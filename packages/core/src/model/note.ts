/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Entity, f, uuid} from "@marcj/marshal";

@Entity('note')
export class Note {
    @f.uuid().primary()
    public id: string = uuid();

    @f
    version: number = 0;

    @f.uuid().index().optional()
    public owner!: string;

    @f
    emoji: string = '';

    @f
    title: string = '';

    @f
    created: Date = new Date;

    @f
    updated: Date = new Date;

    @f.map('any')
    cursor: { [sessionId: string]: any } = {};

    constructor(
        @f.uuid().asName('projectId') public projectId: string
    ) {
    }
}
