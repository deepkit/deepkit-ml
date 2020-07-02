/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild} from "@angular/core";
import {observe} from "../../../reactivate-change-detection";
import {ControllerClient} from "../../../providers/controller-client";
import {EntitySubject, StreamBehaviorSubject} from "@marcj/glut-core";
import {Job, Project} from "@deepkit/core";
import {TermComponent} from "../../../components/term.component";
import {LocalStorage} from "ngx-store";
import {detectChangesNextFrame, DuiDialog, ViewState} from "@marcj/angular-desktop-ui";
import {MainStore} from "../../../store";

@Component({
    selector: 'dk-job-show',
    template: `
        <ng-container *ngIf="!readOnly">
            <ng-container *ngIf="job$|async as job">
                <dui-window-toolbar for="main" *ngIf="viewState.attached">
                    <dui-button-group padding="none">
                        <dui-button textured *ngIf="!job.ended || job.isAlive()"
                                    (click)="stopJob()"
                                    title="{{job.connections}} connections">
                            {{job.stopRequested ? 'Force ' : ''}}
                            Stop
                        </dui-button>
                        <dui-button textured [openDropdown]="labelDropdown" icon="flag"></dui-button>
                        <dui-button textured [openDropdown]="shareDropdown" icon="share"></dui-button>
                    </dui-button-group>
                </dui-window-toolbar>
            </ng-container>
        </ng-container>

        <dui-window-toolbar for="main_right" *ngIf="viewState.attached">
            <dui-button-group padding="none" float="right">
                <dui-button textured [highlighted]="showLogs" (click)="showLogs = !showLogs"
                            icon="toggle_bottom"></dui-button>
            </dui-button-group>
        </dui-window-toolbar>

        <dui-dropdown #shareDropdown>
            <ng-container *ngIf="job$|async as job">
                <div style="margin: 5px 15px;">
                    <h4 style="margin-bottom: 10px;">Share experiment</h4>

                    <ng-container *ngIf="job.shareToken">
                        <p>
                            Following link can be used to access your experiment.
                        </p>
                        <p>
                            <dui-input lightFocus readonly [ngModel]="getPublicLink(job.id, job.shareToken)"
                                       style="width: 350px;"></dui-input>
                        </p>
                    </ng-container>

                    <dui-button *ngIf="job.shareToken" (click)="stopSharing(job.id); shareDropdown.focus()">Revoke
                    </dui-button>
                    <dui-button *ngIf="!job.shareToken" (click)="startSharing(job.id); shareDropdown.focus()">Share
                        now
                    </dui-button>
                </div>
            </ng-container>
        </dui-dropdown>

        <dui-dropdown #labelDropdown>
            <ng-container *ngIf="project$|async as project">
                <dui-dropdown-item (click)="newLabel()">New label</dui-dropdown-item>
                <ng-container *ngIf="job$|async as job">
                    <dui-dropdown-item
                        *ngFor="let label of project.experimentLabels"
                        [selected]="job.labelIds.includes(label.id)"
                        (click)="toggleLabel(label.id)">
                        <dk-label [label]="label.label"></dk-label>
                    </dui-dropdown-item>
                </ng-container>
            </ng-container>
        </dui-dropdown>

        <div class="main-container"
        >
            <div>
                <div class="left overlay-scrollbar-small" *ngIf="job$|asyncRender as job">
                    <div>
                        <div class="sidebar-title">#{{job.fullNumberCombat}} Experiment</div>

                        <job-status [job]="job"></job-status>

                        <div style="margin: 15px 0;">
                            <div style="margin-bottom: 2px;">
                                EPOCH <span class="monospace">{{job.iteration}}/{{job.iterations}}</span>
                            </div>
                            <div>
                                <dk-progress-bar [value]="job.iteration / job.iterations"></dk-progress-bar>
                            </div>
                        </div>

                        <div style="margin: 15px 0;">
                            <div style="margin-bottom: 2px;">
                                <span style="text-transform: uppercase">{{job.stepLabel}} </span>
                                <span class="monospace">{{job.step}}/{{job.steps}}</span>
                            </div>
                            <div>
                                <dk-progress-bar [height]="11" [value]="job.step / job.steps"></dk-progress-bar>
                            </div>
                        </div>

                        <!--                        <div class="dial" style="margin-top: 25px;">-->
                        <!--                            <div class="job-detail-circle-container">-->
                        <!--                                <div class="gauge-main">-->
                        <!--                                    <div class="gauge-background">-->
                        <!--                                        <progress-arc-->
                        <!--                                                [size]="220"-->
                        <!--                                                [strokeWidth]="25"-->
                        <!--                                                [complete]="0.75">-->
                        <!--                                        </progress-arc>-->
                        <!--                                    </div>-->

                        <!--                                    <div class="gauge-epoch">-->
                        <!--                                        <progress-arc-->
                        <!--                                                [size]="220"-->
                        <!--                                                [strokeWidth]="25"-->
                        <!--                                                [complete]="((job.iteration/job.iterations)||0) * 0.75">-->
                        <!--                                        </progress-arc>-->
                        <!--                                    </div>-->

                        <!--                                    <div class="gauge-batch">-->
                        <!--                                        <progress-arc-->
                        <!--                                                [size]="220"-->
                        <!--                                                [strokeWidth]="1"-->
                        <!--                                                [complete]="((job.step/job.steps)||0) * 0.75">-->
                        <!--                                        </progress-arc>-->
                        <!--                                    </div>-->

                        <!--                                    <div class="gauge-circle-line-outer"></div>-->
                        <!--                                    <div class="gauge-circle">-->
                        <!--                                        <div class="gauge-circle-line"></div>-->
                        <!--                                        <div class="gauge-circle-line-dotted"-->
                        <!--                                             ng-class="{'active': job.alive, -->
                        <!--        'crashed': job.status === 5, 'done': job.status === 3, -->
                        <!--        'paused': job.alive && job.values.system.paused}"-->
                        <!--                                        ></div>-->
                        <!--                                        <div class="text">-->
                        <!--                                            <job-status [job]="job$"></job-status>-->

                        <!--                                            <div>-->
                        <!--                                                <div>{{job.iteration}} / {{job.iterations}}</div>-->
                        <!--                                                <div class="label">EPOCH</div>-->
                        <!--                                            </div>-->
                        <!--                                        </div>-->
                        <!--                                    </div>-->
                        <!--                                </div>-->
                        <!--                            </div>-->
                        <!--                        </div>-->
                    </div>

                    <div class="labeled-values">
                        <div>
                            <label>Elapsed</label>
                            <dk-redraw>
                                <div class="monospace">{{job.elapsedTime() | humanize}}</div>
                            </dk-redraw>
                        </div>
                        <div>
                            <label>Remaining</label>
                            <div class="monospace">{{job.eta | humanize}}</div>
                        </div>
                        <div>
                            <label>Seconds/Epoch</label>
                            <div class="monospace">{{job.secondsPerIteration | humanize}}</div>
                        </div>
                        <div>
                            <label>{{job.speedLabel || 'Samples/s'}}</label>
                            <div class="monospace">{{job.speed | number}}</div>
                        </div>
                        <div style="flex: 0 0 100%">
                            <label>Configuration</label>
                            {{job.config.path || 'Script run'}}
                        </div>
                        <div style="flex: 0 0 100%">
                            <label>Description</label>
                            <ng-container *ngIf="readOnly" style="white-space: pre">{{job.description}}</ng-container>
                            <textarea class="description"
                                      *ngIf="!readOnly"
                                      [(ngModel)]="job.description"
                                      (ngModelChange)="changedDescription()"
                            ></textarea>
                        </div>
                        <div style="flex: 0 0 100%">
                            <ng-container *ngIf="project$|async as project">
                                <dk-label *ngFor="let label of project.getExperimentLabels(job.labelIds)"
                                          [label]="label.label"></dk-label>
                            </ng-container>
                        </div>
                    </div>


                    <ng-container *ngIf="job.git">
                        <dk-section-header [center]="true">Git</dk-section-header>
                        <table class="tabled-values">
                            <tr>
                                <td class="label">Commit</td>
                                <td class="value monospace">{{job.git.commit|slice:0:9}}</td>
                            </tr>
                            <tr>
                                <td class="label">Date</td>
                                <td class="value">{{job.git.date|date:'d. MMM yy, HH:mm'}}</td>
                            </tr>
                            <tr>
                                <td class="label">Author</td>
                                <td class="value">{{job.git.author}}</td>
                            </tr>
                            <tr>
                                <td class="label">Message</td>
                                <td class="value">{{job.git.message}}</td>
                            </tr>
                        </table>
                    </ng-container>

                    <dk-section-header [center]="true">About</dk-section-header>
                    <table class="tabled-values">
                        <tr *ngIf="job.cluster && store.value.clusters">
                            <td class="label">Cluster</td>
                            <td class="value">{{store.value.clusters.get(job.cluster).name}}</td>
                        </tr>
                        <tr>
                            <td class="label">Created</td>
                            <td class="value">{{job.created|date:'d. MMM yy, HH:mm'}}</td>
                        </tr>
                        <tr>
                            <td class="label">Started</td>
                            <td class="value">{{job.started|date:'d. MMM yy, HH:mm'}}</td>
                        </tr>
                        <tr>
                            <td class="label">Author</td>
                            <td class="value">
                                <dk-user-small *ngIf="job.user" [userId]="job.user"></dk-user-small>
                            </td>
                        </tr>
                    </table>
                </div>

                <div class="right"
                     [style.bottom.px]="showLogs ? logsHeight : 0">
                    <div style="margin-top: 10px;">
                        <dui-button-group>
                            <dui-tab-button [active]="tab === 'overview'" (click)="tab='overview'">Overview
                            </dui-tab-button>

                            <dui-tab-button [active]="tab === 'channels'" (click)="tab='channels'">Metrics
                            </dui-tab-button>

                            <dui-tab-button [active]="tab === 'files'" (click)="tab='files'">Files</dui-tab-button>
                            <dui-tab-button [active]="tab === 'insights'" (click)="tab='insights'">
                                Insights
                            </dui-tab-button>
                            <dui-tab-button [active]="tab === 'debugger'" (click)="tab='debugger'">
                                Debugger
                            </dui-tab-button>
                        </dui-button-group>
                    </div>

                    <div class="main-fix-background" style="top: 40px; left: 25px; overflow: visible;">
                        <dk-job-show-overview *duiView="tab === 'overview'" [job$]="job$"></dk-job-show-overview>
                        <dk-job-show-channels *duiView="tab === 'channels'" [job$]="job$"></dk-job-show-channels>
                        <dk-job-show-files *duiView="tab === 'files'" [job$]="job$"></dk-job-show-files>
                        <dk-job-show-debugger *duiView="tab === 'debugger'" [readOnly]="readOnly"
                                              [job$]="job$"></dk-job-show-debugger>
                        <dk-job-show-insights *duiView="tab === 'insights'" [readOnly]="readOnly"
                                              [job$]="job$"></dk-job-show-insights>
                    </div>
                </div>
            </div>
        </div>

        <div class="logs-area"
             *ngIf="job$|async as job"
             [class.visible]="showLogs"
             [style.height.px]="showLogs ? logsHeight : 0"
        >
            <div class="logs-header">
                <dui-select textured [ngModel]="logsSelectedTask" (ngModelChange)="setLogsSelectedTask($event)">
                    <dui-option *ngFor="let task of job.getAllTasks()" [value]="task.name">{{task.name}}</dui-option>
                </dui-select>

                <dui-input lightFocus round clearer style="margin-left: auto;" icon="search"
                           placeholder="Search" [(ngModel)]="logsSearch"
                           (esc)="logsSearch = ''"
                           (enter)="$event.shiftKey ? term?.searchPrevious() : term?.searchNext()"
                ></dui-input>
            </div>
            <div class="logs-content" *ngIf="showLogs && logSubject">
                <dk-term [scrollback]="100000" style="margin-left: 5px;"
                         [searchQuery]="logsSearch" [data]="logSubject"></dk-term>
            </div>
            <dui-splitter position="top" (modelChange)="logsHeight = $event; cd.detectChanges()"></dui-splitter>
        </div>
    `,
    styleUrls: ['./job-show.component.scss']
})
export class JobShowComponent implements OnDestroy, OnChanges {
    @ViewChild(TermComponent, {static: false}) term?: TermComponent;

    readonly viewState = new ViewState;

    @LocalStorage('job.tab')
    public tab: 'overview' | 'files' | 'channels' | 'insights' | 'debugger' = 'overview';

    @Input() jobId?: string;
    @Input() public readOnly: boolean = false;

    @observe()
    @Input() project$?: EntitySubject<Project>;

    @observe()
    @Input() job$?: EntitySubject<Job>;

    @observe({unsubscribe: true})
    logSubject?: StreamBehaviorSubject<string>;

    @LocalStorage('job-show-logs')
    showLogs = false;

    @LocalStorage('job-logs-height')
    logsHeight = 220;

    logsSearch: string = '';

    logsSelectedTask: string = '';
    logsSelectedTaskInstance: number = 0;

    protected jobSelfLoaded?: EntitySubject<Job>;

    constructor(
        private controllerClient: ControllerClient,
        public cd: ChangeDetectorRef,
        public store: MainStore,
        public dialog: DuiDialog,
    ) {
    }

    getPublicLink(id: string, token: string) {
        const config = this.controllerClient.getConfig();
        const http = config.ssl ? 'https' : 'http';
        return http + '://' + config.host + ':' + (config.port !== 80 ? config.port : '') + '/public/job/' + id + '/' + token;
    }

    isFullProject() {
        return this.project$ && this.project$.value instanceof Project;
    }

    async test() {
    }

    async stopSharing(id: string) {
        await this.controllerClient.app().stopJobSharing(id);
    }

    async startSharing(id: string) {
        await this.controllerClient.app().startJobSharing(id);
    }

    async newLabel() {
        if (!this.project$ || !this.isFullProject()) return;

        const a = await this.dialog.prompt('Label name', '');
        if (a) {
            const labelId = await this.controllerClient.project().addExperimentLabel(this.project$.id, a);
            this.toggleLabel(labelId);
        }
    }

    toggleLabel(labelId: string) {
        if (!this.job$) return;

        const labelIds = this.job$.value.labelIds;
        const index = labelIds.indexOf(labelId);
        if (index !== -1) {
            labelIds.splice(index, 1);
        } else {
            labelIds.push(labelId);
        }
        this.controllerClient.app().patchJob(this.job$.id, {labelIds});
    }

    async changedDescription() {
        const job = await this.job$!.value;
        if (job) {
            await this.controllerClient.app().patchJob(job.id, {description: job.description});
        }
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (changes.job$) {
            if (this.jobSelfLoaded && this.job$ && this.job$.id === this.jobSelfLoaded.id) {
                this.job$ = this.jobSelfLoaded;
                return;
            }
        }

        if (this.jobSelfLoaded) {
            this.jobSelfLoaded.unsubscribe();
        }
        this.jobSelfLoaded = undefined;

        if (this.jobId) {
            //we have to manually load it in anyway, since we want updates even if the provider
            //unsubscribes
            this.jobSelfLoaded = this.job$ = await this.controllerClient.getJob(this.jobId);
        }

        if (this.logSubject) {
            this.logSubject.unsubscribe();
            this.logSubject = undefined;
        }
        this.logsSelectedTask = '';

        if (this.job$) {
            const tasks = this.job$!.value.getAllTasks();
            if (tasks.length) {
                this.setLogsSelectedTask(tasks[0].name);
            }
        }

        (window as any)['job'] = this.job$ ? this.job$.value : undefined;
        detectChangesNextFrame(this.cd);
    }

    public async setLogsSelectedTask(name: string) {
        if (this.logsSelectedTask !== name) {
            this.logsSelectedTaskInstance = 0;
            const path = `.deepkit/log/${name}_${this.logsSelectedTaskInstance}.txt`;

            this.logSubject = undefined;
            this.logSubject = (await this.controllerClient.publicJob().subscribeJobFileContent(this.job$!.value.id, path)).toUTF8();
        }

        this.logsSelectedTask = name;
        detectChangesNextFrame(this.cd);
    }

    async stopJob() {
        if (this.job$!.value.stopRequested) {
            await this.controllerClient.app().stopJob(this.job$!.value.id, true);
        } else {
            await this.controllerClient.app().stopJob(this.job$!.value.id);
        }
    }

    ngOnDestroy(): void {
        if (this.jobSelfLoaded && this.job$) {
            this.job$.unsubscribe();
        }
    }
}
