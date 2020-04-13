/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Entity, f, uuid} from "@marcj/marshal";
import {IdInterface} from "@marcj/glut-core";

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

    constructor(
        @f.asName('name') public name: string) {
    }
}
