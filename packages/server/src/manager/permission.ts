/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Injectable} from 'injection-js';
import {ClusterNode, OrganisationMember, User} from '@deepkit/core';
import {Database} from '@marcj/marshal-mongo';
import {Token, TokenRole} from "../model/token";
import {ClusterNodeCredentials} from "@deepkit/core";

/**
 * This class is server wide, not per connection. So, do not cache stuff based on sessionHelper as it would be never cleared.
 */
@Injectable()
export class PermissionManager {
    constructor(
        private database: Database,
    ) {
    }

    public async getLocalUser(): Promise<User> {
        const user = await this.database.query(User).filter({
            localUser: true
        }).findOne();

        if (!user) {
            throw new Error('No local user available');
        }

        return user;
    }

    public async getUserForToken(token: string): Promise<User | undefined> {
        const tokenInstance = await this.database.query(Token).filter({
            token: token,
            role: TokenRole.USER
        }).findOneOrUndefined();

        if (!tokenInstance) {
            return;
        }

        return await this.database.query(User).filter({
            id: tokenInstance.target
        }).findOneOrUndefined();
    }

    /**
     * Throws an access denied exception when permission is denied.
     */

    public async getNodeForToken(token: { token: string, nodeId: string }): Promise<ClusterNode | undefined> {
        const node = await this.database.query(ClusterNode).filter({id: token.nodeId}).findOneOrUndefined();

        if (node) {
            const credentials = await this.database.query(ClusterNodeCredentials).filter({nodeId: node.id}).findOneOrUndefined();
            if (credentials && credentials.token === token.token) {
                return node;
            }
        }
    }

    public async getOrganisationMember(userId: string, organisationId: string): Promise<OrganisationMember | undefined> {
        return await this.database.query(OrganisationMember).filter({
            userId: userId,
            organisationId: organisationId,
        }).findOneOrUndefined();
    }
}
