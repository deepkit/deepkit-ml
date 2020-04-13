/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Injectable} from 'injection-js';
import {PermissionManager} from '../manager/permission';
import {NodeManager} from './node.manager';
import {
    AssignedJobTaskInstance, Cluster,
    ClusterNode, ClusterNodeJobStartConfig,
    DeepKitFile, getPeerId,
    Job,
    JobTaskInstanceStatus,
    JobTaskStatus,
    NodeControllerInterface,
    NodeHardwareInformation,
    NodeHardwareStats,
    NodeResources,
    RoleType
} from '@deepkit/core';
import {ResourcesManager} from './resources';
import {EntityStorage, Exchange, ExchangeDatabase, FS, ProcessLocker} from "@marcj/glut-server";
import {Role} from "../utils";
import {ProjectManager} from "../manager/project-manager";
import {NodeSession, SessionHelper} from "../session";
import {Action, Controller, observeItem, StreamBehaviorSubject} from "@marcj/glut-core";
import {Database} from '@marcj/marshal-mongo';
import {ServerSettings} from "../model/server";
import { f } from '@marcj/marshal';

@Injectable()
@Controller('node')
export class NodeController implements NodeControllerInterface {
    private nodeSession: NodeSession;

    protected lastSpeedTest: {[peerId: string]: number} = {};

    constructor(
        private exchange: Exchange,
        private database: Database,
        private exchangeDatabase: ExchangeDatabase,
        private resourcesManager: ResourcesManager,
        private projectManager: ProjectManager,
        private entityStorage: EntityStorage,
        private fs: FS<DeepKitFile>,
        private permissionManager: PermissionManager,
        private locker: ProcessLocker,
        private sessionHelper: SessionHelper,
        private nodeManager: NodeManager,
        private serverSettings: ServerSettings,
    ) {
        this.nodeSession = this.sessionHelper.getNodeSession();
    }

    get nodeId() {
        return this.nodeSession.nodeId;
    }

    /**
     * This can happen when the connection breaks. This should not lead into a
     * resetting of AssignedTaskInstances as the work can continue once the connection
     * is re-established.
     */
    public async destroy() {
        try {
            await this.nodeManager.setConnected(this.nodeId, false);
            await this.nodeManager.setReady(this.nodeId, false);
            await this.resourcesManager.assignJobs();
        } catch (e) {
        }
    }

    @Action()
    @Role(RoleType.server)
    public async setPeerSpeed(peerNodeId: string, uploadSpeed: number, downloadSpeed: number): Promise<void> {
        const peerId = getPeerId(this.nodeId, peerNodeId);
        const clusterNode = await this.database.query(ClusterNode).filter({id: this.nodeId}).select(['cluster']).findOne();

        await this.exchangeDatabase.patch(Cluster, clusterNode.cluster, {
            ['peerSpeed.' + peerId]: {download: downloadSpeed, upload: uploadSpeed}
        });
    }

    @Action()
    @Role(RoleType.server)
    public async setPeerConnection(peerNodeId: string, ping: number): Promise<void> {
        await this.exchangeDatabase.patch(ClusterNode, this.nodeId, {
            ['peerConnections.' + peerNodeId]: {ping: ping}
        });
    }

    @Action()
    @Role(RoleType.server)
    @f.any()
    public async getServerIp(): Promise<{ localIp: string, publicIp: string }> {
        return {localIp: this.serverSettings.localIp!, publicIp: this.serverSettings.publicIp!};
    }

    @Action()
    @Role(RoleType.server)
    public async lockPeerSpeedTest(peerNodeId: string): Promise<StreamBehaviorSubject<void> | undefined> {
        const peerId = getPeerId(this.nodeId, peerNodeId);
        const subject = new StreamBehaviorSubject<void>(undefined);

        //it's important to lock peerNodeId and not peerId,
        // since the server can only handle one test at a time.
        const lock = await this.locker.acquireLock('node/speed-test/' + peerNodeId);

        if (this.lastSpeedTest[peerId] && Date.now() - this.lastSpeedTest[peerId] < 20_000) {
            //last test happened t0o shortly.
            await lock.unlock();
            return undefined;
        }

        this.lastSpeedTest[peerId] = Date.now();

        subject.addTearDown(() => {
            lock.unlock();
        });

        return subject;
    }

    @Action()
    @Role(RoleType.server)
    @f.any()
    public async getPeers(): Promise<{ id: string, ip: string, port: number }[]> {
        const peers: { id: string, ip: string, port: number }[] = [];

        for (const node of await this.nodeManager.getPeers(this.nodeId)) {
            if (this.nodeId !== node.id) {
                peers.push({id: node.id, ip: node.host, port: node.speedPort});
            }
        }

        return peers;
    }

    @Action()
    @Role(RoleType.server)
    @f.any()
    public async getSwarm(): Promise<{ host: string, token: string }> {
        return {host: this.serverSettings.swarmMasterAddress!, token: this.serverSettings.swarmJoinWorkerToken!};
    }

    @Action()
    @Role(RoleType.server)
    public async setNetwork(localIp: string, publicIp: string, speedPort: number): Promise<void> {
        await this.exchangeDatabase.patch(ClusterNode, this.nodeId, {
            localIp: localIp,
            publicIp: publicIp,
        });
    }

    @Action()
    @Role(RoleType.server)
    public async putStdout(stdout: string): Promise<void> {
        await this.fs.stream('stdout.log', Buffer.from(stdout, 'utf8'), {
            node: this.nodeId
        }, {
            cropSizeAt: 250 * 1024 * 1024, //250kb
            cropSizeAtTo: 150 * 1024 * 1024, //150kb
        });
    }

    @Action()
    @Role(RoleType.server)
    public async setDockerInfo(@f.any() info: any): Promise<any> {
        await this.exchangeDatabase.patch(ClusterNode, this.nodeId, {
            dockerInfo: info,
        });
    }

    @Action()
    @Role(RoleType.server)
    public async setNvidiaInfo(@f.any() info: {driverVersion: string, cudaVersion: string} | undefined): Promise<any> {
        await this.exchangeDatabase.patch(ClusterNode, this.nodeId, {
            nvidiaInfo: info,
        });
    }

    /**
     * resources is the correct resources. the node knows which resources are still reserved.
     */
    @Action()
    @Role(RoleType.server)
    public async connected(resources: NodeResources): Promise<string> {
        const lock = await this.locker.acquireLock(`node/${this.nodeId}`);
        const lockAssignJobs = await this.locker.acquireLock('assign-jobs');

        try {
            await this.nodeManager.setConnected(this.nodeId, true);
            const node = await this.database.query(ClusterNode).filter({id: this.nodeId}).has();
            if (!node) throw new Error('Node deleted.');

            await this.nodeManager.setResources(this.nodeId, resources);
        } finally {
            await lock.unlock();
            await lockAssignJobs.unlock();
        }

        return this.nodeId;
    }

    @Action()
    @Role(RoleType.server)
    public async setResources(resources: NodeResources): Promise<void> {
        const lock = await this.locker.acquireLock(`node/${this.nodeId}`);
        const lockAssignJobs = await this.locker.acquireLock('assign-jobs');

        try {
            const node = await this.database.query(ClusterNode).filter({id: this.nodeId}).has();
            if (!node) throw new Error('Node deleted.');

            await this.nodeManager.setResources(this.nodeId, resources);
        } finally {
            await lock.unlock();
            await lockAssignJobs.unlock();
        }
    }

    @Action()
    @Role(RoleType.server)
    public async ready(): Promise<void> {
        await this.nodeManager.setReady(this.nodeId, true);
        await this.resourcesManager.assignJobs();
    }

    @Action()
    @Role(RoleType.server)
    @f.array(AssignedJobTaskInstance)
    public async getAssignedTaskInstances(): Promise<AssignedJobTaskInstance[]> {
        const node = await this.database.query(ClusterNode).filter({id: this.nodeId}).findOneOrUndefined();
        if (!node) return [];

        return Object.values(node.resources.assignedJobTaskInstances);
    }

    @Action()
    @Role(RoleType.server)
    public async getStartConfig(): Promise<ClusterNodeJobStartConfig> {
        const node = await this.database.query(ClusterNode).filter({id: this.nodeId}).findOne();

        return node.getJobStartConfig();
    }

    /**
     * Trigger action when task instance is done.
     *
     * 1. Free assigned node resources.
     * 2. Assign new tasks to nodes (and start them)
     */
    @Action()
    @Role(RoleType.server)
    public async jobTaskInstanceDone(jobId: string, task: string, instance: number): Promise<void> {
        await this.resourcesManager.freeResourcesForTaskInstance(this.nodeId, jobId, task, instance);
        await this.resourcesManager.assignJobs();
    }

    @Action()
    @Role(RoleType.server)
    public async getNodeId(): Promise<string> {
        return this.nodeId;
    }

    @Action()
    @Role(RoleType.server)
    public async isTaskInstanceAllowedToStartThenStart(id: string, task: string, instance: number): Promise<boolean> {
        const originalJob = await this.database.query(Job).filter({id}).findOneOrUndefined();

        if (!originalJob) {
            await this.resourcesManager.freeResourcesForTaskInstance(this.nodeId, id, task, instance);
            await this.resourcesManager.assignJobs();
            return false;
        }

        const lock = await this.locker.acquireLock(`job/${originalJob.id}`);
        const observer = observeItem(originalJob);
        const job = observer.snapshot;

        try {
            const taskInfo = job.getTask(task);
            if (!taskInfo) {
                return false;
            }

            const instanceInfo = taskInfo.getInstance(instance);

            if (taskInfo.status === JobTaskStatus.assigned && instanceInfo.status === JobTaskInstanceStatus.pending) {
                instanceInfo.status = JobTaskInstanceStatus.booting;
                return true;
            }

            return false;
        } finally {
            await lock.unlock();

            const patches = observer.getPatchesAndReset();
            if (patches) {
                await this.exchangeDatabase.patch(Job, id, patches);
            }
        }
    }

    @Action()
    @Role(RoleType.server)
    public async setHardwareInformation(information: NodeHardwareInformation): Promise<void> {
        await this.nodeManager.setHardwareInformation(this.nodeId, information);
    }

    @Action()
    @Role(RoleType.server)
    public async streamStats(stats: NodeHardwareStats): Promise<void> {
        await this.nodeManager.streamStats(this.nodeId, stats);
    }
}
