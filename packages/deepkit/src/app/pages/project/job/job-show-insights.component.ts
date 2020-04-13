/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    ChangeDetectorRef,
    Component,
    ElementRef,
    Input,
    OnChanges,
    OnDestroy,
    SimpleChanges,
    ViewChild
} from "@angular/core";
import {Collection, EntitySubject, StreamBehaviorSubject} from "@marcj/glut-core";
import {DataArray, DeepKitFile, Job, JobInsight, readNumpyFile} from "@deepkit/core";
import {ControllerClient} from "../../../providers/controller-client";
import {detectChangesNextFrame, DuiDialog} from "@marcj/angular-desktop-ui";
import {stack} from "@marcj/estdlib";
import {plainToClass} from "@marcj/marshal";
import {observe, unsubscribe} from "../../../reactivate-change-detection";
import * as FileSaver from "file-saver";
import {Subject, Subscription} from "rxjs";
import { DropdownComponent } from "@marcj/angular-desktop-ui";

@Component({
    selector: 'dk-job-show-insight-entry-numpy',
    template: `
        <ng-container *ngIf="dataView">
            <dui-icon *ngIf="!showDetails" clickable [openDropdown]="drop" name="search"></dui-icon>
            <strong>numpy</strong><br/>

            <div class="text">
                Shape: {{dataView.shape}}<br/>
                Min: {{min}}<br/>
                Max: {{max}}<br/>
                dtype: {{dataView.dtype}}<br/>
            </div>

            <dui-dropdown #drop>
                <div style="margin: 2px 3px; font-size: 11px;">
                    Data browser<br/>

                    <div class="shapes">
                        <div *ngFor="let ax of axes; trackBy: trackByIndex; let i = index;">
                            <dui-input
                                lightFocus semiTransparent round
                                [min]="0"
                                [max]="dataView.shape[i] - 1"
                                style="width: 50px; margin-right: 2px;"
                                placeholder="Axis {{i}}"
                                [(ngModel)]="axes[i]"
                                type="number"></dui-input>
                            <div class="shape-entry">{{dataView.shape[i]}}</div>
                        </div>
                    </div>
                </div>

                <dui-dropdown-splitter></dui-dropdown-splitter>
                <div class="v" *ngFor="let v of getSlice()">
                    {{v}}
                </div>
            </dui-dropdown>
        </ng-container>
    `,
    // host: {
    //     '[class.overlay-scrollbar-small]': 'true',
    // },
    styles: [`
        .v {
            font-size: 11px;
            margin-left: 4px;
        }

        .shapes {
            display: flex;
        }

        .shape-entry {
            text-align: center;
            color: var(--text-gray2);
        }

        .shapes > div {
            display: flex;
            flex-direction: column;
        }

        .text {
            color: var(--text-gray2);
        }

        dui-icon {
            position: relative;
            left: -2px;
        }

        :host {
            display: block;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 9px;
            line-height: 11px;
            border-radius: 5px;
            background-color: var(--background-semi-transparent);
            height: 100%;
            padding: 3px;
        }
    `]
})
export class JobShwoInsightEntryNumpyComponent implements OnChanges, OnDestroy {
    @Input() numpy!: Uint8Array;
    @Input() showDetails?: Subject<ElementRef | undefined>;

    @ViewChild('drop') drop?: DropdownComponent;

    dataView?: DataArray;
    array: any;
    min: any;
    max: any;

    axes: number[] = [];
    lastAxisSize = 0;

    @unsubscribe()
    showDetailsSub?: Subscription;

    ngOnDestroy(): void {
    }

    trackByIndex(index: number, v: any) {
        return index;
    }

    getSlice() {
        if (!this.array) return;

        const res: number[] = [];
        for (let i = 0; i < this.lastAxisSize; i++) {
            res.push(this.array.get(...this.axes, i));
        }
        return res;
    }

    ngOnChanges(changes: SimpleChanges): void {
        this.showDetailsSub = undefined;
        if (this.showDetails) {
            this.showDetailsSub = this.showDetails.subscribe((target) => {
                if (this.drop) {
                    this.drop.toggle(target);
                }
            });
        }

        this.dataView = readNumpyFile(this.numpy.buffer);
        this.array = this.dataView.toArray();
        this.axes = [];
        if (this.dataView.shape.length > 1) {
            this.axes = this.dataView.shape.slice(0, this.dataView.shape.length - 1).fill(0);
        }
        this.lastAxisSize = this.dataView.shape[this.dataView.shape.length - 1];
        this.min = undefined;
        this.max = undefined;

        for (const v of this.dataView.typedArray) {
            if (this.min === undefined || v < this.min) this.min = v;
            if (this.max === undefined || v > this.max) this.max = v;
        }
    }
}

@Component({
    selector: 'dk-job-show-insight-entry',
    template: `
        <div class="entry-content">
            <div class="entry-render">
                <ng-container *ngIf="file.isImage()">
                    <img *ngIf="content|async as buffer" [src]="buffer|objectURL"/>
                </ng-container>
                <ng-container *ngIf="file.getExtension() === 'json'">
                    <ng-container *ngIf="content|async|jsonBuffer as json">
                        <pre class="overlay-scrollbar-small" *ngIf="isString(json)">{{json}}</pre>
                        <pre class="overlay-scrollbar-small" *ngIf="!isString(json)">{{json|json}}</pre>
                    </ng-container>
                </ng-container>
                <ng-container *ngIf="file.getExtension() === 'npy'">
                    <dk-job-show-insight-entry-numpy [showDetails]="showDetails"
                        *ngIf="content|async as data" [numpy]="data"></dk-job-show-insight-entry-numpy>
                </ng-container>
            </div>
        </div>

        <dui-dropdown #jsonDrop>
            <ng-container *ngIf="file.getExtension() === 'json'">
                <ng-container *ngIf="content|async|jsonBuffer as json">
                    <pre class="in-dialog-pre" *ngIf="isString(json)">{{json}}</pre>
                    <pre class="in-dialog-pre" *ngIf="!isString(json)">{{json|json}}</pre>
                </ng-container>
            </ng-container>
        </dui-dropdown>

        <div class="entry-meta" *ngIf="showMeta && file.meta && file.meta.meta !== undefined && file.meta.meta !== null">
            <div *ngIf="isString(file.meta.meta)">{{file.meta.meta}}</div>
            <div *ngIf="!isString(file.meta.meta)">{{file.meta.meta|json}}</div>
        </div>
        <div class="entry-title">
            {{file.getNameWithoutExtension()}}
        </div>
        <div class="entry-size" *ngIf="showSize">
            {{file.size|fileSize}}
        </div>

        <div class="download">
            <dui-button-group padding="none">
                <dui-button textured tight *ngIf="file.getExtension() === 'json'" [openDropdown]="jsonDrop" icon="search"></dui-button>
                <dui-button textured tight *ngIf="file.getExtension() === 'npy'" #npyOpen (click)="showDetails.next(npyOpenElement)" icon="search"></dui-button>
                <dui-button textured tight icon="download" (click)="download()"></dui-button>
            </dui-button-group>
        </div>
    `,
    styles: [`
        :host {
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 5px;
            width: 100%;
            border-radius: 5px;
            position: relative;
        }

        :host:hover {
            background-color: var(--background-semi-transparent);
        }

        pre.in-dialog-pre {
            padding: 3px;
            user-select: text;
        }

        pre:not(.in-dialog-pre) {
            font-size: 9px;
            line-height: 11px;
            border-radius: 5px;
            background-color: var(--background-semi-transparent);
            height: 100%;
            padding: 3px;
            overflow: auto !important;
        }

        :host:hover .download {
            visibility: visible;
        }

        .download {
            visibility: hidden;
            position: absolute;
            right: 0px;
            top: -8px;
        }

        .entry-content {
            display: inline-flex;
            overflow: hidden;
            flex-direction: row;
            flex: 1;
            width: 100%;
            min-height: 30px;
        }

        .entry-render {
            flex: 1;
            width: 100%;
            overflow: hidden;
        }

        .entry-meta {
            overflow: hidden;
            text-overflow: ellipsis;
            color: var(--text-gray2);
            user-select: text;
            width: 100%;
            font-size: 11px;
            text-align: center;
        }

        .entry-title {
            overflow: hidden;
            margin-top: 4px;
            text-overflow: ellipsis;
            width: 100%;
            flex: 0 0 15px;
            font-size: 11px;
            user-select: text;
            text-align: center;
        }

        .entry-size {
            overflow: hidden;
            margin-top: 1px;
            text-overflow: ellipsis;
            color: var(--text-gray2);
            width: 100%;
            flex: 0 0 12px;
            font-size: 10px;
            line-height: 12px;
            user-select: text;
            text-align: center;
        }

        img {
            object-fit: contain;
            width: 100%;
            height: 100%;
        }
    `]
})
export class JobShowInsightEntryComponent implements OnChanges, OnDestroy {
    @Input() job$!: EntitySubject<Job>;
    @Input() file!: DeepKitFile;
    @Input() showMeta = false;
    @Input() showSize = false;

    @Input() showDetails = new Subject<ElementRef | undefined>();

    @ViewChild('npyOpen', {read: ElementRef}) npyOpenElement?: ElementRef;

    @unsubscribe()
    content?: StreamBehaviorSubject<Uint8Array | undefined>;

    constructor(
        protected cd: ChangeDetectorRef,
        protected controllerClient: ControllerClient,
    ) {
    }

    isString(value: any) {
        return 'string' === typeof value;
    }

    ngOnDestroy(): void {
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (changes.file) {
            this.content = undefined;
            const loadPath = this.file.path;
            const res = await this.controllerClient.publicJob().subscribeJobFileContent(this.job$.id, this.file.path);

            if (loadPath === this.file.path) {
                this.content = res;
                this.cd.detectChanges();
            }
        }
    }

    async download() {
        if (!this.content || !this.content.value) return;

        const blob = new Blob([this.content.value]);
        FileSaver.saveAs(blob, this.job$!.value.number + '-insight-' + this.file.getName());
    }
}

@Component({
    selector: 'dk-job-show-insight',
    template: `
        <ng-container *ngFor="let dir of dirs; trackBy: trackByDir">
            <div class="dir-title">
                <dui-icon clickable (click)="hiddenDirs[dir.name] = !hiddenDirs[dir.name]"
                          [name]="hiddenDirs[dir.name] ? 'triangle_right': 'triangle_down'"></dui-icon>
                {{dir.name}}

                <span style="margin-left: 5px; color: var(--text-gray2)">
                    - {{filesShown[dir.name]}}/{{dir.files.length}} {{dir.files.length === 1 ? 'entry' : 'entries'}}
                </span>

                <dui-button-group padding="none" *ngIf="dir.files.length > filesShown[dir.name]"
                                  style="margin-left: auto; margin-right: 12px;">
                    <dui-button textured small (click)="showMore(dir.name)">Show more</dui-button>
                    <dui-button textured small (click)="showAll(dir.name)">Show all</dui-button>
                </dui-button-group>
            </div>

            <div class="files" *ngIf="!hiddenDirs[dir.name]">
                <dk-job-show-insight-entry
                    [class.entry-2]="file.meta !== undefined"
                    *ngFor="let file of dir.files|slice:0:filesShown[dir.name]; trackBy: trackById"
                    [job$]="job$" [file]="file" [showMeta]="showMeta" [showSize]="showSize"
                >
                </dk-job-show-insight-entry>
            </div>

        </ng-container>
    `,
    styles: [`
        :host {
            display: block;
        }

        .dir-title {
            padding: 5px 3px;
            display: flex;
            align-items: center;
        }

        .dir-title:not(:first-child) {
            border-top: 1px solid var(--line-color-light);
        }

        .files {
            display: grid;
            grid-gap: 0;
            padding: 12px;
            grid-template-columns: repeat(auto-fit, var(--entry-size));
            grid-auto-rows: var(--entry-size);
        }
    `]
})
export class JobShowInsightComponent implements OnChanges, OnDestroy {
    @Input() job$!: EntitySubject<Job>;
    @Input() insight!: JobInsight;
    @Input() filter: string = '';
    @Input() showMeta: boolean = true;
    @Input() showSize: boolean = false;
    @Input() sortBy: 'name' | 'created' = 'name';

    @observe({unsubscribe: true})
    fileCollection?: Collection<DeepKitFile>;

    dirs: { name: string, files: DeepKitFile[] }[] = [];

    dirFiles: { [name: string]: DeepKitFile[] } = {};
    hiddenDirs: { [name: string]: boolean } = {};
    filesShown: { [name: string]: number } = {};

    files: DeepKitFile[] = [];

    sortByName = (a: DeepKitFile, b: DeepKitFile) => {
        if (a.path < b.path) return -1;
        if (a.path > b.path) return 1;
        return 0;
    }

    sortByCreated = (a: DeepKitFile, b: DeepKitFile) => {
        if (a.created < b.created) return -1;
        if (a.created > b.created) return 1;
        return 0;
    }

    constructor(
        protected cd: ChangeDetectorRef,
        protected controllerClient: ControllerClient,
    ) {
    }

    showAll(dir: string) {
        this.filesShown[dir] = this.dirFiles[dir].length;
    }

    showMore(dir: string) {
        this.filesShown[dir] = Math.min(this.filesShown[dir] + 10, this.dirFiles[dir].length);
    }


    filterList<T>(items: DeepKitFile[]): DeepKitFile[] {
        if (!items) return [];
        const sort = this.sortBy === 'name' ? this.sortByName : this.sortByCreated;

        if (!this.filter) {
            return items.sort(sort);
        }

        return items.filter(v => v.path.includes(this.filter)).sort(sort);
    }

    trackByDir(index: number, dir: { name: string, files: DeepKitFile[] }) {
        return dir.name;
    }

    trackById(index: number, file: DeepKitFile) {
        return file.id;
    }

    ngOnDestroy(): void {
    }

    @stack()
    async ngOnChanges(changes: SimpleChanges) {
        if (!this.job$) {
            this.fileCollection = undefined;
            return;
        }

        if (changes.job$ || changes.insight) {
            const loadX = this.insight.x;
            this.fileCollection = await this.controllerClient.publicJob().subscribeInsights(this.job$.id, this.insight.x);
            if (loadX !== this.insight.x) return;

            this.filesShown = {};
            this.fileCollection.subscribe((files) => {
                this.files = files;
                this.render();
            });
        } else {
            if (changes.filter) {
                this.filesShown = {};
            }
            this.render();
        }
    }

    render() {
        const baseDir = '.deepkit/insight/' + this.insight.x + '/';
        const dirs: { [name: string]: { name: string, files: DeepKitFile[] } } = {};
        this.dirFiles = {};

        for (const file of this.filterList(this.files)) {
            const dir = file.getDirectory().substr(baseDir.length + 1);
            if (!dirs[dir]) {
                dirs[dir] = {name: dir, files: []};
                this.dirFiles[dir] = dirs[dir].files;
            }
            if (!this.filesShown[dir]) {
                this.filesShown[dir] = 10;
            }

            dirs[dir].files.push(file);
        }

        for (const dir of Object.keys(dirs)) {
            this.filesShown[dir] = Math.min(this.filesShown[dir], dirs[dir].files.length);
        }

        this.dirs = Object.values(dirs).sort((a, b) => {
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;
            return 0;
        });

        this.cd.detectChanges();
    }
}

@Component({
    selector: 'dk-job-show-insights',
    template: `
        <div class="header" *ngIf="job$|async as job">
            <dk-history-bar
                [(selected)]="selected"
                [size]="insights.length"></dk-history-bar>

            <div class="text" *ngIf="insights[selected] as insight">
                <div>
                    Insight #{{insight.x}}, epoch {{insight.epoch}}, step {{insight.step}},
                    created {{insight.time|humanize:job.started}}
                </div>
                <div style="margin-left: auto; display: flex; align-items: center;">
                    <dui-slider style="width: 80px; margin-right: 6px;" mini
                                [min]="50" [max]="500" [(ngModel)]="entrySize"></dui-slider>
                    <dui-checkbox style="margin-right: 6px;" [(ngModel)]="showMeta">Meta</dui-checkbox>
                    <dui-checkbox style="margin-right: 6px;" [(ngModel)]="showSize">Size</dui-checkbox>
                    <dui-select textured style="width: 80px; margin-right: 6px;" [(ngModel)]="sortBy">
                        <dui-option value="created">Created</dui-option>
                        <dui-option value="name">Name</dui-option>
                    </dui-select>
                    <dui-input lightFocus semiTransparent round clearer icon="filter"
                               placeholder="Filter" [(ngModel)]="filter"></dui-input>
                </div>
            </div>
        </div>

        <div class="content overlay-scrollbar-small" [style.--entrySize.px]="entrySize">
            <ng-container *ngIf="selected >= 0 && insights[selected]">
                <dk-job-show-insight [job$]="job$" [filter]="filter"
                                     [showMeta]="showMeta"
                                     [showSize]="showSize"
                                     [sortBy]="sortBy"
                                     [insight]="insights[selected]"></dk-job-show-insight>
            </ng-container>
        </div>
    `,
    styleUrls: ['./job-show-insights.component.scss']
})
export class JobShowInsightsComponent {
    @Input() job$?: EntitySubject<Job>;
    @Input() readOnly: boolean = false;

    public sortBy: 'name' | 'created' = 'name';
    public entrySize = 95;
    public showMeta: boolean = true;
    public showSize: boolean = false;

    selected = -1;

    filter = '';

    @unsubscribe()
    insights$?: StreamBehaviorSubject<string>;

    insights: JobInsight[] = [];

    constructor(
        protected cd: ChangeDetectorRef,
        protected controllerClient: ControllerClient,
        protected dialog: DuiDialog,
    ) {
    }

    ngOnDestroy(): void {
    }

    @stack()
    async ngOnChanges() {
        this.selected = 0;
        this.insights = [];

        if (!this.job$) {
            return;
        }

        this.insights$ = (await this.controllerClient.publicJob()
            .subscribeJobFileContent(this.job$.id, '.deepkit/insights.json')).toUTF8();
        this.insights$.subscribe(json => {
            if (json) {
                for (const j of json.split('\n')) {
                    if (!j) continue;
                    this.insights.push(plainToClass(JobInsight, JSON.parse(j)));
                }
                detectChangesNextFrame(this.cd);
            }
        });
        this.insights$.appendSubject.subscribe(json => {
            if (json) {
                for (const j of json.split('\n')) {
                    if (!j) continue;
                    this.insights.push(plainToClass(JobInsight, JSON.parse(j)));
                }
                detectChangesNextFrame(this.cd);
            }
        });

        detectChangesNextFrame(this.cd);
    }
}
