/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {RoleType} from '@deepkit/core';
import {ClassType, getClassPropertyName, CustomError} from "@marcj/estdlib";

/**
 * Decorator
 */
export const Role = (role: RoleType) => {
    return (target: Object, property: string) => {
        Reflect.defineMetadata('role', role, target, property);
    };
};

export function getRole<T>(classType: ClassType<T>, actionName: string): RoleType {
    const role = Reflect.getMetadata('role', classType.prototype, actionName);
    if (undefined === role) {
        throw new Error(`Action ${getClassPropertyName(classType, actionName)} has no @Role()`);
    }

    return role;
}

export class NotFoundError extends CustomError {
    constructor(path: string = '') {
        super('Not found' + (path ? ' ' + path : ''));
    }
}

const localIps = [
    '::ffff:127.0.0.1',
    '127.0.0.1',
    '127.1',
    '127.0.1',
    '::1',
    '::1/128',
].concat((process.env['DK_WHITELIST_LOCAL_IP'] || '').split(','));

export function isLocalUser(ip: string) {
    return localIps.includes(ip);
}
