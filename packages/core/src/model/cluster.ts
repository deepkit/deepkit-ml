/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Entity, f, uuid} from "@marcj/marshal";
import {IdInterface} from "@marcj/glut-core";
import {ClusterNodeJobStartConfig} from "./clusterNode";

export enum ClusterAdapter {
    custom = '',
    google_cloud = 'gcp',
    aws = 'aws',
    genesis_cloud = 'genesis_cloud',
}


export enum ClusterAutoScaleFilterType {
    whitelist,
    blacklist,
}

export class ClusterAutoScaleOptions {
    @f maxInstances: number = 1;

    // @f.enum(ClusterAutoScaleFilterType)
    // filterType: ClusterAutoScaleFilterType = ClusterAutoScaleFilterType.whitelist;
    //
    // @f.array(String)
    // whitelistInstanceTypes: string[] = [];
    //
    // @f.array(String)
    // blacklistInstanceTypes: string[] = [];
}

export class ClusterAutoScaleState {
    /**
     * List of type names that have been created.
     */
    @f.array(String)
    instancesTypes: string[] = [];

    /**
     * Id ist of created cluster node ids.
     */
    @f.array(String)
    instanceIds: string[] = [];

    getInstanceCount(): number {
        return this.instanceIds.length;
    }

    clear() {
        this.instancesTypes = [];
        this.instanceIds = [];
    }
}

@Entity('cluster', 'cluster')
export class Cluster implements IdInterface {
    @f.uuid().primary()
    id: string = uuid();

    @f
    version: number = 1;

    @f.uuid().optional().index()
    owner!: string;

    @f
    public: boolean = false;

    /**
     * Values in MB and seconds.
     * peerId is based on getPeerId()
     */
    @f.any().asMap()
    peerSpeed: { [peerId: string]: { download: number, upload: number } } = {};

    @f
    created: Date = new Date();

    @f
    updated: Date = new Date();

    /**
     * Whether the cluster is disabled (and with it auto-scaling).
     */
    @f.index()
    disabled: boolean = false;

    @f.enum(ClusterAdapter)
    adapter: ClusterAdapter = ClusterAdapter.custom;

    @f
    jobStartConfig: ClusterNodeJobStartConfig = new ClusterNodeJobStartConfig;

    @f
    autoScale: ClusterAutoScaleOptions = new ClusterAutoScaleOptions;

    @f
    autoScaleState: ClusterAutoScaleState = new ClusterAutoScaleState;

    /**
     * Whether DEBUG=deepkit is enabled or not. Activates additional debug logging output for created cluster nodes.
     */
    @f
    debugMode: boolean = false;

    constructor(
        @f.asName('name') public name: string) {
    }

    isCloud() {
        return this.adapter !== ClusterAdapter.custom;
    }
}
