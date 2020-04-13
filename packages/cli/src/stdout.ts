/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import stream from "stream";
import {isNumber} from "@marcj/estdlib";
import yaml from 'yaml';
import {JobStorage} from "./job-storage";

export class StdoutApiReader {
    protected buffer: string = '';
    protected onData: (chunk: Buffer | string) => void;

    constructor(
        private jobStorage: JobStorage,
        private name: string,
        private stream: stream.Readable | stream.Writable | NodeJS.ReadableStream,
        private redirectTo: stream.Writable = process.stdout as stream.Writable
    ) {
        const onData = this.onData = (chunk: Buffer | string) => {
            if ('string' === typeof chunk) {
                chunk = Buffer.from(chunk);
            }

            this.handle(chunk);
        };

        function end() {
            stream.removeListener('end', end);
            stream.removeListener('data', onData);
        }

        stream.on('data', this.onData);
        stream.on('end', end);
    }

    public off() {
        if (this.buffer) {
            //we have still buffer data, so flush
            this.handle(Buffer.from("\n", 'utf8'));
        }

        this.stream.removeListener('data', this.onData);
    }

    private parse(call: string) {
        const op = yaml.parse(call);

        if ('iteration' === op['deepkit'] || 'epoch' === op['deepkit']) {
            if (isNumber(op['total'])) {
                this.jobStorage.setIterations(op['total']);
            }
            if (isNumber(op['step'])) {
                this.jobStorage.setIteration(op['step']);
            }
            if (isNumber(op['iteration'])) {
                this.jobStorage.setIteration(op['iteration']);
            }
            if (isNumber(op['epoch'])) {
                this.jobStorage.setIteration(op['epoch']);
            }
        }

        if ('status' === op['deepkit']) {
            this.jobStorage.patchJob({title: op['deepkit']});
        }

        if ('parameter' === op['deepkit']) {
            this.jobStorage.patchJob({['config.parameters.' + op['path']]: op['value']});
        }

        if ('info' === op['deepkit']) {
            this.jobStorage.patchJob({['infos.' + op['name'].replace(/\.+/g, '_')]: op['value']});
        }

        if ('create-channel' === op['deepkit']) {
            this.jobStorage.job.createChannel(
                op['name'],
                op['traces'] || [op['name']],
                op['xaxis'],
                op['yaxis'],
                op['layout'],
            );

            this.jobStorage.patchJob({
                ['channels.' + op['name']]: this.jobStorage.job.getChannel(op['name'])
            });
        }

        if ('batch' === op['deepkit']) {
            this.jobStorage.patchJob({stepLabel: 'batch'});

            if (isNumber(op['current'])) {
                this.jobStorage.patchJob({step: op['current']});
            }

            if (isNumber(op['total'])) {
                this.jobStorage.patchJob({steps: op['total']});
            }

            if (isNumber(op['current']) && isNumber(op['total']) && isNumber(op['size'])) {
                this.jobStorage.setBatch(op['current'], op['total'], op['size']);
            }
        }

        if ('sample' === op['deepkit']) {
            this.jobStorage.patchJob({stepLabel: 'step'});

            if (isNumber(op['sample'])) {
                this.jobStorage.patchJob({step: op['sample']});
            }

            if (isNumber(op['total'])) {
                this.jobStorage.patchJob({steps: op['total']});
            }

            if (isNumber(op['current']) && isNumber(op['total']) && isNumber(op['size'])) {
                this.jobStorage.setBatch(op['current'], op['total'], op['size']);
            }
        }

        if ('channel' === op['deepkit']) {
            this.jobStorage.addChannelValue(op['name'], op['x'], op['y']);
        }
    }

    private handle(data: Buffer) {
        this.buffer += data.toString('utf8');

        //we flush only line by line
        while (-1 !== this.buffer.indexOf('\n')) {
            const position = this.buffer.indexOf('\n');
            let line = this.buffer.substr(0, position + 1);
            this.buffer = this.buffer.substr(position + 1);

            if ((line.endsWith('}\n') || line.endsWith('}\r\n'))) {
                let startPos = line.indexOf('{"deepkit":');

                if (-1 === startPos) {
                    startPos = line.indexOf('{deepkit:');
                }

                if (-1 !== startPos) {
                    //startpos found, so we execute the command
                    try {
                        this.parse(line.substr(startPos));
                    } catch (error) {
                        console.warn('stdout command failed:' + JSON.stringify(line) + ' startPos=' + startPos + ' => ' + JSON.stringify(line.substr(startPos)));
                    }

                    if (0 === startPos) {
                        //whole line is a command, so we don't need to display anything to terminal/server
                        continue;
                    }

                    //line ends with the {deepkit} command and between somewhere with {deepkit, so we keep the stuff right before {deepkit and display it
                    // by not calling continue.
                    line = line.substr(0, startPos);
                }
            }

            if (line) {
                //to terminal
                this.redirectTo.write(line);

                //to server
                this.jobStorage.log(this.name, line);
            }
        }
    }
}
