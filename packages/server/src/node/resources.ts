/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Injectable} from 'injection-js';
import {
    Job,
    JobTaskStatus,
    ClusterNode,
    NodePeerControllerInterface,
    FitsStatus,
} from '@deepkit/core';
import {NodeManager} from './node.manager';
import {Entity, f, MultiIndex} from '@marcj/marshal';
import {Exchange, ExchangeDatabase, ProcessLocker, InternalClient} from '@marcj/glut-server';
import {eachPair, eachKey} from '@marcj/estdlib';
import {Database} from '@marcj/marshal-mongo';
import {findNodesForQueueItem} from "@deepkit/core";

@Entity('JobQueueItem', 'jobQueue')
@MultiIndex(['job', 'task'], {})
export class JobQueueItem {
    @f.mongoId().primary()
    _id?: string;

    /**
     * Name of task
     */
    @f
    task: string = 'main';

    @f
    priority: number = 0;

    @f
    position: number = 0;

    @f
    tries: number = 0;

    @f
    added: Date = new Date();

    constructor(
        @f.uuid().asName('userId') public userId: string,
        @f.uuid().asName('job') public job: string,
    ) {
    }
}

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
            const assignedJobsToNodes: {[nodeId: string]: true} = {};
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

            const items = await this.database.query(JobQueueItem).sort({
                priority: 'desc',
                added: 'asc'
            }).find();

            let queuePosition = 0;
            for (const queueItem of items) {
                const job = await this.database.query(Job).filter({id: queueItem.job}).findOne();
                if (!job) continue;
                if (!availableNodesPerUser[queueItem.userId]) {
                    continue;
                }

                const availableNodes = availableNodesPerUser[queueItem.userId];

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

                    if (taskConfig.nodes && taskConfig.nodes.length > 0) {
                        nodes = availableNodes.filter(v => -1 !== taskConfig.nodes.indexOf(v.name));
                    }

                    if (taskConfig.nodeIds && taskConfig.nodeIds.length > 0) {
                        nodes = availableNodes.filter(v => -1 !== taskConfig.nodeIds.indexOf(v.id));
                    }

                    if (taskConfig.clusters && taskConfig.clusters.length > 0) {
                        nodes = availableNodes.filter(v => -1 !== taskConfig.clusters.indexOf(v.cluster));
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
                        const result = findNodesForQueueItem(nodes, taskConfig.replicas, taskConfig.resources);

                        if (result.status === FitsStatus.neverFits) {
                            task.queue.result = 'impossible';
                            queuePosition++;
                            task.queue.position = queuePosition;
                        } else if (result.status === FitsStatus.notFree) {
                            task.queue.result = 'failed';
                            queuePosition++;
                            task.queue.position = queuePosition;
                        } else {
                            const assignedResourcesPerNode = result.nodeAssignment;
                            console.log('Assign Task', '#' + job.number, task.name, assignedResourcesPerNode);
                            task.queue.result = 'assigned';
                            task.status = JobTaskStatus.assigned;
                            task.assigned = new Date();

                            await this.database.query(JobQueueItem).filter({
                                job: queueItem.job,
                                task: queueItem.task
                            }).deleteOne();

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
                    await this.database.query(JobQueueItem).filter({job: queueItem.job, task: queueItem.task}).deleteOne();
                }
            }

            for (const nodeId of eachKey(assignedJobsToNodes)) {
                //we don't need the result or want to wait
                this.internalClient.auto<NodePeerControllerInterface>('node/' + nodeId, async (c) => {
                    await c.loadJobsToStart();
                }).catch(() => {});
            }
        } catch (error) {
            console.error('Could not assign job tasks', error);
        } finally {
            await lock.unlock();
        }
    }

}
