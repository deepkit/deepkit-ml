/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, SimpleChanges} from "@angular/core";
import {Layout} from "plotly.js";
import {BehaviorSubject, Observable} from "rxjs";
import {unsubscribe} from "../../../reactivate-change-detection";
import {createTraceForJobChannel, ObservableTrace} from "../../../components/plotly.component";
import {Subscriptions} from "@marcj/estdlib-rxjs";
import {arrayRemoveItem, eachPair} from "@marcj/estdlib";
import {EntitySubject} from "@marcj/glut-core";
import {Job} from "@deepkit/core";
import {detectChangesNextFrame} from "@marcj/angular-desktop-ui";
import {triggerResize} from "@marcj/angular-desktop-ui";
import {MainStore} from "../../../store";
import {ChannelReader} from "../../../providers/channel-reader";

@Component({
    selector: 'dk-job-show-overview',
    template: `
        <div *ngIf="job$|asyncRender as job">
            <ng-container>
                <div style="padding: 20px 0;">
                    <job-hardware-graphs [job$]="job$"></job-hardware-graphs>
                </div>
            </ng-container>

            <div class="grid" [duiClassMin]="{two: 650}">
                <div *ngIf="false">
                    <dk-section-header>Active hardware</dk-section-header>

                    <ng-template #noActiveTask>
                        No active tasks.
                    </ng-template>
                    <ng-container *ngIf="job.getActiveTasks() as activeTasks; else noActiveTask">

                        <div>
                            ACTIVE TASKS: {{activeTasks.names.join(', ')}}
                        </div>

                        <div class="header-labels" style="margin-top: 30px;">
                            <div>
                                <div>CPU CORES</div>
                                <div class="monospace">{{activeTasks.assignedResources.cpus}} cores</div>
                            </div>
                            <div>
                                <div>CPU MEMORY</div>
                                <div class="monospace">{{activeTasks.assignedResources.memory}} GB</div>
                            </div>
                            <div>
                                <div>GPU CORES</div>
                                <div class="monospace">{{activeTasks.assignedResources.gpus.length}} cores</div>
                            </div>
                        </div>
                    </ng-container>
                </div>

                <div class="section">
                    <dk-section-header>Config</dk-section-header>

                    <div *ngIf="!(job.config.getFlatConfig()|keys).length"
                         style="padding: 15px 0; font-size: 11px; text-align: center" class="text-light">
                        No config values defined.<br/>
                        See how to use
                        <a href="http://deepkit.ai/documentation/configuration#config">config values</a>.
                    </div>

                    <div class="label-columns">
                        <div *ngFor="let parameter of job.config.getFlatConfig() | keyvalue">
                            <div>{{parameter.key}}</div>
                            <div style="user-select: text">{{parameter.value|json}}</div>
                        </div>
                        <!--                        <div class="add-button">-->
                        <!--                            + ADD HYPERPARAMETER-->
                        <!--                        </div>-->
                    </div>
                </div>

                <div class="section">
                    <dk-section-header>Information</dk-section-header>


                    <div *ngIf="!(job.getFlatInfos()|keys).length"
                         style="padding: 15px 0; font-size: 11px; text-align: center" class="text-light">
                        No information defined.<br/>
                        See how to use
                        <a href="http://deepkit.ai/documentation/python-sdk/meta-data">info values</a>.
                    </div>

                    <div class="label-columns">
                        <div *ngFor="let info of job.getFlatInfos() | keyvalue">
                            <div>{{info.key}}</div>
                            <div style="user-select: text">{{info.value|json}}</div>
                        </div>
                        <!--                        <div class="add-button">-->
                        <!--                            + ADD INFORMATION-->
                        <!--                        </div>-->
                    </div>
                </div>
            </div>

            <div class="section" style="margin-top: 20px;">
                <dk-section-header>Main metric</dk-section-header>

                <div style="display: flex; justify-content: flex-end; align-items: center">
                    <div style="margin-right: 5px; font-size: 11px;">Smoothing:</div>
                    <dui-slider style="width: 60px;" mini [ngModel]="smoothing.value / 150"
                                (ngModelChange)="smoothing.next($event * 150)"></dui-slider>
                    <dui-button textured [openDropdown]="drop" style="margin-left: 10px;" iconRight icon="arrow_down">
                        Select metrics
                    </dui-button>
                    <dui-dropdown #drop>
                        <dui-dropdown-item
                                [selected]="channelNamesToShow.includes(id)"
                                [closeOnClick]="false"
                                (click)="selectChannel(id)"
                                *ngFor="let id of possibleChannels">{{id}}</dui-dropdown-item>
                    </dui-dropdown>
                </div>

                <div class="channel-grid">
                    <ng-container *ngFor="let id of channelNamesToShow">
                        <div *ngIf="possibleChannels.includes(id)">
                            <h4>{{id}}</h4>
                            <plotly class="full" [smoothing]="smoothing" [layout]="channelLayout"
                                    [trace]="getChannelTrace(id)"></plotly>
                        </div>
                    </ng-container>
                </div>
            </div>

            <div class="tasks" *ngIf="!job.selfExecution">
                <div class="section no-padding">
                    <dk-section-header>Pipeline</dk-section-header>

                    <job-task-graph [job$]="job$"></job-task-graph>
                </div>
            </div>
        </div>
    `,
    host: {
        '[class.overlay-scrollbar]': 'true',
    },
    styleUrls: ['./job-show-overview.component.scss']
})
export class JobShowOverviewComponent implements OnDestroy, OnChanges {
    possibleChannels: string[] = [];
    channelNamesToShow: string[] = [];

    @Input() job$?: EntitySubject<Job>;
    parseFloat = parseFloat;

    public channelTraces: { [name: string]: Observable<ObservableTrace> } = {};

    @Input() public smoothing = new BehaviorSubject<number>(1);

    public channelLayout: BehaviorSubject<Partial<Layout>> = new BehaviorSubject<Partial<Layout>>({
        // xaxis: {}
    });

    @unsubscribe()
    private subs = new Subscriptions();

    constructor(
        public store: MainStore,
        private cd: ChangeDetectorRef,
        private channelReader: ChannelReader,
    ) {
    }

    protected saveStorage() {
        if (this.job$ && this.job$.value) {
            localStorage.setItem('deepkit/jobs/main-metrics/' + this.job$.value.project, JSON.stringify(this.channelNamesToShow));
        }
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (changes.job$) {
            this.subs.unsubscribe();

            if (this.job$) {
                this.channelTraces = {};

                try {
                    if (this.job$!.value) {
                        this.channelNamesToShow = JSON.parse(localStorage.getItem('deepkit/jobs/main-metrics/' + this.job$!.value.project)!) || [];
                    }
                } catch (error) {
                    console.error('failed to read deepkit/jobs/main-metrics', error);
                }
                this.subs.add = this.job$!.subscribe(async (job: Job) => {
                    this.updateGraphs();
                });
            }
        }
    }

    getChannelTrace(name: string) {
        if (!this.channelTraces[name]) {
            this.channelTraces[name] = createTraceForJobChannel(this.channelReader, this.job$!.value, name)!;
        }

        return this.channelTraces[name];
    }

    selectChannel(id: string) {
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

        for (const [channelName, channel] of eachPair(this.job$!.value.channels)) {
            this.possibleChannels.push(channelName);
        }
        this.possibleChannels.sort();
        if (this.channelNamesToShow.length === 0) {
            this.channelNamesToShow = this.possibleChannels.slice(0, 2);
        }
        detectChangesNextFrame(this.cd);
    }

    ngOnDestroy(): void {
        this.saveStorage();
    }
}
