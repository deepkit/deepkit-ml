/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    Entity, f, RegisteredEntities,
    uuid,
} from "@marcj/marshal";
import {IdInterface} from "@marcj/glut-core";
import {each, eachPair} from "@marcj/estdlib";
import {flatObject} from "../core";

@Entity('JobAssignedResourcesGpu')
export class JobAssignedResourcesGpu {
    constructor(
        //index starts at 0, and is later mapped to the actual UUID. 0 means first gpu found by gpuReader
        @f.asName('index') public index: number,
        @f.asName('name') public name: string,
        @f.asName('memory') public memory: number,
    ) {
    }
}


@Entity('JobAssignedResources')
export class JobAssignedResources {
    @f
    cpu: number = 0;

    @f
    memory: number = 0;

    @f.array(JobAssignedResourcesGpu)
    gpus: JobAssignedResourcesGpu[] = [];

    public getMinGpuMemory(): number {
        let minGpuMemory = 0;

        for (const gpu of this.gpus) {
            if (!minGpuMemory || gpu.memory < minGpuMemory) minGpuMemory = gpu.memory;
        }

        return minGpuMemory;
    }

    public getMaxGpuMemory(): number {
        let maxGpuMemory = 0;

        for (const gpu of this.gpus) {
            if (gpu.memory > maxGpuMemory) maxGpuMemory = gpu.memory;
        }

        return maxGpuMemory;
    }

    public getGpuIDs(): number[] {
        return this.gpus.map(v => v.index);
    }

    public getGpuMemoryRange(): string {
        const min = this.getMinGpuMemory();
        const max = this.getMaxGpuMemory();

        if (min === max) return `${min}`;

        return `${min}-${max}`;
    }
}

export class JobConfigDocker {
    @f.array(String)
    env: string[] = []; //e.g. ["PATH=bla"]

    @f.array(String)
    binds: string[] = []; //e.g. ["/tmp:/tmp"]

    @f.array(String)
    links: string[] = []; //e.g. ["redis3:redis"]
}

export class JobResources {
    @f
    minCpu: number = 0;

    @f
    maxCpu: number = 0;

    @f
    cpu: number = 0;

    @f
    allMemory: boolean = true;

    @f
    minMemory: number = 0;

    @f
    maxMemory: number = 0;

    @f
    memory: number = 0;


    @f
    minGpu: number = 0;

    @f
    maxGpu: number = 0;

    @f
    gpu: number = 0;

    /**
     * Value in GB. Defines minimum gpu memory that is necessary.
     */
    @f
    minGpuMemory: number = 0;

    static fromPartial(partial: Partial<JobResources>): JobResources {
        const resources = new JobResources;
        for (const [i, v] of eachPair(partial)) {
            (resources as any)[i] = v;
        }
        return resources;
    }

    public normalizeValues() {
        this.cpu = Math.max(this.cpu, 0);
        this.maxCpu = Math.max(this.maxCpu, 0);
        this.minCpu = Math.max(this.minCpu, 0);

        this.memory = Math.max(this.memory, 0);
        this.maxMemory = Math.max(this.maxMemory, 0);
        this.minMemory = Math.max(this.minMemory, 0);

        this.gpu = Math.max(this.gpu, 0);
        this.maxGpu = Math.max(this.maxGpu, 0);
        this.minGpu = Math.max(this.minGpu, 0);
        this.minGpuMemory = Math.max(this.minGpuMemory, 0);
    }

    public getMinCpu(): number {
        return Math.max(this.minCpu || this.cpu, 1);
    }

    public getMaxCpu(): number {
        return Math.max(this.maxCpu || this.cpu, 1);
    }

    public getMinMemory(): number {
        return Math.max(this.minMemory || this.memory, 1);
    }

    public getMaxMemory(): number {
        return Math.max(this.maxMemory || this.memory, 1);
    }

    public getMinGpu(): number {
        return Math.max(this.minGpu || this.gpu, 0);
    }

    public getMaxGpu(): number {
        return Math.max(this.maxGpu || this.gpu, 0);
    }
}

export class JobTaskCommand {
    constructor(
        @f.asName('name')
        public name: string = '',
        @f.asName('command')
        public command: string = '',
    ) {
    }
}

@Entity('JobTaskConfigBase')
export class JobTaskConfigBase {
    @f
    title: string = '';

    /**
     * Build instructions, used in Docker "RUN x"
     */
    @f.array(String)
    build: string[] = [];

    /**
     * A path to a Dockerfile.
     */
    @f
    dockerfile: string = '';

    /**
     * The docker image name
     */
    @f
    image: string = '';

    /**
     * Paths/Pattern to output files. Matching files will be added to the
     * job as output file at the end of the run.
     */
    @f.array(String)
    output: string[] = [];

    /**
     * Environment variables in the format of "NAME=VALUE", or just "NAME" to passthrough
     * existing env variables.
     */
    @f.array(String)
    env: string[] = [];

    /**
     * Filter to nodes. Set via experiment creation dialog.
     */
    @f.array(String)
    nodeIds: string[] = [];

    /**
     * Filter to nodes name. Can be set via CLI arguments.
     */
    @f.array(String)
    nodes: string[] = [];

    /**
     * Filter to cluster names. Can be set via CLI arguments.
     */
    @f.array(String)
    clusters: string[] = [];

    /**
     * Actual commands to run.
     */
    @f.array(JobTaskCommand)
    commands: JobTaskCommand[] = [];

    /**
     * Not used yet.
     */
    @f.array(String)
    args: string[] = [];

    /**
     * Limit/Request resources
     */
    @f.type(JobResources)
    resources: JobResources = new JobResources;

    /**
     * Additional docker configurations
     */
    @f.type(JobConfigDocker)
    docker: JobConfigDocker = new JobConfigDocker;

    public getBuildFiles(): string[] {
        return this.build.filter(v => v.startsWith('ADD ')).map(v => v.substr(v.indexOf(' ') + 1));
    }

    public isDockerImage(): boolean {
        return !!this.image;
    }

    public hasCommand() {
        return this.commands.length > 0;
    }

    get installString(): string {
        return this.build.join('\n');
    }

    set installString(v: string) {
        this.build = v.split('\n');
    }
}

export class JobTaskConfig extends JobTaskConfigBase {
    /**
     * Will be set by config loader.
     */
    @f
    name: string = '';

    @f
    replicas: number = 1;

    @f.array(String)
    depends_on: string[] = [];

    /**
     * Will be set config loader and is used when changing root config and writing back values to tasks.
     * Example: When changing rootConfig.cluster, then all tasks should have those options as well
     * after calling resolveInheritance() except those who had a `cluster` explicitly set.
     */
    @f.map(Boolean)
    configValuesNoOverwrite: { [path: string]: true } = {};

    public isRoot(): boolean {
        return this.depends_on.length === 0;
    }
}

@Entity('job-config')
export class JobConfig extends JobTaskConfigBase {
    public static readonly inheritTaskProperties: string[] = [
        'build',
        'build_directory',
        'dockerfile',
        'image',
        'env',
        'clusters',
        'nodes',
        'nodeIds',
        'resources',
        'output',
        'commands',
        'command_directory',
        'args',
        'output',
        'docker'
    ];

    @f.any().asMap()
    config: { [name: string]: any } = {};

    /**
     * This path is the path to the initial deepkit.yml.
     */
    @f
    path: string = '';

    /**
     * All deepkit.yml configuration used (import etc)
     */
    @f.array(String)
    paths: string[] = [];

    /**
     * All dirs of deepkit.yml configuration used (import etc)
     */
    @f.array(String)
    dirs: string[] = [];

    /**
     * Per default all files in rootDir is added to the job, e.g. "** / *".
     * This changes the base pattern.
     */
    @f.array(String)
    files: string[] = [];

    /**
     * Per default all files in rootDir is added to the job. This limits it.
     */
    @f.array(String)
    ignore: string[] = [];

    @f list: string = '';

    @f.array(String) labels: string[] = [];

    @f
    priority: number = 0;

    @f.map(JobTaskConfig)
    protected tasks: { [name: string]: JobTaskConfig } = {};

    // protected parametersArray?: { name: string, value: any }[];

    protected resolved = false;

    public getTitle(): string {
        if (!this.title && this.path) {
            let path = this.path;

            if (path.endsWith('.yaml')) path = path.substr(0, path.length - 5);
            if (path.endsWith('.yml')) path = path.substr(0, path.length - 4);

            const index = path.lastIndexOf('/');
            if (index !== -1) {
                path = path.substr(index + 1);
            }


            if (this.path === 'deepkit.yml') {
                return 'Default';
            }

            if (path === 'deepkit') {
                if (this.path.endsWith('.deepkit.yml')) {
                    return this.path.substr(0, this.path.lastIndexOf('.deepkit.yml') - 1);
                }

                return this.path.substr(0, this.path.lastIndexOf('deepkit.yml') - 1);
            }

            return this.path;
        }

        return this.title;
    }

    public getFlatConfig() {
        return flatObject(this.config);
    }

    // public getParameters(): { name: string, value: any }[] {
    //     if (!this.parametersArray) {
    //         this.parametersArray = [];
    //         for (const [i, v] of eachPair(this.config)) {
    //             this.parametersArray.push({name: i, value: v});
    //         }
    //     }
    //
    //     return this.parametersArray;
    // }

    /**
     * Writes all values of the root config into task config and the values from the original config (configValuesToOverwrite)
     * file to task config (so user can override them)
     */
    resolveInheritance() {
        for (const task of each(this.getTasks())) {
            for (const name of JobConfig.inheritTaskProperties) {
                if (task.configValuesNoOverwrite[name]) continue;
                (task as any)[name] = (this as any)[name];
            }
        }
    }

    public getTasks(): { [name: string]: JobTaskConfig } {
        if (Object.keys(this.tasks).length === 0) {
            this.tasks = {main: new JobTaskConfig};
            this.tasks.main.name = 'main';
        }

        if (!this.resolved) {
            this.resolved = true;
            this.resolveInheritance();
        }

        return this.tasks;
    }
}

export class JobEnvironmentPython {
    @f.optional()
    version?: string;

    @f.optional()
    binary?: string;

    @f.optional()
    sdkVersion?: string;

    @f.map(String)
    pipPackages: { [name: string]: string } = {};
}

export class JobEnvironment {
    @f.optional()
    hostname?: string;

    @f.optional()
    username?: string;

    @f.optional()
    platform?: string;

    @f.optional()
    release?: string;

    @f.optional()
    arch?: string;

    @f.optional()
    uptime?: number;

    @f.optional()
    nodeVersion?: string;

    @f.map(String).optional()
    environmentVariables?: { [name: string]: string };

    @f.type(JobEnvironmentPython).optional()
    python?: JobEnvironmentPython;
}

export class JobGit {
    @f.optional()
    author?: string;

    @f.optional()
    branch?: string;

    @f.optional()
    origin?: string;

    constructor(
        @f.asName('commit') public commit: string,
        @f.asName('message') public message: string,
        @f.asName('authorEmail').optional() public authorEmail?: string,
        @f.asName('date').optional() public date?: Date,
    ) {
    }
}

export class JobDocker {
    @f.optional()
    runOnVersion?: string;
}

export class JobDockerImage {
    @f.optional()
    name?: string;

    @f.optional()
    id?: string;

    @f.optional()
    size?: number;

    @f.optional()
    os?: string;

    @f.optional()
    arch?: string;

    @f.optional()
    created?: Date;

    @f.optional()
    builtWithDockerVersion?: string;
}

//note: these codes are hardcoded in the SDKs as well
export enum JobStatus {
    creating = 0,
    created = 50, //when all files are attached

    running = 100,

    done = 150, //when all tasks are done
    aborted = 200, //when at least one task aborted

    failed = 250, //when at least one task failed
    crashed = 300, //when at least one task crashed
}

//note: these codes are hardcoded in the SDKs as well
export enum JobTaskStatus {
    pending = 0,

    queued = 100, //when the job got a queue position assigned and queue results
    assigned = 150, //when a server or multiple servers are assigned and at least one replica is about to start

    started = 300,

    //beginning with that ended
    done = 500,
    aborted = 550,
    failed = 600,
    crashed = 650,
}

//note: these codes are hardcoded in the SDKs as well
export enum JobTaskInstanceStatus {
    pending = 0,

    booting = 200, //is starting the job's task
    docker_pull = 220, //joining docker's network
    docker_build_await = 230, //joining docker's network
    docker_build = 235, //joining docker's network
    joining_network = 250, //joining docker's network
    checkout_files = 260, //download job files for that task instance

    started = 300,
    interrupted = 350, //when for example spot instance/preemptibility instance stopped
    paused = 340, //when the user manually paused

    //beginning with that ended
    done = 500,
    aborted = 550,
    failed = 600,
    crashed = 650,
}

@Entity('job/channel')
export class Channel {
    /**
     * This might be empty.
     */
    @f.array(String)
    traces: string[] = [];

    @f.optional()
    kpi?: boolean;

    @f
    kpiTrace: number = 0;

    @f
    maxOptimization: boolean = true;

    @f.any().optional()
    xaxis?: object;

    @f.any().optional()
    yaxis?: object;

    @f.any().optional()
    layout?: object;
}

export enum PullStatsStatus {
    waiting = 'waiting',
    downloading = 'downloading',
    extracting = 'extracting',
    verifying = 'verifying',
    done = 'done',
}

export class PullStats {
    @f
    current: number = 0;

    @f
    total: number = 0;

    @f.enum(PullStatsStatus)
    status: PullStatsStatus = PullStatsStatus.waiting;

    constructor(
        @f.asName('id') public readonly id: string
    ) {
    }
}

export class JobTaskInstance {
    @f.enum(JobTaskInstanceStatus)
    status: JobTaskInstanceStatus = JobTaskInstanceStatus.pending;

    @f
    uploadOutputCurrent: number = -1;

    @f
    uploadOutputTotal: number = 0;

    @f.type(JobEnvironment)
    environment: JobEnvironment = new JobEnvironment;

    @f.type(JobDocker)
    docker: JobDocker = new JobDocker;

    @f.map(PullStats)
    dockerPullStats: { [id: string]: PullStats } = {};

    @f.type(JobDockerImage)
    dockerImage: JobDockerImage = new JobDockerImage;

    @f.uuid().optional()
    node?: string;

    @f.optional()
    exitCode?: number;

    @f
    error: string = '';

    @f.type(JobAssignedResources)
    assignedResources: JobAssignedResources = new JobAssignedResources;

    @f.optional()
    started?: Date;

    @f.optional()
    ended?: Date;

    constructor(@f.asName('id') public id: number) {
    }

    public getOrCreatePullStats(id: string): PullStats {
        if (!this.dockerPullStats[id]) {
            this.dockerPullStats[id] = new PullStats(id);
        }

        return this.dockerPullStats[id];
    }

    public isRunning() {
        return this.isStarted() && !this.isEnded();
    }

    public isStarted() {
        return this.status >= JobTaskInstanceStatus.booting;
    }

    public isEnded() {
        return this.status >= JobTaskInstanceStatus.done;
    }

    public isDockerPull() {
        return this.status === JobTaskInstanceStatus.docker_pull;
    }

    public elapsedTime(): number | undefined {
        if (this.ended && this.started) {
            return (this.ended.getTime() - this.started.getTime()) / 1000;
        }

        if (this.started) {
            return ((new Date).getTime() - this.started.getTime()) / 1000;
        }

        return undefined;
    }
}

export class JobTaskQueue {
    @f
    position: number = 0;

    @f
    tries: number = 0;

    @f
    result: string = '';

    @f
    added: Date = new Date();
}

export class JobTask {
    @f.type(JobTaskQueue)
    queue: JobTaskQueue = new JobTaskQueue;

    @f.enum(JobTaskStatus)
    status: JobTaskStatus = JobTaskStatus.pending;

    @f.optional()
    assigned?: Date;

    @f.optional()
    started?: Date;

    @f.optional()
    ended?: Date;

    @f.optional()
    exitCode?: number;

    @f.array(JobTaskInstance)
    public instances: JobTaskInstance[] = [];

    constructor(
        @f.asName('name') public name: string,
        replicas: number,
    ) {
        for (let i = 0; i < replicas; i++) {
            this.instances[i] = new JobTaskInstance(i);
        }
    }

    public elapsedTime(): number | undefined {
        if (this.ended && this.started) {
            return (this.ended.getTime() - this.started.getTime()) / 1000;
        }

        if (this.started) {
            return ((new Date).getTime() - this.started.getTime()) / 1000;
        }

        return undefined;
    }

    public getInstances(): JobTaskInstance[] {
        return this.instances;
    }

    public getRunningInstances(): JobTaskInstance[] {
        const result: JobTaskInstance[] = [];
        for (const instance of this.instances) {
            if (instance.isRunning()) result.push(instance);
        }
        return result;
    }

    public getFirstInstance(): JobTaskInstance | undefined {
        return this.instances[0];
    }

    public isErrored(): boolean {
        return this.status === JobTaskStatus.crashed
            || this.status === JobTaskStatus.failed
            || this.status === JobTaskStatus.aborted;
    }

    public getInstance(replica: number): JobTaskInstance {
        if (!this.instances[replica]) {
            throw new Error(`Replica #${replica} of task ${this.name} does not exist.`);
        }

        return this.instances[replica];
    }

    public isStarted() {
        return this.status >= JobTaskStatus.started;
    }

    public isQueued() {
        return this.status === JobTaskStatus.queued;
    }

    public isRunning() {
        return this.isStarted() && !this.isEnded();
    }

    public isEnded() {
        return this.status >= JobTaskStatus.done;
    }

    public areAllInstancesEnded(): boolean {
        return this.instances.every((instance) => {
            return instance.isEnded();
        });
    }

    public calculateStatusByInstances(): JobTaskStatus {
        let status = JobTaskStatus.done;

        for (const instance of this.instances) {
            if (status === JobTaskStatus.done) {
                //allowed to set to all

                if (instance.status === JobTaskInstanceStatus.aborted) {
                    status = JobTaskStatus.aborted;
                }
                if (instance.status === JobTaskInstanceStatus.failed) {
                    status = JobTaskStatus.failed;
                }
                if (instance.status === JobTaskInstanceStatus.crashed) {
                    status = JobTaskStatus.crashed;
                }
            }

            if (status === JobTaskStatus.aborted) {
                if (instance.status === JobTaskInstanceStatus.failed) {
                    status = JobTaskStatus.failed;
                }
                if (instance.status === JobTaskInstanceStatus.crashed) {
                    status = JobTaskStatus.crashed;
                }
            }
        }

        return status;
    }
}


@Entity('JobModelSnapshot')
export class JobModelSnapshot {
    @f x: number = 0;

    @f time: Date = new Date;

    @f.array(String) layerNames: string[] = [];

    @f.optional() epoch?: number;
    @f.optional() step?: number;
}

@Entity('JobInsight')
export class JobInsight {
    @f x: number = 0;

    @f time: Date = new Date;

    @f.optional() epoch?: number;
    @f.optional() step?: number;
}

export enum JobModelNodeType {
    activation = 'activation',
    op = 'op',
    layer = 'layer',
    primitive = 'primitive',
    input = 'input',
    output = 'output',
    scope = 'scope',
    scope_input = 'scope:input'
}

/**
 * This class overwrites properties of nodes automatically created by scope splitting (by /).
 */
export class JobModelScope {
    @f
    id!: string;

    @f
    label!: string;

    @f.enum(JobModelNodeType)
    type: JobModelNodeType = JobModelNodeType.scope;

    @f.optional()
    subType: string = ''; //scope or the class name

    @f
    recordable: boolean = false;

    @f.any().asMap()
    attributes: { [name: string]: any } = {};

    @f.array(Number)
    shape: number[] = [];
}

// export enum JobModelNodeRenderType {
//     image = 'image',
//     json = 'json',
// }

export class JobModelNode {
    /**
     * Ids like 'conv1.2', or with scope 'ResNet/layer1/0'.
     */
    @f
    id!: string;

    @f
    label!: string;

    @f.enum(JobModelNodeType)
    type: JobModelNodeType = JobModelNodeType.layer;

    @f.optional()
    subType: string = '';

    /**
     * Path like /usr/local/lib/python3.7/site-packages/torch/nn/modules/conv.py:342:0
     */
    @f.optional()
    source?: string;

    @f
    recordable: boolean = false;

    /**
     * Grouping of scopes happend via the / character.
     * Parent scopes are automatically created from scope.split('/'), so / acts here as a grouping character.
     */
    @f.optional()
    scope: string = '';

    @f.array(Number)
    shape: number[] = [];

    //that's not in use yet. We use the shape to detect how to display shizzel
    // @f.enum(JobModelNodeRenderType)
    // renderType: JobModelNodeRenderType = JobModelNodeRenderType.image;

    @f.any().asMap()
    attributes: { [name: string]: any } = {};

    /**
     * input ids from other nodes.
     */
    @f.array(String)
    input: string[] = [];
}

@Entity('job/model/graph')
export class JobModelGraph {
    @f.array(JobModelNode)
    nodes: JobModelNode[] = [];

    @f.array(JobModelScope)
    scopes: JobModelScope[] = [];
}

export class JobModelGraphInfo {
    /**
     * The path to the file where the JobModelGraph is stored.
     */
    @f
    path: string = '';
}

@Entity('jobDebuggingState')
export class JobDebuggingState {
    @f.map(Boolean) watchingLayers: { [layerId: string]: boolean } = {};
    @f live: boolean = false;
    @f recording: boolean = false;

    @f recordingMode: 'epoch' | 'second' = 'second';

    @f recordingLayers: 'watched' | 'all' = 'watched';

    @f recordingSecond: number = 60;
}

@Entity('job', 'jobs')
export class Job implements IdInterface {
    @f.uuid().primary() public id: string = uuid();

    @f.uuid().exclude('plain')
    accessToken: string = uuid();

    @f
    number: number = 0;

    @f.type(String).optional().uuid()
    shareToken: string | null = null;

    @f.index()
    version: number = 1;

    @f
    description: string = '';

    /**
     * The cluster id if assigned.
     */
    @f.uuid().index().optional()
    cluster?: string;

    @f.index()
    ci: boolean = false;

    /**
     * The id of the ProjectExperimentList.
     */
    @f.type(String).index().uuid().optional()
    list: string | null = null;

    @f.index()
    connections: number = 0;

    @f
    created: Date = new Date();

    @f
    updated: Date = new Date();

    @f.optional()
    author?: string;

    @f.uuid().optional()
    user?: string;

    @f.type(JobConfig)
    config: JobConfig = new JobConfig;

    @f.type(JobGit).optional()
    git?: JobGit;

    /**
     * Whether the job is executed directly in script without Deepkit CLI tools.
     */
    @f
    selfExecution: boolean = false;

    @f.map(JobModelGraphInfo)
    graphInfos: { [name: string]: JobModelGraphInfo } = {};

    @f.uuid().optional()
    liveSnapshotId?: string;

    @f.enum(JobStatus)
    status: JobStatus = JobStatus.creating;

    @f
    title: string = '';

    @f.any().asMap()
    infos: { [name: string]: any } = {};

    @f.map(JobTask)
    tasks: { [name: string]: JobTask } = {};

    //todo, move the content to a file
    @f.any().asMap()
    debugSnapshots: { [timestamp: number]: any } = {};

    @f.type(Boolean).asMap()
    debugActiveLayerWatching: { [layerId: string]: boolean } = {};

    @f.type(JobDebuggingState)
    debuggingState: JobDebuggingState = new JobDebuggingState;

    @f
    runOnCluster: boolean = false;

    @f.array(String)
    labelIds: string[] = [];

    @f.optional()
    assigned?: Date;

    @f.optional()
    started?: Date;

    @f.optional()
    ended?: Date;

    @f.optional()
    stopRequested?: Date;

    @f.optional()
    ping?: Date;

    //aka epochs
    @f
    iteration: number = 0;

    @f
    iterations: number = 0;

    @f
    secondsPerIteration: number = 0;

    //aka batches
    @f
    step: number = 0;

    @f
    steps: number = 0;

    @f
    stepLabel: string = 'step';

    /**
     * ETA in seconds. Time left.
     */
    @f
    eta: number = 0;

    @f
    speed: number = 0;

    @f
    speedLabel: string = 'sample/s';

    @f.map(Channel)
    channels: { [name: string]: Channel } = {};

    @f.map('any')
    channelLastValues: { [name: string]: number[] } = {};

    channelGetters?: { [name: string]: () => any };
    channelGettersHash: string = '';

    constructor(
        @f.uuid().index().asName('project') public project: string,
    ) {
    }

    getStatusLabel(): string {
        return JobStatus[this.status];
    }

    public getFlatInfos() {
        return flatObject(this.infos);
    }

    public elapsedTime(): number | undefined {
        if (this.ended && this.started) {
            return (this.ended.getTime() - this.started.getTime()) / 1000;
        }

        if (this.started) {
            return ((new Date).getTime() - this.started.getTime()) / 1000;
        }

        return undefined;
    }

    // public getKpiChannelName(): string | undefined {
    //     for (const [i, channel] of eachPair(this.channels)) {
    //         if (channel.kpi) {
    //             return i;
    //         }
    //     }
    // }

    public isRunning() {
        return this.isStarted() && !this.isEnded();
    }

    public isStarted() {
        return this.status >= JobStatus.running;
    }

    public isEnded() {
        return this.status >= JobStatus.done;
    }

    public isAlive() {
        return this.connections > 0;
    }

    public runInDocker() {
        return !!this.config.image;
    }

    public isConnectionLost() {
        if (this.started && !this.ended && this.ping) {
            const diffSeconds = (Date.now() - this.ping.getTime()) / 1000;
            return diffSeconds > 5;
        }

        return false;
    }

    public createChannel(id: string, traceName: string[],
                         xaxis: object = {},
                         yaxis: object = {},
                         layout: object = {},
    ) {
        const channel = new Channel();
        channel.traces = traceName;
        channel.xaxis = xaxis;
        channel.yaxis = yaxis;
        channel.layout = layout;

        this.channels[id] = channel;
        this.channelGetters = undefined;
    }

    public getLastChannelValue(path: string): any {
        if (!this.channelGetters || this.channelGettersHash !== Object.keys(this.channels).join(', ')) {
            this.channelGetters = {};
            this.channelGettersHash = Object.keys(this.channels).join(', ');
            for (const [name, c] of Object.entries(this.channels)) {
                this.channelGetters[name] = () => {
                    return this.channelLastValues[name] ? this.channelLastValues[name][0] : undefined;
                };

                for (let i = 0; i < c.traces.length; i++) {
                    this.channelGetters[name + '.' + i] = () => {
                        return this.channelLastValues[name] ? this.channelLastValues[name][i] : undefined;
                    };
                    this.channelGetters[name + '.' + c.traces[i]] = () => {
                        return this.channelLastValues[name] ? this.channelLastValues[name][i] : undefined;
                    };
                }
            }
        }

        if (this.channelGetters && this.channelGetters[path]) {
            return this.channelGetters[path]();
        }
    }

    public getChannel(id: string): Channel {
        return this.channels[id];
    }

    public getChannelNames(): string[] {
        return Object.keys(this.channels);
    }

    public getTaskConfig(name: string): JobTaskConfig {
        //no main task and we have tasks defined
        if (!this.config.getTasks()[name]) {
            throw new Error(`Task '${name}' does not exist.`);
        }

        return this.config.getTasks()[name];
    }

    public getLatestTaskInstance(): { task: string | undefined, instance: number | undefined } {
        let latest: JobTask | undefined;
        for (const task of this.getAllTasks()) {
            if (!latest) {
                latest = task;
            }
            if (latest && task.isStarted() && task.started && latest.started && task.started >= latest.started) {
                latest = task;
            }
        }

        if (latest) {
            const running = latest.getRunningInstances();
            if (running.length > 0) {
                return {
                    task: latest.name,
                    instance: running[0].id,
                };
            } else {
                return {
                    task: latest.name,
                    instance: latest.getInstances()[0].id,
                };
            }
        }

        return {
            task: undefined,
            instance: undefined,
        };
    }

    /**
     * Makes sure `tasks` is set. Needs to be called on every new Job() instance before saving it into the database.
     */
    public prepareTaskInstances() {
        this.tasks = {};

        for (const task of this.getAllTaskConfigs()) {
            this.tasks[task.name] = new JobTask(task.name, task.replicas);
        }
    }

    public getTask(name: string): JobTask {
        if (!this.tasks[name]) {
            throw new Error(`Task '${name}' does not exist. Existing: ` + Object.keys(this.tasks).join(','));
        }

        return this.tasks[name];
    }

    public getQueuedRootTasks(): JobTask[] {
        const list: JobTask[] = [];

        for (const taskConfig of this.getAllTaskConfigs()) {
            const task = this.tasks[taskConfig.name];

            if (task && taskConfig.isRoot() && task.isQueued()) {
                list.push(task);
            }
        }

        return list;
    }

    /**
     * Returns true if there is at least one task that can be started but can't yet because of unmet dependencies.
     * This excludes tasks where dependencies crashed/aborted/failed. This means if one task crashed in the middle of
     * the dependency graph this returns false.
     */
    public hasPendingTasks(): boolean {
        for (const taskConfig of this.getAllTaskConfigs()) {
            const info = this.getTask(taskConfig.name);

            if (!info.isEnded() && this.isTaskDependenciesValid(taskConfig.name)) {
                return true;
            }
        }

        return false;
    }

    public getActiveTasks(): {
        names: string[],
        assignedResources: {
            cpus: number;
            memory: number;
            gpus: JobAssignedResourcesGpu[]
        }
    } | undefined {
        const result: {
            names: string[],
            assignedResources: { cpus: number, memory: number, gpus: JobAssignedResourcesGpu[] }
        } = {names: [], assignedResources: {cpus: 0, memory: 0, gpus: []}};

        for (const taskConfig of this.getAllTaskConfigs()) {
            const info = this.getTask(taskConfig.name);

            const runningInstances = info.getRunningInstances();
            if (runningInstances.length) {
                result.names.push(taskConfig.name);

                for (const instance of runningInstances) {
                    result.assignedResources.cpus += instance.assignedResources.cpu;
                    result.assignedResources.memory += instance.assignedResources.memory;
                    result.assignedResources.gpus.push(...instance.assignedResources.gpus);
                }
            }
        }

        return result.names.length ? result : undefined;
    }

    public calculateStatusByTasks(): JobStatus {
        let status = JobStatus.done;

        for (const task of this.getAllTasks()) {
            if (status === JobStatus.done) {
                //allowed to set to all

                if (task.status === JobTaskStatus.aborted) {
                    status = JobStatus.aborted;
                }
                if (task.status === JobTaskStatus.failed) {
                    status = JobStatus.failed;
                }
                if (task.status === JobTaskStatus.crashed) {
                    status = JobStatus.crashed;
                }
            }

            if (status === JobStatus.aborted) {
                if (task.status === JobTaskStatus.failed) {
                    status = JobStatus.failed;
                }
                if (task.status === JobTaskStatus.crashed) {
                    status = JobStatus.crashed;
                }
            }
        }

        return status;
    }

    /**
     * Returns true if at least one task errored (crashed, failed, or aborted)
     */
    public hasErroredTasks(): boolean {
        for (const task of this.getAllTasks()) {
            if (task.isErrored()) return true;
        }

        return false;
    }

    /**
     * Returns the task that errored (crashed, failed, or aborted)
     */
    public getErroredTask(): JobTask | undefined {
        for (const task of this.getAllTasks()) {
            if (task.isErrored()) return task;
        }
    }

    public getAllTasks(): JobTask[] {
        const tasks: JobTask[] = [];

        for (const task of each(this.tasks)) {
            tasks.push(task);
        }

        return tasks;
    }

    public getInstancesFor(task: string): JobTaskInstance[] {
        return this.tasks[task] ? this.tasks[task].getInstances() : [];
    }

    public getInstanceFor(task: string, replica: number): JobTaskInstance {
        return this.tasks[task].getInstance(replica);
    }

    public getRunningInstances(task: string): JobTaskInstance[] {
        return this.tasks[task].getRunningInstances();
    }

    public getAllTaskConfigs(): JobTaskConfig[] {
        return Object.values(this.config.getTasks());
    }

    /**
     * Returns only job tasks that should and can be started (dependencies met).
     */
    public getNextTasksToStart(): JobTask[] {
        // if (!this.config.hasTasks()) {
        //     const main = this.config.getMainTask();
        //     const info = this.getTask(main.name);
        //
        //     if (!info.isStarted()) {
        //         return [info];
        //     }
        //
        //     return [];
        // }

        const nextTasks: JobTask[] = [];
        for (const taskConfig of each(this.config.getTasks())) {
            const info = this.getTask(taskConfig.name);

            if (info.isStarted()) {
                continue;
            }

            if (this.isTaskDependenciesMet(taskConfig.name)) {
                nextTasks.push(info);
            }
        }

        return nextTasks;
    }

    /**
     * Checks whether all dependencies are valid, which means: not crashed, aborted, or failed.
     */
    public isTaskDependenciesValid(name: string): boolean {
        for (const dependsOnInfo of this.getDependencies(name)) {
            if (dependsOnInfo.isErrored()) {
                return false;
            }
        }

        return true;
    }

    public getDependencies(name: string) {
        const list: JobTask[] = [];

        if (!this.config.getTasks()[name]) {
            throw new Error(`Task '${name}' does not exist.`);
        }

        const config = this.config.getTasks()[name];

        for (const depends_on of config.depends_on) {
            if (!this.tasks[depends_on]) {
                throw new Error(`Task '${name}' depends on '${depends_on}' which does not exist.`);
            }

            list.push(this.tasks[depends_on]);
        }

        return list;
    }

    public isTaskDependenciesMet(name: string): boolean {
        for (const dependsOnInfo of this.getDependencies(name)) {
            if (dependsOnInfo.status !== JobTaskStatus.done) {
                //a dependent task is not finished, so this task is not allowed to run
                return false;
            }
        }

        //no depends_on, so allowed to run
        return true;
    }
}
