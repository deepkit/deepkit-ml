/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import 'reflect-metadata';
import os from 'os';
import fs from 'fs-extra';
import {remove} from 'fs-extra';
import {
    ClusterNodeJobStartConfig,
    HomeAccountConfig,
    humanizeTime,
    Job,
    JobAssignedResourcesGpu,
    JobConfig,
    JobGit,
    JobStatus,
    JobTask,
    JobTaskConfig,
    JobTaskInstanceStatus,
    JobTaskStatus,
    Project
} from '@deepkit/core';
import {sync as fastGlobSync} from 'fast-glob';
import md5File from 'md5-file/promise';
import relative from 'relative';
import {TaskExecuteExitCodes, TaskExecutor} from "./task";
import {Docker, getCWD, getJobConfig, getJobHomeDir, normalizeRelativePathToBeIncluded} from "@deepkit/core-node";
import {JobStorage} from "./job-storage";
import path, {dirname} from "path";
import {join} from "path";
import {eachPair, empty, humanBytes, setPathValue} from "@marcj/estdlib";
import {ClientController, JobClient, UserClient} from "./client-controller";
import * as Git from 'isomorphic-git';
import {GPUReader} from "./gpu";
import {findFiles} from "./util/files";

export type StartedFlags = Partial<{
    node: string[],
    priority: number,
    cluster: boolean,
    debug: boolean,
    file: string,
    config: string[],

    cpu: number,
    minCpu: number,
    maxCpu: number,
    memory: number,
    minMemory: number,
    maxMemory: number,
    gpu: number,
    minGpu: number,
    maxGpu: number,

    gpuMemory: number,
}>;

export class Starter {
    private files: { [path: string]: { relativePath: string; size: number; md5: string } } = {};

    public async create(
        account: HomeAccountConfig,
        userController: UserClient,
        flags: StartedFlags,
        project: Project,
        rootDir: string,
        config?: JobConfig
    ): Promise<number> {
        const job = new Job(project.id);

        if (config) {
            job.config = config;
        } else {
            const config = flags.file || 'deepkit.yml';
            const configFile = path.isAbsolute(config) ? config : path.join(getCWD(), config);
            const relativePath = path.relative(rootDir, configFile);

            if (fs.existsSync(configFile)) {
                job.config = await getJobConfig(relativePath, undefined, rootDir);
            } else {
                throw new Error(`No deepkit configuration found ${configFile}.`);
            }
        }

        job.config.priority = flags.priority ? flags.priority : 0;

        if (flags.node && flags.node.length > 0) {
            job.config.nodes = flags.node;
        }

        if (flags.cpu) {
            job.config.resources.cpu = flags.cpu;
        }

        if (flags.minCpu) {
            job.config.resources.minCpu = flags.minCpu;
        }

        if (flags.maxCpu) {
            job.config.resources.maxCpu = flags.maxCpu;
        }

        if (flags.memory) {
            job.config.resources.memory = flags.memory;
        }

        if (flags.minMemory) {
            job.config.resources.minMemory = flags.minMemory;
        }

        if (flags.maxMemory) {
            job.config.resources.maxMemory = flags.maxMemory;
        }

        if (flags.gpu) {
            job.config.resources.gpu = flags.gpu;
        }

        if (flags.minGpu) {
            job.config.resources.minGpu = flags.minGpu;
        }

        if (flags.maxGpu) {
            job.config.resources.maxGpu = flags.maxGpu;
        }

        if (flags.gpuMemory) {
            job.config.resources.minGpuMemory = flags.gpuMemory;
        }

        if (flags.config) {
            for (const p of flags.config) {
                const [k, v] = p.split('=');
                setPathValue(job.config.config, k, v);
            }
        }

        job.config.resolveInheritance();
        job.prepareTaskInstances();

        if (!flags.cluster) {
            //     const docker = new Docker();
            //     const info = await docker.info();
            //     job.assignedResources.cpu = info['NCPU'];
            //     job.assignedResources.memory = info['MemTotal'];

            let info: any = {'NCPU': 1, 'MemTotal': 1_000_000_000};
            if (job.runInDocker()) {
                try {
                    const docker = new Docker();
                    info = await docker.info();
                } catch (error) {
                    console.log('Could no connect to Docker.');
                    if ('linux' === os.platform()) {
                        console.log('If you use the snap app version, please execute "sudo snap connect deepkit:docker" to allow Docker access.');
                    }
                    console.error(error);
                }
            }

            for (const taskConfig of job.getAllTaskConfigs()) {
                const taskInfo = job.getTask(taskConfig.name);
                for (const instance of taskInfo.getInstances()) {
                    if (job.runInDocker()) {
                        instance.assignedResources.cpu = info['NCPU'];
                        instance.assignedResources.memory = Math.floor(info['MemTotal'] / 1000 / 1000 / 1000);
                    } else {
                        instance.assignedResources.cpu = os.cpus().length;
                        instance.assignedResources.memory = (os.totalmem() / 1000 / 1000 / 1000);
                    }

                    const gpuReader = new GPUReader();
                    for (const [i, gpu] of eachPair(await gpuReader.getGpus())) {
                        const assignedGpu = new JobAssignedResourcesGpu(i, gpu.name, gpu.memoryTotal);
                        instance.assignedResources.gpus.push(assignedGpu);
                    }
                }
            }
        }
        await this.fetchGitInformation(job, rootDir);

        const app = userController.app();

        if (flags.cluster) {
            job.runOnCluster = true;
        }
        job.status = JobStatus.creating;

        const createdJob = await app.addJob(job);

        // todo, add indicator in GUI and CLI.
        await this.commitJobFiles(userController, job, rootDir);

        await app.patchJob(job.id, {status: JobStatus.created});

        let exitCode = 0;

        console.log('Experiment created', '#' + createdJob.number, 'in', project.name);

        if (!flags.cluster) {
            const jobAccessToken = await app.getJobAccessToken(job.id);
            if (!jobAccessToken) {
                throw new Error('Experiment has no access token.');
            }

            //todo since job.accessToken is not transmitted (@excluded(plain)) the server defines the accessToken
            // thus we need to retrieve it and store it. In the future the accessToken is per default empty
            // and stored in another collection.
            job.accessToken = jobAccessToken;
            const jobClient = ClientController.forJob(account, job.id, jobAccessToken);
            exitCode = await this.createForLocal(jobClient, flags, project, job);
        } else {
            const result = await app.queueJob(job.id, job.config.priority);

            let exitCode = 0;

            for (const task of result) {
                let message = '';

                if (task.result === 'impossible') {
                    message = ': but no cluster with resource requirements available.';
                    exitCode = 4;
                    //todo, display max resources currently connected.
                }

                if (task.result === 'failed') {
                    message = ': but no cluster with resource requirements online. It starts automatically when cluster is online.';
                }

                console.log(`Task ${task.name} queued at position #${task.position} (priority: ${job.config.priority})${message}`);
            }

            return exitCode;
        }

        return exitCode;
    }

    public async fetchGitInformation(job: Job, pwd: string) {
        try {
            Git.plugins.set('fs', fs);

            const gitRoot = await Git.findRoot({filepath: pwd});
            if (!gitRoot) return;

            const commits = await Git.log({dir: gitRoot, ref: 'HEAD'});
            if (!commits.length) return;

            const commit = commits[0];

            if (!commit || !commit.oid) return;

            job.git = new JobGit(commit.oid!, commit.message, commit.author.email, new Date(commit.author.timestamp * 1000));
            job.git.author = commit.author.name;
        } catch (error) {
            //when .git is not found it throws an error. we don't care about that.
        }
    }

    /**
     * Sends files from dir to the server, saving it to this.files as well.
     */
    public async commitJobFiles(userController: UserClient, job: Job, dir: string) {
        const started = new Date();
        const files = await this.commitFiles(userController, job, dir);
        console.log('Added', files.size, 'files in', humanizeTime((Date.now() - started.getTime()) / 1000), 'seconds.');
    }

    /**
     * Add all files in rootDir as input files.
     */
    public async commitFiles(userController: UserClient, job: Job, rootDir: string) {
        const patterns: string[] = job.config.files.length > 0 ? job.config.files : [dirname(job.config.path)];
        const foundFiles = await findFiles(rootDir, patterns, job.config.ignore);
        const files = new Set<string>(Object.keys(foundFiles));

        const buildFiles = new Set<string>();
        for (const task of Object.values(job.config.getTasks())) {
            for (const path of task.getBuildFiles()) {
                buildFiles.add(path);
            }
        }

        for (const file of buildFiles.values()) {
            const [filePattern, target] = file.split(':');
            const stats = fs.statSync(join(rootDir, filePattern));
            if (!stats) continue;

            if (stats.isDirectory()) {
                const ignoreResolve = [rootDir].concat(job.config.ignore);
                const buildFilesResolved = await fastGlobSync<string>(
                    '**/*', {
                        ignore: ignoreResolve,
                        cwd: join(rootDir, filePattern),
                        unique: true,
                        absolute: true,
                        onlyFiles: true
                    }
                );
                for (const fullFilePath of buildFilesResolved) {
                    files.add(fullFilePath);
                }
            } else {
                files.add(join(rootDir, filePattern));
            }
        }

        console.log('Adding', files.size, 'files to experiment');

        //do something with it
        // const fileInfos: { [path: string]: { size: number; md5: string } } = {};
        const md5ToPath: { [md5: string]: string } = {};

        for (const filePath of files.values()) {
            const stats = fs.statSync(filePath);
            if (stats) {
                //max 100MB per file
                if (stats.size > 100_000_000) continue;

                const relativePath: string = normalizeRelativePathToBeIncluded(relative(rootDir, filePath));
                this.files[filePath] = {relativePath: relativePath, size: stats.size, md5: await md5File(filePath)};
                md5ToPath[this.files[filePath].md5] = filePath;
            }
        }

        const missingFiles = await userController.app().missingFiles(Object.keys(md5ToPath));

        for (const [filePath, info] of eachPair(this.files)) {
            if (info.size > 5_000_000) {
                console.log('   add big file', info.relativePath, humanBytes(info.size));
            }

            if (!info.md5) {
                throw new Error(`No md5 given for ${info.relativePath}.`);
            }

            if (-1 !== missingFiles.indexOf(info.md5)) {
                await userController.app().jobUploadFile(
                    job.id,
                    info.relativePath,
                    info.md5,
                    fs.readFileSync(filePath).toString('base64')
                );
            } else {
                await userController.app().jobRegisterFile(job.id, info.relativePath, info.md5);
            }
        }

        return files;
    }

    /**
     * Copies uploaded job files to dir. Necessary for local running jobs
     */
    public async copyJobFilesTo(dir: string) {
        for (const [filePath, info] of eachPair(this.files)) {
            const localPathCheckout = path.join(dir, info.relativePath);

            fs.ensureDirSync(path.dirname(localPathCheckout));
            fs.copySync(filePath, localPathCheckout);
        }
    }

    /**
     * For tasks started via node server only.
     */
    async startTask(
        flags: StartedFlags,
        job: Job,
        jobStorage: JobStorage,
        task: string,
        replica: number,
        jobStartConfig: ClusterNodeJobStartConfig
    ) {
        const config = job.getTaskConfig(task);
        const info = job.getTask(task);
        const taskExecutor = new TaskExecutor(jobStorage, config, info, replica, jobStartConfig);
        await taskExecutor.start(true);
    }

    /**
     * For local running jobs only.
     */
    async startAll(
        flags: StartedFlags,
        project: Project,
        job: Job,
        jobStorage: JobStorage,
    ): Promise<number> {

        jobStorage.patchJob({
            status: JobStatus.running,
            started: new Date,
        });

        const localJobConfig = new ClusterNodeJobStartConfig();
        localJobConfig.hostExecutionAllowed = true;
        localJobConfig.customMountsAllowed = true;

        return new Promise<number>((resolve, reject) => {
            //only used for failures
            const instanceErrored = async (task: JobTask, replica: number, status: JobTaskInstanceStatus, exitCode: number) => {
                //this is called multiple times when multiple tasks/instances run at the same time
                //and are aborted at the same time. so do NOT call resolve() here

                let taskStatus = JobTaskStatus.failed;
                if (status === JobTaskInstanceStatus.aborted) {
                    taskStatus = JobTaskStatus.aborted;
                }
                if (status === JobTaskInstanceStatus.failed) {
                    taskStatus = JobTaskStatus.failed;
                }
                if (status === JobTaskInstanceStatus.crashed) {
                    taskStatus = JobTaskStatus.crashed;
                }

                jobStorage.patchTask(task.name, {
                    status: taskStatus,
                    ended: new Date,
                    exitCode: exitCode
                });
            };

            let maxProcesses = 0;
            for (const task of job.getAllTaskConfigs()) {
                maxProcesses += task.replicas;
            }

            process.setMaxListeners(maxProcesses * 3);
            const taskPromises: { [name: string]: Promise<any> } = {};

            /**
             * @throws JobTaskAborted
             */
            async function startTask(taskConfig: JobTaskConfig, task: JobTask) {
                jobStorage.patchTask(task.name, {
                    status: JobTaskStatus.started,
                    started: new Date,
                });

                const promises: Promise<any>[] = [];
                for (let replica = 0; replica < taskConfig.replicas; replica++) {

                    const taskExecutor = new TaskExecutor(jobStorage, taskConfig, task, replica, localJobConfig);
                    const promise = taskExecutor.start(false);

                    promises.push(new Promise((resolve) => {
                        promise.then(async (exitCode: number) => {
                            if (exitCode === TaskExecuteExitCodes.ABORTED) {
                                await instanceErrored(task, replica, JobTaskInstanceStatus.aborted, exitCode);
                            } else if (exitCode === TaskExecuteExitCodes.FAILED) {
                                await instanceErrored(task, replica, JobTaskInstanceStatus.failed, exitCode);
                            } else if (exitCode === TaskExecuteExitCodes.CRASHED) {
                                await instanceErrored(task, replica, JobTaskInstanceStatus.crashed, exitCode);
                            }

                            //TaskExecutor started with start(false) does not send output files to the origin
                            //folder nor does it add those files to job output. We do this here
                            if (taskConfig.output && taskConfig.output.length) {
                                const foundFiles = await findFiles(
                                    taskExecutor.instanceFilesPath,
                                    taskConfig.output,
                                    job.config.ignore,
                                );

                                for (const [filePath, info] of Object.entries(foundFiles)) {
                                    fs.copySync(filePath, path.join(jobStorage.filesDir, info.relativePath), {
                                        recursive: true,
                                        overwrite: true,
                                    });
                                }

                                await jobStorage.commitFiles(
                                    taskConfig.name,
                                    replica,
                                    taskExecutor.instanceFilesPath,
                                    taskConfig.output
                                );
                            }

                            resolve();
                        }, async error => {
                            resolve();
                        });
                    }));
                }

                await Promise.all(promises);

                if (!task.isErrored()) {
                    jobStorage.patchTask(task.name, {
                        status: JobTaskStatus.done,
                        ended: new Date,
                    });
                }

                delete taskPromises[task.name];
                startNextTasks();
            }

            async function startNextTasks() {
                const erroredTask = job.getErroredTask();
                const hasRunningTasks = Object.keys(taskPromises).length > 0;

                if (!hasRunningTasks) {
                    if (erroredTask) {
                        let jobStatus = JobStatus.failed;

                        if (erroredTask.status === JobTaskStatus.aborted) {
                            jobStatus = JobStatus.aborted;
                        }

                        if (erroredTask.status === JobTaskStatus.crashed) {
                            jobStatus = JobStatus.crashed;
                        }

                        jobStorage.patchJob({
                            status: jobStatus,
                        });

                        //todo, stop all other running tasks instances

                        if (!flags.debug) {
                            //todo, readd this
                            // await jobStorage.removeLocalInstanceFiles();
                        }

                        jobStorage.patchJob({
                            ended: new Date,
                        });

                        resolve(erroredTask.exitCode);
                        return;
                    }
                }

                const tasks = job.getNextTasksToStart();

                //this returns an empty list
                if (!hasRunningTasks && empty(tasks) && !job.hasPendingTasks()) {
                    jobStorage.patchJob({
                        status: JobStatus.done,
                        ended: new Date,
                    });

                    if (!flags.debug) {
                        //todo, readd this
                        // await jobStorage.removeLocalInstanceFiles();
                    }

                    //todo, stop all running tasks instances
                    console.log('Experiment done', job.id, 'in', project.name);

                    resolve(0);
                    return;
                }

                for (const nextTaskInfo of tasks) {
                    taskPromises[nextTaskInfo.name] = startTask(job.getTaskConfig(nextTaskInfo.name), nextTaskInfo);
                }
            }

            startNextTasks();
        });
    }

    async createForLocal(
        jobClient: JobClient,
        flags: StartedFlags,
        project: Project,
        job: Job,
    ): Promise<number> {
        //we first copy all files from the job to a local folder, which is then used for each task instance as source copy
        const jobFilesPath = getJobHomeDir(job.id, 'files');
        await this.copyJobFilesTo(jobFilesPath);

        try {
            const opsPath = getJobHomeDir(job.id, 'ops.json');
            const projectName = await jobClient.job().getProjectName();
            const jobStorage = new JobStorage(jobClient, projectName, job, jobFilesPath, opsPath);

            const exitCode = await this.startAll(flags, project, job, jobStorage);

            await jobStorage.stop();
            await jobStorage.disconnect();

            return exitCode;
        } finally {
            remove(jobFilesPath);
        }
    }
}
