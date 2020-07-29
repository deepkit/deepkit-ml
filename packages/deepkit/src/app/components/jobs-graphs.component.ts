/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, SimpleChanges} from "@angular/core";
import {Job, Project} from "@deepkit/core";
import {NumericMetricParser} from "../models";
import {arrayRemoveItem, each, eachPair, stack} from "@marcj/estdlib";
import {BehaviorSubject, ReplaySubject, Subject} from "rxjs";
import {Layout} from "plotly.js";
import {createAndSendTrace, ObservableTrace, ObservableTraceStream} from "./plotly.component";
import {ChannelReader} from "../providers/channel-reader";
import {triggerResize} from "@marcj/angular-desktop-ui";
import {Progress} from "@marcj/glut-core";
import {skip} from "rxjs/operators";


@Component({
    selector: 'jobs-graph',
    template: `
        <div>
            {{getChannelName()}} {{traceName}}

            <plotly class="full" [renderNowSubject]="renderNowSubject" [layout]="channelLayout"
                    [smoothing]="smoothing"
                    [trace]="traces"></plotly>
        </div>
    `,
})
export class JobsGraphComponent implements OnDestroy, OnChanges {
    @Input() id: string = '';
    @Input() traceName: string = '';
    @Input() jobs: Job[] = [];
    @Input() shownJobs = new Set<string>();
    @Input() progress!: Progress;
    @Input() smoothing = new BehaviorSubject<number>(1);

    public traces = new ReplaySubject<ObservableTrace>();
    public renderNowSubject = new Subject<void>();

    public channelLayout: BehaviorSubject<Partial<Layout>> = new BehaviorSubject<Partial<Layout>>({
        height: 250,
    });

    openFiles: { [jobId: string]: NumericMetricParser } = {};
    openTraces: { [jobId: string]: Subject<ObservableTraceStream> } = {};

    running = false;
    lastUpdateProcess?: any;

    constructor(
        protected channelReader: ChannelReader,
        protected cd: ChangeDetectorRef,
    ) {
    }

    public getChannelName(): string {
        return this.id.substr(0, this.id.indexOf(' #'));
    }

    public getTrace(): number {
        return parseInt(this.id.substr(this.id.indexOf(' #') + 2), 10);
    }

    public updateProgress() {
        if (this.lastUpdateProcess) cancelAnimationFrame(this.lastUpdateProcess);
        this.lastUpdateProcess = requestAnimationFrame(this._updateProgress.bind(this));
    }
    protected _updateProgress() {
        let total = 0;
        let current = 0;
        let done = true;
        for (const bla of Object.values(this.openFiles)) {
            total += bla.downloadProgress.total;
            current += bla.downloadProgress.current;
            if (!bla.downloadProgress.done) {
                done = false;
            }
        }
        this.progress.total = total;
        this.progress.current = current;
        this.progress.done = done;
        this.progress.next(this.progress);
    }

    @stack()
    async ngOnChanges(changes: SimpleChanges) {
        if (changes.jobs) {
            const currentIds: { [jobId: string]: true } = {};
            const newJobs = new Set<Job>();

            this.channelLayout.next({
                height: this.jobs.length > 30 ? (this.jobs.length > 80 ? 550 : 400) : 250,
            });

            for (const job of this.jobs) {
                currentIds[job.id] = true;

                if (!this.shownJobs.has(job.id)) {
                    this.shownJobs.add(job.id);
                    newJobs.add(job);
                }
            }

            for (const jobId of this.shownJobs) {
                if (!currentIds[jobId]) {
                    this.shownJobs.delete(jobId);
                    //job deleted
                    if (this.openFiles[jobId]) {
                        this.openFiles[jobId].complete();
                        delete this.openFiles[jobId];
                    }
                    if (this.openTraces[jobId]) {
                        if (!this.openTraces[jobId].isStopped) {
                            this.openTraces[jobId].complete();
                        }
                        delete this.openTraces[jobId];
                    }
                }
            }

            const allDone: Promise<void>[] = [];

            for (const job of newJobs) {
                this.progress.done = false;
                const path = ['.deepkit', 'channel', this.getChannelName(), 'metrics'].join('/');
                const trace = createAndSendTrace(this.traces, '#' + job.number, {}, false);
                this.openTraces[job.id] = trace.stream;
                this.openFiles[job.id] = this.channelReader.getCachedJobMetricParser(job.id, path);

                this.openFiles[job.id].downloadProgress.pipe(skip(1)).subscribe(this.updateProgress.bind(this), () => {}, () => {
                    delete this.openFiles[job.id];
                    this.updateProgress();
                });
            }

            //detectChanges now so that plotly subscribes to ours trace.stream
            this.cd.detectChanges();

            const traceId = this.getTrace();
            for (const job of newJobs) {
                allDone.push(new Promise((resolve) => {
                    this.openFiles[job.id].empty.subscribe((v) => {
                        if (v) {
                            //important to resolve when empty since subscribe() is never called.
                            resolve();
                        }
                    });

                    this.openFiles[job.id].subscribe((csvData) => {
                        const x: (string | number)[] = [];
                        const y: (string | number)[] = [];

                        for (const row of csvData) {
                            x.push(row[0]);
                            y.push(row[traceId + 2]);
                        }

                        this.openTraces[job.id].next({x: x, y: y});
                        resolve();
                    });
                }));
            }

            Promise.all(allDone).then(() => {
                requestAnimationFrame(() => {
                    this.renderNowSubject.next();
                });
            });
        }
    }

    ngOnDestroy() {
        this.running = false;
        for (const file of each(this.openFiles)) {
            file.complete();
        }
        for (const trace of each(this.openTraces)) {
            trace.complete();
        }
    }
}


@Component({
    selector: 'jobs-graphs',
    template: `
        <!--        <jobs-graph [jobs]="jobs" *ngIf="channelNamesToShow.length" -->
        <!--                    [id]="channelNamesToShow[0]" [traceName]="traceName[channelNamesToShow[0]]"></jobs-graph>-->

        <div style="display: flex; ">
            <div *ngIf="progress|throttle:2|asyncRender as p" class="hide-with-animation" [class.fadein]="!p.done">
                <dui-indicator [step]="p.progress"></dui-indicator>
            </div>

            <div style="margin-left: auto; padding-right: 20px; text-align: right; display: flex; align-items: center; ">
                <div style="margin-right: 5px; font-size: 11px;">Smoothing:</div>
                <dui-slider style="width: 60px; margin: 0 5px;" mini [ngModel]="smoothing.value / 150"
                            (ngModelChange)="smoothing.next($event * 150)"></dui-slider>

                <dui-button textured [openDropdown]="drop" iconRight icon="arrow_down">
                    Select metrics
                </dui-button>
                <dui-dropdown #drop>
                    <dui-dropdown-item
                        [selected]="channelNamesToShow.includes(id)"
                        [closeOnClick]="false"
                        (click)="select(id)"
                        *ngFor="let id of possibleChannels">{{id}}</dui-dropdown-item>
                </dui-dropdown>
            </div>
        </div>

        <div class="graphs overlay-scrollbar-small">
            <div class="graph-grid">
                <ng-container *ngFor="let id of channelNamesToShow; trackBy: channelTracker">
                    <div *ngIf="possibleChannels.includes(id)">
                        <jobs-graph [progress]="progress" [smoothing]="smoothing" [jobs]="jobs" [id]="id" [traceName]="traceName[id]"></jobs-graph>
                    </div>
                </ng-container>
            </div>
        </div>
    `,
    styleUrls: ['./jobs-graphs.component.scss'],
})
export class JobsGraphsComponent implements OnChanges, OnDestroy {
    @Input() project!: Project;
    @Input() jobs: Job[] = [];
    smoothing = new BehaviorSubject<number>(1);

    progress = new Progress;

    possibleChannels: string[] = [];
    channelNamesToShow: string[] = [];

    traceName: { [id: string]: string } = {};

    constructor(
        protected cd: ChangeDetectorRef,
    ) {
        this.progress.setDone();
    }

    channelTracker(index: any, item: any) {
        return item;
    }

    ngOnDestroy(): void {
        this.saveStorage();
    }

    protected saveStorage() {
        localStorage.setItem('deepkit/jobs/graphs/' + this.project.id, JSON.stringify(this.channelNamesToShow));
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes.project) {
            try {
                this.channelNamesToShow = JSON.parse(localStorage.getItem('deepkit/jobs/graphs/' + this.project.id)!) || [];
            } catch (error) {
                console.error('failed to read deepkit/jobs/graphs', error);
            }
        }

        this.updateGraphs();
    }

    select(id: string) {
        if (this.channelNamesToShow.includes(id)) {
            arrayRemoveItem(this.channelNamesToShow, id);
        } else {
            this.channelNamesToShow.push(id);
        }
        this.saveStorage();
        this.channelNamesToShow.sort();
        this.cd.detectChanges();
        triggerResize();
    }

    updateGraphs() {
        this.possibleChannels = [];

        const channels: { [name: string]: true } = {};

        for (const job of this.jobs) {
            for (const [channelName, channel] of eachPair(job.channels)) {
                for (let i = 0; i < channel.traces.length; i++) {
                    const id = channelName + ' #' + i;

                    if (!channels[id]) {
                        this.possibleChannels.push(id);
                        channels[id] = true;

                        this.traceName[id] = channel.traces[i];
                    }
                }
            }
        }
        this.possibleChannels.sort();
        if (this.channelNamesToShow.length === 0) {
            this.channelNamesToShow = this.possibleChannels.slice(0, 4);
        }
    }
}
