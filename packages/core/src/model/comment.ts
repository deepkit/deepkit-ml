/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Entity, f} from "@marcj/marshal";
import uuid from "uuid";

@Entity('comment')
export class UniversalComment {
    @f.primary().uuid() id: string = uuid();

    @f version: number = 0;

    @f.array('any') content: any[] = [];

    @f created: Date = new Date;

    @f updated: Date = new Date;

    constructor(
        @f.uuid().index().asName('parentId') public parentId: string,
        @f.uuid().index().asName('userId') public userId: string,
    ) {
    }
}
