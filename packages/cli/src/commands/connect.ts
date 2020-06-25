/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import 'reflect-metadata';
import {Command, flags} from '@oclif/command';
import {classToPlain, f} from '@marcj/marshal';
import {
    AssignedJobTaskInstance,
    ClusterNodeJobStartConfig,
    getJobTaskInstanceIdForAssignedJobTaskInstance,
    HomeAccountConfig,
    NodeControllerInterface,
    NodeCpuResource,
    NodeGpuResource,
    NodeHardwareInformation,
    NodeHardwareInformationCpu,
    NodeHardwareInformationGpu,
    NodeHardwarePlatform,
    NodeHardwareStats,
    NodeHardwareStatsGpu,
    NodePeerControllerInterface,
    NodeResources
} from '@deepkit/core';
import {Docker, pidLocker, SpeedClient} from "@deepkit/core-node";
import os from "os";
import {createWriteStream} from "fs";
import {CpuHelper} from "../util/cpu";
import {each, eachKey, eachPair, sleep} from "@marcj/estdlib";
import {ClientController, NodeClient} from "../client-controller";
import {AuthenticationError} from "@marcj/glut-client";
import {Action, RemoteController} from "@marcj/glut-core";
import {IConfig} from "@oclif/config";
import systeminformation from "systeminformation";
import {Subject} from "rxjs";
import {GPUReader} from "../gpu";
import {bufferTime} from "rxjs/operators";
import execa from 'execa';
import {remove} from "fs-extra";
import {createServer} from "net";

async function startTaskInstance(
    nodeController: RemoteController<NodeControllerInterface>,
    oclifConfig: IConfig,
    serverHost: string,
    serverPort: number,
    assignedJobTaskInstance: AssignedJobTaskInstance,
    startConfig: ClusterNodeJobStartConfig
) {
    console.log('Start job task', serverHost, assignedJobTaskInstance.jobId, assignedJobTaskInstance.taskName, assignedJobTaskInstance.instance);
    const allowedToStart = await nodeController.isTaskInstanceAllowedToStartThenStart(
        assignedJobTaskInstance.jobId,
        assignedJobTaskInstance.taskName,
        assignedJobTaskInstance.instance,
    );
    if (!allowedToStart) {
        console.error(`Could not start job ${assignedJobTaskInstance.jobId} as already started or deleted.`);
        await nodeController.jobTaskInstanceDone(
            assignedJobTaskInstance.jobId,
            assignedJobTaskInstance.taskName,
            assignedJobTaskInstance.instance
        );
        return;
    }

    // execute in new process. It's better and the only solution since
    // it wouldn't work with stopping the job (since its the same process and kills the server with it)

    const logPath = 'deepkit-job-' + assignedJobTaskInstance.jobId + '.log';

    try {
        const fileLog = createWriteStream(logPath, {flags: 'a'});

        const options: execa.NodeOptions = {
            stdout: 'pipe',
            stderr: 'pipe',
            cleanup: true,
        };

        const buffer = Buffer.from(JSON.stringify(classToPlain(ClusterNodeJobStartConfig, startConfig)), 'utf8');

        const p = execa(process.execPath, [
            process.argv[1],
            'start',
            serverHost,
            String(serverPort),
            assignedJobTaskInstance.jobId,
            assignedJobTaskInstance.jobAccessToken,
            assignedJobTaskInstance.taskName,
            String(assignedJobTaskInstance.instance),
            buffer.toString('base64')
        ], options);

        p.stdout.pipe(fileLog);
        p.stderr.pipe(fileLog);

        await p;
    } catch (error) {
        console.error(
            'Job errored',
            assignedJobTaskInstance.jobId,
            assignedJobTaskInstance.taskName,
            assignedJobTaskInstance.instance,
            error
        );
    } finally {
        console.log('Job ended',
            assignedJobTaskInstance.jobId,
            assignedJobTaskInstance.taskName,
            assignedJobTaskInstance.instance
        );
        await nodeController.jobTaskInstanceDone(
            assignedJobTaskInstance.jobId,
            assignedJobTaskInstance.taskName,
            assignedJobTaskInstance.instance
        );
        await remove(logPath);
    }
}

class NodePeerController implements NodePeerControllerInterface {
    constructor(
        private connectCommand: ConnectCommand,
        private docker: Docker,
    ) {
    }

    @Action()
    async loadStartConfig(): Promise<void> {
        this.connectCommand.startConfig = await this.connectCommand.nodeController.getStartConfig();
    }

    @Action()
    async checkDocker(): Promise<boolean> {
        return this.connectCommand.setDockerInfo(true);
    }

    @Action()
    async checkNvidia(): Promise<void> {
        await this.connectCommand.setNvidiaInfo();
    }

    @Action()
    async loadJobsToStart() {
        await this.connectCommand.startAssignedTaskInstances();
    }

    @Action()
    @f.any()
    async getDockerContainer() {
        try {
            return await this.docker.listContainers({all: true});
        } catch (error) {
            return [];
        }
    }

    @Action()
    @f.any()
    async removeDockerImage(imageId: string): Promise<void> {
        await this.docker.getImage(imageId).remove();
    }

    @Action()
    @f.any()
    async pruneDockerImages(): Promise<void> {
        await this.docker.pruneImages();
    }

    @Action()
    @f.any()
    async pruneDockerContainer(): Promise<void> {
        await this.docker.pruneContainers();
    }

    @Action()
    @f.any()
    async stop() {
        await this.connectCommand.stop();
    }

    @Action()
    @f.any()
    async getDockerImages() {
        try {
            return await this.docker.listImages({all: true});
        } catch (error) {
            return [];
        }
    }
}

export class ConnectCommand extends Command {
    static description = 'server: Connect a node to a Deepkit server';

    public static args = [
        {
            name: 'id',
            required: true,
            description: 'The id of your node which you want to connect',
        },
        {
            name: 'token',
            required: true,
            description: 'The token for your node which you want to connect',
        },
    ];

    public static flags = {
        cpu: flags.integer(),
        memory: flags.integer(),
        server: flags.string(),
        serverPort: flags.integer(),
        deepkitSpeedServer: flags.string(),
        deepkitSpeedServerPort: flags.integer(),
    };

    public nodeController!: RemoteController<NodeControllerInterface>;
    protected lastCpus: os.CpuInfo[] = [];
    protected docker!: Docker;

    protected speedServer: string = '127.0.0.1';
    protected speedServerPort: number = 61721;

    protected nodeId!: string;
    public account!: HomeAccountConfig;
    public dockerReady = false;

    startConfig?: ClusterNodeJobStartConfig;

    protected drives: { path: string, index: number }[] = [];

    protected activeTaskInstances: { [taskInstanceId: string]: AssignedJobTaskInstance } = {};

    protected logSubject = new Subject<string>();
    protected active = true;
    protected connected = false;

    protected peerSpeedTests: { [peerNodeId: string]: { active: boolean } } = {};
    protected lastCheckSpeedTimeout: any;

    protected resourcesFlags: { cpu?: number, memory?: number } = {};

    protected client!: NodeClient;

    public async run(): Promise<void> {
        await pidLocker('/tmp/run-deepkit-connect.run', true);

        const {args, flags} = this.parse(ConnectCommand);
        this.resourcesFlags.cpu = flags.cpu;
        this.resourcesFlags.memory = flags.memory;

        this.account = new HomeAccountConfig('default', '127.0.0.1');

        if (flags.server) {
            this.account.host = flags.server;
        }
        if (flags.serverPort) {
            this.account.port = flags.serverPort;
        }

        if (flags.deepkitSpeedServer) {
            this.speedServer = flags.deepkitSpeedServer;
        }

        if (flags.deepkitSpeedServerPort) {
            this.speedServerPort = flags.deepkitSpeedServerPort;
        }

        this.client = ClientController.forNode(this.account, args.id, args.token);
        this.nodeController = this.client.node();

        //todo, we should make sure that file doesn't get bigger than few megabytes.
        const fileLog = createWriteStream('deepkit.log', {flags: 'a'});

        const originalStdoutWrite: any = process.stdout.write.bind(process.stdout);
        process.stdout.write = (...args: any[]) => {
            this.logSubject.next(args[0]);
            fileLog.write(args[0]);
            return originalStdoutWrite(...args);
        };

        const originalStderrWrite: any = process.stderr.write.bind(process.stdout);
        process.stderr.write = (...args: any[]) => {
            this.logSubject.next(args[0]);
            fileLog.write(args[0]);
            return originalStderrWrite(...args);
        };

        this.logSubject.pipe(bufferTime(1000)).subscribe(async (ds: (Buffer | string)[]) => {
            let total = '';
            for (const d of ds) {
                total += (d instanceof Buffer) ? d.toString('utf8') : d;
            }

            try {
                if (total) {
                    await this.nodeController.putStdout(total);
                }
            } catch (error) {
            }
        });

        console.log('-----------------------');

        await this.client.client.connect();

        console.log('Connection established');

        //todo, make it configurable? So we can use in macOs/windows the VM better?
        this.docker = new Docker();

        // const speedPort = 61721;

        const pingServer = createServer(function(socket) {
        });
        pingServer.listen(61720, '0.0.0.0');
        // const server = new SpeedServer('0.0.0.0', 61721);
        // server.start().then(() => {
        // }, (error: any) => {
        //     console.error('SpeedServer error', error);
        // });

        // console.log(`Joining cluster swarm ...`);
        // await this.joinSwarm(flags.masterAddress);
        // await this.createMonitoringContainer();
        // console.log(`   joined.`);

        const connected = async () => {
            await this.setDockerInfo();
            await this.setNvidiaInfo();

            const nodeId = this.nodeId = await this.nodeController.connected(
                await this.getResources(flags.cpu, flags.memory)
            );

            console.log(`Node is now connected to Deepkit.`);

            this.startConfig = await this.nodeController.getStartConfig();

            // await this.nodeController.setNetwork(await getMyIPAddress(), '', speedPort);
            await this.client.client.registerController('node/' + nodeId, new NodePeerController(this, this.docker));

            await this.setHardwareInformation();
            this.ready();
            this.checkPeerConnection();
        };

        this.client.client.connection.subscribe(async (v) => {
            this.connected = v;

            if (this.connected) {
                try {
                    await connected();
                } catch (error) {
                    console.error(error);
                }
            } else {
                console.log('Connection lost.');
            }
        });

        while (this.active) {
            try {
                if (this.connected) {
                    await this.streamStats();
                } else {
                    console.log('Try to connect');
                    await this.client.client.connect();
                }
            } catch (error) {
                if (error instanceof AuthenticationError) {
                    this.active = false;
                    console.log('Authentication error. exiting.');
                    throw new Error('Authentication failed. Abort.');
                }
                console.log('Error, retry in 5sec', error.message || error);
                //add additional seconds
                await sleep(5);
            }
            await sleep(1);
        }

        //all jobs are stopped automatically due to execa cleanup:true
        console.log('Bye.');
        process.exit(0);
    }

    public async stop() {
        console.log('Exiting ...');
        this.logSubject.complete();
        this.active = false;

        await this.client.disconnect();
    }

    public async setNvidiaInfo(): Promise<void> {
        try {
            const gpu = new GPUReader();
            await gpu.activatePersistentMode();
            const version = await gpu.getVersions();
            await this.nodeController.setNvidiaInfo(version);

            if ((await gpu.getGpus()).length) {
                await this.nodeController.setResources(await this.getResources(this.resourcesFlags.cpu, this.resourcesFlags.memory));
            }
        } catch (error) {
            console.error('setNvidiaInfo', error);
        }
    }

    public async setDockerInfo(callReadyWhenOK = false): Promise<boolean> {
        try {
            const info = await this.docker.info();
            await this.nodeController.setDockerInfo(info);
            this.dockerReady = true;
            if (callReadyWhenOK) {
                await this.ready();
            }
        } catch (error) {
            console.log('Docker daemon not ready', error);
            try {
                await this.nodeController.setDockerInfo({error: error});
            } catch (error) {
                console.error('setDockerInfo', error);
            }
            this.dockerReady = false;
        }

        return this.dockerReady;
    }

    public async ready() {
        //when docker is not correctly connected, we dont mark this node as ready
        if (!this.dockerReady) return;

        console.log(`Node is ready to accept jobs.`);
        await this.nodeController.ready();

        await this.startAssignedTaskInstances();
    }

    public async startAssignedTaskInstances() {
        const taskInstances = await this.nodeController.getAssignedTaskInstances();
        for (const taskInstance of taskInstances) {
            this.startTaskInstance(taskInstance);
        }
    }

    public endTaskInstance(assignedJobTaskInstance: AssignedJobTaskInstance) {
        const id = getJobTaskInstanceIdForAssignedJobTaskInstance(assignedJobTaskInstance);
        delete this.activeTaskInstances[id];
    }

    public startTaskInstance(assignedJobTaskInstance: AssignedJobTaskInstance) {
        if (!this.startConfig) {
            console.error('No startConfig set');
            return;
        }

        const id = getJobTaskInstanceIdForAssignedJobTaskInstance(assignedJobTaskInstance);
        if (this.activeTaskInstances[id]) {
            return;
        }

        this.activeTaskInstances[id] = assignedJobTaskInstance;

        startTaskInstance(
            this.nodeController,
            this.config,
            this.account.host,
            this.account.port,
            assignedJobTaskInstance,
            this.startConfig
        ).then(() => {
            this.endTaskInstance(assignedJobTaskInstance);
        }, (error) => {
            this.endTaskInstance(assignedJobTaskInstance);
        });
    }

    protected async checkPeerConnection() {
        if (this.lastCheckSpeedTimeout) {
            clearTimeout(this.lastCheckSpeedTimeout);
        }

        if (this.connected) {
            try {
                const peers = await this.nodeController.getPeers();
                peers.unshift({id: 'server', ip: this.speedServer, port: this.speedServerPort});

                for (const peer of peers) {
                    if (!peer.ip) continue;

                    const client = new SpeedClient(peer.ip, peer.port);

                    try {
                        const ping = await client.ping();
                        await this.nodeController.setPeerConnection(peer.id, ping);
                    } catch (error) {
                    }
                }
            } catch (error) {

            }
        }

        this.lastCheckSpeedTimeout = setTimeout(() => {
            this.checkPeerConnection();
        }, 20_000);
    }

    public async getResources(maxCpu?: number, maxMemory?: number): Promise<NodeResources> {
        // Convert to GB
        const resources = new NodeResources;

        try {
            const info = await this.docker.info();

            const ramInTotal = Math.floor(info['MemTotal'] / 1000 / 1000 / 1000);
            resources.cpu.total = maxCpu || info['NCPU'];
            resources.memory.total = maxMemory || ramInTotal;
        } catch (error) {
            resources.cpu.total = maxCpu || os.cpus().length;
            resources.memory.total = Math.floor(os.totalmem() / 1024 / 1024 / 1024);
        }

        const gpu = new GPUReader();
        const gpus = await gpu.getGpus();
        for (const [i, gpu] of eachPair(gpus)) {
            const gpuResource = new NodeGpuResource(i, gpu.name);
            gpuResource.memory = gpu.memoryTotal;
            resources.gpu.push(gpuResource);
        }

        for (const active of each(this.activeTaskInstances)) {
            resources.reserveAssignment(
                active.jobId,
                active.jobAccessToken,
                active.taskName,
                active.instance,
                active.assignedResources
            );
        }

        return resources;
    }

    public async setHardwareInformation() {
        const info = new NodeHardwareInformation;

        const system = await systeminformation.system();
        info.deviceDescription = `${system.manufacturer} ${system.model}`;

        const osInfo = await systeminformation.osInfo();
        info.osDescription = `${osInfo.distro} - ${osInfo.release} - Kernel: ${osInfo.kernel}`;

        const cpu = await systeminformation.cpu();
        info.cpuDescription = `${cpu.manufacturer} ${cpu.brand} - ${cpu.speed} GHz - ${cpu.cores} Cores`;

        const graphics = await systeminformation.graphics();

        for (const controller of graphics.controllers) {
            const gb = (controller.vram > 512 ? controller.vram / 1024 : controller.vram).toFixed(2);
            info.gpuDescriptions.push(`${controller.vendor} ${controller.model} ${gb} GB`);
        }

        for (const cpu of each(os.cpus())) {
            info.cpus.push(new NodeHardwareInformationCpu(
                cpu.speed,
                cpu.model,
            ));
        }

        info.platform = os.platform() as NodeHardwarePlatform;
        info.memoryTotal = (os.totalmem() / 1024 / 1024 / 1024);

        const gpu = new GPUReader();
        const gpus = await gpu.getGpus();

        for (const gpu of gpus) {
            const gpuHardware = new NodeHardwareInformationGpu(
                gpu.index, gpu.uuid, gpu.name, gpu.clockMax, gpu.memoryTotal
            );
            gpuHardware.powerLimit = gpu.powerLimit;
            gpuHardware.temperatureMax = gpu.temperatureMax;
            info.gpus.push(gpuHardware);
        }

        //doesnt work when compiled. we should find an alternative.
        // const drives: drivelist.Drive[] = await drivelist.list();
        // this.drives = [];
        // for (const drive of drives) {
        //     if (drive.size && !drive.isVirtual && !drive.isUSB && !drive.isReadOnly && !drive.isCard && drive.mountpoints[0]) {
        //         this.drives.push({index: info.drives.length, path: drive.mountpoints[0].path});
        //
        //         const check = await diskusage.check(drive.mountpoints[0].path);
        //
        //         info.drives.push(new NodeHardwareInformationDrive(
        //             drive.description,
        //             drive.device,
        //             check.total / 1000 / 1000 / 1000,
        //             drive.mountpoints
        //         ));
        //     }
        // }

        await this.nodeController.setHardwareInformation(info);
    }

    public async streamStats() {
        const cpus = os.cpus();
        const cpuUsages: NodeCpuResource[] = [];

        for (const i of eachKey(cpus)) {
            cpuUsages.push(new NodeCpuResource(
                CpuHelper.calculateUsagePerCore(cpus[i], this.lastCpus[i])
            ));
        }

        this.lastCpus = cpus;
        const stats = new NodeHardwareStats();

        for (const drive of this.drives) {
            //todo use systeminformation
            // const check = await diskusage.check(drive.path);
            // stats.driveUsage.push((check.total - check.available) / check.total);
        }

        const memory = await systeminformation.mem();
        stats.uptime = os.uptime();
        stats.memoryUsage = (memory.active) / 1000 / 1000 / 1000;
        stats.cpus = cpuUsages;

        const gpu = new GPUReader();
        const gpus = await gpu.getGpus();

        for (const gpu of gpus) {
            const gpuStat = new NodeHardwareStatsGpu(gpu.uuid);
            gpuStat.clock = gpu.clock;
            gpuStat.gpuUtilization = gpu.gpuUtilization;
            gpuStat.memory = gpu.memoryUsed / gpu.memoryTotal;
            gpuStat.powerDraw = gpu.powerDraw;
            gpuStat.temperature = gpu.temperature;
            stats.gpus.push(gpuStat);
        }

        await this.nodeController.streamStats(stats);
    }
}
