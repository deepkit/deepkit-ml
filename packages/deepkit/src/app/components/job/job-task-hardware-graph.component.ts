/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, SimpleChanges} from "@angular/core";
import {BehaviorSubject, Observable, Subject} from "rxjs";
import {Layout} from "plotly.js";
import {createAndSendTrace, ObservableTrace, ObservableTraceStream} from "../plotly.component";
import {HardwareParser} from "../../models";
import {observe} from "../../reactivate-change-detection";
import {EntitySubject, StreamBehaviorSubject} from "@marcj/glut-core";
import {ControllerClient} from "../../providers/controller-client";
import {Job} from "@deepkit/core";
import {eachPair} from "@marcj/estdlib";
import {detectChangesNextFrame} from "@marcj/angular-desktop-ui";
import {Buffer} from 'buffer';

@Component({
    selector: 'job-task-hardware-graph',
    template: `
        <plotly class="full" [renderNowSubject]="renderNowSubject" [smoothing]="smoothing" [layout]="hardwareLayout" [trace]="hardwareTrace"></plotly>
    `,
    styles: [
            `
            :host {
                display: block;
                height: 130px;
            }
        `
    ]
})
export class JobTaskHardwareGraphComponent implements OnDestroy, OnChanges {
    @Input()
    @observe()
    public job$!: EntitySubject<Job>;

    @Input()
    public taskName!: string;

    @Input()
    public replica!: number;

    @Input() public smoothing = new BehaviorSubject<number>(30);

    public renderNowSubject = new Subject<void>();

    public hideHardware = true;

    public hardwareLayout: BehaviorSubject<Partial<Layout>> = new BehaviorSubject<Partial<Layout>>({
        margin: {
            t: 25,
            r: 35,
            l: 65,
            b: 35,
        },
        height: 130,
        yaxis: {
            tickformat: ',.0%',
            hoverformat: ',.2%',
            zeroline: false,
            // showticklabels: false,
            // visible: false,
        },
        showlegend: false
    });

    public hardwareTrace?: Observable<ObservableTrace>;

    constructor(
        private controllerClient: ControllerClient,
        private cd: ChangeDetectorRef,
    ) {
    }

    ngOnDestroy(): void {
    }

    ngOnChanges(changes: SimpleChanges): void {
        this.hardwareTrace = new Observable<ObservableTrace>((observer) => {
            let hardwareFile: StreamBehaviorSubject<Uint8Array | undefined> | undefined;

            (async () => {
                const name = this.taskName + '_' + this.replica;

                const path = '.deepkit/hardware/' + name + '.hardware';

                const cpuTrace = createAndSendTrace(observer, 'CPU', {}, false);
                const memoryTrace = createAndSendTrace(observer, 'Memory', {}, false);

                const instance = this.job$.value.getInstanceFor(this.taskName, this.replica);

                const gpus: Subject<ObservableTraceStream>[] = [];
                const gpuMemory: Subject<ObservableTraceStream>[] = [];
                for (const [i, gpu] of eachPair(instance.assignedResources.gpus)) {
                    gpus.push(createAndSendTrace(observer, 'GPU' + i + ' ' + gpu.name, {}, false).stream);
                    gpuMemory.push(createAndSendTrace(observer, 'GPU' + i + ' Memory ' + gpu.name, {}, false).stream);
                }

                try {
                    const csv = new HardwareParser(path);
                    hardwareFile = await this.controllerClient.publicJob().subscribeJobFileContent(this.job$.value.id, path);
                    hardwareFile.subscribe((value) => {
                        if (value) {
                            csv.feed(value);
                        }
                    });

                    hardwareFile.appendSubject.subscribe((append: any) => {
                        csv.feed(Buffer.from(append, 'base64'));
                    });
                    let first = false;

                    csv.subscribe((csvRows: any) => {
                        const cpu: { x: Date[], y: number[] } = {x: [], y: []};
                        const memory: { x: Date[], y: number[] } = {x: [], y: []};

                        const gpuUtilisations: { x: Date[], y: number[] }[] = [];
                        const gpuMemories: { x: Date[], y: number[] }[] = [];
                        for (const [i, s] of eachPair(gpus)) {
                            gpuUtilisations.push({x: [], y: []});
                            gpuMemories.push({x: [], y: []});
                        }

                        for (const row of csvRows) {
                            //row = [time, cpu, memory, ...]
                            //"time","cpu","memory","network_rx","network_tx","block_write","block_read",
                            // "gpu_0", "gpu_memory_0", "gpu_temperature_0", "gpu_power_0"
                            const x = new Date(row[0] * 1000);

                            cpu.x.push(x);
                            cpu.y.push(row[1]);

                            memory.x.push(x);
                            memory.y.push(row[2]);

                            for (const [i, s] of eachPair(gpus)) {
                                gpuUtilisations[i].x.push(x);
                                gpuUtilisations[i].y.push(row[7 + (i * 4)]);

                                gpuMemories[i].x.push(x);
                                gpuMemories[i].y.push(row[7 + (i * 4) + 1]);
                            }
                        }

                        cpuTrace.stream.next(cpu);
                        memoryTrace.stream.next(memory);

                        for (const [i, s] of eachPair(gpus)) {
                            s.next(gpuUtilisations[i]);
                        }

                        for (const [i, s] of eachPair(gpuMemory)) {
                            s.next(gpuMemories[i]);
                        }

                        if (!first) {
                            this.renderNowSubject.next();
                            first = true;
                        }
                    });
                    this.hideHardware = false;

                } catch (error) {
                    this.hideHardware = true;
                }

                detectChangesNextFrame(this.cd);
            })();

            return async () => {
                if (hardwareFile) {
                    await hardwareFile.unsubscribe();
                }
            };
        });
    }
}
