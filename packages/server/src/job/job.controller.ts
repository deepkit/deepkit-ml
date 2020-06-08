/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Exchange, ExchangeDatabase, FS, ProcessLocker} from "@marcj/glut-server";
import {Role} from "../utils";
import {
    Channel,
    DeepKitFile,
    Job,
    JobControllerInterface,
    JobDebuggingState,
    JobFileType,
    JobInsight,
    JobModelGraphInfo,
    JobModelSnapshot,
    JobQueueItem,
    JobStatus,
    JobTaskStatus,
    Project,
    RoleType
} from "@deepkit/core";
import {ResourcesManager} from "../node/resources";
import {ProjectManager} from "../manager/project-manager";
import {PermissionManager} from "../manager/permission";
import {Injectable} from "injection-js";
import {JobSession, SessionHelper} from "../session";
import {join} from "path";
import {Action, Controller} from "@marcj/glut-core";
import {Database} from "@marcj/marshal-mongo";
import {eachPair} from "@marcj/estdlib";
import {f} from "@marcj/marshal";
import {JobManager} from "../manager/job-manager";


@Injectable()
@Controller('job')
export class JobController implements JobControllerInterface {
    protected jobSession: JobSession;
    protected pingerTimer: any;

    // protected jobSnapshotLiveId?: string;

    constructor(
        private exchange: Exchange,
        private database: Database,
        private exchangeDatabase: ExchangeDatabase,
        private resourcesManager: ResourcesManager,
        private projectManager: ProjectManager,
        private jobManager: JobManager,
        private locker: ProcessLocker,
        private fs: FS<DeepKitFile>,
        private permissionManager: PermissionManager,
        private sessionHelper: SessionHelper,
    ) {
        this.jobSession = sessionHelper.getJobSession();
        console.log('new JobClient', this.jobSession);

        this.pingerTimer = setInterval(async () => {
            await this.database.query(Job).filter({id: this.jobSession.jobId}).patchOne({
                ping: new Date(),
            });
        }, 2000);

    }

    /**
     * This is a special method by Glut.ts executed as soon as the first action arrives.
     * Todo: refactor that shit to a decorator, holy cow.
     */
    public async initPerConnection() {
        await this.exchangeDatabase.increase(Job, {id: this.jobSession.jobId}, {
            connections: 1
        });

        // this.jobSnapshotLiveId = liveSnapshotId;

        await this.exchangeDatabase.patch(Job, this.jobSession.jobId, {
            ping: new Date(),
        });
    }

    /**
     * This is a special method by Glut.ts executed as soon as the client disconnects.
     */
    public async destroy() {
        console.log('destroy job connection');
        clearInterval(this.pingerTimer);

        try {
            await this.exchangeDatabase.increase(Job, {id: this.jobSession.jobId}, {
                connections: -1
            });

            await this.exchangeDatabase.patch(Job, this.jobSession.jobId, {
                ping: new Date(),
            });
        } catch (e) {
        }

        //important to clear all listeners here
    }

    @Action()
    @Role(RoleType.job)
    @f.array(String)
    async missingFiles(@f.array(String) md5s: string[]): Promise<string[]> {
        const missingMd5s: string[] = [];

        for (const md5 of md5s) {
            if (!(await this.fs.hasMd5(md5))) {
                missingMd5s.push(md5);
            }
        }

        return missingMd5s;
    }

    @Action()
    @Role(RoleType.job)
    async jobUploadFile(task: string, instance: number, path: string, md5: string, content: string): Promise<boolean> {
        await this.fs.write(path, Buffer.from(content, 'base64'), {
            job: this.jobSession.jobId,
            task: task,
            instance: instance,
            jobType: JobFileType.output,
        });
        return true;
    }

    /**
     * Registers a file for a job, where the file content (its md5) already exists.
     */
    @Action()
    @Role(RoleType.job)
    async jobRegisterFile(task: string, instance: number, path: string, md5: string): Promise<boolean> {
        await this.fs.registerFile(md5, path, {
            job: this.jobSession.jobId,
            task: task,
            instance: instance,
            jobType: JobFileType.output,
        });
        return true;
    }

    /**
     * Used by Python SDK.
     */
    @Action()
    @Role(RoleType.job)
    async addInsight(
        x: number,
        time: number,
        @f.optional() epoch?: number,
        @f.optional() step?: number
    ): Promise<void> {
        const s = new JobInsight();
        s.x = x;
        s.epoch = epoch;
        s.step = step;
        s.time = new Date(time * 1000);

        const path = `.deepkit/insights.json`;

        await this.fs.stream(path, Buffer.from(JSON.stringify(s) + '\n'), {
            job: this.jobSession.jobId,
            jobType: JobFileType.internal
        });
    }

    /**
     * Used by Python SDK.
     */
    @Action()
    @Role(RoleType.job)
    async addInsightEntry(
        x: number,
        name: string,
        @f created: Date,
        @f.any().optional() meta?: any,
        @f.any().optional() data?: any,
    ): Promise<void> {
        if (!data) return;
        const path = `.deepkit/insight/${x}/${name}`;

        await this.fs.write(path, Buffer.from(data, 'base64'), {
            job: this.jobSession.jobId,
            meta: meta,
            created: created,
            jobType: JobFileType.internal,
        });
    }

    /**
     * Used by Python SDK.
     */
    @Action()
    @Role(RoleType.job)
    async addSnapshot(
        x: number,
        time: number,
        @f.array(String) layerNames: string[],
        @f.optional() epoch?: number,
        @f.optional() step?: number
    ): Promise<void> {
        const s = new JobModelSnapshot();
        s.x = x;
        s.layerNames = layerNames;
        s.epoch = epoch;
        s.step = step;
        s.time = new Date(time * 1000);

        const path = `.deepkit/debug/snapshot/snapshots.json`;

        await this.fs.stream(path, Buffer.from(JSON.stringify(s) + '\n'), {
            job: this.jobSession.jobId,
            jobType: JobFileType.internal
        });
    }


    /**
     * Used by Python SDK.
     */
    @Action()
    @Role(RoleType.job)
    async setModelGraph(@f.any() graph: any, @f name: string): Promise<boolean> {
        name = name.replace(/\./g, '-');

        const path = '.deepkit/model-graphs/' + name + '.json';
        await this.fs.write(path, JSON.stringify(graph), {
            job: this.jobSession.jobId,
            jobType: JobFileType.internal
        });

        const graphInfo = new JobModelGraphInfo();
        graphInfo.path = path;
        await this.exchangeDatabase.patch(Job, this.jobSession.jobId, {
            ['graphInfos.' + name]: graphInfo,
        });
        return true;
    }

    /**
     * Used by Python SDK.
     */
    @Action()
    @Role(RoleType.job)
    async getDebuggingState(): Promise<JobDebuggingState> {
        return await this.database.query(Job).filter({id: this.jobSession.jobId}).findOneField('debuggingState');
    }

    /**
     * Used by Python SDK.
     */
    @Action()
    @Role(RoleType.job)
    async setSnapshotLayerData(
        x: number,
        andAsLive: boolean,
        layerId: string,
        @f.any().optional() output?: any,
        @f.optional() outputImage?: string,
        @f.optional() activations?: string,
        @f.optional() weights?: string,
        @f.optional() biases?: string
    ): Promise<void> {
        const basePath = `.deepkit/debug/snapshot/${x}/${layerId}`;

        const promises: Promise<any>[] = [];

        if (output || outputImage) {
            const buf = outputImage ? Buffer.from(outputImage, 'base64') : Buffer.from(JSON.stringify(output));
            promises.push(this.fs.write(`${basePath}/output`, buf, {
                job: this.jobSession.jobId,
                jobType: JobFileType.internal,
            }));
        }

        if (activations) {
            const path = `${basePath}/activations`;
            promises.push(this.fs.write(path, Buffer.from(activations, 'base64'), {
                job: this.jobSession.jobId,
                jobType: JobFileType.internal,
            }));
        }

        if (weights) {
            const path = `${basePath}/weights`;
            promises.push(this.fs.write(path, Buffer.from(weights, 'base64'), {
                job: this.jobSession.jobId,
                jobType: JobFileType.internal,
            }));
        }

        if (biases) {
            const path = `${basePath}/biases`;
            promises.push(this.fs.write(path, Buffer.from(biases, 'base64'), {
                job: this.jobSession.jobId,
                jobType: JobFileType.internal,
            }));
        }

        if (andAsLive) {
            promises.push(this.addLiveLayerData(layerId, output, outputImage, activations, weights, biases));
        }

        await Promise.all(promises);
    }

    /**
     * Used by Python SDK.
     */
    @Action()
    @Role(RoleType.job)
    async addLiveLayerData(
        layerId: string,
        @f.any().optional() output?: any,
        @f.optional() outputImage?: string,
        @f.optional() activations?: string,
        @f.optional() weights?: string,
        @f.optional() biases?: string
    ): Promise<void> {
        const basePath = `debugger/snapshot/${this.jobSession.jobId}/live/${layerId}/`;
        const ttl = 10;

        if (output || outputImage) {
            const buf = outputImage ? Buffer.from(outputImage, 'base64') : Buffer.from(JSON.stringify(output));
            this.exchange.publishBinary(basePath + 'output', buf, ttl);
        }

        if (activations) {
            this.exchange.publishBinary(basePath + 'activations', Buffer.from(activations, 'base64'), ttl);
        }
        if (weights) {
            this.exchange.publishBinary(basePath + 'weights', Buffer.from(weights, 'base64'), ttl);
        }
        if (biases) {
            this.exchange.publishBinary(basePath + 'biases', Buffer.from(biases, 'base64'), ttl);
        }
    }

    @Action()
    @Role(RoleType.job)
    async patchJob(@f.partial(Job) patches: Partial<Job>): Promise<number> {
        const doc = await this.exchangeDatabase.patch(Job, this.jobSession.jobId, patches);

        return doc.version;
    }

    @Action()
    @Role(RoleType.job)
    async getProjectName(): Promise<string> {
        const job = await this.database.query(Job).filter({id: this.jobSession.jobId}).findOneOrUndefined();
        if (job) {
            const project = await this.database.query(Project).filter({id: job.project}).findOneOrUndefined();
            if (project) {
                return project.name;
            }
        }

        throw new Error('No project found for job ' + this.jobSession.jobId);
    }

    @Action()
    @Role(RoleType.job)
    async taskInstanceStarted(taskName: string, taskInstance: number): Promise<void> {
        const job = await this.database.query(Job).filter({id: this.jobSession.jobId}).findOneOrUndefined();

        if (!job) return;

        const lock = await this.locker.acquireLock('job/' + job.id);
        try {
            const patches: { [path: string]: any } = {};

            const task = job.getTask(taskName);

            //set task status/started if necessary
            if (!task.areAllInstancesEnded()) {
                if (!task.started) {
                    patches['tasks.' + task.name + '.started'] = new Date();
                }

                patches['tasks.' + task.name + '.status'] = JobTaskStatus.started;
            }

            //set job status/started if necessary
            if (!job.isRunning()) {
                patches['status'] = JobStatus.running;
                patches['started'] = new Date;
            }

            if (Object.keys(patches).length) {
                await this.exchangeDatabase.patch(Job, this.jobSession.jobId, patches);
            }
        } finally {
            await lock.unlock();
        }

        //trigger job events (no concept yet)
    }

    @Action()
    @Role(RoleType.job)
    @f.array(DeepKitFile)
    async getJobFiles(): Promise<DeepKitFile[]> {
        return await this.database.query(DeepKitFile).filter({
            job: this.jobSession.jobId,
            jobType: {$in: [JobFileType.input, JobFileType.output]},
        }).find();
    }

    @Action()
    @Role(RoleType.job)
    @f.type(Job).optional()
    async getJob(): Promise<Job | undefined> {
        return await this.database.query(Job).filter({id: this.jobSession.jobId}).findOneOrUndefined();
    }

    @Action()
    @Role(RoleType.job)
    async getJobFileContent(filePath: string): Promise<string | undefined> {
        const buffer = await this.fs.read(filePath, {job: this.jobSession.jobId});

        if (buffer) {
            return buffer.toString('base64');
        }

        return;
    }

    /**
     * We should probably just call this at disconnect when verified that the job task instance ended?
     * @param taskName
     * @param taskInstance
     */
    @Action()
    @Role(RoleType.job)
    async taskInstanceEnded(taskName: string, taskInstance: number): Promise<void> {
        const lock = await this.locker.acquireLock('job/' + this.jobSession.jobId);

        const job = await this.database.query(Job).filter({id: this.jobSession.jobId}).findOneOrUndefined();
        if (!job) {
            console.log('job already deleted');
            return;
        }

        if (job.isEnded()) {
            console.log('job already ended');
            //job is already ended, so don't do anything. especially not starting new tasks.
            return;
        }

        const project = await this.database.query(Project).filter({id: job.project}).findOne();

        try {
            const patches: { [path: string]: any } = {};

            const task = job.getTask(taskName);

            //set task status/ended if necessary
            if (task.areAllInstancesEnded()) {
                task.status = task.calculateStatusByInstances();
                task.ended = new Date();
                patches['tasks.' + taskName + '.status'] = task.calculateStatusByInstances();
                patches['tasks.' + taskName + '.ended'] = new Date();
            }

            //set job status/ended if necessary
            if (job.hasPendingTasks()) {
                //assign next
                const openTasks = job.getNextTasksToStart();

                for (const task of openTasks) {
                    const item = new JobQueueItem(project.owner, job.id);
                    item.task = task.name;
                    item.priority = job.config.priority;
                    await this.exchangeDatabase.add(item);
                }

                await this.resourcesManager.assignJobs();
            } else {
                patches['status'] = job.calculateStatusByTasks();
                patches['ended'] = new Date;
            }

            if (Object.keys(patches).length) {
                await this.exchangeDatabase.patch(Job, this.jobSession.jobId, patches);
            }
        } catch (error) {
            console.error('taskInstanceEnded error', error);
            throw error;
        } finally {
            await lock.unlock();
        }

        //trigger job events (no concept yet)
    }

    @Action()
    @Role(RoleType.job)
    async uploadFile(path: string, content: string): Promise<boolean> {
        await this.fs.write(path, Buffer.from(content, 'base64'), {
            job: this.jobSession.jobId,
        });
        return true;
    }

    @Action()
    @Role(RoleType.job)
    async uploadOutputFile(path: string, content: string): Promise<boolean> {
        await this.fs.write(path, Buffer.from(content, 'base64'), {
            job: this.jobSession.jobId,
            jobType: JobFileType.output
        });
        return true;
    }

    @Action()
    @Role(RoleType.job)
    async streamInternalFile(path: string, data: ArrayBuffer): Promise<boolean> {
        await this.fs.stream(path, Buffer.from(data), {
            job: this.jobSession.jobId,
            jobType: JobFileType.internal
        });

        return true;
    }

    @Action()
    @Role(RoleType.job)
    async log(name: string, content: string): Promise<boolean> {
        const path = join('.deepkit', 'log', name + '.txt');

        await this.fs.stream(path, Buffer.from(content, 'utf8'), {
            job: this.jobSession.jobId,
            jobType: JobFileType.internal
        });

        return true;
    }

    /**
     * Used by the SDK
     */
    @Action()
    @Role(RoleType.job)
    async addLabel(labelName: string): Promise<void> {
        const labelId = await this.projectManager.addOrReturnExperimentLabel(this.jobSession.projectId, labelName);
        await this.jobManager.addLabel(this.jobSession.jobId, labelId);
    }

    @Action()
    @Role(RoleType.job)
    async setList(@f.type(String).optional() name: string | 'ci' | null): Promise<void> {
        if (name === null) {
            await this.exchangeDatabase.patch(Job, this.jobSession.jobId, {
                list: null,
            });
        } else if (name === 'ci') {
            await this.exchangeDatabase.patch(Job, this.jobSession.jobId, {
                list: null,
                ci: true
            });
        } else {
            const listId = await this.projectManager.addOrReturnExperimentList(this.jobSession.projectId, name);
            await this.exchangeDatabase.patch(Job, this.jobSession.jobId, {
                list: listId,
            });
        }
    }

    @Action()
    @Role(RoleType.job)
    async removeLabel(labelName: string): Promise<void> {
        const labelId = await this.projectManager.getExperimentLabelIdOrUndefined(this.jobSession.projectId, labelName);
        if (labelId) {
            await this.jobManager.removeLabel(this.jobSession.jobId, labelId);
        }
    }

    @Action()
    @Role(RoleType.job)
    async defineMetric(name: string, @f.partial(Channel) partialMetric: Partial<Channel>): Promise<boolean> {
        const metric = new Channel();

        for (const [i, v] of eachPair(partialMetric)) {
            (metric as any)[i] = v;
        }

        await this.exchangeDatabase.patch(Job, this.jobSession.jobId, {
            ['channels.' + name]: metric
        });

        return true;
    }

    @Action()
    @Role(RoleType.job)
    async debugSnapshot(@f.any() graph: any): Promise<boolean> {
        this.patchJob({
            ['debugSnapshots.' + Date.now()]: {graph: graph}
        });
        return true;
    }

    @Action()
    @Role(RoleType.job)
    async channelData(channelName: string, data: ArrayBuffer): Promise<boolean> {
        const path = join('.deepkit', 'channel', channelName, 'metrics');
        const view = new DataView(data);

        // console.log('got channel data', data.byteLength, {
        //     rows: data.byteLength / 27,
        //     version: view.getUint8(0),
        //     fields: view.getUint16(1, true),
        //     x: view.getFloat64(3, true),
        // });

        await this.fs.stream(path, Buffer.from(data), {
            job: this.jobSession.jobId,
            jobType: JobFileType.internal
        });

        return true;
    }

    @Action()
    @Role(RoleType.job)
    async streamJsonFile(path: string, @f.any() rows: any[][]): Promise<boolean> {
        const content = rows.map(v => {
            const json = JSON.stringify(v);
            return json.substr(1, json.length - 2);
        }).join('\n') + '\n';

        await this.fs.stream(path, Buffer.from(content, 'utf8'), {
            job: this.jobSession.jobId
        });

        return true;
    }
}
