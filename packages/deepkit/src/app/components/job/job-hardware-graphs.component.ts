/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Component, Input, OnChanges, OnDestroy, SimpleChanges} from "@angular/core";
import {BehaviorSubject, ReplaySubject} from "rxjs";
import {Config, Data, Layout} from "plotly.js";
import {createAndReactTrace, ReactTrace} from "../plotly.component";
import {HardwareParser} from "../../models";
import {observe} from "../../reactivate-change-detection";
import {EntitySubject, StreamBehaviorSubject} from "@marcj/glut-core";
import {ControllerClient} from "../../providers/controller-client";
import {Job} from "@deepkit/core";
import {average, each} from "@marcj/estdlib";
import {Buffer} from 'buffer';

@Component({
    selector: 'job-hardware-graphs',
    template: `
        <div>
            <plotly class="full" [smoothing]="smoothing" [layout]="percentHardwareLayout" [config]="config" [react]="cpu"></plotly>
            <div class="value monospace">{{lastCpu * 100 | number:'2.1-2'}}%</div>
            <div class="title">CPU</div>
        </div>
        <div>
            <plotly class="full" [smoothing]="smoothing" [layout]="percentHardwareLayout" [config]="config" [react]="memory"></plotly>
            <div class="value monospace">{{lastMemory * 100 | number:'2.1-2'}}%</div>
            <div class="title">MEMORY</div>
        </div>
        <div>
            <plotly class="full" [smoothing]="smoothing" [layout]="hardwareLayout" [config]="config" [react]="network"></plotly>
            <div class="value monospace">
                {{lastNetworkTx| number:'.1-2'}} up,
                <span style="color: var(--color-orange)">{{lastNetworkRx| number:'.1-2'}} down</span>
            </div>
            <div class="title">NETWORK MB/s</div>
        </div>
        <div>
            <plotly class="full" [smoothing]="smoothing" [layout]="hardwareLayout" [config]="config" [react]="block"></plotly>
            <div class="value monospace">
                {{lastBlockRead|number:'.1-2'}} read,
                <span style="color: var(--color-orange)">{{lastBlockWrite|number:'.1-2'}} write</span>
            </div>
            <div class="title">BLOCK MB/s</div>
        </div>
    `,
    styleUrls: ['./job-hardware-graphs.component.scss']
})
export class JobHardwareGraphsComponent implements OnDestroy, OnChanges {
    @Input()
    @observe()
    public job$!: EntitySubject<Job>;

    public config: BehaviorSubject<Partial<Config>> = new BehaviorSubject<Partial<Config>>({
        displayModeBar: false,
        showAxisDragHandles: false,
    });

    public smoothing = new BehaviorSubject(10);

    protected defaultLayout: Partial<Layout> = {
        xaxis: {
            title: 'Bla',
            showgrid: false,
            visible: false,
            autorange: true,
            rangemode: 'nonnegative',
        },
        margin: {
            t: 5,
            r: 0,
            l: 0,
            b: 0,
        },
        yaxis: {
            showgrid: false,
            visible: false,
        },
        height: 25,
        dragmode: 'pan',
        showlegend: false
    };

    public hardwareLayout: BehaviorSubject<Partial<Layout>> = new BehaviorSubject<Partial<Layout>>({
        ...this.defaultLayout,
        yaxis: {
            // range: [0],
            rangemode: 'tozero',
            hoverformat: ',.4f',
            showgrid: false,
            visible: false,
        },
    });

    public percentHardwareLayout: BehaviorSubject<Partial<Layout>> = new BehaviorSubject<Partial<Layout>>({
        ...this.defaultLayout,
        yaxis: {
            range: [0, 1.1],
            rangemode: 'tozero',
            tickformat: ',.1%',
            hoverformat: ',.2%',
            showgrid: false,
            visible: false,
        },
    });

    private openFilesTimer: any;
    protected hardwareFiles: { [name: string]: StreamBehaviorSubject<Uint8Array | undefined> } = {};
    protected hardwareFilesPromise: { [name: string]: Promise<any> } = {};

    public cpu = new ReplaySubject<ReactTrace>();
    public memory = new ReplaySubject<ReactTrace>();
    public network = new ReplaySubject<ReactTrace>();
    public block = new ReplaySubject<ReactTrace>();

    public lastCpu: number = 0;
    public lastMemory: number = 0;
    public lastNetworkTx: number = 0;
    public lastNetworkRx: number = 0;

    public lastBlockWrite: number = 0;
    public lastBlockRead: number = 0;

    protected lastRowPerTrace: { [traceName: string]: number[] } = {};

    protected cpuValues: { [x: number]: { values: number[] } } = {};
    protected memoryValues: { [x: number]: { values: number[] } } = {};

    protected cpuValuesResolved: { [x: number]: number } = {};
    protected memoryValuesResolved: { [x: number]: number } = {};

    protected networkTxValues: { [x: number]: number } = {};
    protected networkRxValues: { [x: number]: number } = {};

    protected blockReadValues: { [x: number]: number } = {};
    protected blockWriteValues: { [x: number]: number } = {};

    traceConfig: Partial<Data> = {
        hoverinfo: 'y+z',
        line: {width: 1, color: '#000000'},
    };

    cpuTrace = createAndReactTrace(this.cpu, 'CPU', this.traceConfig);
    memoryTrace = createAndReactTrace(this.memory, 'MEMORY', this.traceConfig);
    networkTxTrace = createAndReactTrace(this.network, 'Tx', this.traceConfig);
    networkRxTrace = createAndReactTrace(this.network, 'Rx', {...this.traceConfig, line: {width: 1, color: 'var(--color-orange)'}});
    blockReadTrace = createAndReactTrace(this.block, 'Read', this.traceConfig);
    blockWriteTrace = createAndReactTrace(this.block, 'Write', {...this.traceConfig, line: {width: 1, color: 'var(--color-orange)'}});

    constructor(
        private controllerClient: ControllerClient,
    ) {
    }

    ngOnDestroy() {
        clearInterval(this.openFilesTimer);

        for (const file of each(this.hardwareFiles)) {
            file.unsubscribe();
        }
    }

    async ngOnChanges(changes: SimpleChanges) {
        for (const file of each(this.hardwareFiles)) {
            file.unsubscribe();
        }
        clearInterval(this.openFilesTimer);
        this.hardwareFiles = {};
        this.hardwareFilesPromise = {};

        this.cpuValuesResolved = {};
        this.memoryValuesResolved = {};
        this.networkTxValues = {};
        this.networkRxValues = {};
        this.blockWriteValues = {};
        this.blockReadValues = {};

        this.cpuTrace.setMap(this.cpuValuesResolved);
        this.memoryTrace.setMap(this.memoryValuesResolved);
        this.networkTxTrace.setMap(this.networkTxValues);
        this.networkRxTrace.setMap(this.networkRxValues);
        this.blockWriteTrace.setMap(this.blockWriteValues);
        this.blockReadTrace.setMap(this.blockReadValues);

        if (this.job$) {
            const jobId = this.job$.value.id;
            this.lastCpu = 0;
            this.lastMemory = 0;
            this.lastNetworkTx = 0;
            this.lastNetworkRx = 0;
            this.lastBlockRead = 0;
            this.lastBlockWrite = 0;

            function averageAcrossTasks(
                row: number[],
                rowIndex: number,
                values: { [x: number]: { values: number[] } },
                valuesResolved: { [x: number]: number },
            ) {
                const xSecond = Math.floor(row[0]);
                if (!values[xSecond]) {
                    values[xSecond] = {values: []};
                }

                values[xSecond].values.push(row[rowIndex]);

                const cpuValue = average(values[xSecond].values);
                valuesResolved[xSecond] = cpuValue;

                return cpuValue;
            }

            const upDownAcrossTasks = (
                traceName: string,
                row: number[],
                rowIndex: number,
                values: { [x: number]: number },
            ): number => {
                const xSecond = Math.floor(row[0]);

                if (!values[xSecond]) {
                    values[xSecond] = 0;
                }

                if (this.lastRowPerTrace[traceName]) {
                    const diff = row[rowIndex] - this.lastRowPerTrace[traceName][rowIndex];
                    values[xSecond] += diff / 1024 / 1024;
                } else {
                    values[xSecond] += row[rowIndex] / 1024 / 1024;
                }

                return values[xSecond];
            };

            const readTasks = () => {
                for (const task of this.job$.value.getAllTasks()) {
                    for (const instance of task.getInstances()) {
                        const name = task.name + '_' + instance.id;

                        if (this.hardwareFiles[name] || this.hardwareFilesPromise[name]) {
                            continue;
                        }

                        if (!this.controllerClient.getClient().isConnected()) {
                            return;

                        }
                        const path = '.deepkit/hardware/' + name + '.hardware';
                        this.hardwareFilesPromise[name] = this.controllerClient.publicJob().subscribeJobFileContent(jobId, path);
                        this.hardwareFilesPromise[name].then((stream) => {
                            this.hardwareFiles[name] = stream;
                            delete this.hardwareFilesPromise[name];

                            const csv = new HardwareParser(path);

                            this.hardwareFiles[name].subscribe((value) => {
                                if (value) {
                                    csv.feed(value);
                                }
                            });

                            this.hardwareFiles[name].appendSubject.subscribe((append: any) => {
                                csv.feed(Buffer.from(append, 'base64'));
                            });

                            csv.subscribe((csvRows: any) => {
                                for (const row of csvRows) {
                                    //row = ['time', 'cpu', 'memory', 'network_rx', 'network_tx', 'block_write', 'block_read']
                                    this.lastCpu = averageAcrossTasks(row, 1, this.cpuValues, this.cpuValuesResolved);
                                    this.lastMemory = averageAcrossTasks(row, 2, this.memoryValues, this.memoryValuesResolved);
                                    //
                                    this.lastNetworkRx = upDownAcrossTasks(name, row, 3, this.networkRxValues);
                                    this.lastNetworkTx = upDownAcrossTasks(name, row, 4, this.networkTxValues);
                                    //
                                    this.lastBlockWrite = upDownAcrossTasks(name, row, 5, this.blockWriteValues);
                                    this.lastBlockRead = upDownAcrossTasks(name, row, 6, this.blockReadValues);

                                    this.lastRowPerTrace[name] = row;
                                }

                                this.cpuTrace.setMap(this.cpuValuesResolved);
                                this.memoryTrace.setMap(this.memoryValuesResolved);
                                this.networkTxTrace.setMap(this.networkTxValues);
                                this.networkRxTrace.setMap(this.networkRxValues);
                                this.blockWriteTrace.setMap(this.blockWriteValues);
                                this.blockReadTrace.setMap(this.blockReadValues);
                                //todo, show gpu shizzle
                            });
                        }, () => {
                            //reschedule
                            delete this.hardwareFilesPromise[name];
                        });
                    }
                }
            };
            this.openFilesTimer = setInterval(readTasks, 1000);
            readTasks();
        }
    }
}
