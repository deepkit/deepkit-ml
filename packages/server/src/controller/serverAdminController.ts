/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    AppServerAdminControllerInterface,
    FrontendUser,
    OrganisationMember,
    Project,
    RoleType,
    Team,
    User,
    UserType
} from "@deepkit/core";
import {Subscriptions} from "@marcj/estdlib-rxjs";
import {Database} from "@marcj/marshal-mongo";
import {EntityStorage, Exchange, ExchangeDatabase} from "@marcj/glut-server";
import {Role} from "../utils";
import {Action, Collection, Controller, EntitySubject, ValidationError} from "@marcj/glut-core";
import {hash} from "bcryptjs";
import {f} from "@marcj/marshal";

@Controller('server/admin')
export class ServerAdminController implements AppServerAdminControllerInterface {
    private subs = new Subscriptions();

    constructor(
        private database: Database,
        private exchangeDatabase: ExchangeDatabase,
        private exchange: Exchange,
        private entityStorage: EntityStorage,
    ) {
    }

    public async destroy() {
        this.subs.unsubscribe();
    }

    @Action()
    @Role(RoleType.serverAdmin)
    async getOrganisations(): Promise<Collection<FrontendUser>> {
        return this.entityStorage.collection(FrontendUser).filter({
            type: UserType.organisation
        }).find();
    }

    @Action()
    @Role(RoleType.serverAdmin)
    async getUser(id: string): Promise<EntitySubject<FrontendUser>> {
        return this.entityStorage.findOne(FrontendUser, {
            id: id
        });
    }

    @Action()
    @Role(RoleType.serverAdmin)
    async getUsers(): Promise<Collection<FrontendUser>> {
        return this.entityStorage.collection(FrontendUser).filter({
            type: UserType.user
        }).find();
    }

    @Action()
    @Role(RoleType.serverAdmin)
    async getTeams(organisationId: string): Promise<Collection<Team>> {
        return this.entityStorage.collection(Team).filter({
            accountId: organisationId
        }).find();
    }

    @Action()
    @Role(RoleType.serverAdmin)
    async getProjects(userId: string): Promise<Collection<Project>> {
        return this.entityStorage.collection(Project).filter({
            owner: userId
        }).find();
    }

    @Action()
    @Role(RoleType.serverAdmin)
    async getAllProjects(): Promise<Collection<Project>> {
        return this.entityStorage.collection(Project).filter({}).find();
    }

    @Action()
    @Role(RoleType.serverAdmin)
    async createUser(user: User) {
        if (await this.database.query(User).filter({
            username: user.username
        }).has()) {
            throw ValidationError.from([{code: 'already_used', path: 'username', message: 'Username already used'}]);
        }

        user.password = await hash(user.password, 10);
        await this.exchangeDatabase.add(user, {advertiseAs: FrontendUser});
    }

    @Action()
    @Role(RoleType.serverAdmin)
    async createOrganisation(user: FrontendUser): Promise<void> {
        if (await this.database.query(User).filter({
            username: user.username
        }).has()) {
            throw ValidationError.from([{code: 'already_used', path: 'username', message: 'Username already used'}]);
        }

        await this.exchangeDatabase.add(user, {advertiseAs: FrontendUser});
    }

    @Action()
    @Role(RoleType.serverAdmin)
    async updatePassword(userId: string, password: string): Promise<void> {
        password = await hash(password, 10);
        await this.database.query(User).filter({id: userId}).patchOne({password: password});
    }

    @Action()
    @Role(RoleType.serverAdmin)
    async patchUser(userId: string, @f.partial(User) patches: any): Promise<void> {
        await this.exchangeDatabase.patch(User, userId, patches, {advertiseAs: FrontendUser});
    }

    @Action()
    @Role(RoleType.serverAdmin)
    async removeProject(projectId: string): Promise<void> {
        //todo, remove
        //   - notes
        //   - experiments (incl. files)
        await this.exchangeDatabase.remove(Project, projectId);
    }

    @Action()
    @Role(RoleType.serverAdmin)
    async removeUser(userId: string): Promise<void> {
        //todo, remove projects
        //   - notes
        //   - experiments (incl. files)
        await this.exchangeDatabase.remove(FrontendUser, userId);
    }

    @Action()
    @Role(RoleType.serverAdmin)
    async removeOrganisation(organisationId: string): Promise<void> {
        //todo, remove projects
        //   - notes
        //   - experiments (incl. files)

        await this.database.query(OrganisationMember).filter({organisationId: organisationId}).deleteMany();
        await this.exchangeDatabase.remove(FrontendUser, organisationId);
    }
}
