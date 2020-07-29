/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, Input, OnDestroy, ViewChild} from "@angular/core";
import {ControllerClient} from "../../../providers/controller-client";
import {EntitySubject, ItemObserver} from "@marcj/glut-core";
import {unsubscribe} from "../../../reactivate-change-detection";
import {Job, ProjectJobListFilter, Project} from "@deepkit/core";
import {Subscriptions} from "@marcj/estdlib-rxjs";
import {JobsListComponent} from "../../../components/jobs-list.component";
import {LocalStorage} from "ngx-store";
import {detectChangesNextFrame, DuiDialog, triggerResize, ViewState} from "@marcj/angular-desktop-ui";
import {
    actionExperimentFilter,
    actionExperimentMode,
    actionExperimentTab,
    ExperimentViewTab,
    MainStore
} from "../../../store";
import {CreateExperimentComponent} from "../../../dialogs/create-experiment.component";

@Component({
    selector: 'dk-project-experiments',
    template: `
        <dui-window-toolbar for="main" *ngIf="viewState.attached">
            <dui-button-group *ngIf="!readOnly">
                <dui-button textured (click)="showExperiment()" icon="play"></dui-button>
            </dui-button-group>

            <dui-button-group padding="none">
                <dui-button textured [active]="store.value.experimentView.mode === 'list'" (click)="openMode('list')"
                            icon="list"></dui-button>
                <dui-button textured [active]="store.value.experimentView.mode === 'detail'" (click)="openJob()"
                            icon="experiment_detail"
                ></dui-button>
            </dui-button-group>
        </dui-window-toolbar>

        <dui-window-toolbar for="main_right" *ngIf="viewState.attached && store.value.experimentView.mode === 'list'">
            <dui-button-group padding="none" float="right">
                <dui-button textured [highlighted]="showGraphs" (click)="showGraphs = !showGraphs; resize()"
                            icon="toggle_bottom"></dui-button>
            </dui-button-group>
        </dui-window-toolbar>

        <div class="list" *duiView="store.value.experimentView.mode === 'list' && !!project$"
             [class.with-graphs]="showGraphs">

            <jobs-list #list
                       [readOnly]="readOnly"
                       (jobsSorted)="jobsSorted($event)"
                       (jobsSelected)="updateJobsToGraph()"
                       [filter]="store.value.experimentView.filter"
                       (filterChange)="onFilter($event)"
                       (open)="openJob($event)"
                       [project$]="project$"
            ></jobs-list>

            <div class="graphs"
                 *ngIf="showGraphs"
                 [style.height.px]="graphsHeight">

                <dui-button-groups align="center">
                    <dui-button-group padding="none">
                        <dui-button textured [active]="store.value.experimentView.tab === 'channels'" (click)="selectTab('channels')">Metrics
                        </dui-button>
                        <dui-button textured [active]="store.value.experimentView.tab === 'parallel'" (click)="selectTab('parallel')">Parallel
                            Coordinates
                        </dui-button>
                        <dui-button textured [active]="store.value.experimentView.tab === 'compare'" (click)="selectTab('compare')">Compare
                        </dui-button>
                    </dui-button-group>
                </dui-button-groups>

                <div class="graphs-actions" *ngIf="store.value.experimentView.tab === 'channels'">
                    Show
                    <dui-select small style="min-width: 95px;" textured [(ngModel)]="jobsToGraphCount"
                                (ngModelChange)="updateJobsToGraph() ">
                        <dui-option [value]="0">selected ({{jobsToGraph.length}})</dui-option>
                        <dui-option [value]="5">top 5</dui-option>
                        <dui-option [value]="10">top 10</dui-option>
                        <dui-option [value]="25">top 25</dui-option>
                        <dui-option [value]="50">top 50</dui-option>
                        <dui-option [value]="100">top 100</dui-option>
                    </dui-select>
                </div>
                <div class="graphs-actions" *ngIf="store.value.experimentView.tab === 'parallel'">
                    <ng-container *ngIf="jobList && jobList.jobs">
                        {{jobList.jobs.count()}} experiment{{jobList.jobs.count() === 1 ? '' : 's'}}.
                    </ng-container>
                </div>

                <div class="graphs-content">
                    <ng-container *duiView="store.value.experimentView.tab === 'channels'">
                        <div *ngIf="jobsToGraphCount === 0 && jobsToGraph.length === 0" style="text-align: center;">
                            Please select at least one job.
                        </div>
                        <jobs-graphs [project]="project$.value"
                                     [jobs]="jobsToGraph"></jobs-graphs>
                    </ng-container>

                    <dk-parallel-coordinates *duiView="store.value.experimentView.tab === 'parallel' && !!jobList"
                                             [project]="project$.value"
                                             [jobList]="jobList"></dk-parallel-coordinates>

                    <job-compare *duiView="store.value.experimentView.tab === 'compare' && !!jobList"
                                 [jobIds]="jobIds(jobList.selected)"
                                 (deselect)="jobList.deselect($event)"
                                 (open)="openJob(jobList.jobs.getEntitySubject($event))"
                    ></job-compare>
                </div>

                <dui-splitter position="top" (modelChange)="graphsHeight = $event; cd.detectChanges()"></dui-splitter>
            </div>
        </div>

        <dk-job-show *duiView="store.value.experimentView.mode === 'detail'"
                     [project$]="project$"
                     [readOnly]="readOnly"
                     [jobId]="store.value.experimentView.lastSelectedJobId"
                     [job$]="store.value.experimentView.lastSelectedJob"></dk-job-show>
    `,
    styleUrls: ['project-experiments.component.scss']
})
export class ProjectExperimentsComponent implements OnDestroy {
    @Input() project$!: EntitySubject<Project>;
    @Input() readOnly: boolean = false;

    readonly viewState = new ViewState;

    firstJob?: EntitySubject<Job>;

    @LocalStorage('project-graphs-height')
    graphsHeight = 450;

    @LocalStorage('project-show-graphs')
    showGraphs = true;

    protected watcher?: ItemObserver<Project>;

    public jobsToGraphCount = 5;
    public jobsToGraph: Job[] = [];

    @ViewChild(JobsListComponent, {static: false}) jobList?: JobsListComponent;

    @unsubscribe()
    subs = new Subscriptions();

    constructor(
        public controllerClient: ControllerClient,
        public cd: ChangeDetectorRef,
        public store: MainStore,
        public dialog: DuiDialog,
    ) {
    }

    onFilter(filter: ProjectJobListFilter) {
        this.store.dispatch(actionExperimentFilter({filter}));
    }

    selectTab(tab: ExperimentViewTab) {
        this.store.dispatch(actionExperimentTab({tab}));
    }

    openMode(mode: 'list' | 'detail', job?: EntitySubject<Job>) {
        this.store.dispatch(actionExperimentMode({mode, job}));
    }

    public showExperiment() {
        this.dialog.open(CreateExperimentComponent, {project: this.project$!.value});
    }

    public jobIds(jobs: Job[]) {
        return jobs.map(v => v.id);
    }

    public updateJobsToGraph() {
        if (this.jobsToGraphCount === 0) {
            this.jobsToGraph = this.jobList!.selected.slice(0, 100);
        } else {
            const jobs = this.jobList!.table!.sorted;
            this.jobsToGraph = jobs.slice(0, this.jobsToGraphCount);
        }
        // this.jobsToGraph.reverse();
        detectChangesNextFrame(this.cd);
    }

    public jobsSorted(jobs: Job[]) {
        if (jobs[0]) {
            this.firstJob = this.jobList!.jobs!.getEntitySubject(jobs[0]);
        }

        this.jobsToGraph = jobs.slice(0, this.jobsToGraphCount);
        // this.jobsToGraph.reverse();
        detectChangesNextFrame(this.cd);
    }

    resize() {
        this.cd.detectChanges();
        triggerResize();
    }

    public openJob(job?: EntitySubject<Job>) {
        if (!job) {
            job = this.store.value.experimentView.lastSelectedJob;
        }

        if (!job) {
            job = this.firstJob;
        }

        if (job) {
            this.openMode('detail', job);
        }
    }

    ngOnDestroy(): void {
    }
}
