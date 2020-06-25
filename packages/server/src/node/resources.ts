/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Injectable} from 'injection-js';
import {Cluster, ClusterNode, findNodesForQueueItem, FitsStatus, Job, JobQueueItem, JobTaskStatus, NodePeerControllerInterface,} from '@deepkit/core';
import {NodeManager} from './node.manager';
import {Exchange, ExchangeDatabase, InternalClient, ProcessLocker} from '@marcj/glut-server';
import {eachKey, eachPair} from '@marcj/estdlib';
import {Database} from '@marcj/marshal-mongo';
import {MachineManager} from "./machine.manager";

export enum QueueStatus {
    assigned,
    impossible,
    failed
}


@Injectable()
export class ResourcesManager {
    constructor(
        private locker: ProcessLocker,
        private nodeManager: NodeManager,
        private exchange: Exchange,
        private database: Database,
        private internalClient: InternalClient,
        private machineManager: MachineManager,
        private exchangeDatabase: ExchangeDatabase,
    ) {
    }

    /**
     * When a task instance is ended, there resources need to be freed.
     */
    async freeResourcesForTaskInstance(nodeId: string, jobId: string, task: string, instance: number) {
        const lock = await this.locker.acquireLock(`node/${nodeId}`);
        const lockAssignJobs = await this.locker.acquireLock('assign-jobs');

        try {
            const node = await this.database.query(ClusterNode).filter({id: nodeId}).findOneOrUndefined();
            if (!node) return;

            node.resources.free(
                jobId,
                task,
                instance
            );

            await this.exchangeDatabase.patch(ClusterNode, nodeId, {
                resources: node.resources
            });
        } finally {
            await lock.unlock();
            await lockAssignJobs.unlock();
        }
    }

    public async assignJobs() {
        const lock = await this.locker.acquireLock('assign-jobs');

        try {
            const assignedJobsToNodes: { [nodeId: string]: true } = {};
            const createdDynamicNodes: ClusterNode[] = [];

            const availableNodesAll = await this.nodeManager.getReadyAndConnectedNodes();
            const availableNodesMap: { [id: string]: ClusterNode } = {};
            const availableNodesPerUser: { [userId: string]: ClusterNode[] } = {};

            for (const node of availableNodesAll) {
                availableNodesMap[node.id] = node;
                if (!availableNodesPerUser[node.owner]) availableNodesPerUser[node.owner] = [];
                availableNodesPerUser[node.owner].push(node);
            }

            for (const i of eachKey(availableNodesPerUser)) {
                availableNodesPerUser[i].sort((a, b) => {
                    if (a.priority < b.priority) return -1;
                    if (a.priority > b.priority) return 1;
                    return 0;
                });

                //we wanna have highest priority at the beginning, so those nodes get picked first
                availableNodesPerUser[i].reverse();
            }

            const clusters = await this.database.query(Cluster).filter({
                disabled: false,
            }).find();
            const availableClustersPerUser: { [userId: string]: Cluster[] } = {};
            const clusterNameMap: { [clusterId: string]: string } = {};

            for (const cluster of clusters) {
                if (!availableClustersPerUser[cluster.owner]) availableClustersPerUser[cluster.owner] = [];
                availableClustersPerUser[cluster.owner].push(cluster);
                clusterNameMap[cluster.id] = cluster.name;
            }

            const items = await this.database.query(JobQueueItem).sort({
                priority: 'desc',
                added: 'asc'
            }).find();

            console.log('assign jobs', items.length);

            let queuePosition = 0;
            for (const queueItem of items) {
                const job = await this.database.query(Job).filter({id: queueItem.job}).findOne();
                if (!job) continue;
                if (!availableNodesPerUser[queueItem.userId] && !availableClustersPerUser[queueItem.userId]) {
                    continue;
                }

                const availableNodes = availableNodesPerUser[queueItem.userId] || [];
                const availableClusters = availableClustersPerUser[queueItem.userId] || [];

                const task = job.getTask(queueItem.task);
                const taskConfig = job.getTaskConfig(queueItem.task);

                if ((task.status === JobTaskStatus.pending || task.status === JobTaskStatus.queued)) {

                    //todo, find first a available free cluster for all tasks, so all can fit.
                    //  Make sure tasks that should run at the same time (worker/parameter) fit at the same time into the cluster. Important.
                    // if not found, find a cluster with theoretical resources
                    // if not found, assign queue error to job.
                    // if found, assign cluster and assign node to each task.
                    if (!job.cluster) {
                        //do it here
                    }

                    //queued doesn't mean it is assigned, so when we reassign jobs, we consider this tasks as well
                    //since we want to transition from pending|queued to assigned.
                    task.status = JobTaskStatus.queued;
                    task.queue.tries = task.queue.tries++;
                    task.queue.result = '';
                    task.queue.added = queueItem.added;

                    let nodes = availableNodes;
                    let clusters = availableClusters;

                    if (taskConfig.nodes && taskConfig.nodes.length > 0) {
                        nodes = nodes.filter(v => -1 !== taskConfig.nodes.indexOf(v.name));
                    }

                    if (taskConfig.nodeIds && taskConfig.nodeIds.length > 0) {
                        nodes = nodes.filter(v => -1 !== taskConfig.nodeIds.indexOf(v.id));
                    }

                    if (taskConfig.clusters && taskConfig.clusters.length > 0) {
                        nodes = nodes.filter(v => -1 !== taskConfig.clusters.indexOf(clusterNameMap[v.cluster]));
                        clusters = clusters.filter(v => -1 !== taskConfig.clusters.indexOf(v.name));
                    }

                    if (job.cluster) {
                        //make sure we don't switch cluster
                        nodes = availableNodes.filter(v => v.cluster === job.cluster);
                    }

                    if (taskConfig.nodes.length) {
                        nodes = availableNodes.filter(v => {
                            return taskConfig.nodes.some(n => v.id === n || v.name === n);
                        });
                    }

                    try {
                        const result = findNodesForQueueItem(clusters, nodes, taskConfig.replicas, taskConfig.resources);
                        // console.log('findNodesForQueueItem', clusters, nodes, queuePosition, result.status, result.newNodes, result.nodeAssignment);

                        if (result.status === FitsStatus.neverFits) {
                            task.queue.result = 'never fits';
                            queuePosition++;
                            task.queue.position = queuePosition;
                        } else if (result.status === FitsStatus.notFree) {
                            task.queue.result = 'not free';
                            queuePosition++;
                            task.queue.position = queuePosition;
                        } else {
                            const assignedResourcesPerNode = result.nodeAssignment;
                            console.log('Assign Task', '#' + job.number, task.name, assignedResourcesPerNode);
                            task.queue.result = 'assigned';
                            task.status = JobTaskStatus.assigned;
                            task.assigned = new Date();

                            for (const newNode of result.newNodes) {
                                if (!availableNodesPerUser[queueItem.userId]) availableNodesPerUser[queueItem.userId] = [];

                                availableNodesPerUser[queueItem.userId].push(newNode);
                                await this.exchangeDatabase.add(newNode);
                                availableNodesMap[newNode.id] = newNode;
                                createdDynamicNodes.push(newNode);
                            }

                            await this.exchangeDatabase.remove(JobQueueItem, queueItem.id);

                            for (const [nodeId, assignedResourcesPerInstance] of eachPair(assignedResourcesPerNode)) {
                                const node: ClusterNode = availableNodesMap[nodeId];
                                const lock = await this.locker.acquireLock(`node/${node.id}`);

                                try {
                                    job.cluster = node.cluster;

                                    for (const [instanceId, assignedResource] of eachPair(assignedResourcesPerInstance)) {
                                        node.resources.reserveAssignment(
                                            job.id,
                                            job.accessToken,
                                            task.name,
                                            Number(instanceId),
                                            assignedResource
                                        );

                                        const instance = task.getInstance(Number(instanceId));
                                        instance.node = nodeId;
                                        instance.assignedResources = assignedResource;
                                    }

                                    await this.exchangeDatabase.patch(ClusterNode, nodeId, {
                                        resources: node.resources
                                    });
                                } finally {
                                    await lock.unlock();
                                }

                                assignedJobsToNodes[nodeId] = true;
                            }
                        }
                    } catch (error) {
                        console.error(error);
                        throw new Error('Could not assign server to job ' + job.id);
                    }

                    await this.exchangeDatabase.patch(Job, job.id, {
                        cluster: job.cluster,
                        ['tasks.' + task.name]: task,
                    });
                } else {
                    //task has already been started, so remove that job queue item
                    await this.exchangeDatabase.remove(JobQueueItem, queueItem.id);
                }
            }

            for (const node of createdDynamicNodes) {
                //this calls MachineManager.createAndStartInstance()
                await this.exchange.publish('cloud/dynamic-created', {nodeId: node.id});
                delete assignedJobsToNodes[node.id];
            }

            for (const nodeId of eachKey(assignedJobsToNodes)) {
                //we don't need the result or want to wait
                this.internalClient.auto<NodePeerControllerInterface>('node/' + nodeId, async (c) => {
                    await c.loadJobsToStart();
                }).catch(console.error);
            }
        } catch (error) {
            console.error('Could not assign job tasks', error);
        } finally {
            await lock.unlock();
        }
    }

}
