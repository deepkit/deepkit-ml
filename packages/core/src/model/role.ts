/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

//note: Do not add new types between, since we store ids numeric positional ID in the database tokens.
export enum RoleType {
    anonymouse,
    readonly,


    //user as OrganisationMember as well
    regular,
    admin,
    billing,

    server,
    job,
    local,
    serverAdmin,
}

export enum OrganisationMemberRoleType {
    regular = 2,
    admin = 3,
    billing = 4,
}

export let RoleHierarchy: { [baseRole: number]: RoleType[] } = {};
RoleHierarchy[RoleType.local] = [RoleType.regular, RoleType.billing, RoleType.anonymouse];
RoleHierarchy[RoleType.admin] = [RoleType.regular, RoleType.billing, RoleType.anonymouse];
RoleHierarchy[RoleType.serverAdmin] = [RoleType.admin, RoleType.regular, RoleType.billing, RoleType.anonymouse];
RoleHierarchy[RoleType.regular] = [RoleType.billing, RoleType.anonymouse];
RoleHierarchy[RoleType.readonly] = [RoleType.anonymouse];
RoleHierarchy[RoleType.server] = [RoleType.anonymouse];
RoleHierarchy[RoleType.billing] = [RoleType.anonymouse];
RoleHierarchy[RoleType.anonymouse] = [];
RoleHierarchy[RoleType.job] = [];

export function hasRole(has: RoleType, needs: RoleType): boolean {
    return has === needs || -1 !== RoleHierarchy[has].indexOf(needs);
}
