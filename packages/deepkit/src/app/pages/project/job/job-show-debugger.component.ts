/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, Output} from "@angular/core";
import {EntitySubject, Collection, StreamBehaviorSubject} from "@marcj/glut-core";
import {Job, JobDebuggingState, JobModelSnapshot} from "@deepkit/core";
import {stack} from "@marcj/estdlib";
import {ControllerClient} from "../../../providers/controller-client";
import {unsubscribe} from "../../../reactivate-change-detection";
import {detectChangesNextFrame} from "@marcj/angular-desktop-ui";
import {DialogComponent} from "@marcj/angular-desktop-ui";
import {cloneClass, plainToClass} from "@marcj/marshal";
import {DuiDialog} from "@marcj/angular-desktop-ui";
import {Subscription} from "rxjs";

@Component({
    template: `
        <dui-form-row label="Recording mode">
            <dui-select textured [(ngModel)]="state.recordingMode">
                <dui-option value="epoch">Each epoch</dui-option>
                <dui-option value="second">Interval</dui-option>
            </dui-select>
        </dui-form-row>

        <dui-form-row label="Interval" *ngIf="state.recordingMode === 'second'">
            <dui-select textured [(ngModel)]="state.recordingSecond">
                <dui-option [value]="10">Each 10 seconds</dui-option>
                <dui-option [value]="30">Each 30 seconds</dui-option>
                <dui-option [value]="60">Each minute</dui-option>
                <dui-option [value]="60*5">Each 5 minutes</dui-option>
                <dui-option [value]="60*15">Each 15 minutes</dui-option>
                <dui-option [value]="60*30">Each 30 minutes</dui-option>
                <dui-option [value]="60*60">Each hour</dui-option>
            </dui-select>
        </dui-form-row>

        <dui-form-row label="Record layers">
            <dui-select textured [(ngModel)]="state.recordingLayers">
                <dui-option value="watched">Only watched</dui-option>
                <dui-option value="all">All</dui-option>
            </dui-select>
        </dui-form-row>

        <dui-form-row *ngIf="state.recordingLayers === 'all'">
            Recording too many layers at once can lead to dramatic extended training time and storage usage depending
            on your model size.
        </dui-form-row>

        <dui-dialog-actions>
            <dui-button (click)="stop()" *ngIf="state.recording" style="margin-right: auto;">Stop recording</dui-button>
            <dui-button closeDialog>Cancel</dui-button>

            <dui-button (click)="start()" *ngIf="!state.recording">Start</dui-button>
            <dui-button (click)="start()" *ngIf="state.recording">Update</dui-button>

        </dui-dialog-actions>
    `
})
export class JobDebuggerRecordDialogComponent {
    static dialogDefaults = {
        width: 450,
    };

    @Input() state!: JobDebuggingState;

    constructor(
        protected dialogRef: DialogComponent,
    ) {
    }

    async stop() {
        this.state.recording = false;
        this.dialogRef.close(this.state);
    }

    start() {
        this.state.recording = true;
        this.dialogRef.close(this.state);
    }
}

@Component({
    selector: 'dk-job-show-debugger',
    template: `
        <ng-container *ngIf="job$|async as job">
            <div class="header" [class.live-recording]="job.debuggingState.live && job.isAlive()"
                 [class.live-selected]="snapshotId === 'live'">
                <dk-history-bar [selected]="snapshotId === 'live' ? snapshots.length : selected"
                                (selectedChange)="selectSnapshot($event)"
                                [size]="snapshots.length + (showLive ? 1 : 0)"></dk-history-bar>

                <div class="text">
                    <dui-button textured icon="record" [disabled]="readOnly || job.isEnded()" (click)="toggleRecord()"
                                [iconColor]="job.isRunning() && job.debuggingState.recording ? 'var(--dui-selection)' : ''">
                        Record
                    </dui-button>
                    <dui-button textured icon="record" [disabled]="readOnly || job.isEnded()" (click)="toggleLive()"
                                [iconColor]="job.isRunning() && job.debuggingState.live ? 'red' : ''">Live
                    </dui-button>

                    <span style="margin-left: 5px;" class="monospace">
                        <ng-container *ngIf="snapshotId === 'live'">
                            Watching live data
                            <ng-container *ngIf="!job.debuggingState.live">(no active live recording)</ng-container>
                        </ng-container>
                        <ng-container *ngIf="snapshots.length > 0 && snapshotId && snapshotId !== 'live'">
                            Watching snapshot
                            <ng-container *ngIf="snapshots[selected] as snapshot">
                                <span class="monospace">#{{selected + 1}}/{{snapshots.length}}</span>
                                epoch {{snapshot.epoch}}, step {{snapshot.step}},
                                created {{snapshot.time|humanize:job.started}},
                                {{snapshot.layerNames.length}} layers
                            </ng-container>
                        </ng-container>
                    </span>
                </div>
            </div>

            <job-model-graph [snapshotId]="snapshotId"
                             [readOnly]="readOnly"
                             [snapshot]="snapshots[selected]"
                             [job$]="job$"></job-model-graph>
        </ng-container>
    `,
    styleUrls: ['./job-show-debugger.component.scss']
})
export class JobShowDebuggerComponent implements OnChanges, OnDestroy {
    @Input() job$?: EntitySubject<Job>;
    @Input() readOnly: boolean = false;

    selected = 1;

    snapshotId = '0';

    @unsubscribe()
    snapshots$?: StreamBehaviorSubject<string>;

    snapshots: JobModelSnapshot[] = [];

    @unsubscribe()
    jobSub?: Subscription;

    showLive = false;

    constructor(
        protected cd: ChangeDetectorRef,
        protected controllerClient: ControllerClient,
        protected dialog: DuiDialog,
    ) {
    }

    ngOnDestroy(): void {
    }

    @stack()
    async toggleRecord() {
        if (!this.job$) return;

        const {dialog} = this.dialog.open(JobDebuggerRecordDialogComponent, {
            state: cloneClass(this.job$.value.debuggingState)
        });
        const a = await dialog.toPromise();
        if (a) {
            this.job$.value.debuggingState = a;
            await this.controllerClient.app().jobSetDebuggingState(this.job$.id, this.job$.value.debuggingState);
        }
    }

    @stack()
    async toggleLive() {
        if (!this.job$) return;

        this.job$.value.debuggingState.live = !this.job$.value.debuggingState.live;

        await this.controllerClient.app().jobSetDebuggingState(this.job$.id, this.job$.value.debuggingState);
        if (this.job$.value.isAlive() && this.job$.value.debuggingState.live) {
            this.showLive = true;
            this.snapshotId = 'live';
            this.cd.detectChanges();
        } else {
            this.showLive = false;
            if (this.snapshots.length > 0) {
                this.selected = this.snapshots.length - 1;
                this.snapshotId = String(this.snapshots[this.selected].x);
            }
        }
    }

    selectSnapshot(index: number) {
        this.selected = index;
        if (index === this.snapshots.length) {
            this.snapshotId = 'live';
        } else {
            this.snapshotId = String(this.snapshots[index].x);
        }
        this.cd.detectChanges();
    }

    @stack()
    async ngOnChanges() {
        this.selected = 0;
        this.snapshots = [];
        this.snapshotId = '';

        if (!this.job$) {
            return;
        }

        this.showLive = this.job$.value.debuggingState.live && this.job$.value.isAlive();
        this.snapshotId = this.showLive ? 'live' : '0';

        this.jobSub = this.job$.subscribe(job => {
            if (this.showLive !== job.debuggingState.live) {
                this.showLive = job.debuggingState.live && job.isAlive();
                this.snapshotId = this.showLive ? 'live' : '0';
                this.cd.detectChanges();
            }
        });

        this.snapshots$ = (await this.controllerClient.publicJob()
            .subscribeJobFileContent(this.job$.id, '.deepkit/debug/snapshot/snapshots.json')).toUTF8();
        this.snapshots$.subscribe(json => {
            if (json) {
                for (const j of json.split('\n')) {
                    if (!j) continue;
                    if (this.snapshotId !== 'live') {
                        if (this.selected === this.snapshots.length - 1) {
                            this.selected++;
                        }
                    }
                    this.snapshots.push(plainToClass(JobModelSnapshot, JSON.parse(j)));
                    if (this.snapshotId !== 'live') {
                        this.snapshotId = String(this.snapshots[this.selected].x);
                    }
                }
                detectChangesNextFrame(this.cd);
            }
        });
        this.snapshots$.appendSubject.subscribe(json => {
            if (json) {
                for (const j of json.split('\n')) {
                    if (!j) continue;
                    if (this.snapshotId !== 'live') {
                        if (this.selected === this.snapshots.length - 1) {
                            this.selected++;
                        }
                    }
                    this.snapshots.push(plainToClass(JobModelSnapshot, JSON.parse(j)));
                    if (this.snapshotId !== 'live') {
                        this.snapshotId = String(this.snapshots[this.selected].x);
                    }
                }
                detectChangesNextFrame(this.cd);
            }
        });

        detectChangesNextFrame(this.cd);
    }
}
