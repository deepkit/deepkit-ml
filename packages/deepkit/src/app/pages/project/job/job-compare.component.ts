/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnChanges,
    OnDestroy,
    Output,
    SimpleChanges
} from "@angular/core";
import {Collection, EntitySubject, StreamBehaviorSubject} from "@marcj/glut-core";
import {ControllerClient} from "../../../providers/controller-client";
import {DeepKitFile, Job} from "@deepkit/core";
import {arrayRemoveItem, each, eachPair} from "@marcj/estdlib";
import {unsubscribe} from "../../../reactivate-change-detection";

@Component({
    selector: 'job-compare',
    template: `
        <div *ngIf="!jobsArray.length" style="text-align: center">
            Please select at least two experiments.
        </div>

        <dui-dropdown #fileDropdown [minWidth]="700" width="80%" height="80%" [scrollbars]="false">
            <monaco-editor
                *ngIf="fileContentSubject !== undefined"
                [options]="{readOnly: true}"
                [fileName]="fileContentPath"
                [ngModel]="fileContentSubject|async"
            ></monaco-editor>
        </dui-dropdown>

        <dui-dropdown #diffDropdown [minWidth]="700" width="80%" height="80%" [scrollbars]="false">
            <monaco-editor
                *ngIf="fileContentSubject !== undefined"
                [options]="{readOnly: true}"
                [fileName]="fileContentPath"
                [ngModel]="fileContentSubject|async"
                [modified]="fileContentModifiedSubject|async"
            ></monaco-editor>
        </dui-dropdown>

        <div *ngIf="jobsArray.length">
            <table>
                <tr>
                    <td></td>
                    <td *ngFor="let job of jobsArray; trackBy: trackJob; let i = index">
                        <dui-button-group padding="none">
                            <dui-button small textured [disabled]="origin === job"
                                        (click)="origin = job; updateComparison()">Origin
                            </dui-button>
                            <dui-button small textured (click)="deselect.emit(job.id)">Deselect</dui-button>
                            <dui-button small textured (click)="open.emit(job.id)">Open</dui-button>
                        </dui-button-group>
                    </td>
                </tr>
                <tr class="data-row">
                    <td>ID</td>
                    <td *ngFor="let job of jobsArray; trackBy: trackJob; let i = index">
                        #{{job.number}}
                    </td>
                </tr>
                <!--                <tr>-->
                <!--                    <td>Actions</td>-->
                <!--                    <td *ngFor="let job of jobsArray">-->
                <!--                        Bla-->
                <!--                    </td>-->
                <!--                </tr>-->
                <tr class="data-row">
                    <td>Created</td>
                    <td *ngFor="let job of jobsArray; trackBy: trackJob">
                        {{job.created | date:'short'}}
                    </td>
                </tr>
                <tr class="data-row">
                    <td>Configuration</td>
                    <td *ngFor="let job of jobsArray; trackBy: trackJob">
                        {{job.config.path}}
                    </td>
                </tr>
                <tr class="data-row">
                    <td>Description</td>
                    <td *ngFor="let job of jobsArray; trackBy: trackJob">
                        {{job.description}}
                    </td>
                </tr>

                <tr class="data-row">
                    <td class="title" [attr.colspan]="jobsCount + 1">
                        Progress
                    </td>
                </tr>
                <tr class="data-row">
                    <td>Status</td>
                    <td *ngFor="let job of jobsArray; trackBy: trackJob">
                        <job-status [job]="job"></job-status>
                    </td>
                </tr>
                <tr class="data-row">
                    <td>Epoch</td>
                    <td *ngFor="let job of jobsArray; trackBy: trackJob">
                        {{job.iteration}} / {{job.iterations}}
                    </td>
                </tr>
                <tr class="data-row">
                    <td>Batch</td>
                    <td *ngFor="let job of jobsArray; trackBy: trackJob">
                        {{job.step}} / {{job.steps}}
                    </td>
                </tr>
                <tr class="data-row">
                    <td>Performance</td>
                    <td *ngFor="let job of jobsArray; trackBy: trackJob">
                        {{job.speed | number:'1.2'}} {{job.speedLabel}}
                    </td>
                </tr>
                <tr class="data-row">
                    <td>Elapsed</td>
                    <td *ngFor="let job of jobsArray; trackBy: trackJob">
                        <dk-redraw>
                            {{job.elapsedTime() | humanize}}
                        </dk-redraw>
                    </td>
                </tr>
                <tr class="data-row">
                    <td>ETA</td>
                    <td *ngFor="let job of jobsArray; trackBy: trackJob">
                        {{job.eta | humanize}}
                    </td>
                </tr>

                <tr>
                    <td class="title" [attr.colspan]="jobsCount + 1">
                        Information
                    </td>
                </tr>

                <tr class="data-row" *ngFor="let row of comparisonInfos | keyvalue; trackBy: trackByIndex">
                    <td>{{row.key}}</td>
                    <td *ngFor="let job of jobsArray; trackBy: trackJob"
                        [class.changed]="row.value.origin !== row.value.values[job.id]"
                    >
                        {{row.value.values[job.id] | json}}
                    </td>
                </tr>

                <tr>
                    <td class="title" [attr.colspan]="jobsCount + 1">
                        Configuration
                    </td>
                </tr>

                <tr class="data-row" *ngFor="let row of comparisonParameters | keyvalue; trackBy: trackByIndex">
                    <td>{{row.key}}</td>
                    <td *ngFor="let job of jobsArray; trackBy: trackJob"
                        [class.changed]="row.value.origin !== row.value.values[job.id]"
                    >
                        {{row.value.values[job.id] | json}}
                    </td>
                </tr>


                <tr>
                    <td class="title" [attr.colspan]="jobsCount + 1">
                        Metrics
                    </td>
                </tr>

                <tr class="data-row" *ngFor="let row of comparisonMetrics | keyvalue; trackBy: trackByIndex">
                    <td>{{row.key}}</td>
                    <td *ngFor="let job of jobsArray; trackBy: trackJob"
                        [class.changed]="row.value.origin !== row.value.values[job.id]"
                    >
                        {{row.value.values[job.id] | json}}
                    </td>
                </tr>

                <tr>
                    <td class="title" [attr.colspan]="jobsCount + 1">
                        File differences
                    </td>
                </tr>

                <tr class="data-row" *ngFor="let row of comparisonFiles | keyvalue; trackBy: trackByIndex">
                    <td>{{row.key}}</td>
                    <td *ngFor="let job of jobsArray; trackBy: trackJob; let i = index">

                        <ng-container *ngIf="i === 0 || row.value.md5[job.id] === row.value.origin">
                            <dui-button small textured [openDropdown]="fileDropdown"
                                        (click)="openFile(job.id, row.key)">Open
                            </dui-button>
                        </ng-container>

                        <ng-container *ngIf="i !== 0 && row.value.md5[job.id] !== row.value.origin">
                            <dui-button small textured [openDropdown]="fileDropdown"
                                        (click)="openFile(job.id, row.key)">Open
                            </dui-button>
                            <dui-button small textured [openDropdown]="diffDropdown"
                                        (click)="openDiff(row.key, job.id)">Diff
                            </dui-button>
                        </ng-container>
                    </td>
                </tr>
            </table>
        </div>
    `,
    styleUrls: ['./job-compare.component.scss'],
})
export class JobCompareComponent implements OnDestroy, OnChanges {
    @Input() public jobIds: string[] = [];
    @Output() public deselect = new EventEmitter<string>();
    @Output() public open = new EventEmitter<string>();

    public jobsMap: { [id: string]: EntitySubject<Job> } = {};
    public jobsArray: Job[] = [];
    public origin?: Job;

    public fileContentPath?: string;

    @unsubscribe()
    public fileContentSubject?: StreamBehaviorSubject<string>;

    @unsubscribe()
    public fileContentModifiedSubject?: StreamBehaviorSubject<string>;

    public comparisonInfos: { [path: string]: { origin: any, values: { [id: string]: any } } } = {};
    public comparisonParameters: { [path: string]: { origin: any, values: { [id: string]: any } } } = {};
    public comparisonFiles: { [path: string]: { origin: any, md5: { [id: string]: any } } } = {};

    public comparisonMetrics: { [path: string]: { origin: any, values: { [id: string]: any } } } = {};

    protected fileCollections: { [id: string]: Collection<DeepKitFile> } = {};

    protected destroyed = false;

    constructor(
        private cd: ChangeDetectorRef,
        private controllerClient: ControllerClient,
    ) {
    }

    async ngOnDestroy() {
        this.destroyed = true;

        for (const job of each(this.jobsMap)) {
            await job.unsubscribe();
        }

        for (const collection of each(this.fileCollections)) {
            await collection.unsubscribe();
        }
    }

    async openFile(jobId: string, filePath: string) {
        this.fileContentPath = filePath;
        this.fileContentSubject = undefined;
        this.cd.detectChanges();

        this.fileContentSubject = (await this.controllerClient.publicJob().subscribeJobFileContent(jobId, filePath)).toUTF8();
        this.fileContentSubject.activateNextOnAppend();
        this.cd.detectChanges();
    }

    async openDiff(filePath: string, jobId: string) {
        this.fileContentPath = filePath;
        this.fileContentSubject = undefined;
        this.fileContentModifiedSubject = undefined;
        this.cd.detectChanges();

        this.fileContentSubject = (await this.controllerClient.publicJob().subscribeJobFileContent(this.origin!.id, filePath)).toUTF8();
        this.fileContentSubject.activateNextOnAppend();

        this.fileContentModifiedSubject = (await this.controllerClient.publicJob().subscribeJobFileContent(jobId, filePath)).toUTF8();
        this.fileContentModifiedSubject.activateNextOnAppend();

        this.cd.detectChanges();
    }

    trackByIndex(index: number) {
        return index;
    }

    trackJob(index: number, job: Job) {
        return job.id;
    }

    get jobsCount(): number {
        return this.jobsArray.length;
    }

    public updateComparison() {
        this.comparisonInfos = {};
        this.comparisonParameters = {};

        if (!this.origin) return;

        for (const job of this.jobsArray) {
            for (const [key, value] of eachPair(job.config.getFlatConfig())) {
                if (!this.comparisonParameters[key]) {
                    this.comparisonParameters[key] = {origin: undefined, values: {}};
                }

                if (job.id === this.origin.id) {
                    this.comparisonParameters[key].origin = value;
                }

                this.comparisonParameters[key].values[job.id] = value;
            }

            for (const [name, channel] of eachPair(job.channels)) {

                for (const [i, trace] of eachPair(channel.traces)) {
                    const key = name + '.' + trace;

                    if (!this.comparisonMetrics[key]) {
                        this.comparisonMetrics[key] = {origin: undefined, values: {}};
                    }

                    if (job.id === this.origin.id) {
                        this.comparisonMetrics[key].origin = job.channelLastValues[name] ? job.channelLastValues[name][i] : undefined;
                    }

                    this.comparisonMetrics[key].values[job.id] = job.channelLastValues[name] ? job.channelLastValues[name][i] : undefined;
                }
            }

            for (const [key, value] of eachPair(job.getFlatInfos())) {
                if (!this.comparisonInfos[key]) {
                    this.comparisonInfos[key] = {origin: undefined, values: {}};
                }

                if (job.id === this.origin.id) {
                    this.comparisonInfos[key].origin = value;
                }

                this.comparisonInfos[key].values[job.id] = value;
            }
        }
    }

    updateFileComparison() {
        const files: { [path: string]: { origin: any, md5: { [id: string]: any } } } = {};

        const origin = this.jobsArray[0];

        for (const job of this.jobsArray) {
            if (!this.fileCollections[job.id]) continue;

            for (const file of this.fileCollections[job.id].all()) {
                if (file.path.startsWith('.deepkit')) continue;

                if (!files[file.path]) {
                    files[file.path] = {origin: undefined, md5: {}};
                }

                if (job.id === origin.id) {
                    files[file.path].origin = file.md5!;
                }

                files[file.path].md5[job.id] = file.md5;
            }
        }

        this.comparisonFiles = {};
        for (const [key, value] of eachPair(files)) {
            if (value.origin) {
                for (const v of each(value.md5)) {
                    if (v !== value.origin) {
                        this.comparisonFiles[key] = value;
                        break;
                    }
                }
            }
        }

        this.cd.detectChanges();
    }

    async startFileWatching() {
        // const origin = this.jobsArray[0];
        const promises: Promise<any>[] = [];

        for (const job of this.jobsArray) {
            if (this.fileCollections[job.id]) continue;

            const promise = this.controllerClient.app().subscribeClosedJobFiles(job.id);
            promises.push(promise);
            promise.then(async (res) => {
                if (this.destroyed) {
                    await res.unsubscribe();
                    return;
                }

                this.fileCollections[job.id] = res;

                res.subscribe(() => {
                    this.updateFileComparison();
                });
            });
        }

        await Promise.all(promises);
        this.updateFileComparison();
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (JSON.stringify(changes.jobIds.currentValue) === JSON.stringify(changes.jobIds.previousValue)) return;

        this.fileContentSubject = undefined;
        this.fileContentModifiedSubject = undefined;

        const publicJob = this.controllerClient.publicJob();
        const promises: Promise<void>[] = [];

        const deselectedIds: string[] = Object.keys(this.jobsMap);
        for (const id of this.jobIds) {
            arrayRemoveItem(deselectedIds, id);
        }

        for (const id of deselectedIds) {
            this.jobsMap[id].unsubscribe();
            delete this.jobsMap[id];
            if (this.fileCollections[id]) this.fileCollections[id].unsubscribe();
            delete this.fileCollections[id];
        }

        for (const job of this.jobIds) {
            if (!this.jobsMap[job]) {
                promises.push(publicJob.subscribeJob(job).then(async (res) => {
                    if (this.destroyed) {
                        await res.unsubscribe();
                        return;
                    }

                    this.jobsMap[res.value.id] = res;

                    res.subscribe(() => {
                        this.updateComparison();
                    });
                }));
            }
        }

        await Promise.all(promises);

        this.jobsArray = [];

        for (const job of each(this.jobsMap)) {
            this.jobsArray.push(job.value);
        }

        if (!this.origin) {
            this.origin = this.jobsArray[0];
        }

        if (this.origin && !this.jobsMap[this.origin.id]) {
            this.origin = this.jobsArray[0];
        }

        this.updateComparison();
        this.cd.detectChanges();

        await this.startFileWatching();
    }
}
