/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import os from "os";
import path, {join} from "path";
import {
    ClusterNodeJobStartConfig,
    JobDocker,
    JobDockerImage,
    JobEnvironment,
    JobTask,
    JobTaskConfig,
    JobTaskInstance,
    JobTaskInstanceStatus,
    PullStatsStatus,
    TypedArrayWriter
} from "@deepkit/core";
import {spawn} from "child_process";
import stream from "stream";
import {StdoutApiReader} from "./stdout";
import {
    catchSilentSigint,
    Docker,
    getHomeDockerConfig,
    getJobTaskInstanceFiles,
    getMd5,
    getUserHome,
    normalizeRelativePathToBeIncluded
} from "@deepkit/core-node";
import {plainToClass} from "@marcj/marshal";
import {JobStorage} from "./job-storage";
import fs from "fs-extra";
import {each, eachKey, getPathValue, isObject, isUndefined} from "@marcj/estdlib";
import {Subject} from "rxjs";
import {bufferTime} from "rxjs/operators";
import {GpuInformation, GPUReader} from "./gpu";
import chalk from "chalk";
import {connect, createServer} from "net";

export enum TaskExecuteExitCodes {
    ABORTED = 8961,
    FAILED = 8962,
    CRASHED = 8963,
}

export class TaskExecutor {
    public readonly instanceFilesPath: string;

    protected ended = false;

    constructor(
        private jobStorage: JobStorage,
        private taskConfig: JobTaskConfig,
        private taskInfo: JobTask,
        private replica: number,
        private jobStartConfig: ClusterNodeJobStartConfig
    ) {
        this.instanceFilesPath = getJobTaskInstanceFiles(this.jobStorage.job.id, this.taskInfo.name, this.replica);
        if (fs.existsSync(this.instanceFilesPath)) {
            fs.removeSync(this.instanceFilesPath); //its filled in start() by this.jobStorage.filesDir.
        }
        fs.ensureDirSync(this.instanceFilesPath);
    }

    protected async end(addOutputFilesToQueue: boolean) {
        //todo, leave docker network

        if (this.ended) {
            return;
        }

        this.ended = true;

        //files are uploaded via jobStorage when online
        if (addOutputFilesToQueue && this.taskConfig.output && this.taskConfig.output.length) {
            this.jobStorage.queuedFileCommit.push({
                taskName: this.taskConfig.name,
                instance: this.getInstance().id,
                instanceFilesPath: this.instanceFilesPath,
                pattern: this.taskConfig.output
            });
        }

        this.jobStorage.deleteInstanceFolderWhenDone.push({
            path: this.instanceFilesPath,
            callback: this.removeInstanceFiles.bind(this)
        });
    }

    public patchInstance(patches: Partial<JobTaskInstance>) {
        this.jobStorage.patchInstance(this.taskConfig.name, this.replica, patches);
    }

    public getInstance(): JobTaskInstance {
        return this.taskInfo.getInstance(this.replica);
    }

    async start(addOutputFilesToQueue: boolean): Promise<number> {
        this.log('Start task', this.taskConfig.name, '#', this.replica);

        try {
            return await catchSilentSigint(async (state) => {
                this.patchInstance({started: new Date});

                fs.copySync(this.jobStorage.filesDir, this.instanceFilesPath, {
                    recursive: true,
                    overwrite: true,
                });

                //todo, add input files to this.instanceFilesPath from getJobTaskOutputFiles() as source

                //copy Job as job.json so the process has information about that
                fs.ensureDirSync(path.join(this.instanceFilesPath, '.deepkit'));
                await fs.writeJSON(path.join(this.instanceFilesPath, '.deepkit', 'job.json'), this.jobStorage.job);
                await fs.writeJSON(path.join(this.instanceFilesPath, '.deepkit', 'task.json'), this.taskConfig);

                if (this.taskConfig.image) {
                    this.patchInstance({status: JobTaskInstanceStatus.docker_pull});
                    await this.ensureDockerImage();

                    this.patchInstance({status: JobTaskInstanceStatus.docker_build_await});
                    await this.buildImage();
                }

                if (!state.running) return -1;
                await this.collectEnvironment();

                this.patchInstance({status: JobTaskInstanceStatus.joining_network});
                //todo, join docker network

                this.patchInstance({status: JobTaskInstanceStatus.started});

                try {
                    const exitCode = await this.startCommands();
                    if (!state.running) return exitCode;

                    //todo, detect output files, and copy to getJobTaskOutputFiles() so next task can use it as input
                    // upload to server as well. when local running, scheduling upload is enough

                    this.log('Ended task', this.taskConfig.name, '#', this.replica, 'exitCode', exitCode);

                    if (exitCode === 0) {
                        this.patchInstance({exitCode: exitCode, status: JobTaskInstanceStatus.done, ended: new Date});
                    } else {
                        this.patchInstance({exitCode: exitCode, status: JobTaskInstanceStatus.failed, ended: new Date});
                        return TaskExecuteExitCodes.FAILED;
                    }

                    return exitCode;
                } catch (error) {
                    this.logError(error.message || error);
                    this.patchInstance({
                        status: JobTaskInstanceStatus.crashed,
                        error: error.message || error,
                        ended: new Date,
                    });
                    return TaskExecuteExitCodes.CRASHED;
                } finally {
                    await this.end(addOutputFilesToQueue);
                }
            }, async () => {
                await this.end(addOutputFilesToQueue);
                this.patchInstance({status: JobTaskInstanceStatus.aborted, ended: new Date});
                return TaskExecuteExitCodes.ABORTED;
            });
        } catch (error) {
            let exitCode = 1;
            const errorMessage = error.message || error;

            if ('string' === typeof errorMessage) {
                const match = errorMessage.match(/non-zero code: ([0-9]+)/);
                if (match && parseInt(match[1], 10)) {
                    exitCode = parseInt(match[1], 10);
                }
            }
            this.logError(error);
            this.patchInstance({
                exitCode: exitCode,
                error: errorMessage,
                status: JobTaskInstanceStatus.crashed,
                ended: new Date
            });
            return TaskExecuteExitCodes.CRASHED;
        }
    }

    parseEnvironmentVariables(vars: string[]): { [name: string]: string } {
        const result: { [k: string]: any } = {};

        for (const v of vars) {
            const [name, value] = v.split('=');

            if (isUndefined(value)) {
                result[name] = String(process.env[name]);
            } else {
                result[name] = value;
            }
        }

        return result;
    }

    async collectEnvironment() {
        const environmentVariables = this.parseEnvironmentVariables(this.taskConfig.env);

        const python = null;

        this.taskInfo.getInstance(this.replica).environment = plainToClass(JobEnvironment, {
            hostname: os.hostname(),
            username: os.userInfo().username,
            platform: os.platform(),
            release: os.release(),
            arch: os.arch(),
            uptime: os.uptime(),
            nodeVersion: process.version,
            environmentVariables: environmentVariables,
            python: python
        });
    }

    public getLogName(): string {
        return this.taskInfo.name + '_' + this.replica;
    }

    async buildImage() {
        //todo, make sure this command is only executed once at a time on a machine for the target image
        const docker = new Docker();

        let dockerFile = '';
        const buildContextFiles: string[] = [];

        //todo, check if this commands is already running on this machine, if so wait
        // until it's done, then try on our own. It's to make sure we don't build the image at the same time on the same machine

        const info = await docker.info();

        this.patchInstance({
            docker: plainToClass(JobDocker, {
                runOnVersion: info['ServerVersion']
            })
        });
        let dockerImageName = this.taskConfig.image;
        let needBuild = false;

        if (this.taskConfig.dockerfile) {
            dockerFile = this.taskConfig.dockerfile;
            needBuild = true;
        } else if (this.taskConfig.build) {
            needBuild = true;
            let dockerFileContent = `# CREATED BY Deepkit because of "build" config.\n`;

            dockerFileContent += `FROM ${this.taskConfig.image}\n`;
            dockerFileContent += `RUN mkdir /job\n`;
            dockerFileContent += `WORKDIR /job\n`;
            for (const dir of this.jobStorage.job.config.dirs) {
                if (dir) {
                    dockerFileContent += `RUN mkdir -p /job/${dir}\n`;
                }
            }

            dockerFile = '.deepkit/Dockerfile';
            buildContextFiles.push(dockerFile);

            if (this.taskConfig.build) {
                for (const cmd of this.taskConfig.build) {
                    if (cmd.startsWith('ADD ')) {
                        const file = cmd.substr(cmd.indexOf(' ') + 1);
                        const [filePattern, target] = file.split(':');
                        const pathToAdd = normalizeRelativePathToBeIncluded(filePattern);
                        const stats = fs.statSync(join(this.instanceFilesPath, pathToAdd));
                        if (!stats) continue;

                        const relativePath = normalizeRelativePathToBeIncluded(filePattern);
                        dockerFileContent += `ADD ${relativePath} ${target || relativePath}\n`;
                        buildContextFiles.push(relativePath);
                    } else {
                        dockerFileContent += `RUN ${cmd}\n`;
                    }
                }
            }

            await this.addInstanceFile(dockerFile, dockerFileContent);

            const affix = [
                this.taskConfig.image,
                this.taskConfig.build,
            ];

            dockerImageName = (this.jobStorage.projectName.replace(/[^a-zA-Z0-9_]/g, '-') + '_' + getMd5(affix.join('_'))).toLowerCase();
        }

        if (needBuild) {
            this.patchInstance({status: JobTaskInstanceStatus.docker_build});

            await catchSilentSigint(async () => {
                await new Promise<void>(async (resolve, reject) => {
                    //note: aborts automatically when node process dies.
                    try {
                        const stream = await docker.buildImage({
                            context: this.instanceFilesPath,
                            src: buildContextFiles,
                        }, {
                            t: dockerImageName,
                            // nocache: true,
                            dockerfile: dockerFile,
                            Memory: this.taskConfig.resources.memory * 1024 * 1024 * 1024,
                            CpuQuota: this.taskConfig.resources.cpu * 1000,
                            CpuPeriod: 1000,
                        });

                        docker.modem.followProgress(stream, (err: any, output: any) => {
                            if (err) {
                                this.log('Docker build failed', err);
                                return reject(err);
                            }
                            resolve();
                        }, (event: any) => {
                            if (event.stream) {
                                this.logRaw(event.stream);
                            }
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
            }, async () => {
                //todo, implement abort/stop
            });
        }

        const imageInfo = await docker.getImage(this.taskConfig.image).inspect();

        this.patchInstance({
            dockerImage: plainToClass(JobDockerImage, {
                name: dockerImageName,
                id: imageInfo['Id'],
                size: imageInfo['Size'],
                os: imageInfo['Os'],
                arch: imageInfo['Architecture'],
                created: new Date(imageInfo['Created']),
                builtWithDockerVersion: imageInfo['DockerVersion'],
            })
        });
    }

    public async addInstanceFile(relativePath: string, content: string) {
        const targetPath = path.join(this.instanceFilesPath, relativePath);
        await fs.ensureDir(path.dirname(targetPath));
        await fs.writeFile(targetPath, content);

        await this.jobStorage.addFile(relativePath, content);
    }

    async ensureDockerImage() {
        //todo, make sure this command is only executed once at a time on a machine for the target image
        const docker = new Docker();
        let updateImage = false;

        try {
            await docker.getImage(this.taskConfig.image).inspect();
        } catch (e) {
            updateImage = true;
        }

        if (updateImage) {
            this.log('Docker pull', this.taskConfig.image);

            await new Promise<void>(async (resolve, reject) => {
                if (this.taskConfig.image) {
                    //note: aborts automatically when node process dies.

                    //todo, check if this commands is already running on this machine, if so wait
                    //until it's done, then try on our own. It's to make sure we don't download twice at the same time.

                    try {
                        const stream = await docker.pull(this.taskConfig.image, {});
                        const subject = new Subject<{
                            status: 'Downloading',
                            progressDetail: { current: number, total: number },
                            id: string
                        } | {
                            status: 'Extracting',
                            progressDetail: { current: number, total: number },
                            id: string
                        } | {
                            status: 'Verifying Checksum',
                            id: string
                        } | {
                            status: 'Pull complete',
                            id: string
                        }>();

                        const sub = subject.pipe(
                            bufferTime(1000),
                        ).subscribe((items) => {
                            for (const item of items) {
                                const stats = this.getInstance().getOrCreatePullStats(item.id);

                                if (item.status === 'Downloading') {
                                    stats.status = PullStatsStatus.downloading;
                                    stats.current = item.progressDetail.current;
                                    stats.total = item.progressDetail.total;
                                }
                                if (item.status === 'Extracting') {
                                    stats.status = PullStatsStatus.extracting;
                                    stats.current = item.progressDetail.current;
                                    stats.total = item.progressDetail.total;
                                }
                                if (item.status === 'Verifying Checksum') {
                                    stats.status = PullStatsStatus.verifying;
                                }
                                if (item.status === 'Pull complete') {
                                    stats.status = PullStatsStatus.done;
                                }
                            }

                            if (items.length) {
                                this.patchInstance({
                                    dockerPullStats: this.getInstance().dockerPullStats
                                });
                            }
                        });

                        docker.modem.followProgress(stream, (err: any, output: any) => {
                            subject.complete();
                            sub.unsubscribe();

                            resolve();
                        }, (event: any) => {
                            if (event.id) {
                                subject.next(event);
                            }
                        });
                    } catch (error) {
                        reject(error);
                    }
                }
            });
        }
    }

    protected async log(...messages: any[]) {
        console.log(...messages);
        await this.jobStorage.log(this.getLogName(), messages.join(' ') + '\n');
    }

    protected async logError(...messages: any[]) {
        console.error(...messages);
        await this.jobStorage.log(this.getLogName(), messages.join(' ') + '\n');
    }

    protected async logRaw(message: string) {
        process.stdout.write(message);
        await this.jobStorage.log(this.getLogName(), message);
    }

    async startDockerCommand(command: string): Promise<number> {
        const docker = new Docker();

        const instance = this.taskInfo.getInstance(this.replica);

        const containerName = 'deepkit_' + this.jobStorage.job.id + '_' + this.taskConfig.name + '_' + this.replica;

        const rawBinds = this.jobStartConfig.dockerBinds.slice(0);
        if (this.jobStartConfig.customMountsAllowed) {
            rawBinds.push(...this.taskConfig.docker.binds);
        }

        const binds = rawBinds.map((v: string) => {
            const [l, r] = v.split(':');

            if (l.startsWith('~')) {
                return getUserHome() + l.substr(1) + ':' + r;
            }

            if (l.startsWith('.')) {
                return path.join(this.instanceFilesPath, l) + ':' + r;
            }

            return l + ':' + r;
        });

        if (!instance.dockerImage.name) {
            throw new Error('No dockerImage defined for job');
        }

        // this.log('Job task instance files', this.instanceFilesPath);
        this.log('start docker', instance.dockerImage.name, ':', command);
        // this.log('docker binds', homeDockerConfig.binds, this.taskConfig.docker.binds, binds);
        // this.log('binds', binds);
        // this.log('links', homeDockerConfig.links.concat(this.taskConfig.docker.links));

        const deviceRequests: any[] = [];
        const gpuUUIDs: string[] = [];
        for (const gpu of instance.assignedResources.gpus) {
            gpuUUIDs.push(gpu.uuid);
        }
        if (gpuUUIDs.length) {
            deviceRequests.push({
                Driver: 'nvidia',
                DeviceIDs: gpuUUIDs,
                Capabilities: [['compute', 'utility', 'gpu']]
            });
        }

        const deepkitPort = process.env['DEEPKIT_PORT'] ? parseInt(process.env['DEEPKIT_PORT'], 10) : 8960;
        const deepkitSSL = process.env['DEEPKIT_SSL'] || '0';
        let deepkitHost = process.env['DEEPKIT_HOST'] || '';
        let deepkitSocket = process.env['DEEPKIT_SOCKET'] || '';

        const hostConfig: any = {
            Mounts: [
                {
                    Type: 'bind',
                    Source: this.instanceFilesPath,
                    Target: '/job'
                }
            ],
            DeviceRequests: deviceRequests,
            Memory: this.taskConfig.resources.memory * 1024 * 1024 * 1024,
            CpuQuota: this.taskConfig.resources.cpu * 1000,
            CpuPeriod: 1000,
            Binds: binds,
            // Links: homeDockerConfig.links.concat(this.taskConfig.docker.links),
            AutoRemove: true,
        };

        if (deepkitHost === '127.0.0.1' || deepkitHost === 'localhost') {
            if (process.platform === 'linux') {
                //for linux docker its the easiest to create a unix reverse proxy
                //to the given deepkitHost, simply because we have there nothing like
                //`host.docker.internal`
                const server = createServer((c) => {
                    const proxy = connect(deepkitPort, deepkitHost, () => {
                    });

                    proxy.on('error', function(ex) {
                        c.end();
                    });

                    c.on('data', function (data) {
                        try {
                            const flushed = proxy.write(data);
                            if (!flushed) {
                                c.pause();
                            }
                        } catch (error) {
                            c.end();
                        }
                    });

                    proxy.on('data', function(data) {
                        try {
                            const flushed = c.write(data);
                            if (!flushed) {
                                proxy.pause();
                            }
                        } catch (error) {
                            c.end();
                        }
                    });

                    c.on('drain', function() {
                        proxy.resume();
                    });

                    proxy.on('drain', function() {
                        c.resume();
                    });

                    c.on('close', function(had_error) {
                        proxy.end();
                    });

                    c.on('error', function(had_error) {
                        proxy.end();
                    });

                    proxy.on('close', function(had_error) {
                        c.end();
                    });
                });
                const socketFile = `.deepkit-server.s`;
                const socketPath = this.instanceFilesPath + '/' + socketFile;
                await new Promise((resolve, reject) => {
                    server.on('error', function (error) {
                        reject('proxy server error: ' + error);
                    });
                    server.listen(socketPath, () => {
                        resolve();
                    });
                });

                deepkitSocket = '/job/' + socketFile;
            } else {
                deepkitHost = 'host.docker.internal';
            }
        }

        const createOptions = {
            name: containerName,
            StopTimeout: 1,
            HostConfig: hostConfig,
            Env: [
                'PYTHONUNBUFFERED=1',
                'DEEPKIT_SSL=' + deepkitSSL,
                'DEEPKIT_HOST=' + deepkitHost,
                'DEEPKIT_SOCKET=' + deepkitSocket,
                'DEEPKIT_PORT=' + deepkitPort,
                'DEEPKIT_ROOT_DIR=/job',
                'DEEPKIT_JOB_ACCESSTOKEN=' + this.jobStorage.job.accessToken,
                'DEEPKIT_JOB_ID=' + this.jobStorage.job.id,
                'DEEPKIT_JOB_CONFIG=' + JSON.stringify(this.jobStorage.job.config.config),
            ].concat(this.jobStartConfig.env).concat(this.taskConfig.docker.env),
            WorkingDir: '/job'
        };

        const startOptions = {};

        const stdoutStream = new class extends stream.Writable {
            _write(chunk: any, encoding: string, callback: (err?: Error) => void): void {
                this.emit('data', chunk);
                callback();
            }
        };

        const stdoutReader = new StdoutApiReader(this.jobStorage, this.getLogName(), stdoutStream);

        if (!instance.dockerImage.name) {
            throw new Error('No dockerImage defined for job');
        }

        return catchSilentSigint(async () => {
            //note: does NOT abort automatically when node process dies.
            return new Promise<number>(async (resolve, reject) => {
                try {
                    const data = await docker.run(
                        instance.dockerImage.name!,
                        ['sh', '-c', command],
                        stdoutStream,
                        createOptions,
                        startOptions
                    );
                    resolve(data.output.StatusCode);
                } catch (error) {
                    this.log('run failed', error);
                    reject(error);
                } finally {
                    stdoutReader.off();
                }
            });
        }, async () => {
            this.log('Stopping Docker container ...', this.getLogName());

            try {
                await docker.getContainer(containerName).stop({t: 2});
                await docker.getContainer(containerName).remove({link: true, v: true, force: true});
            } catch (e) {
                //doesn't exist anymore, so ignore
                // console.error('Stopping Docker container error', e);
            }

            this.log('Stopping Docker container done', this.getLogName());

            return -1;
        });
    }

    async removeInstanceFiles() {
        const instance = this.taskInfo.getInstance(this.replica);

        if (!instance.dockerImage.name) return;

        const docker = new Docker();

        const stdoutStream = new class extends stream.Writable {
            _write(chunk: any, encoding: string, callback: (err?: Error) => void): void {
                this.emit('data', chunk);
                callback();
            }
        };

        const stdoutReader = new StdoutApiReader(this.jobStorage, this.getLogName(), stdoutStream);

        const startOptions = {};
        const createOptions = {
            StopTimeout: 1,
            HostConfig: {
                Mounts: [
                    {
                        Type: 'bind',
                        Source: this.instanceFilesPath,
                        Target: '/job'
                    }
                ],
                AutoRemove: true,
            }
        };

        return new Promise<number>(async (resolve, reject) => {
            try {
                const data = await docker.run(
                    instance.dockerImage.name!,
                    ['sh', '-c', 'rm -rf /job/*'],
                    stdoutStream,
                    createOptions,
                    startOptions
                );
                resolve(data.output.StatusCode);
            } catch (error) {
                this.log('run failed', error);
                reject(error);
            } finally {
                stdoutReader.off();
            }
        });
    }

    async startCommand(command: string): Promise<number> {
        if (!this.jobStartConfig.hostExecutionAllowed) {
            this.jobStorage.log(this.getLogName(), 'Experiments without Docker container image not allowed on this server.');
            return 1;
        }

        const stdio: ('pipe' | 'inherit')[] = ['inherit', 'pipe', 'pipe'];

        const env: { [name: string]: any } = Object.assign({PYTHONUNBUFFERED: '1'}, this.parseEnvironmentVariables(this.taskConfig.env));
        env['DEEPKIT_JOB_CONFIG'] = JSON.stringify(this.jobStorage.job.config.config);

        env['DEEPKIT_SSL'] = process.env['DEEPKIT_SSL'];
        env['DEEPKIT_HOST'] = process.env['DEEPKIT_HOST'];
        env['DEEPKIT_PORT'] = process.env['DEEPKIT_PORT'];
        env['DEEPKIT_JOB_ACCESSTOKEN'] = this.jobStorage.job.accessToken;
        env['DEEPKIT_JOB_ID'] = this.jobStorage.job.id;
        env['DEEPKIT_ROOT_DIR'] = this.instanceFilesPath;

        function addEnv(container: { [name: string]: any }, envs: string[]) {
            for (const env of envs) {
                const first = env.indexOf('=');
                if (first === -1) {
                    container[env] = process.env[env];
                } else {
                    container[env.substr(0, first)] = env.substring(first + 1);
                }
            }
        }

        addEnv(env, this.jobStartConfig.env);
        addEnv(env, this.taskConfig.env);

        const options = {
            stdio: stdio,
            cwd: this.instanceFilesPath,
            shell: true,
            env: env
        };

        const args: string[] = [];
        const p = spawn(command, args, options);

        return catchSilentSigint(async () => {
            const stdout = new StdoutApiReader(this.jobStorage, this.getLogName(), p.stderr, process.stderr as stream.Writable);
            const stderr = new StdoutApiReader(this.jobStorage, this.getLogName(), p.stdout, process.stdout as stream.Writable);

            return new Promise<number>((resolve, reject) => {
                p.on('close', (code: number) => {
                    resolve(code);
                    stdout.off();
                    stderr.off();
                });
            });
        }, async () => {
            p.kill();

            return -1;
        });
    }

    startDockerMonitoring(taskConfig: JobTaskConfig, replica: number) {
        const name = taskConfig.name + '_' + replica;
        const instance = this.jobStorage.job.getTask(taskConfig.name).getInstance(replica);

        return new class {
            public stopped = false;

            constructor(public jobStorage: JobStorage) {
                this.start();
            }

            public start() {
                const gpuUUIDs: string[] = [];
                for (const gpu of instance.assignedResources.gpus) {
                    gpuUUIDs.push(gpu.uuid);
                }

                const containerName = 'deepkit_' + this.jobStorage.job.id + '_' + taskConfig.name + '_' + replica;

                const docker = new Docker();

                let previous_cpu = 0;
                let previous_system = 0;
                const assigned_cpus = instance.assignedResources.cpu;

                const path = join('.deepkit', 'hardware', name + '.hardware');

                /*
                <version> = uint8 = 1 byte
                <gpu_count> = uint16 = 2bytes

                <time> = float64 = 8bytes

                <cpu>  = uint16 = 2bytes 0000 - 65535 (so we get 54.44% for example)
                <memory>  = uint16 = 2bytes 0000 - 65535 (so we get 54.44% for example)

                <network_rx> = float32 = 4bytes
                <network_tx> = float32 = 4bytes
                <block_write> = float32 = 4bytes
                <block_read> = float32 = 4bytes

                <gpu_utilization> = uint16 = 2bytes
                <gpu_memory> = uint16 = 2bytes
                <gpu_temperature> = uint16 = 2bytes
                <gpu_powerDraw> = uint16 = 2bytes
                 */
                const rowWriter = new TypedArrayWriter;
                rowWriter.add(
                    Uint8Array, //version
                    Uint16Array, //gpu_count

                    Float64Array, //time

                    Uint16Array, //cpu
                    Uint16Array, //memory

                    Float32Array, //network_rx
                    Float32Array, //network_tx
                    Float32Array, //block_write
                    Float32Array, //block_read
                );
                for (const gpu of gpuUUIDs) {
                    rowWriter.add(
                        Uint16Array, //gpu_utilization
                        Uint16Array, //gpu_memory
                        Uint16Array, //gpu_temperature
                        Uint16Array, //gpu_powerDraw
                    );
                }

                const streamStats = () => {
                    docker.getContainer(containerName).stats({}, (error, stream) => {
                        if (error && error.statusCode === 404) {
                            if (this.stopped) {
                                return;
                            }

                            setTimeout(() => {
                                streamStats();
                            }, 100);
                            return;
                        }

                        docker.modem.followProgress(stream, (err: any, output: any) => {
                            if (error) {
                                if (this.stopped) {
                                    return;
                                }

                                setTimeout(() => {
                                    streamStats();
                                }, 100);
                                return;
                            }
                        }, async (data: any) => {
                            let cpu_util = 0;
                            if (!data['cpu_stats']) {
                                return;
                            }

                            let networkRx = 0;
                            let networkTx = 0;
                            let blockWrite = 0;
                            let blockRead = 0;
                            for (const op of each(data['blkio_stats']['io_service_bytes_recursive'] as { op: 'Read' | 'Write' | string, value: number }[])) {
                                if (op.op === 'Read') {
                                    blockRead += op.value;
                                }

                                if (op.op === 'Write') {
                                    blockWrite += op.value;
                                }
                            }

                            for (const network of each(data['networks'] as { rx_bytes: number, tx_bytes: number }[])) {
                                networkRx += network['rx_bytes'];
                                networkTx += network['tx_bytes'];
                            }

                            const cpu_delta = data['cpu_stats']['cpu_usage']['total_usage'] - previous_cpu;
                            const system_delta = data['cpu_stats']['system_cpu_usage'] - previous_system;

                            previous_cpu = data['cpu_stats']['cpu_usage']['total_usage'];
                            previous_system = data['cpu_stats']['system_cpu_usage'];

                            if (cpu_delta > 0 && system_delta > 0) {
                                const cpu_cores = data['cpu_stats']['cpu_usage']['percpu_usage'].length;
                                cpu_util = (cpu_delta / system_delta) * cpu_cores / assigned_cpus;
                            }

                            const mem_util = data['memory_stats']['usage'] / data['memory_stats']['limit'];

                            rowWriter.reset();
                            rowWriter.push(
                                1,
                                gpuUUIDs.length,
                                Date.now() / 1000,
                                Math.min(65535, cpu_util * 65535),
                                Math.min(65535, mem_util * 65535),
                                networkRx,
                                networkTx,
                                blockWrite,
                                blockRead,
                            );

                            const gpuReader = new GPUReader();
                            const lastGpuData: GpuInformation[] = await gpuReader.getGpus(gpuUUIDs);

                            for (const gpu of eachKey(gpuUUIDs)) {
                                if (lastGpuData[gpu]) {
                                    rowWriter.push(Math.min(65535, lastGpuData[gpu].gpuUtilization * 65535));
                                    rowWriter.push(Math.min(65535, (lastGpuData[gpu].memoryUsed / lastGpuData[gpu].memoryTotal) * 65535));
                                    rowWriter.push(lastGpuData[gpu].temperature);
                                    rowWriter.push(lastGpuData[gpu].powerDraw);
                                } else {
                                    rowWriter.push(0);
                                    rowWriter.push(0);
                                    rowWriter.push(0);
                                    rowWriter.push(0);
                                }
                            }

                            await this.jobStorage.bufferedJobApi.streamInternalFile(path, rowWriter.getArrayBuffer());
                        });
                    });
                };

                streamStats();
            }

            public stop() {
                this.stopped = true;
            }

        }(this.jobStorage);
    }

    async startCommands(): Promise<number> {
        if (!this.taskConfig.hasCommand()) {
            throw new Error('No command defined. Use command argument or use deepkit.yml configuration file.');
        }

        const additionalParameters = {
            _name: this.taskConfig.replicas > 1 ? this.taskConfig.name + '_' + this.replica : this.taskConfig.name,
            _replica: this.taskConfig.replicas > 1 ? this.taskConfig.name + '_' + this.replica : this.taskConfig.name,
        };

        if (this.taskConfig.isDockerImage()) {
            const monitoring = this.startDockerMonitoring(this.taskConfig, this.replica);
            let code = 0;
            try {
                for (const command of this.taskConfig.commands) {
                    code = await this.startDockerCommand(
                        this.prepareCommand(
                            this.jobStorage.job.config.config,
                            additionalParameters,
                            command.command
                        ),
                    );
                    if (code > 0) {
                        return code;
                    }
                }

                return code;
            } finally {
                monitoring.stop();
            }
        } else {
            let code = 0;
            try {
                for (const command of this.taskConfig.commands) {
                    code = await this.startCommand(
                        this.prepareCommand(
                            this.jobStorage.job.config.config,
                            additionalParameters,
                            command.command
                        )
                    );
                    if (code > 0) {
                        return code;
                    }
                }
                return code;
            } finally {
            }
        }

        throw new Error('No command executed');
    }

    private prepareCommand(paramters: object, additionalParameters: object, command: string): string {
        return command.replace(/({{[\sa-zA-Z0-9\._-]+}})/g, (match, p1) => {
            p1 = p1.replace('{{', '').replace('}}', '');

            let result = getPathValue(paramters, p1);

            if (isUndefined(result)) {
                result = getPathValue(additionalParameters, p1);

                if (isUndefined(result)) {
                    console.warn(chalk.yellow(`Parameter '${p1}' not defined in job config.\n`));
                    return '';
                }
            }

            if (isObject(result)) {
                return `'${JSON.stringify(result)}'`;
            }

            return `'${result}'`;
        });
    }
}
