/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Injectable} from 'injection-js';
import {
    Cluster,
    ClusterNode,
    Job,
    Note,
    OrganisationMember,
    Project,
    ProjectIssue,
    RoleType,
    UniversalComment
} from '@deepkit/core';
import {Database} from '@marcj/marshal-mongo';
import {SessionHelper} from "../session";
import {ClassType, getClassName} from "@marcj/estdlib";
import {PermissionManager} from "./permission";
import {getEntityName} from "@marcj/marshal";

export class AccessDenied extends Error {
    constructor(message: string = 'Access denied.') {
        super(message);
    }
}

/**
 * This class is per connection/session.
 *
 * All check* methods either return nothing (access granted) or throw AccessDenied error (access denied).
 */
@Injectable()
export class SessionPermissionManager {
    protected cachedAccess: { [id: string]: {time: number, error?: Error, res?: any} } = {};

    constructor(
        private database: Database,
        protected sessionHelper: SessionHelper,
        protected permissionManager: PermissionManager,
    ) {
    }

    protected async handleCached<T>(id: string, cb: () => Promise<T>): Promise<T> {
        if (this.cachedAccess[id]) {
            const cache = this.cachedAccess[id];
            const age = Date.now() - cache.time;
            if (age < 60_000) {
                //cache is valid
                if (cache.error) {
                    //access denied
                    throw cache.error;
                } else {
                    //access granted
                    return cache.res;
                }
            }
        }

        //cache invalid or not existent
        try {
            const res = await cb();
            //granted
            this.cachedAccess[id] = {time: Date.now(), res: res};
            return res;
        } catch (error) {
            //denied
            this.cachedAccess[id] = {time: Date.now(), error: error};
            throw error;
        }
    }

    /**
     * Throws an access denied exception when permission is denied.
     */
    public async checkEntityReadAccess<T extends { id: string, owner?: string, public?: boolean }>(
        entity: ClassType<T>,
        id: string,
        withPublicCheck = true
    ) {
        if (this.sessionHelper.hasSession() && this.sessionHelper.getUserSession().role === RoleType.serverAdmin) return true;

        const item = await this.database.query(entity).filter({id: id}).select(['owner', 'public']).findOneOrUndefined();

        if (!item) {
            throw new AccessDenied();
        }

        if (withPublicCheck && item.public) {
            return true;
        }

        if (!this.sessionHelper.hasSession()) {
            throw new AccessDenied(`No session`);
        }

        if (item.owner === this.sessionHelper.getUserSession().authenticatedUserId) {
            return true;
        }

        //check if the project belongs to an organisation and user is member
        const orgMember = await this.database.query(OrganisationMember).filter({
            userId: this.sessionHelper.getUserSession().authenticatedUserId,
            organisationId: item.owner,
        }).findOneOrUndefined();

        if (orgMember) {
            //user is member. role is not important to have access
            return true;
        }

        throw new AccessDenied();
    }

    public async checkClusterReadAccess(id: string) {
        await this.checkEntityReadAccess(Cluster, id);
    }

    public async checkClusterAdminAccess(id: string) {
        await this.checkAdminAccessByOwner(Cluster, id);
    }

    public async checkNoteReadAccess(id: string): Promise<string> {
        const projectId = await this.database.query(Note).filter({id: id}).findOneFieldOrUndefined('projectId');
        if (!projectId) throw new AccessDenied();
        await this.checkProjectReadAccess(projectId);
        return projectId;
    }

    public async checkNoteWriteAccess(id: string): Promise<string> {
        const projectId = await this.database.query(Note).filter({id: id}).findOneFieldOrUndefined('projectId');
        if (!projectId) throw new AccessDenied();
        await this.checkProjectWriteAccess(projectId);
        return projectId;
    }

    public async checkIssueReadAccess(id: string): Promise<string> {
        const projectId = await this.database.query(ProjectIssue).filter({id: id}).findOneFieldOrUndefined('projectId');
        if (!projectId) throw new AccessDenied();
        await this.checkProjectReadAccess(projectId);
        return projectId;
    }

    public async checkIssueWriteAccess(id: string): Promise<string> {
        const projectId = await this.database.query(ProjectIssue).filter({id: id}).findOneFieldOrUndefined('projectId');
        if (!projectId) throw new AccessDenied();
        await this.checkProjectWriteAccess(projectId);
        return projectId;
    }

    public async checkCommentWriteAccess(id: string) {
        const userId = await this.database.query(UniversalComment).filter({id: id}).findOneFieldOrUndefined('userId');
        if (userId !== this.sessionHelper.getAuthenticatedUserId()) {
            throw new AccessDenied();
        }
    }

    public async checkClusterNodeReadAccess(id: string) {
        await this.checkEntityReadAccess(ClusterNode, id);
    }

    public async checkClusterNodeAdminAccess(id: string) {
        await this.checkAdminAccessByOwner(ClusterNode, id);
    }

    public async checkProjectReadAccess(id: string) {
        await this.checkEntityReadAccess(Project, id, true);
    }

    public async checkUserReadAccess(userId: string) {
        await this.checkRegularAccessByUserId(userId);
    }

    public async checkProjectWriteAccess(id: string) {
        await this.checkRegularAccessByOwner(Project, id);
    }

    public async checkProjectAdminAccess(id: string) {
        await this.checkAdminAccessByOwner(Project, id);
    }

    /**
     * Regular means usually write access, but not admin
     */
    public async checkRegularAccessByOwner<T extends { id: string, owner: string }>(
        classType: ClassType<T>,
        itemId: string
    ) {
        await this.handleCached(getEntityName(classType) + '/checkRegularAccessByOwner/' + itemId, async () => {
            if (this.sessionHelper.hasSession() && this.sessionHelper.getUserSession().role === RoleType.serverAdmin) return;

            const item = await this.database.query(classType).filter({id: itemId}).select(['owner']).findOne();
            if (item && item.owner) {
                await this.checkRegularAccessByUserId(item.owner);
            } else {
                throw new AccessDenied();
            }
        });
    }

    /**
     * Admin access, full rights.
     */
    public async checkAdminAccessByOwner<T extends { id: string, owner: string }>(
        classType: ClassType<T>,
        itemId: string
    ) {
        await this.handleCached(getEntityName(classType) + '/checkAdminAccessByOwner/' + itemId, async () => {
            if (this.sessionHelper.hasSession() && this.sessionHelper.getUserSession().role === RoleType.serverAdmin) return;

            const item = await this.database.query(classType).filter({id: itemId}).select(['owner']).findOne();
            if (item && item.owner) {
                await this.checkAdminAccessByUserId(item.owner);
            } else {
                throw new AccessDenied();
            }
        });
    }

    public async checkRegularAccessByUserId(ownerId: string) {
        await this.handleCached('/checkRegularAccessByUserId/' + ownerId, async () => {
            if (this.sessionHelper.hasUserSession()) {
                if (this.sessionHelper.getUserSession().role === RoleType.serverAdmin) return;
                if (this.sessionHelper.getUserSession().authenticatedUserId === ownerId) return;

                const member = await this.permissionManager.getOrganisationMember(this.sessionHelper.getUserSession().authenticatedUserId, ownerId);
                if (member && member.hasRegularRights()) return;
            }

            throw new AccessDenied();
        });
    }

    public async checkAdminAccessByUserId(ownerId: string) {
        await this.handleCached('/checkAdminAccessByUserId/' + ownerId, async () => {
            if (this.sessionHelper.hasUserSession()) {
                if (this.sessionHelper.getUserSession().role === RoleType.serverAdmin) return;
                if (this.sessionHelper.getUserSession().authenticatedUserId === ownerId) return;

                const member = await this.permissionManager.getOrganisationMember(this.sessionHelper.getUserSession().authenticatedUserId, ownerId);
                if (member && member.hasAdminRights()) return;
            }

            throw new AccessDenied();
        });
    }

    public async checkJobReadAccess(id: string, token?: string) {
        await this.handleCached('checkJobReadAccess/' + id, async () => {
            if (this.sessionHelper.hasUserSession() && this.sessionHelper.getUserSession().role === RoleType.serverAdmin) return;

            //we need a special check here for job connections
            if (this.sessionHelper.hasSession() && this.sessionHelper.isJobSession() && id === this.sessionHelper.getJobSession().jobId) {
                return;
            }

            const item = await this.database.query(Job).filter({id}).select(['project', 'shareToken']).findOne();
            if (item.shareToken && token) {
                //check for token
                if (item.shareToken === token) return;
            }
            await this.checkEntityReadAccess(Project, item.project);
        });
    }

    public async checkJobWriteAccess(id: string) {
        await this.handleCached('checkJobWriteAccess/' + id, async () => {
            if (this.sessionHelper.hasUserSession() && this.sessionHelper.getUserSession().role === RoleType.serverAdmin) return;

            //we need a special check here for job connections
            if (this.sessionHelper.hasSession() && this.sessionHelper.isJobSession() && id === this.sessionHelper.getJobSession().jobId) {
                return;
            }

            const item = await this.database.query(Job).filter({id}).select(['project']).findOne();
            await this.checkRegularAccessByOwner(Project, item.project);
        });
    }
}
