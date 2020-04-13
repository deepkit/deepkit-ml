/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Inject, Injectable} from "injection-js";
import {Exchange, ExchangeDatabase, ProcessLocker} from "@marcj/glut-server";
import {ClusterNode, ClusterNodeCredentials, ClusterNodeStatus} from "@deepkit/core";
import {Database} from "@marcj/marshal-mongo";
import {onProcessExit, Provision, SshConnection} from "@deepkit/core-node";
import {auditTime} from "rxjs/operators";
import {google} from 'googleapis';


/**
 * This class is responsible for establishing the SSH connection and ssh tunnels
 * as well as starting cloud machines (AWS/GC) when necessary.
 */
@Injectable()
export class MachineManager {
    protected lastTimeout: any;
    protected first = true;

    constructor(
        protected locker: ProcessLocker,
        protected exchange: Exchange,
        protected database: Database,
        protected exchangeDatabase: ExchangeDatabase,
        @Inject('HTTP_PORT') protected HTTP_PORT: number,
    ) {
    }

    public async start() {
        if (this.lastTimeout) {
            clearTimeout(this.lastTimeout);
        }

        this.exchangeDatabase.onCreation(ClusterNode, {}, false, false).pipe(auditTime(2)).subscribe(() => {
            this.doIt();
        });

        this.doIt();
    }

    protected async doIt() {
        const lessThanThisDate = this.first ? new Date() : new Date(Date.now() - 20_000);
        this.first = false;

        const nodes = await this.database.query(ClusterNode).filter({
            $and: [
                {connected: false, disabled: {$ne: true}},
                {$or: [{lastConnectionTry: {$exists: false}}, {lastConnectionTry: {$lt: lessThanThisDate}}]}
            ]
        }).select(['id', 'name']).find();

        for (const node of nodes) {
            this.connectNodeIfNecessary(node.id).catch(console.error);
        }

        this.lastTimeout = setTimeout(() => {
            this.doIt();
        }, 10_000);
    }

    protected async connectNodeIfNecessary(nodeId: string) {
        //at this point the machine needs to be created, online, and available.
        //if a job has been created for a cloud node, its creation and starting is done in another place.

        //this Promise will either run forever or error
        //which means we cannot wait for it
        this.ensureTunnel(nodeId).catch(async (error) => {
            await this.exchangeDatabase.patch(ClusterNode, nodeId, {machineError: error.message || error});
        });

        //this Promise will either run forever or error
        //which means we cannot wait for it
        this.connectNode(nodeId).catch(console.error);
    }

    protected async ensureTunnel(nodeId: string) {
        const lockId = 'node/tunnel/' + nodeId;
        if (await this.locker.isLocked(lockId)) {
            return;
        }
        const lock = await this.locker.acquireLock(lockId);

        try {
            const node = await this.database.query(ClusterNode).filter({id: nodeId}).findOneOrUndefined();
            if (!node) return;
            if (!node.host) return;
            if (node.disabled) return;
            if (!node.isCreated()) return;

            const connection = await this.getSshConnection(node);
            //block unlimited until connection breaks
            const promises: Promise<any>[] = [];

            const sub = await this.exchange.subscribe('node/tunnel-close/' + nodeId, (message: { close?: true }) => {
                if (message.close) {
                    this.exchangeDatabase.patch(ClusterNode, nodeId, {tunnelActive: false, tunnelError: ''}).catch(console.error);
                    connection.disconnect();
                }
            });

            await this.exchangeDatabase.patch(ClusterNode, nodeId, {tunnelActive: false, tunnelError: ''});
            await connection.connect();
            await this.exchangeDatabase.patch(ClusterNode, nodeId, {tunnelActive: true, tunnelError: ''});
            promises.push(connection.forwardToUs(this.HTTP_PORT, 8961));
            promises.push(connection.forwardToUs(61720, 61721));
            await Promise.all(promises);
            sub.unsubscribe();
        } catch (error) {
            await this.exchangeDatabase.patch(ClusterNode, nodeId, {tunnelActive: false, tunnelError: error.message || String(error)});
        } finally {
            lock.unlock();
        }
    }

    protected async getSshConnection(node: ClusterNode): Promise<SshConnection> {
        const credentials = await this.database.query(ClusterNodeCredentials).filter({nodeId: node.id}).findOneOrUndefined();
        if (!credentials) {
            throw new Error('No credentials set');
        }

        return new SshConnection(
            node.host,
            credentials.sshPort,
            credentials.sshUsername,
            credentials.sshPassword,
            credentials.sshPrivateKey,
            credentials.sshPrivateKeyPassphrase,
        );
    }

    public async disconnectTunnel(nodeId: string) {
        try {
            const node = await this.database.query(ClusterNode).filter({id: nodeId}).findOneOrUndefined();
            if (!node) return;
            if (!node.host) return;

            const connection = await this.getSshConnection(node);
            await connection.unForwardToUs(8961);
            await connection.unForwardToUs(61721);
        } catch (error) {
        }
    }

    protected async connectNode(nodeId: string) {
        //check if this is already in process for this particular node
        const lockId = 'node/connect/' + nodeId;
        if (await this.locker.isLocked(lockId)) {
            return;
        }

        const lock = await this.locker.acquireLock(lockId);

        try {
            const node = await this.database.query(ClusterNode).filter({id: nodeId}).findOneOrUndefined();

            if (!node) return;
            if (!node.host) return;
            if (node.connected) return;
            if (node.disabled) return;
            if (!node.isCreated()) return;

            await this.exchangeDatabase.patch(ClusterNode, nodeId, {
                machineError: '',
                status: ClusterNodeStatus.connecting,
                lastConnectionTry: new Date()
            });

            const credentials = await this.database.query(ClusterNodeCredentials).filter({nodeId: node.id}).findOneOrUndefined();
            if (!credentials) return;

            const connection = new SshConnection(
                node.host,
                credentials.sshPort,
                credentials.sshUsername,
                credentials.sshPassword,
                credentials.sshPrivateKey,
                credentials.sshPrivateKeyPassphrase,
            );

            const sub = onProcessExit(() => {
                connection.disconnect();
            });
            try {
                await connection.connect();

                await this.exchangeDatabase.patch(ClusterNode, nodeId, {status: ClusterNodeStatus.provisioning});
                const provision = new Provision(connection);

                await provision.provision();

                const s = await provision.ensureSudoAccess(credentials);
                await this.exchangeDatabase.patch(ClusterNode, nodeId, {sudoFailed: !s});

                await this.exchangeDatabase.patch(ClusterNode, nodeId, {status: ClusterNodeStatus.starting});
                //this will hang as long as the connection is established.
                await provision.startConnect(node, credentials.token, credentials.sshRequiresSudo);
            } finally {
                sub.unsubscribe();
                connection.disconnect();
            }
        } catch (error) {
            await this.exchangeDatabase.patch(ClusterNode, nodeId, {status: ClusterNodeStatus.error, machineError: error.message || ''});
        } finally {
            await lock.unlock();
        }
    }

    protected async createAndStartInstance(nodeId: string) {

        const lockId = 'node/create-instance/' + nodeId;
        if (await this.locker.isLocked(lockId)) {
            return;
        }

        const lock = await this.locker.acquireLock(lockId);

        try {
            const node = await this.database.query(ClusterNode).filter({id: nodeId}).findOneOrUndefined();
            if (!node) return;
            if (!node.host) return;
            if (node.connected) return;
            if (node.disabled) return;

            const compute = google.compute('v1');
            // compute.instances.insert({project: 'asd', zone: 'asd', requestId: 'asd'});

        } finally {
            lock.unlock();
        }
    }
}
