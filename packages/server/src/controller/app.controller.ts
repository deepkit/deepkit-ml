/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Role} from '../utils';
import {
    AppControllerInterface,
    Cluster,
    ClusterNode,
    DeepKitFile,
    FrontendUser,
    HomeConfig,
    Job,
    JobConfig,
    JobDebuggerPeerControllerInterface,
    JobDebuggingState,
    JobFileType,
    JobPeerControllerInterface,
    JobStatus,
    JobTaskInstancePeerControllerInterface,
    JobTaskInstanceStatus,
    JobTaskStatus,
    OrganisationMember,
    OrganisationMemberRoleType,
    Project,
    ProjectIssue,
    PublicUser,
    QueueResult,
    RoleType,
    SimplePatches,
    SourceFile,
    User,
    UserType,
    JobQueueItem,
} from '@deepkit/core';
import {ResourcesManager} from '../node/resources';
import {getHomeConfig, setHomeConfig, setHomeFolderLink} from "@deepkit/core-node";
import {Observable} from "rxjs";
import {Subscriptions} from "@marcj/estdlib-rxjs";
import {ClientConnection, EntityStorage, Exchange, ExchangeDatabase, FS, InternalClient} from "@marcj/glut-server";
import {
    Action,
    Collection,
    Controller,
    EntitySubject,
    FileMode,
    FilterQuery,
    observeItem,
    ReactiveSubQuery,
    StreamBehaviorSubject,
    ValidationError,
} from "@marcj/glut-core";
import {Database} from "@marcj/marshal-mongo";
import {SessionHelper} from "../session";
import {compare, hash} from "bcryptjs";
import {Token, TokenRole} from "../model/token";
import {SessionPermissionManager} from "../manager/session-permission";
import Dockerode from 'dockerode';
import {pathExists} from 'fs-extra';
import {f, uuid} from '@marcj/marshal';
import {ServerSettings} from "../model/server";
import {ProjectManager} from "../manager/project-manager";
import {JobManager} from "../manager/job-manager";

@Controller('app')
export class AppController implements AppControllerInterface {
    private subs = new Subscriptions();

    constructor(
        private serverSettings: ServerSettings,
        private sessionHelper: SessionHelper,
        private database: Database,
        private exchangeDatabase: ExchangeDatabase,
        private exchange: Exchange,
        private entityStorage: EntityStorage,
        private resources: ResourcesManager,
        private permission: SessionPermissionManager,
        private fs: FS<DeepKitFile>,
        private internalClient: InternalClient,
        private connection: ClientConnection,
        private dockerode: Dockerode,
        private projectManager: ProjectManager,
        private jobManager: JobManager,
    ) {
    }

    public async destroy() {
        this.subs.unsubscribe();
    }

    private getUserId(): string {
        return this.sessionHelper.getUserSession().chosenOrganisationOrUserId;
    }

    private getAuthenticatedUserId(): string {
        return this.sessionHelper.getUserSession().authenticatedUserId;
    }

    private isLocalUser(): boolean {
        return this.sessionHelper.getUserSession().localUser;
    }

    @Action()
    @Role(RoleType.anonymouse)
    async isServerMode(): Promise<boolean> {
        return this.serverSettings.serverMode;
    }

    @Action()
    @Role(RoleType.anonymouse)
    async login(username: string, password: string): Promise<string> {
        const user = await this.database.query(User).filter({
            username: username,
        }).findOneOrUndefined();

        if (user && user.password) {
            const valid = await compare(password, user.password);
            if (valid) {
                //create new token
                const token = new Token(user.id, TokenRole.USER);
                await this.database.add(token);

                return token.token;
            }
        }

        return '';
    }

    /**
     * Returns the actual authenticated user (not organissation)
     */
    @Action()
    @Role(RoleType.regular)
    async getAuthenticatedUser(): Promise<EntitySubject<FrontendUser>> {
        return this.entityStorage.findOne(FrontendUser, {
            id: this.getAuthenticatedUserId()
        });
    }

    @Action()
    @Role(RoleType.regular)
    async getSessionId(): Promise<string> {
        return this.sessionHelper.getUserSession().id;
    }

    @Action()
    @Role(RoleType.regular)
    async getSessionRole(): Promise<RoleType> {
        return this.sessionHelper.getUserSession().role;
    }

    /**
     * Returns the actual authenticated user (not organissation)
     */
    @Action()
    @Role(RoleType.regular)
    async getUser(): Promise<EntitySubject<FrontendUser>> {
        return this.entityStorage.findOne(FrontendUser, {
            id: this.getUserId()
        });
    }

    @Action()
    @Role(RoleType.regular)
    async getMyOrganisations(): Promise<Collection<FrontendUser>> {
        return this.entityStorage.collection(FrontendUser).filter({
            id: {$sub: ReactiveSubQuery.createField(OrganisationMember, 'organisationId', {userId: this.getAuthenticatedUserId()})}
        }).find();
    }

    @Action()
    @Role(RoleType.regular)
    async updatePassword(userId: string, password: string): Promise<void> {
        await this.permission.checkAdminAccessByUserId(userId);

        password = await hash(password, 10);
        await this.database.query(User).filter({id: userId}).patchOne({password: password});
    }

    @Action()
    @Role(RoleType.regular)
    async updateUser(user: FrontendUser): Promise<void> {
        await this.permission.checkAdminAccessByUserId(user.id);

        if (await this.database.query(User).filter({
            username: user.username,
            id: {$ne: user.id},
        }).has()) {
            throw ValidationError.from([{code: 'already_used', path: 'username', message: 'Username already used'}]);
        }

        //todo resize user.image if given

        await this.exchangeDatabase.patch(FrontendUser, user.id, user);
    }

    @Action()
    @Role(RoleType.regular)
    @f.array(PublicUser)
    async findUser(query: string, global: boolean = false): Promise<PublicUser[]> {
        const additional: any = {};
        if (!global && this.sessionHelper.getUserSession().isOrganisation) {
            //we need to limit the selection to the organisations member
            const ids = await this.database.query(OrganisationMember).filter({
                organisationId: this.sessionHelper.getUserSession().chosenOrganisationOrUserId
            }).findField("userId");

            additional['id'] = {$in: ids};
        }

        return await this.database.query(PublicUser).filter({
            type: UserType.user,
            removed: {$ne: true},
            username: {$regex: new RegExp('^' + query)},
            ...additional
        }).limit(30).find();
    }

    @Action()
    @Role(RoleType.regular)
    async getProjects(): Promise<Collection<Project>> {
        return this.entityStorage.collection(Project).filter({
            owner: this.getUserId()
        }).find();
    }

    @Action()
    @Role(RoleType.regular)
    async getClusters(): Promise<Collection<Cluster>> {
        return this.entityStorage.collection(Cluster).filter({
            owner: this.getUserId()
        }).find();
    }

    @Action()
    @Role(RoleType.regular)
    async getIssues(projectId: string): Promise<Collection<ProjectIssue>> {
        await this.permission.checkProjectReadAccess(projectId);

        return this.entityStorage.collection(ProjectIssue).filter({
            projectId: projectId,
        }).find();
    }


    @Action()
    @Role(RoleType.regular)
    async getNodes(): Promise<Collection<ClusterNode>> {
        return this.entityStorage.collection(ClusterNode).filter({
            owner: this.getUserId(),
        }).find();
    }

    @Action()
    @Role(RoleType.regular)
    @f.any()
    async getSwarmInformation(): Promise<any> {
        const info = await this.dockerode.info();

        return info['Swarm'];
    }

    @Action()
    @Role(RoleType.regular)
    async stopJob(jobId: string, @f.optional() force: boolean = false) {
        const originalJob = await this.database.query(Job).filter({id: jobId}).findOne();

        const observer = observeItem(originalJob);
        const job = observer.snapshot;

        if (force) {
            for (const task of job.getAllTasks()) {
                if (!task.ended) {
                    task.ended = new Date();
                    task.status = JobTaskStatus.aborted;
                }
                for (const instance of task.getInstances()) {
                    if (!instance.ended) {
                        instance.ended = new Date();
                        instance.status = JobTaskInstanceStatus.aborted;
                        if (instance.node) {
                            await this.resources.freeResourcesForTaskInstance(instance.node, job.id, task.name, instance.id);
                            await this.resources.assignJobs();
                        }
                    }
                }
            }

            if (!job.ended) {
                job.ended = new Date;
                job.status = JobStatus.aborted;
            }

            job.connections = 0;
        } else {
            for (const task of job.getAllTasks()) {
                if (!task.isEnded()) {
                    for (const instance of task.getInstances()) {
                        if (!instance.isEnded()) {

                            this.internalClient.auto<JobTaskInstancePeerControllerInterface>(
                                'job/' + jobId + '/task/' + task.name + '/instance/' + instance.id,
                                async (c) => {
                                    await c.stop();
                                }).catch(() => {
                            });
                        }
                    }
                }
            }
        }

        if (!job.stopRequested) {
            job.stopRequested = new Date;

            this.internalClient.auto<JobPeerControllerInterface>(
                'job/' + jobId,
                async (c) => {
                    await c.stop();
                }).catch(() => {
            });
        }

        const patches = observer.getPatchesAndReset();

        if (patches) {
            await this.exchangeDatabase.patch(Job, jobId, patches);
        }
    }

    @Action()
    @Role(RoleType.regular)
    async patchCluster(clusterId: string, @f.partial(Cluster) patches: SimplePatches): Promise<number> {
        await this.permission.checkClusterAdminAccess(clusterId);

        delete patches['owner'];
        const doc = await this.exchangeDatabase.patch(Cluster, clusterId, patches);

        return doc.version;
    }

    @Action()
    @Role(RoleType.regular)
    async patchJob(jobId: string, @f.partial(Job) patches: SimplePatches): Promise<number> {
        await this.permission.checkJobWriteAccess(jobId);

        //todo, change in white-list
        delete patches['owner'];
        const doc = await this.exchangeDatabase.patch(Job, jobId, patches);

        return doc.version;
    }

    @Action()
    @Role(RoleType.regular)
    async updateProject(@f project: Project): Promise<void> {
        await this.permission.checkProjectAdminAccess(project.id);

        if (await this.database.query(Project).filter({
            name: project.name,
            id: {$ne: project.id},
            owner: this.getUserId(),
        }).has()) {
            throw ValidationError.from([{code: 'already_used', path: 'name', message: 'Project name already in use.'}]);
        }

        const oldProject = await this.database.query(Project).filter({id: project.id}).findOne();

        const validLists: (string | null)[] = project.experimentLists.map(v => v.id);
        validLists.push(null);
        const updateJobsQuery = await this.database.query(Job).filter({
            project: project.id,
            ci: false, list: {$nin: validLists}
        });

        await updateJobsQuery.patchMany({list: null});

        project.updated = new Date();
        await this.exchangeDatabase.update(project, {advertiseAs: Project});
        if (oldProject.gitUrl !== project.gitUrl) {
            //trigger refresh
            this.projectManager.refreshGit(project.id).catch(e => {
                console.log('updateProject refreshGit failed', project, e);
            });
        }
    }

    /**
     * This method is to create jobs based on scripts/CI, not via the desktop App.
     * Simply because if this server is running not on a working machine,
     * it would be pointless to create experiments based on source code from
     * server's state. The users wants to create in desktop app experiments
     * based on the source code of their work station - which isn't accessible
     * by the server (in case you use a remote account in desktop app).
     */
    @Action()
    @Role(RoleType.regular)
    async createExperimentByCI(projectId: string): Promise<void> {

    }

    /**
     * Create action via GUI for Git
     */
    @Action()
    @Role(RoleType.regular)
    async createExperiment(projectId: string, config: JobConfig): Promise<string> {
        //todo, read all file from Git excluding config.exclude
        await this.permission.checkProjectWriteAccess(projectId);
        const job = await this.projectManager.createExperimentFromConfig(this.jobManager, this.getAuthenticatedUserId(), projectId, config);

        return job.id;
    }

    @Action()
    @Role(RoleType.regular)
    async createOrganisation(user: FrontendUser): Promise<void> {
        if (await this.database.query(User).filter({
            username: user.username
        }).has()) {
            throw ValidationError.from([{code: 'already_used', path: 'username', message: 'Username already used'}]);
        }

        await this.exchangeDatabase.add(user, {advertiseAs: FrontendUser});
        await this.exchangeDatabase.add(new OrganisationMember(this.getAuthenticatedUserId(), user.id, OrganisationMemberRoleType.admin));
    }

    @Action()
    @Role(RoleType.regular)
    async getOrganisationMembers(organisationId: string): Promise<Collection<FrontendUser>> {
        await this.permission.checkUserReadAccess(organisationId);

        return this.entityStorage.collection(FrontendUser).filter({
            id: {$sub: ReactiveSubQuery.createField(OrganisationMember, 'userId', {organisationId: organisationId})}
        }).find();
    }

    @Action()
    @Role(RoleType.regular)
    async getOrganisationMember(userId: string, organisationId: string): Promise<EntitySubject<OrganisationMember>> {
        await this.permission.checkUserReadAccess(organisationId);

        return await this.entityStorage.findOne(OrganisationMember, {
            userId, organisationId,
        });
    }

    @Action()
    @Role(RoleType.regular)
    async assignMemberToOrganisation(organisationId: string, userId: string, role: OrganisationMemberRoleType): Promise<void> {
        await this.permission.checkAdminAccessByUserId(organisationId);

        const has = await this.database.query(OrganisationMember).filter({
            userId: userId,
            organisationId: organisationId,
        }).has();
        if (has) {
            throw new Error('User is already member.');
        }

        await this.exchangeDatabase.add(new OrganisationMember(userId, organisationId, role));
    }

    @Action()
    @Role(RoleType.regular)
    async unAssignMemberOfOrganisation(organisationId: string, userId: string): Promise<void> {
        await this.permission.checkAdminAccessByUserId(organisationId);

        //check if its thats last admin user, if so abort
        const member = await this.database.query(OrganisationMember).filter({
            role: OrganisationMemberRoleType.admin,
            organisationId: organisationId,
        }).findOneOrUndefined();

        if (member && member.userId === userId) {
            throw new Error('Could not remove last admin member.');
        }

        await this.exchangeDatabase.deleteOne(OrganisationMember, {userId: userId, organisationId: organisationId});
    }

    @Action()
    @Role(RoleType.regular)
    deleteJobs(@f.array(String) jobIds: string[]): Observable<string> {
        return new Observable<string>((observer) => {
            let running = true;

            (async () => {
                try {
                    for (const jobId of jobIds) {
                        if (!running) return;
                        try {
                            await this.permission.checkJobWriteAccess(jobId);
                        } catch (e) {
                            //no access so continue
                            continue;
                        }

                        await this.database.query(JobQueueItem).filter({job: jobId}).deleteMany();
                        await this.exchangeDatabase.remove(Job, jobId);
                        await this.fs.removeAll({job: jobId});
                        observer.next(jobId);
                    }
                } catch (e) {

                }
                observer.complete();
            })();

            return {
                unsubscribe(): void {
                    running = false;
                }
            };
        });
    }

    @Action()
    @Role(RoleType.regular)
    async jobsCountPerProject(projectId: string) {
        await this.permission.checkProjectReadAccess(projectId);

        return this.database.query(Job).filter({project: projectId}).count();
    }

    @Action()
    @f.type(HomeConfig)
    async getHomeConfig(): Promise<HomeConfig> {
        if (!this.connection.isLocal()) {
            throw new Error('External access denied');
        }

        return await getHomeConfig();
    }

    @Action()
    @Role(RoleType.regular)
    async createProject(name: string, @f.optional() location?: string, @f.optional() bookmarkPermission?: string): Promise<string> {
        //to add account data shizzle
        const project = new Project(this.getUserId(), name);

        if (await this.database.query(Project).filter({
            name: project.name,
            owner: this.getUserId(),
        }).has()) {
            throw ValidationError.from([{code: 'already_used', path: 'name', message: 'Project name already in use.'}]);
        }

        if (location && this.isLocalUser()) {
            if (!await pathExists(location)) {
                throw ValidationError.from([{path: 'location', message: 'Location does not exist'}]);
            }

            const homeConfig = await getHomeConfig();
            await setHomeFolderLink(homeConfig, homeConfig.getLocalAccount().id, project.id, location, project.name, bookmarkPermission);
            await setHomeConfig(homeConfig);
        }

        await this.exchangeDatabase.add(project);
        return project.id;
    }

    @Action()
    @Role(RoleType.regular)
    async createNode(node: ClusterNode): Promise<void> {
        await this.permission.checkClusterAdminAccess(node.cluster);
        node.owner = this.getUserId();
        await this.exchangeDatabase.add(node);
    }

    @Action()
    @Role(RoleType.regular)
    async restartJob(id: string): Promise<boolean> {
        await this.permission.checkJobWriteAccess(id);
        const job = await this.database.query(Job).filter({id}).findOne();

        await this.fs.removeAll({
            job: id,
            jobType: JobFileType.output
        });

        job.prepareTaskInstances();

        await this.exchangeDatabase.patch(Job, id, {
            status: JobStatus.created,
            ended: null,
            ping: null,
            started: null,
            tasks: job.tasks,
            iteration: 0,
            step: 0,
            steps: 0,
            title: '',
            channels: {},
        });

        await this.database.query(JobQueueItem).filter({job: id}).deleteMany();
        const project = await this.database.query(Project).filter({id: job.project}).findOne();

        for (const task of job.getNextTasksToStart()) {
            const item = new JobQueueItem(project.owner, id);
            item.task = task.name;
            item.priority = job.config.priority;
            await this.exchangeDatabase.add(item);
        }

        await this.resources.assignJobs();

        return true;
    }

    @Action()
    @Role(RoleType.regular)
    async jobSetDebuggingState(jobId: string, state: JobDebuggingState): Promise<void> {
        await this.permission.checkJobWriteAccess(jobId);
        await this.patchJob(jobId, {
            debuggingState: state
        });

        this.internalClient.auto<JobDebuggerPeerControllerInterface>('job/' + jobId + '/debugger', async (c) => {
            await c.updateWatchingLayer();
        }).catch(() => {
        });
    }

    @Action()
    @Role(RoleType.regular)
    async jobDebugStartWatchLayer(jobId: string, layerId: string): Promise<void> {
        await this.permission.checkJobWriteAccess(jobId);
        const state: JobDebuggingState = await this.database.query(Job).filter({id: jobId}).findOneField('debuggingState');
        state.watchingLayers[layerId] = true;
        await this.patchJob(jobId, {
            'debuggingState': state
        });

        this.internalClient.auto<JobDebuggerPeerControllerInterface>('job/' + jobId + '/debugger', async (c) => {
            await c.updateWatchingLayer();
        }).catch(() => {
        });

    }

    @Action()
    @Role(RoleType.regular)
    async jobDebugStopWatchLayer(jobId: string, layerId: string): Promise<void> {
        await this.permission.checkJobWriteAccess(jobId);
        const state: JobDebuggingState = await this.database.query(Job).filter({id: jobId}).findOneField('debuggingState');
        delete state.watchingLayers[layerId];
        await this.patchJob(jobId, {
            'debuggingState': state
        });

        this.internalClient.auto<JobDebuggerPeerControllerInterface>('job/' + jobId + '/debugger', async (c) => {
            await c.updateWatchingLayer();
        }).catch(() => {
        });

    }

    @Action()
    @Role(RoleType.regular)
    async deleteJob(id: string): Promise<boolean> {
        await this.permission.checkJobWriteAccess(id);
        await this.exchangeDatabase.remove(Job, id);

        await this.fs.removeAll({
            job: id
        });

        await this.database.query(JobQueueItem).filter({job: id}).deleteMany();
        //todo, move queue.position down from all above

        return true;
    }

    @Action()
    @Role(RoleType.regular)
    async deleteProject(id: string): Promise<boolean> {
        await this.permission.checkProjectWriteAccess(id);

        //delete all jobs
        const jobs = await this.database.query(Job).filter({
            project: id
        }).find();

        for (const job of jobs) {
            await this.deleteJob(job.id);
        }

        await this.exchangeDatabase.remove(Project, id);

        if (this.isLocalUser()) {
            const config = await getHomeConfig();
            config.removeLinkForProject(id);
            await setHomeConfig(config);
        }

        return true;
    }

    @Action()
    @Role(RoleType.anonymouse)
    @f.type(Project)
    async getProjectForId(id: string): Promise<Project | undefined> {
        await this.permission.checkProjectReadAccess(id);
        return await this.database.query(Project).filter({id: id}).findOneOrUndefined();
    }

    @Action()
    @Role(RoleType.anonymouse)
    @f.type(String)
    async getProjectName(id: string): Promise<string | undefined> {
        await this.permission.checkProjectReadAccess(id);
        const project = await this.database.query(Project).filter({id: id}).findOneOrUndefined();
        if (project) {
            const user = await this.database.query(User).filter({id: project.owner}).findOneOrUndefined();
            if (user) {
                if (user.localUser) {
                    return project.name;
                }

                return user.username + '/' + project.name;
            }
        }
    }

    @Action()
    @Role(RoleType.anonymouse)
    async subscribeProject(id: string): Promise<EntitySubject<Project>> {
        await this.permission.checkProjectReadAccess(id);
        return await this.entityStorage.findOne(Project, {
            id: id
        });
    }

    @Action()
    @Role(RoleType.anonymouse)
    async subscribeCluster(id: string): Promise<EntitySubject<Cluster>> {
        await this.permission.checkClusterReadAccess(id);
        return await this.entityStorage.findOne(Cluster, {
            id: id
        });
    }

    @Action()
    @Role(RoleType.regular)
    async subscribeClusterNode(id: string): Promise<EntitySubject<ClusterNode>> {
        await this.permission.checkClusterNodeReadAccess(id);

        return await this.entityStorage.findOne(ClusterNode, {
            id: id
        });
    }

    @Action()
    @Role(RoleType.regular)
    async subscribeJobQueue(): Promise<Collection<JobQueueItem>> {
        return await this.entityStorage.collection(JobQueueItem).filter({
            userId: this.getUserId()
        }).find();
    }

    @Action()
    @Role(RoleType.regular)
    @f.type(String)
    async createProjectForName(nameWithNamespace: string): Promise<string> {
        if (await this.isAllowedToCreateProjectByName(nameWithNamespace)) {
            let namespace = '';
            if (nameWithNamespace.includes('/')) {
                [namespace, nameWithNamespace] = nameWithNamespace.split('/');
            }

            let owner = '';
            if (namespace) {
                const user = await this.database.query(User).filter({username: namespace}).findOne();
                await this.permission.checkAdminAccessByUserId(user.id);
                owner = user.id;
            } else {
                owner = this.getAuthenticatedUserId();
            }

            const project = new Project(owner, nameWithNamespace);
            await this.exchangeDatabase.add(project);

            return project.id;
        }

        throw new Error('Could not create project.');
    }

    @Action()
    @Role(RoleType.regular)
    @f.type(Boolean)
    async isAllowedToCreateProjectByName(nameWithNamespace: string): Promise<boolean> {
        let namespace = '';
        if (nameWithNamespace.includes('/')) {
            [namespace, nameWithNamespace] = nameWithNamespace.split('/');
        }

        if (namespace) {
            //organisation
            const user = await this.database.query(User).filter({username: namespace}).findOneOrUndefined();
            if (user) {
                try {
                    await this.permission.checkAdminAccessByUserId(user.id);
                } catch (e) {
                    return false;
                }
            }
        }

        //when not already picked, it's free
        return !(await this.database.query(Project).filter({
            name: nameWithNamespace,
        }).has());
    }

    @Action()
    @Role(RoleType.anonymouse)
    @f.type(Project).optional()
    async getProjectForPublicName(nameWithNamespace: string): Promise<Project | undefined> {
        let namespace = '';
        if (nameWithNamespace.includes('/')) {
            [namespace, nameWithNamespace] = nameWithNamespace.split('/');
        }

        if (namespace && this.sessionHelper.getUserSession().username !== namespace) {
            //organisation
            const user = await this.database.query(User).filter({username: namespace}).findOneOrUndefined();
            if (!user) return;

            const project = await this.database.query(Project).filter({
                name: nameWithNamespace,
                owner: user.id,
            }).findOneOrUndefined();

            if (project) {
                await this.permission.checkProjectReadAccess(project.id);
            }

            return project;
        } else {
            return await this.database.query(Project).filter({
                name: nameWithNamespace,
                owner: this.getUserId(),
            }).findOneOrUndefined();
        }
    }

    @Action()
    @Role(RoleType.anonymouse)
    @f.type(Cluster).optional()
    async getCluster(id: string): Promise<Cluster | undefined> {
        const cluster = await this.database.query(Cluster).filter({
            name: id,
            owner: this.getUserId(),
        }).findOneOrUndefined();

        if (cluster) {
            await this.permission.checkClusterReadAccess(cluster.id);
        }

        return cluster;
    }


    @Action()
    @Role(RoleType.anonymouse)
    @f.type(Job).optional()
    async getJob(id: string): Promise<Job | undefined> {
        await this.permission.checkJobReadAccess(id);

        return await this.database.query(Job).filter({id: id}).findOneOrUndefined();
    }

    @Action()
    @Role(RoleType.anonymouse)
    async getJobs(project: string, @f.type(String).optional() list: undefined | string | 'ci'): Promise<Collection<Job>> {
        await this.permission.checkProjectReadAccess(project);
        const filter: FilterQuery<Job> = {project: project};

        if (list) {
            if (list === 'ci') {
                filter.ci = true;
            } else {
                filter.ci = false;
                filter.list = list;
            }
        } else {
            filter.ci = false;
            filter.list = null;
        }

        return await this.entityStorage.collection(Job).filter(filter).find();
    }

    @Action()
    @Role(RoleType.regular)
    async getActiveJobs(): Promise<Collection<Job>> {
        return await this.entityStorage.collection(Job).filter({
            connections: {$gt: 0},
            user: this.getUserId()
        }).find();
    }

    @Action()
    @Role(RoleType.regular)
    async getJobsForCluster(cluster: string): Promise<Collection<Job>> {
        //todo, check project ids
        await this.permission.checkClusterReadAccess(cluster);

        return await this.entityStorage.collection(Job).filter({
            connections: {$gt: 0},
            cluster: cluster
        }).find();
    }

    @Action()
    @Role(RoleType.anonymouse)
    async subscribeClosedJobFiles(jobId: string): Promise<Collection<DeepKitFile>> {
        await this.permission.checkJobReadAccess(jobId);

        return await this.entityStorage.collection(DeepKitFile).filter({
            job: jobId,
            mode: FileMode.closed,
        }).find();
    }

    @Action()
    @Role(RoleType.regular)
    async subscribeClusterNodeStdout(nodeId: string): Promise<StreamBehaviorSubject<Uint8Array | undefined>> {
        await this.permission.checkClusterNodeReadAccess(nodeId);

        return await this.fs.subscribe('stdout.log', {node: nodeId});
    }

    @Action()
    @Role(RoleType.regular)
    async getJobAccessToken(jobId: string): Promise<string | undefined> {
        await this.permission.checkJobWriteAccess(jobId);

        const job = await this.database.query(Job).filter({id: jobId}).findOneOrUndefined();
        if (job) {
            return job.accessToken;
        }
    }

    @Action()
    @Role(RoleType.anonymouse)
    async jobFileExists(jobId: string, filePath: string): Promise<boolean> {
        await this.permission.checkJobReadAccess(jobId);

        return Boolean(await this.fs.findOne(filePath, {job: jobId}));
    }

    @Action()
    @Role(RoleType.regular)
    async jobs(projectId: string): Promise<Job[]> {
        await this.permission.checkProjectReadAccess(projectId);
        return await this.database.query(Job).filter({project: projectId}).find();
    }

    @Action()
    @Role(RoleType.regular)
    async jobUploadFile(jobId: string, path: string, md5: string, content: string): Promise<boolean> {
        await this.permission.checkJobWriteAccess(jobId);
        await this.fs.write(path, Buffer.from(content, 'base64'), {
            job: jobId,
        });
        return true;
    }

    /**
     * Registers a file for a job, where the file content (its md5) already exists.
     */
    @Action()
    @Role(RoleType.regular)
    async jobRegisterFile(jobId: string, path: string, md5: string): Promise<boolean> {
        await this.permission.checkJobWriteAccess(jobId);
        await this.fs.registerFile(md5, path, {job: jobId});
        return true;
    }

    @Action()
    @Role(RoleType.regular)
    @f.array(String)
    async missingFiles(@f.array(String) md5s: string[]): Promise<string[]> {

        //todo, this is probably a security whole? Someone could bruteforce all md5s to check which file exists. but for what?
        const missingMd5s: string[] = [];

        for (const md5 of md5s) {
            if (!(await this.fs.hasMd5(md5))) {
                missingMd5s.push(md5);
            }
        }

        return missingMd5s;
    }

    @Action()
    @Role(RoleType.regular)
    @f.type(Job)
    async addJob(job: Job): Promise<Job> {
        await this.permission.checkProjectWriteAccess(job.project);
        job.user = this.getAuthenticatedUserId();
        const newFields = await this.exchangeDatabase.increase(Project, {id: job.project}, {jobNumber: 1});
        job.number = newFields.jobNumber;
        await this.jobManager.handleNewJob(job);
        await this.exchangeDatabase.add(job);
        return job;
    }

    /**
     * Used by SDKs for direct experiments without CLI.
     */
    @Action()
    @Role(RoleType.regular)
    @f.type(Job)
    async createJob(project: string, @f.optional() parentExperimentId?: string): Promise<Job> {
        await this.permission.checkProjectWriteAccess(project);
        const job = new Job(project);

        if (parentExperimentId) {
            await this.permission.checkJobWriteAccess(parentExperimentId);
            const newFields = await this.exchangeDatabase.increase(Job, {id: parentExperimentId}, {childNumber: 1}, ['level', 'numberString', 'number']);
            job.number = newFields.childNumber;
            job.level = (newFields.level || 0) + 1;
            const parentNumberString: string = newFields.numberString || String(newFields.number);
            job.fullNumber = parentNumberString + '.' + job.number;
            job.parent = parentExperimentId;
        } else {
            const newFields = await this.exchangeDatabase.increase(Project, {id: project}, {jobNumber: 1});
            job.number = newFields.jobNumber;
        }

        job.selfExecution = true;
        job.status = JobStatus.running;
        job.started = new Date();
        job.user = this.getAuthenticatedUserId();

        await this.jobManager.handleNewJob(job);
        job.prepareTaskInstances();
        job.getTask('main').started = new Date();
        job.getTask('main').getInstance(0).started = new Date();

        await this.exchangeDatabase.add(job);

        return job;
    }

    @Action()
    @Role(RoleType.regular)
    @f.array(QueueResult)
    async queueJob(jobId: string, priority: number): Promise<QueueResult[]> {
        await this.permission.checkJobWriteAccess(jobId);
        const job = await this.database.query(Job).filter({id: jobId}).findOne();
        const project = await this.database.query(Project).filter({id: job.project}).findOne();

        return await this.jobManager.queueJob(project, job);
    }

    @Action()
    @Role(RoleType.regular)
    async projectGitRefresh(projectId: string): Promise<void> {
        await this.permission.checkProjectReadAccess(projectId);

        this.projectManager.refreshGit(projectId).catch((e) => {
            console.log('projectGitRefresh failed', projectId, e);
        });
    }

    @Action()
    @Role(RoleType.regular)
    @f.array(SourceFile)
    async startJobSharing(jobId: string): Promise<void> {
        await this.permission.checkJobWriteAccess(jobId);
        const jobShareToken = await this.database.query(Job).filter({id: jobId}).findOneField('shareToken');
        if (jobShareToken) {
            return;
        }

        const newToken = uuid();
        await this.exchangeDatabase.patch(Job, jobId, {shareToken: newToken});
    }

    @Action()
    @Role(RoleType.regular)
    @f.array(SourceFile)
    async stopJobSharing(jobId: string): Promise<void> {
        await this.permission.checkJobWriteAccess(jobId);
        await this.exchangeDatabase.patch(Job, jobId, {shareToken: null});
    }

    @Action()
    @Role(RoleType.anonymouse)
    @f.array(SourceFile)
    async projectGitFiles(projectId: string, branch: string, path: string): Promise<SourceFile[]> {
        await this.permission.checkProjectReadAccess(projectId);

        return this.projectManager.getGitFiles(projectId, branch, path);
    }

    @Action()
    @Role(RoleType.anonymouse)
    @f.type(String).optional()
    async projectGitFileUtf8Content(projectId: string, branch: string, path: string): Promise<string | undefined> {
        await this.permission.checkProjectReadAccess(projectId);

        return await this.projectManager.projectGitFileUtf8Content(projectId, branch, path);
    }

    @Action()
    @Role(RoleType.anonymouse)
    @f.array(JobConfig)
    async projectGitExperimentFiles(projectId: string, branch: string): Promise<JobConfig[]> {
        await this.permission.checkProjectReadAccess(projectId);

        return await this.projectManager.getGitExperimentFiles(projectId, branch);
    }
}
