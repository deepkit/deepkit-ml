/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, Input, OnChanges, OnDestroy} from "@angular/core";
import {BehaviorSubject, Observable} from "rxjs";
import {createAndSendTrace, createTraceForJobChannel, ObservableTrace} from "../../../components/plotly.component";
import {ControllerClient} from "../../../providers/controller-client";
import {EntitySubject} from "@marcj/glut-core";
import {Job} from "@deepkit/core";
import * as FileSaver from 'file-saver';
import {eachPair} from "@marcj/estdlib";
import {ChannelReader} from "../../../providers/channel-reader";

@Component({
    selector: 'dk-job-show-channels',
    template: `
        <ng-container *ngIf="job$">
            <div style="display: flex; justify-content: flex-end; align-items: center; margin-right: 22px;">
                <div style="margin-right: 5px; font-size: 11px;">Smoothing:</div>
                <dui-slider style="width: 60px; margin: 0 5px;" mini [ngModel]="smoothing.value / 150"
                            (ngModelChange)="smoothing.next($event * 150)"></dui-slider>


                <dui-input class="semi-transparent" clearer lightFocus icon="filter"
                           [(ngModel)]="search" round (esc)="search = ''"
                           placeholder="Filter"></dui-input>
            </div>

            <div class="channels overlay-scrollbar" *ngIf="job$|async as job">
                <div *ngFor="let channelName of job.getChannelNames()"
                     [hidden]="search && -1 === channelName.indexOf(search)"
                >
                    {{channelName}}
                    <plotly [smoothing]="smoothing"
                            [trace]="getChannelTrace(channelName)"></plotly>
<!--                    <dui-button textured (click)="export(channelName)">Export</dui-button>-->
                </div>
                <div *ngFor="let metric of metricsToShow"
                     [hidden]="search && -1 === metric.title.indexOf(search)"
                >
                    {{metric.title}}
                    <plotly [smoothing]="smoothing" [trace]="metric.observable"></plotly>
                </div>
            </div>
        </ng-container>
    `,
    styleUrls: ['./job-show-channels.component.scss']
})
export class JobShowChannelsComponent implements OnDestroy, OnChanges {
    @Input() job$?: EntitySubject<Job>;

    @Input() public smoothing = new BehaviorSubject<number>(1);

    public channelTraces: { [channelName: string]: Observable<ObservableTrace> | undefined } = {};

    // public channelLayout: BehaviorSubject<Partial<Layout>> = new BehaviorSubject<Partial<Layout>>({
    //     xaxis: {}
    // });

    public metricsToShow: { title: string, observable: Observable<any> }[] = [];
    public search = '';

    constructor(
        private cd: ChangeDetectorRef,
        protected channelReader: ChannelReader,
        private controllerClient: ControllerClient,
    ) {
    }

    async ngOnChanges() {
        this.channelTraces = {};
        this.metricsToShow = [];

        if (this.job$) {
            const job = this.job$!.value;

            for (const task of job.getAllTasks()) {
                for (const instance of task.getInstances()) {
                    const path = ['.deepkit', 'hardware', task.name + '_' + String(instance.id) + '.hardware'].join('/');

                    this.metricsToShow.push({
                        title: 'Task ' + task.name + '.' + instance.id + '.hardware',
                        observable: new Observable<ObservableTrace>((observer) => {
                            const trace1 = createAndSendTrace(observer, 'CPU', {});
                            const trace2 = createAndSendTrace(observer, 'Memory', {});
                            const reader = this.channelReader.getCachedJobHardwareParser(job.id, path);

                            reader.redirectToTrace(trace1.stream, (row) => new Date(row[0] * 1000), v => v[1]);
                            reader.redirectToTrace(trace2.stream, (row) => new Date(row[0] * 1000), v => v[2]);

                            return () => {
                                reader.complete();
                            };
                        })
                    });

                    this.metricsToShow.push({
                        title: 'Task ' + task.name + '.' + instance.id + '.network',
                        observable: new Observable<ObservableTrace>((observer) => {
                            const trace1 = createAndSendTrace(observer, 'RX', {});
                            const trace2 = createAndSendTrace(observer, 'TX', {});
                            const reader = this.channelReader.getCachedJobHardwareParser(job.id, path);

                            reader.redirectToTrace(trace1.stream, (row) => new Date(row[0] * 1000), v => v[3]);
                            reader.redirectToTrace(trace2.stream, (row) => new Date(row[0] * 1000), v => v[4]);

                            return () => {
                                reader.complete();
                            };
                        })
                    });

                    this.metricsToShow.push({
                        title: 'Task ' + task.name + '.' + instance.id + '.block',
                        observable: new Observable<ObservableTrace>((observer) => {
                            const trace1 = createAndSendTrace(observer, 'write', {});
                            const trace2 = createAndSendTrace(observer, 'read', {});
                            const reader = this.channelReader.getCachedJobHardwareParser(job.id, path);

                            reader.redirectToTrace(trace1.stream, (row) => new Date(row[0] * 1000), v => v[5]);
                            reader.redirectToTrace(trace2.stream, (row) => new Date(row[0] * 1000), v => v[6]);

                            return () => {
                                reader.complete();
                            };
                        })
                    });


                    for (const [i, gpu] of eachPair(instance.assignedResources.gpus)) {
                        this.metricsToShow.push({
                            title: 'Task ' + task.name + '.' + instance.id + '.gpu.' + i,
                            observable: new Observable<ObservableTrace>((observer) => {
                                const trace1 = createAndSendTrace(observer, '% Utilization', {
                                    xaxis: ''
                                });
                                const trace2 = createAndSendTrace(observer, '% Memory', {});
                                const trace3 = createAndSendTrace(observer, 'C temperature', {});
                                const trace4 = createAndSendTrace(observer, 'Watt power', {});
                                const reader = this.channelReader.getCachedJobHardwareParser(job.id, path);

                                reader.redirectToTrace(trace1.stream, (row) => new Date(row[0] * 1000), v => (v[7 + (i * 4)] * 100));
                                reader.redirectToTrace(trace2.stream, (row) => new Date(row[0] * 1000), v => (v[8 + (i * 4)] * 100));
                                reader.redirectToTrace(trace3.stream, (row) => new Date(row[0] * 1000), v => v[9 + (i * 4)]);
                                reader.redirectToTrace(trace4.stream, (row) => new Date(row[0] * 1000), v => v[10 + (i * 4)]);

                                return () => {
                                    reader.complete();
                                };
                            })
                        });
                    }
                }
            }
        }
    }

    ngOnDestroy(): void {
    }

    public async export(channelName: string) {
        const path = ['.deepkit', 'channel', channelName, 'metrics'].join('/');
        const content = await this.controllerClient.publicJob().getJobFileTextContent(this.job$!.value.id, path);
        if (!content) {
            return;
        }

        const blob = new Blob([content], {type: "text/csv;charset=utf-8"});
        FileSaver.saveAs(blob, this.job$!.value.number + '-' + channelName + '.csv');
    }

    public getChannelTrace(channelName: string): Observable<ObservableTrace> | undefined {
        if (this.job$!.value) {
            if (this.job$!.value.getChannel(channelName)) {
                if (!this.channelTraces[channelName]) {
                    this.channelTraces[channelName] = createTraceForJobChannel(this.channelReader, this.job$!.value, channelName);
                }

                return this.channelTraces[channelName];
            }
        }
    }

}
