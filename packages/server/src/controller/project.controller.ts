/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Action, Controller, EntitySubject} from "@marcj/glut-core";
import {Role} from "../utils";
import {Project, ProjectControllerInterface, ProjectJobListFilter, RoleType, User} from "@deepkit/core";
import {ServerSettings} from "../model/server";
import {SessionHelper} from "../session";
import {Database} from "@marcj/marshal-mongo";
import {ResourcesManager} from "../node/resources";
import {SessionPermissionManager} from "../manager/session-permission";
import {EntityStorage, Exchange, ExchangeDatabase} from "@marcj/glut-server";
import {ProjectManager} from "../manager/project-manager";


@Controller('project')
export class ProjectController implements ProjectControllerInterface {
    constructor(
        private serverSettings: ServerSettings,
        private sessionHelper: SessionHelper,
        private database: Database,
        private exchangeDatabase: ExchangeDatabase,
        private exchange: Exchange,
        private entityStorage: EntityStorage,
        private resources: ResourcesManager,
        private projectManager: ProjectManager,
        private permission: SessionPermissionManager,
    ) {
    }

    @Action()
    @Role(RoleType.regular)
    async addFilter(projectId: string, filter: ProjectJobListFilter): Promise<void> {
        await this.permission.checkProjectAdminAccess(projectId);

        const filters = (await this.database.query(Project).filter({id: projectId}).findOneField('filters')) || [];
        filters.push(filter);
        await this.exchangeDatabase.patch(Project, projectId, {filters: filters}, {advertiseAs: Project});
    }

    @Action()
    @Role(RoleType.regular)
    async deleteFilter(projectId: string, filterId: string): Promise<void> {
        await this.permission.checkProjectAdminAccess(projectId);

        const filters: ProjectJobListFilter[] = (await this.database.query(Project).filter({id: projectId}).findOneField('filters')) || [];
        const index = filters.findIndex((v) => v.id === filterId);
        if (-1 !== index) {
            filters.splice(index, 1);
        }
        await this.exchangeDatabase.patch(Project, projectId, {filters: filters}, {advertiseAs: Project});
    }

    @Action()
    @Role(RoleType.regular)
    async addExperimentLabel(projectId: string, name: string): Promise<string> {
        await this.permission.checkProjectAdminAccess(projectId);

        return await this.projectManager.addOrReturnExperimentLabel(projectId, name);
    }

    @Action()
    @Role(RoleType.regular)
    async addExperimentList(projectId: string, name: string): Promise<void> {
        await this.permission.checkProjectAdminAccess(projectId);

        await this.projectManager.addOrReturnExperimentList(projectId, name);
    }

    @Action()
    @Role(RoleType.regular)
    async changeExperimentListName(projectId: string, listId: string, name: string): Promise<void> {
        await this.permission.checkProjectAdminAccess(projectId);

        await this.projectManager.changeExperimentListName(projectId, listId, name);
    }

    @Action()
    @Role(RoleType.anonymouse)
    async subscribePublicProject(username: string, projectName: string): Promise<EntitySubject<Project>> {
        const userIds = await this.database.query(User).filter({username: username}).ids();
        if (!userIds.length) {
            throw new Error('User not found');
        }

        const ids = await this.database.query(Project).filter({owner: userIds[0], name: projectName}).ids();
        if (!ids.length) {
            throw new Error('Project not found');
        }
        await this.permission.checkProjectReadAccess(ids[0]);

        return await this.entityStorage.findOne(Project, {id: ids[0]});
    }

}
