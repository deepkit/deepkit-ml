/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Injectable} from 'injection-js';
import {ClusterNode, ClusterNodeStatus, NodeHardwareInformation, NodeHardwareStats, NodeResources} from '@deepkit/core';
import {ExchangeDatabase} from '@marcj/glut-server';
import {Database} from '@marcj/marshal-mongo';

@Injectable()
export class NodeManager {
    constructor(
        private database: Database,
        private exchangeDatabase: ExchangeDatabase
    ) {
    }

    public async getReadyAndConnectedNodes(): Promise<ClusterNode[]> {
        //fetch all nodes that are connected
        return this.database.query(ClusterNode).filter({
            connected: true,
            ready: true,
        }).find();
    }

    public async getPeers(nodeId: string): Promise<ClusterNode[]> {
        const node = await this.database.query(ClusterNode).filter({id: nodeId}).findOneOrUndefined();
        if (!node) return [];

        //fetch all nodes that are connected and which sent a ping last 5 seconds at least once.
        return this.database.query(ClusterNode).filter({
            connected: true,
            cluster: node.cluster,
        }).find();
    }

    public async ping(nodeId: string): Promise<void> {
        await this.exchangeDatabase.patch(ClusterNode, nodeId, {ping: new Date()});
    }

    /**
     * This should only be called when the node disconnects or connects.
     */
    public async setConnected(nodeId: string, connected: boolean): Promise<boolean> {
        const patch: Partial<ClusterNode> = {
            connected: connected,
            machineError: '',
            ready: false,
            connectedTime: new Date(),
            ping: new Date()
        };

        if (connected) {
            patch.status = ClusterNodeStatus.started;
        } else {
            patch.status = ClusterNodeStatus.offline;
        }

        await this.exchangeDatabase.patch(ClusterNode, nodeId, patch);

        return true;
    }

    public async setReady(nodeId: string, ready: boolean): Promise<boolean> {
        await this.exchangeDatabase.patch(ClusterNode, nodeId, {ready: ready, ping: new Date});

        return true;
    }

    public async setResources(nodeId: string, resources: NodeResources): Promise<boolean> {
        await this.exchangeDatabase.patch(ClusterNode, nodeId, {resources, ping: new Date});

        return true;
    }

    public async setHardwareInformation(nodeId: string, information: NodeHardwareInformation): Promise<boolean> {
        await this.exchangeDatabase.patch(ClusterNode, nodeId, {information, ping: new Date});

        return true;
    }

    public async streamStats(nodeId: string, stats: NodeHardwareStats): Promise<boolean> {
        await this.exchangeDatabase.patch(ClusterNode, nodeId, {stats, ping: new Date});

        return true;
    }
}
