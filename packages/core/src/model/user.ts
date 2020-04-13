/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Entity, f, MultiIndex, uuid} from "@marcj/marshal";
import {hasRole, OrganisationMemberRoleType, RoleType} from "./role";
import {IdInterface} from "@marcj/glut-core";
import {Validators} from "./validators";

export enum UserType {
    user = 0,
    organisation = 1,
}

@Entity('BaseUser', 'users')
export class BaseUser implements IdInterface {
    @f.primary().uuid()
    id: string = uuid();

    @f
    version: number = 1;

    /**
     * Used for Deepkit app, local version.
     */
    @f
    localUser: boolean = false;

    @f.enum(UserType)
    type: UserType = UserType.user;

    @f.optional()
    image?: ArrayBuffer;

    @f
    created: Date = new Date();

    @f
    updated: Date = new Date();

    constructor(
        @f.asName('username').index({unique: true}).validator(Validators.username)
        public username: string,
        @f.asName('email').index().validator(Validators.email)
        public email: string,
        @f.enum(RoleType).asName('role') public role: RoleType,
    ) {
        this.username = username;
        this.email = email;
        this.role = role;
    }

    public hasRole(role: RoleType) {
        return hasRole(this.role, role);
    }

    public isOrganisation(): boolean {
        return this.type === UserType.organisation;
    }
}

@Entity('User', 'users')
export class User extends BaseUser {
    constructor(
        @f.asName('username').index({unique: true}).validator(Validators.username) public username: string,
        @f.asName('email').index().validator(Validators.email) public email: string,
        @f.enum(RoleType).asName('role') public role: RoleType,
        @f.asName('password') public password: string,
    ) {
        super(username, email, role);
    }
}

@Entity('FrontendUser', 'users')
export class FrontendUser extends BaseUser {
    //never set `@f password` because this would lead to leaking passwords to clients!
}

@Entity('PublicUser', 'users')
export class PublicUser {
    @f.primary().uuid()
    id: string = uuid();

    @f
    version: number = 1;

    @f
    removed: boolean = false;

    @f.enum(UserType)
    type: UserType = UserType.user;

    @f.type(ArrayBuffer).optional()
    image?: ArrayBuffer;

    @f
    created: Date = new Date();

    constructor(
        @f.asName('username') public username: string,
    ) {
    }
}

@Entity('OrganisationMember', 'organisationMember')
@MultiIndex(['userId', 'organisationId'], {})
export class OrganisationMember {
    @f.uuid().primary()
    id: string = uuid();

    @f
    version: number = 1;

    constructor(
        @f.uuid().asName('userId').index() public userId: string,
        @f.uuid().asName('organisationId').index() public organisationId: string,
        @f.enum(RoleType).asName('role') public readonly role: OrganisationMemberRoleType,
    ) {
        if (role !== OrganisationMemberRoleType.regular && role !== OrganisationMemberRoleType.admin && role !== OrganisationMemberRoleType.billing) {
            throw new Error('Invalid user roles');
        }
    }

    hasRegularRights() {
        return this.role === OrganisationMemberRoleType.regular || this.role === OrganisationMemberRoleType.admin;
    }

    hasAdminRights() {
        return this.role === OrganisationMemberRoleType.admin;
    }

    getRoleType(): RoleType {
        if (this.role === OrganisationMemberRoleType.admin) return RoleType.admin;
        if (this.role === OrganisationMemberRoleType.billing) return RoleType.billing;

        return RoleType.regular;
    }
}
