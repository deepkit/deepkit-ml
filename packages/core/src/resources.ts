/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {JobAssignedResources, JobResources} from "./model/job";
import {ClusterNode, NodeResources} from "./model/clusterNode";
import clone from 'clone';
import { eachPair, eachKey } from "@marcj/estdlib";

export enum FitsStatus {
    fits= 'fits',
    notFree = 'notFree',
    neverFits = 'neverFits',
}

export interface NodeAssignments {
    [nodeId: string]: { [instanceId: string]: JobAssignedResources };
}

export function isAssignable(
    cluster: ClusterNode[],
    instances: number,
    jobResources: JobResources,
    reservations: NodeAssignments = {}
): boolean {
    const nodeResources: { [nodeId: string]: NodeResources } = {};

    for (const node of cluster) {
        //important to clone, otherwise we operate consume() call on real node objects.
        //we need only temporary objects to track resource reservations.
        nodeResources[node.id] = clone(node.resources);
    }

    for (let instanceId = 0; instanceId < instances; instanceId++) {
        let found = false;

        for (const [nodeId, resource] of eachPair(nodeResources)) {
            const fits = requirementFits(resource, jobResources);

            if (fits === FitsStatus.fits) {
                found = true;

                if (!reservations[nodeId]) {
                    reservations[nodeId] = {};
                }

                //minimum resources fit, so consume as much as possible
                const reservation = resource.consume(jobResources);

                reservations[nodeId][instanceId] = reservation;
                break;
            }
        }

        if (!found) {
            return false;
        }
    }

    return true;
}

export class NodesFound {
    nodes: ClusterNode[] = [];

    nodeAssignment: NodeAssignments = {};

    //neverFits: current nodes will never be able to satisfy resources
    //notFree: current nodes are too busy to satisfy resources
    status: FitsStatus = FitsStatus.fits;
}

/**
 * Make sure the pass cluster with the right sort.
 */
export function findNodesForQueueItem(clusterNodes: ClusterNode[], instances: number, jobResources: JobResources): NodesFound {
    const result = new NodesFound;
    jobResources.normalizeValues();

    const availableNodesMap: { [id: string]: ClusterNode } = {};
    for (const node of clusterNodes) {
        availableNodesMap[node.id] = node;
    }

    //first try to fit all replicas in our cluster (availableNodes) when all are totally un-reserved
    //this tells us whether it's theoretical possible to start this task
    const freeCluster = clone(clusterNodes);
    for (const node of freeCluster) {
        node.resources.clearReservations();
    }
    const isTheoreticallyAssignable = isAssignable(freeCluster, instances, jobResources);

    //second, try to fit all replicas in our cluster as is (with reservations intact)
    //this tells us whether it's CURRENTLY possible to start this task right away.
    //we return the reserved resources once successful.
    const isCurrentlyAssignable = isAssignable(clusterNodes, instances, jobResources, result.nodeAssignment);

    if (!isCurrentlyAssignable && isTheoreticallyAssignable) {
        //Cluster are too busy to assign task
        result.status = FitsStatus.notFree;
    }

    if (!isCurrentlyAssignable && !isTheoreticallyAssignable) {
        //Cluster is never be able to assign task
        result.status = FitsStatus.neverFits;
    }

    for (const i of eachKey(result.nodeAssignment)) {
        result.nodes.push(availableNodesMap[i]);
    }

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
