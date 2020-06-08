/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {JobAssignedResources, JobResources} from "./model/job";
import {ClusterNode, NodeResources} from "./model/clusterNode";
import clone from 'clone';
import {eachPair} from "@marcj/estdlib";
import {Cluster} from "./model/cluster";
import {cloneClass} from "@marcj/marshal";
import {instanceTypesMap} from "./cloud";

export enum FitsStatus {
    fits= 'fits',
    notFree = 'notFree',
    neverFits = 'neverFits',
}

export interface NodeAssignments {
    [nodeId: string]: { [instanceId: string]: JobAssignedResources };
}

export class NodesFound {
    newNodes: ClusterNode[] = [];

    nodeAssignment: NodeAssignments = {};

    //neverFits: current nodes will never be able to satisfy resources
    //notFree: current nodes are too busy to satisfy resources
    status: FitsStatus = FitsStatus.fits;
}

/**
 * Returns a new ClusterNode when given resources fit into the cluster. The caller is responsible for saving this node cluster.
 * This changes the autoScaleState in given cluster.
 */
export function clusterUpScale(cluster: Cluster, jobResources: JobResources): ClusterNode | void {
    if (cluster.autoScaleState.getInstanceCount() >= cluster.autoScale.maxInstances) return;

    const possibleResources = instanceTypesMap[cluster.adapter];
    if (!possibleResources) return;

    //note: possibleResources is already ordered from smallest to big, so we make naturally sure we don't
    // use a bigger instance than actually needed.
    for (const [instanceTypeName, availableResource] of eachPair(possibleResources)) {
        const fits = requirementFits(availableResource, jobResources);
        if (fits) {
            //cluster has space, so lets create it.
            const node = new ClusterNode('auto', cluster.id);
            node.owner = cluster.owner;
            node.resources = cloneClass(availableResource);
            node.dynamic = true;
            node.adapter = cluster.adapter;
            node.instanceType = instanceTypeName;
            cluster.autoScaleState.instanceIds.push(node.id);
            cluster.autoScaleState.instancesTypes.push(instanceTypeName);
            return node;
        }
    }
}

export interface AssignableResult {
    assignable: boolean;
    newNodes: ClusterNode[];
    reservations: NodeAssignments;
}

export function isAssignable(
    clusters: Cluster[],
    clusterNodes: ClusterNode[],
    instances: number,
    jobResources: JobResources,
): AssignableResult {
    const result: AssignableResult = {assignable: false, newNodes: [], reservations: {}};

    // important to clone, since we change the cluster autoScaleState to make sure this algo works correctly
    const cloudClusters = clusters.filter(v => v.isCloud()).map(v => cloneClass(v));

    //important to clone, otherwise we operate consume() call on real node objects.
    //we need only temporary objects to track resource reservations.
    const clonedNodes = clusterNodes.map(v => cloneClass(v));

    for (let instanceId = 0; instanceId < instances; instanceId++) {
        let found = false;

        //first try custom nodes
        for (const node of clonedNodes) {
            const fits = requirementFits(node.resources, jobResources);

            if (fits === FitsStatus.fits) {
                found = true;

                if (!result.reservations[node.id]) result.reservations[node.id] = {};

                //minimum resources fit, so consume as much as possible
                result.reservations[node.id][instanceId] = node.resources.consume(jobResources);
                break;
            }
        }

        //when no existing ClusterNode has been found that fits, we try to up-scale an cloud-cluster.
        //this cloud cluster returns a new ClusterNode instance, which we add to nodeResources list (for NEXT instances assignment)
        //for the current iteration of instanceId we simply assign it.
        if (!found) {
            for (const cluster of cloudClusters) {
                const node = clusterUpScale(cluster, jobResources);
                if (node) {
                    result.newNodes.push(node);
                    clonedNodes.push(node);
                    found = true;

                    if (!result.reservations[node.id]) result.reservations[node.id] = {};
                    result.reservations[node.id][instanceId] = node.resources.consume(jobResources);
                    break;
                }
            }
        }

        if (!found) {
            return result;
        }
    }

    result.assignable = true;
    return result;
}

/**
 * Finds the nodes necessary to start `instances` amount of `jobResources`. This means if multiple instaces are requested,
 * it returns may allow multiple different nodes.
 *
 * Clusters create new ClusterNodes on demand when doing up-scaling. They remove themself when idle.
 *
 * Make sure to pass cluster nodes with the right order.
 */
export function findNodesForQueueItem(clusters: Cluster[], clusterNodes: ClusterNode[], instances: number, jobResources: JobResources): NodesFound {
    const result = new NodesFound;
    jobResources.normalizeValues();

    const availableNodesMap: { [id: string]: ClusterNode } = {};
    for (const node of clusterNodes) {
        availableNodesMap[node.id] = node;
    }

    //first try to fit all replicas in our cluster (availableNodes) when all are totally un-reserved
    //this tells us whether it's theoretical possible to start this task
    const freeClusterNodes = clone(clusterNodes);
    for (const node of freeClusterNodes) {
        node.resources.clearReservations();
    }
    const freeCluster = clusters.map(v => cloneClass(v));
    for (const cluster of freeCluster) {
        cluster.autoScaleState.clear();
    }
    const isTheoreticallyAssignable = isAssignable(freeCluster, freeClusterNodes, instances, jobResources);

    //second, try to fit all replicas in our cluster as is (with reservations intact)
    //this tells us whether it's CURRENTLY possible to start this task right away.
    //we return the reserved resources once successful.
    const isCurrentlyAssignable = isAssignable(clusters, clusterNodes, instances, jobResources);

    if (!isCurrentlyAssignable.assignable && isTheoreticallyAssignable.assignable) {
        //Cluster are too busy to assign task
        result.status = FitsStatus.notFree;
    }

    if (!isCurrentlyAssignable.assignable && !isTheoreticallyAssignable.assignable) {
        //Cluster is never be able to assign task
        result.status = FitsStatus.neverFits;
    }

    //isCurrentlyAssignable.newNodes need to be returned here as well,
    // so caller of this function saved them and next call to this functions takes them into consideration as well.
    for (const node of isCurrentlyAssignable.newNodes) {
        //newly added nodes have resources reserved so that the actual algo works correctly. we need to reset it, since the
        //caller gets new nodes that don't have yet any reservations.
        node.resources.clearReservations();
    }

    result.nodeAssignment = isCurrentlyAssignable.reservations;
    result.newNodes = isCurrentlyAssignable.newNodes;

    // for (const i of eachKey(result.nodeAssignment)) {
    //     result.nodes.push(availableNodesMap[i]);
    // }

    return result;
}

export function requirementFits(nodeResources: NodeResources, jobResources: JobResources): FitsStatus {
    /**
     * Check first if never fits.
     */
    if (!nodeResources.hasCpu(jobResources.getMinCpu())) {
        return FitsStatus.neverFits;
    }

    if (!nodeResources.hasMemory(jobResources.getMinMemory())) {
        return FitsStatus.neverFits;
    }

    if (!nodeResources.hasGpu(jobResources.getMinGpu())) {
        return FitsStatus.neverFits;
    }

    if (!nodeResources.hasGpuMemory(jobResources.getMinGpu(), jobResources.minGpuMemory)) {
        return FitsStatus.neverFits;
    }


    /**
     * Now check if notFree.
     */
    if (!nodeResources.hasFreeCpu(jobResources.getMinCpu())) {
        return FitsStatus.notFree;
    }

    if (!nodeResources.hasFreeMemory(jobResources.getMinMemory())) {
        return FitsStatus.notFree;
    }

    if (!nodeResources.hasFreeGpu(jobResources.getMinGpu())) {
        return FitsStatus.notFree;
    }

    if (!nodeResources.hasFreeGpuMemory(jobResources.getMinGpu(), jobResources.minGpuMemory)) {
        return FitsStatus.notFree;
    }

    return FitsStatus.fits;
}
