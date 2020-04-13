/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    BinaryWriter,
    Job,
    JobControllerInterface,
    JobPeerControllerInterface,
    JobTask,
    JobTaskInstance,
    SimplePatches
} from "@deepkit/core";
import path from "path";
import fs from "fs-extra";
import {JobClient} from "./client-controller";
import {arrayRemoveItem, average, eachPair, humanBytes, stack, time, sleep} from "@marcj/estdlib";
import {Subject} from "rxjs";
import {bufferTime} from "rxjs/operators";
import {Action} from "@marcj/glut-core";
import {sync as fastGlobSync} from "fast-glob";
import {join} from "path";
import relative from "relative";
import md5File from "md5-file/promise";
import {AuthenticationError} from "@marcj/glut-client";
import cliProgress from 'cli-progress';
import { TypedArrayWriter } from '@deepkit/core';
import {findFiles} from "./util/files";

class PatchOperation {
    id: number;
    path: string;
    value: any;

    sending: boolean = false;

    constructor(id: number, path: string, value: any) {
        this.id = id;
        this.path = path;
        this.value = value;
    }
}

type Operation = PatchOperation;

export type RemoveReturnFn<T extends ((...args: any[]) => any)> = (...args: Parameters<T>) => void;
export type BufferedController<T> = {
    [P in keyof T]: T[P] extends (...args: any[]) => any ? RemoveReturnFn<T[P]> : never
};

class BufferedApiController<K> {
    public readonly api: BufferedController<K>;

    public readonly queue: { name: string, args: any[], sending: false }[] = [];

    constructor(protected originalApi: K) {
        const t = this;

        this.api = new Proxy(originalApi, {
            get: (target: any, propertyName: string) => {
                return function () {
                    const actionName = String(propertyName);
                    const args = Array.prototype.slice.call(arguments);

                    t.queue.push({
                        name: actionName,
                        args: args,
                        sending: false,
                    });
                };
            }
        }) as any;
    }

    /**
     * Returns false when the queue couldn't get cleared due to connection issues.
     */
    @stack()
    async sync(progress?: (item: number) => void): Promise<boolean> {
        if (!this.queue.length) return true;

        const q = this.queue.slice(0);

        let allCleared = true;
        let item = 0;
        for (const op of q) {
            try {
                await (this.originalApi as any)[op.name](...op.args);
                arrayRemoveItem(this.queue, op);
                if (progress) {
                    progress(item++);
                }
            } catch {
                //stop syncing, and try again in 1 second.
                allCleared = false;
                break;
            }
        }

        if (this.queue.length) {
            return false;
        }

        return true;
    }
}

export class JobStorage {
    protected syncOpsToFileTimer?: NodeJS.Timer;
    protected syncDataToServerTimer?: NodeJS.Timer;

    public readonly bufferedJob: BufferedApiController<JobControllerInterface>;

    protected secondsPerIterations: { diff: number, when: Date }[] = [];
    protected lastIterationDate?: Date;
    protected lastBatchDate?: Date;

    protected opId: number = 0;
    protected ops: Operation[] = [];
    protected opsPathMap: { [path: string]: Operation } = {};

    protected logSubject = new Subject<{ name: string, content: string }>();
    protected channelSubject = new Subject<{ id: string, row: any[] }>();
    protected speedSubject = new Subject<number[]>();
    public readonly deleteInstanceFolderWhenDone: {path: string, callback: Function}[] = [];

    public readonly queuedFileCommit: {
        instanceFilesPath: string,
        taskName: string,
        instance: number,
        pattern: string[]
    }[] = [];

    protected stopped = false;

    constructor(
        public readonly client: JobClient,
        public readonly projectName: string,
        public readonly job: Job,
        public readonly filesDir: string,
        public readonly opsPath: string,
    ) {

        this.bufferedJob = new BufferedApiController(this.client.job());
        this.syncOpsToFile();
        this.syncAllToServer();

        client.client.connection.subscribe(async (connected) => {
            if (connected) {
                class JobController implements JobPeerControllerInterface {
                    @Action()
                    stop() {
                        process.kill(process.pid, 'SIGINT');
                    }
                }

                await client.client.registerController('job/' + job.id, new JobController());
            }
        });

        this.logSubject.pipe(bufferTime(1000)).subscribe((contents) => {
            const packed: { [name: string]: string } = {};

            for (const content of contents) {
                if (!packed[content.name]) {
                    packed[content.name] = '';
                }

                packed[content.name] += content.content;
            }

            for (const [name, content] of eachPair(packed)) {
                this.bufferedJobApi.log(name, content);
            }
        });

        this.channelSubject.pipe(bufferTime(1000)).subscribe((channels) => {
            const sizes = new Map<string, number>();
            const packed: { [id: string]: BinaryWriter } = {};

            for (const channel of channels) {
                //uint8 + uint16 + float64 + float 64, field1-float64, field2-float64...
                //row = [x, time, field1, field2]
                sizes.set(channel.id, (sizes.get(channel.id) || 0) + 1 + 2 + 8 + 8 + (8 * (channel.row.length - 2)));
            }

            for (const [name, bytes] of sizes.entries()) {
                packed[name] = new BinaryWriter(bytes);
            }

            for (const channel of channels) {
                packed[channel.id].putInt8(1); //version
                packed[channel.id].putUint16((channel.row.length - 2)); //dataFields

                for (const f of channel.row) {
                    packed[channel.id].putFloat32(f);
                }
            }

            for (const [id, binaryWriter] of eachPair(packed)) {
                this.bufferedJobApi.channelData(id, binaryWriter.buffer);
            }
        });

        const speedWriter = new TypedArrayWriter();
        speedWriter.add(Uint8Array, Float64Array, Float64Array, Float64Array);
        this.speedSubject.pipe(bufferTime(1000)).subscribe((rows) => {
            if (rows.length) {
                //only save latest value, each second
                speedWriter.reset();
                const lastRow = rows[rows.length - 1];
                speedWriter.push(1, lastRow[0], lastRow[1], lastRow[2]);
                this.bufferedJobApi.streamInternalFile('.deepkit/speed.metric', speedWriter.getArrayBuffer());
            }
        });
    }

    public log(name: string, content: string) {
        this.logSubject.next({name, content});
    }

    public reportSpeed(x: number, time: number, speed: number) {
        this.speedSubject.next([x, time, speed]);
    }

    public addChannelValue(id: string, x: number, y: any[] | any) {
        if (!this.job.getChannel(id)) {
            throw new Error(`Channel ${id} not created yet`);
        }

        if (!Array.isArray(y)) {
            y = [y];
        }

        this.job.channelLastValues[id] = y;
        this.patchJob({
            ['channels.' + id + '.lastValue']: y
        });

        const value = [
            x,
            time()
        ];

        this.channelSubject.next({id, row: value.concat(y)});
    }

    /**
     * Upload output files.
     */
    public async commitFiles(task: string, instance: number, rootDir: string, patterns: string[], progress?: (item: string, items: number) => void) {
        const files = await findFiles(rootDir, patterns, this.job.config.ignore);
        const md5ToPath: { [md5: string]: string } = {};
        for (const [filePath, info] of Object.entries(files)) {
            md5ToPath[info.md5] = filePath;
        }
        const missingFiles = await this.client.job().missingFiles(Object.keys(md5ToPath));

        const size = Object.keys(files).length;

        for (const [filePath, info] of Object.entries(files)) {
            if (!info.md5) {
                throw new Error(`No md5 given for ${info.relativePath}.`);
            }

            // console.log('Add output file', info.relativePath, humanBytes(info.size));
            if (progress) progress(info.relativePath + ' ' + humanBytes(info.size), size);

            if (-1 !== missingFiles.indexOf(info.md5)) {
                await this.client.job().jobUploadFile(
                    task,
                    instance,
                    info.relativePath,
                    info.md5,
                    fs.readFileSync(filePath).toString('base64')
                );
            } else {
                await this.client.job().jobRegisterFile(
                    task,
                    instance,
                    info.relativePath,
                    info.md5
                );
            }
        }

        return files;
    }

    get bufferedJobApi(): BufferedController<JobControllerInterface> {
        return this.bufferedJob.api;
    }

    public async disconnect() {
        await this.client.disconnect();
    }

    public async stop() {
        if (this.stopped) {
            throw new Error('JobStorage already stopped');
        }

        this.stopped = true;
        this.logSubject.complete();
        this.channelSubject.complete();

        if (this.syncOpsToFileTimer) {
            clearTimeout(this.syncOpsToFileTimer);
            delete this.syncOpsToFileTimer;
        }

        if (this.syncDataToServerTimer) {
            clearTimeout(this.syncDataToServerTimer);
            delete this.syncDataToServerTimer;
        }

        let i = 1;
        const progressBar = new cliProgress.Bar({
            format: `Experiment synchronisation {percentage}% {bar} {label}`,
            barsize: 20,
        }, cliProgress.Presets.shades_grey);
        // const progressBar = terminal.progressBar({width: 120, title: 'Experiment synchronized', eta: true, percent: true});
        let progressItems = 1 + this.bufferedJob.queue.length + this.queuedFileCommit.length;
        progressBar.start(progressItems, 0, {label: ''});
        let progress = 1;

        while (true) {
            // if (i > 1) {
            //     console.log('Sync try #', i++);
            // }
            if (!this.client.client.isConnected()) {
                if (i === 1) {
                    console.log('Not connected. Await connection to sync job data ...');
                }

                progressBar.update(progress, {label: 'Connecting'});

                while (true) {
                    try {
                        await this.client.client.connect();
                        break;
                    } catch (error) {
                        if (error instanceof AuthenticationError) {
                            console.error('AuthenticationError. Experiment sync aborted.');
                            process.exit(403);
                        }
                        await sleep(2);
                    }
                }
            }

            //todo, show progress bar
            //todo, show message when offline
            //todo, implement `deepkit job push` command

            progressBar.update(progress, {label: 'Meta data'});
            let allSent = await this.syncOpsToServer();
            progress++;
            progressBar.update(progress, {label: 'Meta data'});

            if (allSent) {
                allSent = await this.bufferedJob.sync((item) => {
                    progress++;
                    progressBar.update(progress, {label: 'Meta data'});
                });
            }

            if (allSent) {
                for (const commit of this.queuedFileCommit.slice(0)) {
                    try {
                        await this.commitFiles(
                            commit.taskName,
                            commit.instance,
                            commit.instanceFilesPath,
                            commit.pattern,
                            (item: string, items: number) => {
                                if (items) {
                                    progressItems += items;
                                }
                                progress++;
                                progressBar.setTotal(progressItems);
                                progressBar.update(progress, {label: 'Output file ' + commit.pattern.join(',')});
                            }
                        );

                        arrayRemoveItem(this.queuedFileCommit, commit);
                    } catch (error) {
                        console.error('Failed to send output file', error);
                        allSent = false;
                        break;
                    }
                }
            }

            if (allSent) {
                break;
            } else {
                await sleep(1);
            }
            i++;
        }

        progressBar.update(progressItems, {label: 'Done'});
        progressBar.stop();
        for (const item of this.deleteInstanceFolderWhenDone) {
            try {
                /** @see TaskExecutor.removeInstanceFiles */
                await item.callback();
            } catch (e) {
                console.log(`Could not remove job files ${path}: ${e.message}`);
            }
        }

        console.log('\nAll job data sent. Exiting.');
    }

    public async syncOutputToServer() {
        for (const commit of this.queuedFileCommit.slice(0)) {
            await this.commitFiles(
                commit.taskName,
                commit.instance,
                commit.instanceFilesPath,
                commit.pattern
            );

            arrayRemoveItem(this.queuedFileCommit, commit);
        }
    }

    /**
     * This method is called every second to make sure stuff is synced.
     */
    public async syncAllToServer() {
        if (this.syncDataToServerTimer) {
            clearTimeout(this.syncDataToServerTimer);
        }

        try {
            await this.syncOpsToServer();
            await this.bufferedJob.sync();
        } finally {
            this.syncDataToServerTimer = setTimeout(() => this.syncAllToServer(), 1000);
        }
    }

    // protected patchOps: {[path: string]: PatchOperation} = {};
    // protected fileOps: {[path: string]: FileOperation} = {};

    public setIterations(iterations: number) {
        this.patchJob({
            iterations: iterations,
        });
    }

    public setBatch(current: number, total: number, size: number) {
        const x = this.job.iteration + (current / total);
        const now = new Date;

        const speedPerSecond = this.lastBatchDate ? size / ((now.getTime() - this.lastBatchDate.getTime()) / 1000) : size;

        if (this.lastBatchDate) {
            this.secondsPerIterations.push({
                diff: ((now.getTime() - this.lastBatchDate.getTime()) * total) / 1000,
                when: now
            });
        }

        if (this.secondsPerIterations.length > 0) {
            this.job.secondsPerIteration = average(this.secondsPerIterations.map((v) => {
                return v.diff;
            }));

            const iterationsLeft = this.job.iterations - this.job.iteration;
            this.job.eta = this.job.secondsPerIteration * (iterationsLeft - (current / total));
        }

        this.lastBatchDate = now;

        this.patchJob({speed: speedPerSecond, secondsPerIteration: this.job.secondsPerIteration, eta: this.job.eta});
        this.reportSpeed(x, this.lastBatchDate.getTime(), speedPerSecond);
    }

    public setIteration(iteration: number) {
        this.job.iteration = iteration;
        const now = new Date;

        if (this.lastIterationDate) {
            this.secondsPerIterations.push({
                diff: (now.getTime() - this.lastIterationDate.getTime()) / 1000,
                when: now
            });
        }

        this.lastIterationDate = now;
        this.lastBatchDate = now;

        this.secondsPerIterations = this.secondsPerIterations.filter(val => {
            return (Date.now() - val.when.getTime()) / 1000 < 60; //remove all older than one minute
        });

        if (this.secondsPerIterations.length > 0) {
            this.job.secondsPerIteration = average(this.secondsPerIterations.map(v => {
                return v.diff;
            }));
        }

        const iterationsLeft = this.job.iterations - this.job.iteration;
        if (iterationsLeft > 0) {
            this.job.eta = this.job.secondsPerIteration * iterationsLeft;
        } else {
            this.job.eta = 0;
        }

        this.patchJob({
            iteration: this.job.iteration,
            secondsPerIteration: this.job.secondsPerIteration,
            eta: this.job.eta,
        });
    }

    /**
     * We add all ops to in-memory array, which is modified
     * by the sync process. A second timer ensures that array is synced to file system
     * so we don't loose experiment information when process crashes.
     */
    public addOp(op: Operation) {
        let currentPath = op.path.substr(0, op.path.lastIndexOf('.'));
        while (currentPath) {
            if (this.opsPathMap[currentPath]) {
                //when we have a op already setting the parent, element, don't use this op,
                //as it would result in a conflict.
                //note: we do not copy the op.value, so the user of this method
                //should just make sure that instead the parent object should be updated,
                //so this should work perfectly fine.
                return;
            }
            currentPath = currentPath.substr(0, currentPath.lastIndexOf('.'));
        }

        const existingOperation = this.opsPathMap[op.path];
        if (op instanceof PatchOperation && existingOperation instanceof PatchOperation) {
            if (!existingOperation.sending) {
                //not in sending yet, so just set the new value and exit
                existingOperation.value = op.value;
                return;
            }
        }

        //add new one
        this.ops.push(op);

        //for PatchOperation we overwrite the old one, which is OK.
        this.opsPathMap[op.path] = op;
    }

    public async syncOpsToFile() {
        if (this.syncOpsToFileTimer) {
            clearTimeout(this.syncOpsToFileTimer);
        }

        try {
            const contents: string[] = [];
            for (const op of this.ops) {
                //todo, use marshal? what if op.value is Buffer?
                contents.push(JSON.stringify(op));
            }
            await fs.writeFile(this.opsPath, contents.join('\n'));
        } finally {
            this.syncOpsToFileTimer = setTimeout(() => this.syncOpsToFile(), 1000);
        }
    }

    protected handleApiError(error: Error) {

    }

    /**
     * Returns true of all ops have been sent. False when not.
     */
    @stack()
    public async syncOpsToServer(): Promise<boolean> {
        const sendingOps = this.ops.slice(0);
        if (sendingOps.length === 0) return true;

        const patches: SimplePatches = {};
        for (const op of sendingOps) {
            if (op instanceof PatchOperation) {
                op.sending = true;
                patches[op.path] = op.value;
            }
        }

        try {
            await this.client.job().patchJob(patches);
        } catch (error) {
            this.handleApiError(error);

            //send again next time
            for (const op of sendingOps) {
                if (op instanceof PatchOperation) {
                    op.sending = false;
                }
            }

            return false;
        }

        //successfully uploaded, so remove
        for (const op of sendingOps) {
            if (op instanceof PatchOperation) {
                op.sending = false;
                arrayRemoveItem(this.ops, op);

                //since we overwrite the old map item, when a new is added while sending,
                //we need to check first if op is still the one in opsPathMap to not remove the wrong one.
                if (this.opsPathMap[op.path] === op) {
                    delete this.opsPathMap[op.path];
                }
            }
        }

        return true;
    }

    public patchJob(patch: Partial<Pick<Job, Exclude<keyof Job, 'tasks'>>>) {
        for (const [i, v] of eachPair(patch)) {
            (this.job as any)[i] = v;
            const op = new PatchOperation(++this.opId, i, v);
            this.addOp(op);
        }
    }

    public patchTask(taskName: string, patch: Partial<Pick<JobTask, Exclude<keyof JobTask, 'instances'>>>) {
        const task = this.job.getTask(taskName);
        for (const [i, v] of eachPair(patch)) {
            (task as any)[i] = v;
            const op = new PatchOperation(++this.opId, 'tasks.' + taskName + '.' + i, v);
            this.addOp(op);
        }
    }

    public patchInstance(taskName: string, replica: number, patch: Partial<JobTaskInstance>) {
        const instance = this.job.getTask(taskName).getInstance(replica);
        for (const [i, v] of eachPair(patch)) {
            (instance as any)[i] = v;
            const op = new PatchOperation(++this.opId, 'tasks.' + taskName + '.instances.' + replica + '.' + i, v);
            this.addOp(op);
        }
    }

    // public async addOpFile(path: string) {
    //     await this.addOp({
    //         type: 'file',
    //         path: path,
    //     });
    // }

    /**
     * Adds a file to the job file tree.
     */
    public async addFile(filePath: string, content: string) {
        //put it into checkout, so job can work with it
        const fullPath = path.join(this.filesDir, filePath);
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, content);

        this.bufferedJobApi.uploadFile(filePath, Buffer.from(content).toString('base64'));
    }
}

