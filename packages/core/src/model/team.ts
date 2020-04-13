/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Entity, f, uuid} from "@marcj/marshal";
import {IdInterface} from "@marcj/glut-core";

@Entity('team', 'teams')
export class Team implements IdInterface {
    @f.primary().uuid()
    id: string = uuid();

    @f
    version: number = 1;

    @f
    created: Date = new Date();

    @f
    updated: Date = new Date();

    constructor(
        @f.uuid().asName('accountId') public accountId: string,
        @f.asName('name') public name: string,
    ) {
    }
}

export enum TeamRole {
    regular = 0,
    admin = 1,
}

@Entity('userTeam', 'userTeams')
export class UserTeam {
    @f.enum(TeamRole)
    role: TeamRole = TeamRole.regular;

    constructor(
        @f.uuid().asName('user') public user: string,
        @f.uuid().asName('team') public team: string,
    ) {
    }
}
