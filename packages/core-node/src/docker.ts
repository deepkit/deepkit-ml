/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import Dockerode from "dockerode";
import stream from "stream";
import {ContainerCreateOptions} from "dockerode";

/**
 * When a path like `../../dir` is given, it is replaced with `./parent-file/__/__/dir`.
 * This is necessary to support files outside of the project dir, so that it is included
 * in the job itself.
 */
export function normalizeRelativePathToBeIncluded(path: string): string {
    if (path.startsWith('..')) {
        return '.parent-file/' + path.replace(/(\.\.)/g, '__');
    }
    if (!path) return './';

    return path;
}

class DockerNetwork {
    private network: Dockerode.Network;

    constructor(private modem: any, private id: string) {
        this.network = new Dockerode.Network(modem, id);
    }

    remove(options?: {}): Promise<any> {
        return this.network.remove(options);
    }

    connect(options?: {}): Promise<any> {
        return this.network.connect(options);
    }

    disconnect(options?: {}): Promise<any> {
        return this.network.disconnect(options);
    }

    inspect(query: { verbose?: boolean, scope?: 'swarm' | 'global' | 'local' } = {}) {
        const optsf = {
            path: '/networks/' + this.id + '?',
            method: 'GET',
            statusCodes: {
                200: true,
                404: 'no such network',
                500: 'server error'
            },
            options: {
                _query: query
            }
        };

        return new Promise((resolve, reject) => {
            this.modem.dial(optsf, function (err: any, data: any) {
                if (err) {
                    return reject(err);
                }
                resolve(data);
            });
        });
    }
}

export class Docker {
    protected docker: Dockerode;
    public readonly modem: any;

    constructor(options?: Dockerode.DockerOptions) {
        this.docker = new Dockerode(options);
        this.modem = this.docker.modem;
    }

    getNetwork(id: string): DockerNetwork {
        return new DockerNetwork(this.modem, id);
    }

    createContainer(options: Dockerode.ContainerCreateOptions): Promise<Dockerode.Container> {
        return this.docker.createContainer(options);
    }

    createImage(auth: any, options: {}): Promise<NodeJS.ReadableStream> {
        return this.docker.createImage(auth, options);
    }

    loadImage(file: string | NodeJS.ReadableStream, options?: {}): Promise<NodeJS.ReadableStream> {
        return this.docker.loadImage(file, options);
    }

    importImage(file: string | NodeJS.ReadableStream, options?: {}): Promise<NodeJS.ReadableStream> {
        return this.docker.importImage(file, options);
    }

    checkAuth(options: any): Promise<any> {
        return this.docker.checkAuth(options);
    }

    buildImage(file: string | NodeJS.ReadableStream | Dockerode.ImageBuildContext, options?: {}): Promise<NodeJS.ReadableStream> {
        return this.docker.buildImage(file, options);
    }

    getContainer(id: string): Dockerode.Container {
        return this.docker.getContainer(id);
    }

    getImage(name: string): Dockerode.Image {
        return this.docker.getImage(name);
    }

    getVolume(name: string): Dockerode.Volume {
        return this.docker.getVolume(name);
    }

    getPlugin(name: string, remote: any): Dockerode.Plugin {
        return this.docker.getPlugin(name, remote);
    }

    getService(id: string): Dockerode.Service {
        return this.docker.getService(id);
    }

    getTask(id: string): Dockerode.Task {
        return this.docker.getTask(id);
    }

    getNode(id: string): Dockerode.Node {
        return this.docker.getNode(id);
    }

    getSecret(id: string): Dockerode.Secret {
        return this.docker.getSecret(id);
    }

    getExec(id: string): Dockerode.Exec {
        return this.docker.getExec(id);
    }

    listContainers(options?: {}): Promise<Dockerode.ContainerInfo[]> {
        return this.docker.listContainers(options);
    }

    listImages(options?: {}): Promise<Dockerode.ImageInfo[]> {
        return this.docker.listImages(options);
    }

    listServices(options?: {}): Promise<any[]> {
        return this.docker.listServices(options);
    }

    listNodes(options?: {}): Promise<any[]> {
        return this.docker.listNodes(options);
    }

    listTasks(options?: {}): Promise<any[]> {
        return this.docker.listTasks(options);
    }

    listSecrets(options?: {}): Promise<Dockerode.SecretInfo[]> {
        return this.docker.listSecrets(options);
    }

    listPlugins(options?: {}): Promise<Dockerode.PluginInfo[]> {
        return this.docker.listPlugins(options);
    }

    listVolumes(options?: {}): Promise<{
        Volumes: Dockerode.VolumeInspectInfo[];
        Warnings: string[];
    }> {
        return this.docker.listVolumes(options);
    }

    listNetworks(options?: {}): Promise<any[]> {
        return this.docker.listNetworks(options);
    }

    createSecret(options: {}): Promise<any> {
        return this.docker.createSecret(options);
    }

    createPlugin(options: {}): Promise<any> {
        return this.docker.createPlugin(options);
    }

    createVolume(options: {}): Promise<any> {
        return this.docker.createVolume(options);
    }

    createService(options: {}): Promise<any> {
        return this.docker.createService(options);
    }

    createNetwork(options: {}): Promise<any> {
        return this.docker.createNetwork(options);
    }

    searchImages(options: {}): Promise<any> {
        return this.docker.searchImages(options);
    }

    pruneImages(options?: {}): Promise<Dockerode.PruneImagesInfo> {
        return this.docker.pruneImages(options);
    }

    pruneContainers(options?: {}): Promise<Dockerode.PruneContainersInfo> {
        return this.docker.pruneContainers(options);
    }

    pruneVolumes(options?: {}): Promise<Dockerode.PruneVolumesInfo> {
        return this.docker.pruneVolumes(options);
    }

    pruneNetworks(options?: {}): Promise<Dockerode.PruneNetworksInfo> {
        return this.docker.pruneNetworks(options);
    }

    info(): Promise<any> {
        return this.docker.info();
    }

    df(): Promise<any> {
        return this.docker.df();
    }

    version(): Promise<Dockerode.DockerVersion> {
        return this.docker.version();
    }

    ping(): Promise<any> {
        return this.docker.ping();
    }

    getEvents(options?: {}): Promise<NodeJS.ReadableStream> {
        return this.docker.getEvents(options);
    }

    pull(repoTag: string, options: {} = {}, auth?: {}): Promise<any> {
        return this.docker.pull(repoTag, options);
    }

    run(image: string, cmd: string[], outputStream: NodeJS.WritableStream | NodeJS.WritableStream[], createOptions?: {}, startOptions?: {}): Promise<any> {
        return this.docker.run(image, cmd, outputStream, createOptions, startOptions);
    }

    swarmInit(options: {}): Promise<any> {
        return this.docker.swarmInit(options);
    }

    swarmJoin(options: {}): Promise<any> {
        return this.docker.swarmJoin(options);
    }

    swarmLeave(options: {}): Promise<any> {
        return this.docker.swarmLeave(options);
    }

    swarmUpdate(options: {}): Promise<any> {
        return this.docker.swarmUpdate(options);
    }

    swarmInspect(): Promise<any> {
        return this.docker.swarmInspect();
    }
}

export async function dockerRun(
    docker: Docker,
    options: { name: string, network?: string } & ContainerCreateOptions,
): Promise<Buffer> {
    let output = Buffer.from('');
    await docker.run(
        'alpine',
        ['sh', '-c', `netstat -nr | grep '^0\\.0\\.0\\.0' | awk '{print $2}'`],
        new class extends stream.Writable {
            _write(chunk: any, encoding: string, callback: (err?: Error) => void): void {
                output = Buffer.concat([output, chunk]);
                callback();
            }
        },
        options,
        {}
    );
    return output;
}

export async function dockerRunWithStdIn(
    docker: Docker,
    stdin: NodeJS.ReadableStream | Buffer | null,
    options: { name: string, network?: string } & ContainerCreateOptions,
): Promise<Buffer> {

    return await new Promise<Buffer>(async (resolve, reject) => {
        let stdOutAndStdErr: Buffer = Buffer.from('');
        let currentChunk = Buffer.from('');

        const attachStream = new stream.Writable({
            write: function (chunk: Buffer, encoding, next) {
                //header := [8]byte{STREAM_TYPE, 0, 0, 0, SIZE1, SIZE2, SIZE3, SIZE4}
                currentChunk = Buffer.concat([currentChunk, chunk]);
                //const isStdOut = currentChunk.readInt8() === 0x01;
                //const isStdErr = currentChunk.readInt8() === 0x02;
                const payloadSize: number = currentChunk.readUInt32BE(4);

                while (currentChunk.byteLength >= 8 + payloadSize) {
                    stdOutAndStdErr = Buffer.concat([stdOutAndStdErr, currentChunk.slice(8, 8 + payloadSize)]);
                    currentChunk = currentChunk.slice(8 + payloadSize);
                }
                next();
            },
        });

        async function removeContainer() {
            try {
                await docker.getContainer(options.name).remove({force: true});
            } catch (error) {
            }
        }

        await removeContainer();
        const container = await docker.createContainer(Object.assign({
            OpenStdin: true,
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            StdinOnce: true,
        }, options));

        container.attach({
            stream: true,
            stdin: true,
            hijack: true,
            stdout: true,
            stderr: true,
        }, (err, dockerStream) => {
            if (err || !dockerStream) {
                removeContainer();
                reject(new Error(err));
                return;
            }

            dockerStream.pipe(attachStream);

            container.start((err, data) => {
                if (err) {
                    removeContainer();
                    reject(new Error(err));
                    return;
                }

                if (stdin instanceof Buffer) {
                    dockerStream.end(stdin);
                } else if (stdin) {
                    stdin.pipe(dockerStream);
                } else {
                    dockerStream.end();
                }

                container.wait(async (err, data) => {
                    if (err) {
                        removeContainer();
                        reject(err);
                        return;
                    }

                    resolve(stdOutAndStdErr);
                });
            });
        });
    });
}
