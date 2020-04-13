/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Action, Collection, Controller, EntitySubject, StreamBehaviorSubject} from "@marcj/glut-core";
import {DeepKitFile, Job, PublicJobControllerInterface, Project, RoleType, JobFileType} from "@deepkit/core";
import {Buffer} from "buffer";
import {Role} from "../utils";
import {ServerSettings} from "../model/server";
import {SessionHelper} from "../session";
import {Database} from "@marcj/marshal-mongo";
import {EntityStorage, Exchange, ExchangeDatabase, FS} from "@marcj/glut-server";
import {ResourcesManager} from "../node/resources";
import {SessionPermissionManager} from "../manager/session-permission";

/**
 * This class is used to access data for the job view.
 * Can be anonymouse access!
 */
@Controller('public/job')
export class PublicJobController implements PublicJobControllerInterface {

    protected jobAccessTokens: { [jobId: string]: string } = {};

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
    ) {
    }

    /**
     * This authorizes this connection to access a job.
     */
    @Action()
    @Role(RoleType.anonymouse)
    async authorizeConnection(id: string, accessToken: string): Promise<void> {
        this.jobAccessTokens[id] = accessToken;
        await this.permission.checkJobReadAccess(id, accessToken);
    }

    @Action()
    @Role(RoleType.anonymouse)
    async subscribeJob(id: string): Promise<EntitySubject<Job>> {
        await this.checkJobReadAccess(id);
        return await this.entityStorage.findOne(Job, {id: id});
    }

    protected async checkJobReadAccess(id: string) {
        await this.permission.checkJobReadAccess(id, this.jobAccessTokens[id]);
    }

    @Action()
    @Role(RoleType.anonymouse)
    async subscribeProjectForJob(id: string): Promise<EntitySubject<Project>> {
        await this.checkJobReadAccess(id);
        //if the current user has read-access to that job, we assume he has
        //light read access to the project, at least the public part of it.
        const projectId = await this.database.query(Job).filter({id: id}).findOneField('project');
        return await this.entityStorage.findOne(Project, {id: projectId});
    }

    @Action()
    @Role(RoleType.anonymouse)
    async subscribeJobFileContent(jobId: string, filePath: string): Promise<StreamBehaviorSubject<Uint8Array | undefined>> {
        await this.checkJobReadAccess(jobId);

        return await this.fs.subscribe(filePath, {job: jobId});
    }

    @Action()
    @Role(RoleType.anonymouse)
    async getJobFileContent(jobId: string, filePath: string): Promise<Buffer | undefined> {
        await this.checkJobReadAccess(jobId);

        return await this.fs.read(filePath, {job: jobId});
    }

    @Action()
    @Role(RoleType.anonymouse)
    async getJobFileTextContent(jobId: string, path: string): Promise<string | undefined> {
        await this.checkJobReadAccess(jobId);
        const result = await this.fs.read(path, {job: jobId});

        if (result instanceof Buffer) {
            return result.toString('utf8');
        }

        return;
    }

    @Action()
    @Role(RoleType.anonymouse)
    async subscribeJobFiles(jobId: string): Promise<Collection<DeepKitFile>> {
        await this.checkJobReadAccess(jobId);

        return await this.entityStorage.collection(DeepKitFile).filter({
            job: jobId
        }).find();
    }

    @Action()
    @Role(RoleType.anonymouse)
    async subscribeJobLiveDebugData(jobId: string, path: string): Promise<StreamBehaviorSubject<Uint8Array | undefined>> {
        await this.checkJobReadAccess(jobId);
        const basePath = `debugger/snapshot/${jobId}/live/`;

        const subject = new StreamBehaviorSubject<Uint8Array | undefined>(undefined);
        const sub = this.exchange.subscribe(basePath + path, (message: ArrayBuffer) => {
            subject.next(new Uint8Array(message));
        }, true);
        subject.addTearDown(() => {
            sub.unsubscribe();
        });

        return subject;
    }

    @Action()
    @Role(RoleType.anonymouse)
    async subscribeInsights(jobId: string, x: number): Promise<Collection<DeepKitFile>>  {
        await this.checkJobReadAccess(jobId);
        const regex = new RegExp(`^\.deepkit/insight/${x}/`);

        return await this.entityStorage.collection(DeepKitFile).filter({
            job: jobId,
            jobType: JobFileType.internal,
            path: {$regex: regex},
        }).find();
    }

    // @Action()
    // @Role(RoleType.anonymouse)
    // async subscribeJobLiveGraphSnapshots(jobId: string): Promise<Collection<JobModelGraphSnapshot>> {
    //     await this.checkJobReadAccess(jobId);
    //     return await this.entityStorage.collection(JobModelGraphSnapshot).filter({
    //         job: jobId
    //     }).find();
    // }
    //
    // @Action()
    // @Role(RoleType.anonymouse)
    // async subscribeJobLiveGraphSnapshot(jobId: string) {
    //     await this.checkJobReadAccess(jobId);
    //
    //     //todo this might not be existing yet. what to do?
    //     return await this.entityStorage.findOne(JobModelGraphSnapshot, {
    //         job: jobId
    //     });
    // }
}
