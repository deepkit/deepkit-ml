/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {platform} from "os";
import execa from "execa";
import {findParentPath} from "./utils";
import {sleep} from "@marcj/estdlib";
import * as net from "net";

async function execute(args: string[], options: execa.Options = {}): Promise<execa.ExecaChildProcess> {
    const path = await findParentPath('libs/iperf3');

    let command: string | undefined;
    const env: { [name: string]: string } = {};

    if (platform() === 'linux') {
        command = path + '/linux/iperf3_3.1.3';
        env['LD_LIBRARY_PATH'] = path + '/linux';
    }

    if (platform() === 'darwin') {
        command = path + '/iperf3_3.1.3-darwin';
    }

    if (command) {
        const b: execa.ExecaChildProcess<string> = execa(command, args, {
            env: env,
            cleanup: true,
            ...options
        });

        return b as any; //WTF IS WRONG WITH EXECA!!!!!!
    }

    throw new Error(`Platform ${platform()} not supported for speed tests.`);
}

export class SpeedServer {
    protected server?: execa.ExecaChildProcess;
    protected active = true;

    constructor(public readonly host: string = '127.0.0.1', public readonly port: number = 61721) {
    }

    public async start() {
        while (this.active) {
            try {
                this.server = await execute([
                    '--server',
                    '--bind', this.host,
                    '--port', String(this.port),
                ], {
                    stdout: 'ignore',
                    stderr: 'ignore',
                    cleanup: true,
                    detached: true,
                }) as any;

                await this.server;
            } catch (error) {
                await sleep(0.5);
            }
        }
    }

    public close() {
        this.active = false;
        if (this.server) {
            this.server.kill('SIGTERM', {
                forceKillAfterTimeout: 2000
            });
        }
    }
}

export class SpeedClient {
    constructor(
        public readonly host: string = '127.0.0.1',
        public readonly port: number = 61721,
    ) {
    }

    public async testBandwidth(): Promise<{ download: number, upload: number }> {
        const bandwidth = {download: 0, upload: 0};
        {
            const output = await (await execute([
                '-c', this.host,
                '--port', String(this.port),
                '-t', '1',
                // '--bytes', '255000',
                '--json',
            ], {
                timeout: 15_000,
                killSignal: 'SIGKILL',
            }));

            const data = JSON.parse(output.stdout);
            bandwidth.upload = data.end.sum_sent.bits_per_second / 1000 / 1000;
        }

        {
            const output = await (await execute([
                '-c', this.host,
                '--port', String(this.port),
                '-t', '1',
                '-R',
                // '--bytes', '255000',
                '--json',
            ], {
                timeout: 15_000,
                killSignal: 'SIGKILL',
            }));

            const data = JSON.parse(output.stdout);
            bandwidth.download = data.end.sum_sent.bits_per_second / 1000 / 1000;
        }

        return bandwidth;
        // return {
        //     download: data.end.sum_sent.bits_per_second  / 1000 / 1000,
        //     upload: data.end.sum_received.bits_per_second / 1000 / 1000,
        // };
    }

    public async ping(): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            const sock = new net.Socket();
            sock.setTimeout(2500);
            const start = process.hrtime.bigint();
            sock.on('connect', function () {
            }).on('data', function (e) {
                const connected = process.hrtime.bigint();
                resolve(Number(connected - start) / 1000 / 1000);
                sock.destroy();
            }).on('error', function (e) {
                sock.destroy();
                resolve(0);
            }).on('timeout', function () {
                sock.destroy();
                resolve(0);
            }).connect(this.port, this.host);
        });
    }
}

