/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Command} from '@oclif/command';
import 'reflect-metadata';
import systeminformation from 'systeminformation';
import {dockerRunWithStdIn, Docker, catchSilentSigint, dockerRun} from "@deepkit/core-node";
import {sync as fastGlobSync} from "fast-glob";
import stream from "stream";

export class TestCommand extends Command {
    static description = 'Runs a new job';

    public async run(): Promise<void> {
        const docker = new Docker;

        // const a = await dockerRunWithStdIn(docker, Buffer.from(`test`), {
        //     name: 'peter',
        //     network: 'deepkit-control',
        //     Image: 'node:12-alpine',
        //     Cmd: ['echo', 'hiii'],
        //     HostConfig: {AutoRemove: true}
        // });
        // console.log('answer', JSON.stringify(a.toString()));

        // console.log('osInfo', await systeminformation.osInfo());
        // console.log('system', await systeminformation.system());
        // console.log('cpuCurrentspeed', await systeminformation.cpuCurrentspeed());
        // console.log('cpu', await systeminformation.cpu());
        // console.log('graphics', await systeminformation.graphics());
        // console.log('fsSize', await systeminformation.fsSize());
        // console.log('networkInterfaces', await systeminformation.networkInterfaces());

        console.log('data', await dockerRun(docker, {
            name: 'hi',
            Image: 'node:12-alpine',
            Cmd: ['sh', '-c', `netstat -nr | grep '^0\\.0\\.0\\.0' | awk '{print $2}'`],
            HostConfig: {
                AutoRemove: true,
            }
        }));

        // await catchSilentSigint(async () => {
        //     //note: does NOT abort automatically when node process dies.
        //     return new Promise<void>(async (resolve, reject) => {
        //         const data = await docker.run(
        //             'alpine',
        //             ['sh', '-c', `netstat -nr | grep '^0\\.0\\.0\\.0' | awk '{print $2}'`],
        //             new class extends stream.Writable {
        //                 _write(chunk: any, encoding: string, callback: (err?: Error) => void): void {
        //                     console.log('chunk', chunk.toString('utf8'));
        //                 }
        //             },
        //             {},
        //             {}
        //         );
        //
        //         console.log('data', data);
        //     });
        // }, async () => {
        // });

        process.exit(0);
    }
}
