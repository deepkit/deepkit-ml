/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Entity, f, uuid} from "@marcj/marshal";

export enum TokenRole {
    USER = 0,
}

@Entity('token', 'tokens')
export class Token {
    @f.primary().uuid()
    token: string = uuid();

    @f.uuid()
    target: string;

    @f.enum(TokenRole)
    role: TokenRole;

    @f
    created: Date = new Date;

    constructor(target: string, role: TokenRole) {
        this.target = target;
        this.role = role;
    }
}
