/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Client, ClientChannel, SFTPWrapper, TcpConnectionDetails} from "ssh2";
import {Socket} from "net";
import * as stream from "stream";
import {findParentPath} from "./utils";
import {getMd5FromFile} from "./md5";
import {ClusterNode, ClusterNodeCredentials} from "@deepkit/core";

// export class DockerConnection {
//     protected docker: Docker;
//
//     constructor(public readonly containerId: string) {
//         this.docker = new Docker;
//     }
//
//     public async exec(command: string[]): Promise<number> {
//         const container = await this.docker.getContainer(this.containerId);
//
//         container.exec({Cmd: command, AttachStdin: true, AttachStdout: true}, (err, exec) => {
//             console.log('executed');
//             exec.start({hijack: true, stdin: true}, (err: any, stream: any) => {
//                 console.log('starting ???');
//                 this.docker.modem.demuxStream(stream, process.stdout, process.stderr);
//             });
//         });
//         // container.exec({Cmd: command, AttachStdin: true, AttachStdout: true}, function (err, exec) {
//         //     exec.start({hijack: true, stdin: true}, function (err: any, stream: any) {
//         //         // shasum can't finish until after its stdin has been closed, telling it that it has
//         //         // read all the bytes it needs to sum. Without a socket upgrade, there is no way to
//         //         // close the write-side of the stream without also closing the read-side!
//         //         // fs.createReadStream('node-v5.1.0.tgz', 'binary').pipe(stream);
//         //         //
//         //         // // Fortunately, we have a regular TCP socket now, so when the readstream finishes and closes our
//         //         // // stream, it is still open for reading and we will still get our results :-)
//         //         // docker.modem.demuxStream(stream, process.stdout, process.stderr);
//         //     });
//         // });
//     }
// }

export class SshConnection {
    protected connected = false;
    protected client: Client;
    protected destroyed = false;

    protected sftp?: SFTPWrapper;

    constructor(
        public readonly host: string,
        public readonly port: number,
        public readonly username: string,
        public readonly password?: string,
        public readonly privateKey?: string,
        public readonly privateKeyPassphrase?: string,
    ) {
        this.client = new Client();
    }

    disconnect() {
        this.destroyed = true;
        this.client.end();

        if (this.sftp) {
            this.sftp.end();
        }

        this.connected = false;
    }

    async connect(): Promise<void> {
        if (this.connected) return;
        if (this.destroyed) throw new Error('Connection was already used and destroyed. Use a new one.');

        return new Promise((resolve, reject) => {
            this.client.on('error', (error: any) => {
                reject(error);
            });
            this.client.once('ready', () => {
                this.connected = true;
                resolve();
            });
            this.client.connect({
                host: this.host,
                port: this.port,
                username: this.username,
                password: this.password,
                privateKey: this.privateKey,
                passphrase: this.privateKeyPassphrase,
                compress: false,
                algorithms: {
                    compress: []
                }
            });
        });
    }

    async exec(command: (string | number)[], options: {
        failSilent?: true
        redirectTo?: stream.Writable,
        stdin?: string,
        debug?: boolean,
    } = {}): Promise<number> {
        await this.connect();
        return await new Promise<number>((resolve, reject) => {
            const arg = command.join(' ');
            if (options.debug && options.redirectTo) {
                options.redirectTo.write(`$ ${arg}\n`);
            }
            this.client.exec(arg, {
                // pty: options.stdin ? true : undefined,
            }, (err, stream) => {
                if (err) {
                    return reject(err);
                }

                if (options.stdin) {
                    stream.stdin.write(options.stdin);
                }

                let error = '';
                stream.on('close', function (code: number, signal: number) {
                    if (code && !options.failSilent) {
                        reject(new Error('code:' + code + ', error: ' + error));
                    }
                    resolve(code);
                }).on('data', function (d: any) {
                    if (options.redirectTo) {
                        options.redirectTo.write(d);
                    }
                })
                    .stderr.on('data', function (d) {
                    error += d instanceof Buffer ? d.toString('utf8') : d;
                    if (options.redirectTo) {
                        options.redirectTo.write(d);
                    }
                });
            });
        });
    }

    async output(
        command: (string | number)[]
    ): Promise<string> {
        await this.connect();
        return await new Promise((resolve, reject) => {
            this.client.exec(command.join(' '), {}, (err, stream) => {
                if (err) {
                    return reject(err);
                }

                let data = '';
                let error = '';
                stream.on('close', function (code: string, signal: number) {
                    resolve(data);
                }).on('data', function (d: any) {
                    data += d instanceof Buffer ? d.toString('utf8') : d;
                })
                    .stderr.on('data', function (d) {
                    error += d instanceof Buffer ? d.toString('utf8') : d;
                });
            });
        });
    }

    closeSftp() {
        if (this.sftp) {
            this.sftp.end();
            this.sftp = undefined;
        }
    }

    async getSftp(): Promise<SFTPWrapper> {
        if (this.sftp) {
            return this.sftp;
        }

        await this.connect();

        return new Promise((resolve, reject) => {
            this.client.sftp((err, sftp) => {
                if (err) {
                    return reject(err);
                }

                this.sftp = sftp;
                resolve(sftp);
            });
        });
    }

    async putFile(path: string, targetPath: string): Promise<void> {
        const ftp = await this.getSftp();

        console.log('putFile', path, targetPath);
        return new Promise((resolve, reject) => {
            ftp.fastPut(path, targetPath, (err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });
    }

    async unForwardToUs(remotePort: number): Promise<void> {
        await new Promise((resolve, reject) => {
            this.client.unforwardIn('127.0.0.1', remotePort, (newError) => {
                resolve();
            });
        });
    }

    /**
     * Redirects the port remotePort from the ssh host to to localhost localPort.
     */
    async forwardToUs(localPort: number, remotePort: number): Promise<void> {
        await new Promise((resolve, reject) => {
            this.client.forwardIn('127.0.0.1', remotePort, (error) => {
                if (error) {
                    return reject(`unable to forwardToUs: ${error.message || error}`);
                } else {
                    resolve();
                }
            });
        });

        console.log(`Port forwarded remote:${remotePort} -> local:${localPort}`);

        const onTcpConnection = (details: TcpConnectionDetails, accept: () => ClientChannel, reject: () => void) => {
            if (details.destPort === remotePort) {
                try {
                    const socket = new Socket();
                    const remote = accept();
                    if (remote) {
                        remote.on('error', (...args: any[]) => {
                        });
                        socket.on('error', (...args: any[]) => {
                        });

                        remote.pause();

                        socket.connect(localPort, '127.0.0.1', () => {
                            remote.pipe(socket);
                            socket.pipe(remote);
                            remote.resume();
                        });
                    }
                } catch (error) {
                    console.log(`Tcp pipe error to ${localPort}: error`);
                }
            }
        };

        this.client.on('tcp connection', onTcpConnection);

        await new Promise((resolve, reject) => {
            this.client.on('close', () => {
                console.log('forwardToUs ended');
                resolve();
            });
            this.client.on('error', (error) => {
                console.log('forwardToUs error', error);
                resolve();
            });
        });
    }
}

export enum OSType {
    darwin = 'darwin',
    linux = 'linux',
    linux_arm = 'linux-arm',
    windows = 'windows',
}

export enum LinuxDistribution {
    ubuntu,
    debian,
}

export class OS {
    constructor(public readonly osType: OSType) {
    }

    isUnixLike() {
        return this.osType === OSType.linux_arm || this.osType === OSType.linux || this.osType === OSType.darwin;
    }

    isLinux() {
        return this.osType === OSType.linux_arm || this.osType === OSType.linux;
    }
}

export async function detectOS(connection: SshConnection): Promise<OS> {
    const uname = await connection.output(['uname', '-a']);

    if (-1 !== uname.indexOf('Darwin Kernel')) {
        return new OS(OSType.darwin);
    }

    if (-1 !== uname.indexOf('aarch64')) {
        return new OS(OSType.linux_arm);
    }

    if (-1 !== uname.indexOf('x86')) {
        return new OS(OSType.linux);
    }

    throw new Error('No OS detectable.');
}

export async function detectPackageManager(connection: SshConnection): Promise<LinuxDistribution | undefined> {
    const output = JSON.parse(await connection.output(['deepkit/cli/bin/deepkit', 'os']));

    //see https://github.com/retrohacker/getos/blob/master/os.json
    if (output['dist'] === 'Ubuntu Linux') {
        return LinuxDistribution.ubuntu;
    }

    if (output['dist'] === 'Debian') {
        return LinuxDistribution.debian;
    }
}

export class Provision {
    constructor(
        public readonly connection: SshConnection,
        public readonly logger: stream.Writable = process.stdout,
    ) {
    }

    protected async getLinuxCliArchive(): Promise<string> {
        return await findParentPath('build/linux/deepkit-cli-linux.tar.gz');
    }

    public async installNvidia(sshRequiresSudo = false) {
        const packageManager = await detectPackageManager(this.connection);
        const options = {redirectTo: this.logger, debug: true};
        const sudo = sshRequiresSudo ? 'sudo' : '';

        if (packageManager === LinuxDistribution.debian || packageManager === LinuxDistribution.ubuntu) {
            await this.connection.exec([
                sudo,
                'deepkit/cli/bin/deepkit',
                'install-nvidia'
            ], options);

            this.logger.write(`Done\n`);
            return;
        }

        throw new Error(`No supported package manager ${packageManager}.`);
    }

    public async disableNouveau(sshRequiresSudo = false) {
        const packageManager = await detectPackageManager(this.connection);
        const options = {redirectTo: this.logger, debug: true};
        const sudo = sshRequiresSudo ? 'sudo' : '';

        if (packageManager === LinuxDistribution.debian || packageManager === LinuxDistribution.ubuntu) {
            await this.connection.exec([
                sudo,
                'deepkit/cli/bin/deepkit',
                'install-nvidia',
                '--disableNouveau'
            ], options);

            this.logger.write(`Done\n`);
            return;
        }

        throw new Error(`No supported package manager ${packageManager}.`);
    }

    public async installDocker(sshRequiresSudo = false) {
        const packageManager = await detectPackageManager(this.connection);
        const options = {redirectTo: this.logger, debug: true};
        const sudo = sshRequiresSudo ? 'sudo' : '';

        if (packageManager === LinuxDistribution.debian || packageManager === LinuxDistribution.ubuntu) {
            await this.connection.exec([
                sudo,
                'deepkit/cli/bin/deepkit',
                'install-docker'
            ], options);

            this.logger.write(`Done\n`);
            return;
        }

        throw new Error(`No supported package manager ${packageManager}.`);
    }

    public async ensureSudoAccess(credentials: ClusterNodeCredentials): Promise<boolean> {
        if (!credentials.sshRequiresSudo) return true;

        const os = await detectOS(this.connection);

        if (os.isLinux()) {
            const code = await this.connection.exec([
                'sudo',
                'deepkit/cli/bin/deepkit',
                'os'
            ], {failSilent: true});

            if (code !== 0) {
                if (await this.connection.exec([
                    `sudo --stdin true && echo $USER ALL=\\(root\\) NOPASSWD: $(pwd)/deepkit/cli/bin/deepkit | sudo tee /etc/sudoers.d/15-deepkit`
                ], {
                    stdin: credentials.sshPassword + '\n',
                    failSilent: true,
                    redirectTo: this.logger
                })) {
                    throw new Error('Could not write sudoers.d file');
                }

                return await this.connection.exec([
                    'sudo',
                    'deepkit/cli/bin/deepkit',
                    'os'
                ], {
                    redirectTo: this.logger,
                    failSilent: true,
                }) === 0;
            }
            return true;
        }

        throw new Error('Operating system not supported');
    }

    public async provision() {
        const os = await detectOS(this.connection);

        if (os.isLinux()) {
            // for the moment. WE ONLY SUPPORT DEBIAN/UBUNTU.
            // If people have something different, we display an error

            let needsUpload = false;
            const currentMd5 = await getMd5FromFile(await this.getLinuxCliArchive());

            try {
                let md5 = await this.connection.output(['md5sum', 'deepkit-cli-linux.tar.gz']);
                if (md5) {
                    md5 = md5.substr(0, md5.indexOf(' '));
                }
                needsUpload = md5 !== currentMd5;
            } catch (error) {
                needsUpload = true;
            }

            if (await this.connection.exec(['ls', 'deepkit/cli/bin/node'], {failSilent: true}) > 0) {
                needsUpload = true;
            }

            if (needsUpload) {
                await this.connection.exec(['rm', '-rf', 'deepkit/cli'], {redirectTo: this.logger});
                await this.connection.exec(['mkdir', '-p', 'deepkit/cli'], {redirectTo: this.logger});

                await this.connection.putFile(await this.getLinuxCliArchive(), 'deepkit-cli-linux.tar.gz');
                await this.connection.exec(['tar', 'xf', 'deepkit-cli-linux.tar.gz', '-C', 'deepkit/cli'], {redirectTo: this.logger});
            }

            const nodePath = 'deepkit/cli/bin/node';
            const deepkitPath = 'deepkit/cli/bin/deepkit';
            await this.connection.exec(['chmod', '+x', nodePath], {redirectTo: this.logger});

            await this.connection.exec(['chmod', '+x', nodePath], {redirectTo: this.logger});
            await this.connection.exec(['chmod', '+x', deepkitPath], {redirectTo: this.logger});

            try {
                await this.connection.exec([nodePath, '-v']);
            } catch (error) {
                throw new Error('Node binary not compatible. That distribution is not supported. Error: ' + error);
            }

            try {
                await this.connection.exec([deepkitPath, '-v']);
            } catch (error) {
                throw new Error('Deepkit binary not compatible. That distribution is not supported. Error: ' + error);
            }

            return;
        }

        throw new Error(`No support for ${os.osType}.`);
    }

    public async startConnect(node: ClusterNode, token: string, sshRequiresSudo = false) {
        const sudo = sshRequiresSudo ? 'sudo' : '';

        let needsStart = true;

        if (node.resources.hasAssignedJobs()) {
            //we need to check if an instance is running, to not kill active jobs.
            let pid: string | undefined;

            try {
                pid = await this.connection.output(['cat', '/tmp/run-deepkit-connect.run']);
            } catch (error) {

            }

            if (pid) {
                needsStart = false;
                try {
                    const output = await this.connection.output([`ps ${pid}`]);
                    if (-1 !== output.toLowerCase().indexOf('connect --server=')) {
                        return;
                    } else {
                        needsStart = true;
                    }
                } catch (error) {
                    needsStart = true;
                }
            }
        }

        if (needsStart) {
            await this.connection.exec([
                sudo,
                'deepkit/cli/bin/deepkit',
                'connect',
                '--server=127.0.0.1',
                '--serverPort=8961',
                '--deepkitSpeedServer=127.0.0.1',
                '--deepkitSpeedServerPort=61721',
                node.id, token
            ]);
        }
    }
}
