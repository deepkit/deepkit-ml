/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    Output,
    SimpleChanges,
    ViewChild
} from "@angular/core";
import {BehaviorSubject, Observable} from "rxjs";
import {Config, Layout} from "plotly.js";
import {Job, JobStatus, Project, Search, ProjectJobListFilter} from "@deepkit/core";
import {arrayRemoveItem, copy, eachPair, empty, singleStack} from "@marcj/estdlib";
import {Collection, EntitySubject, Progress} from "@marcj/glut-core";
import {Subscriptions} from "@marcj/estdlib-rxjs";
import {ObservableTrace} from "./plotly.component";
import {observe, unsubscribe} from "../reactivate-change-detection";
import {ControllerClient} from "../providers/controller-client";
import {detectChangesNextFrame, DialogComponent, DuiDialog, TableComponent} from "@marcj/angular-desktop-ui";
import {auditTime} from "rxjs/operators";
import {ClientProgress} from "@marcj/glut-client";
import {f, cloneClass, uuid} from "@marcj/marshal";

@Component({
    selector: 'jobs-list',
    template: `
        <ng-container *ngIf="project$|asyncRender as project">
            <dui-dialog #manageColumns [height]="650" [width]="700">
                <ng-container *dialogContainer>
                    <div class="manage-columns">
                        <div class="panel overlay-scrollbar">
                            <dk-section-header>General</dk-section-header>
                            <div class="columns">
                                <dui-checkbox
                                    *ngFor="let name of defaultColumns"
                                    [ngModel]="isColumnActive(name)"
                                    (ngModelChange)="toogleActiveColumn(name)">{{getLabelForColumnId(name)}}</dui-checkbox>
                            </div>

                            <dk-section-header>Metrics</dk-section-header>
                            <div class="columns">
                                <dui-checkbox [ngModel]="isColumnActive('channel.' + name)"
                                              (ngModelChange)="toogleActiveColumn('channel.' + name)"
                                              *ngFor="let name of availableChannelNames">{{getLabelForColumnId('channel.' + name)}}</dui-checkbox>
                            </div>

                            <dk-section-header>Configuration</dk-section-header>
                            <div class="columns">
                                <dui-checkbox
                                    [ngModel]="isColumnActive('config.' + name)"
                                    (ngModelChange)="toogleActiveColumn('config.' + name)"
                                    *ngFor="let name of availableHyperParameterNames">{{name}}</dui-checkbox>
                            </div>

                            <dk-section-header>Information</dk-section-header>
                            <div class="columns">
                                <dui-checkbox
                                    [ngModel]="isColumnActive('info.' + name)"
                                    (ngModelChange)="toogleActiveColumn('info.' + name)"
                                    *ngFor="let name of availableInformationNames">{{name}}</dui-checkbox>
                            </div>
                        </div>
                    </div>
                    <dui-dialog-actions>
                        <dui-button textured (click)="resetManageColumns(manageColumns)">Cancel</dui-button>
                        <dui-button textured (click)="applyManageColumns(manageColumns)">Apply</dui-button>
                    </dui-dialog-actions>
                </ng-container>
            </dui-dialog>

            <dui-dropdown #labelDropdown>
                <dui-dropdown-item [disabled]="!selected.length" (click)="newLabel()">New label</dui-dropdown-item>
                <dui-dropdown-item
                    [disabled]="!selected.length"
                    *ngFor="let label of project.experimentLabels"
                    (click)="toggleLabel(label.id)">
                    <dk-label [label]="label.label"></dk-label>
                </dui-dropdown-item>
            </dui-dropdown>

            <dui-dropdown #helpDropdown>
                <div style="padding: 5px;">
                    The search allows you to enter complex expressions.<br/>
                    You can access all experiment data like config values, information values,
                    and metrics.

                    <p>
                        Valid operators:
                        <code>=</code>, <code>!=</code>,
                        <code>&gt;</code>, <code>&gt;=</code>,
                        <code>&lt;</code>, <code>&lt;=</code>,
                        <code>~</code> (contains),
                    </p>

                    <h4>Examples</h4>
                    <ul style="margin: 0 5px;">
                        <li>
                            <code>iteration &gt; 3 and (accuracy.training &gt; 0.85 or accuracy.validation &gt;
                                0.80)</code>
                        </li>
                        <li><code>description ~ "k80"</code> (description contains "k80")</li>
                        <li><code>labels ~ "tf"</code> (at least one label contains "tf")</li>
                        <li><code>34 55</code> (two experiments with id #34 and #55)</li>
                        <li><code>status = done or status = aborted</code></li>
                    </ul>

                    <h4 style="margin-top: 5px;">Available fields</h4>

                    <dui-dropdown-splitter></dui-dropdown-splitter>
                    <dui-dropdown-item (click)="addToSearch('id')">id</dui-dropdown-item>
                    <dui-dropdown-item (click)="addToSearch('description')">description</dui-dropdown-item>
                    <dui-dropdown-item (click)="addToSearch('iteration')">iteration (aka epoch)</dui-dropdown-item>
                    <dui-dropdown-item (click)="addToSearch('iterations')">iterations (aka epochs)</dui-dropdown-item>
                    <dui-dropdown-item (click)="addToSearch('step')">step (aka batch)</dui-dropdown-item>
                    <dui-dropdown-item (click)="addToSearch('steps')">steps (aka batches)</dui-dropdown-item>
                    <dui-dropdown-item (click)="addToSearch('speed')">speed</dui-dropdown-item>
                    <dui-dropdown-item (click)="addToSearch('status')">status</dui-dropdown-item>
                    <dui-dropdown-item (click)="addToSearch('labels')">labels</dui-dropdown-item>
                    <dui-dropdown-item (click)="addToSearch('configFile')">configFile</dui-dropdown-item>
                    <dui-dropdown-item (click)="addToSearch('runOnCluster')">runOnCluster</dui-dropdown-item>
                    <dui-dropdown-splitter></dui-dropdown-splitter>
                    <dui-dropdown-item
                        (click)="addToSearch(name)"
                        *ngFor="let name of availableChannelNames">{{name}}</dui-dropdown-item>
                    <dui-dropdown-splitter></dui-dropdown-splitter>
                    <dui-dropdown-item
                        (click)="addToSearch('config.' + name)"
                        *ngFor="let name of availableHyperParameterNames">config.{{name}}</dui-dropdown-item>
                    <dui-dropdown-splitter></dui-dropdown-splitter>
                    <dui-dropdown-item
                        (click)="addToSearch('info.' + name)"
                        *ngFor="let name of availableInformationNames">info.{{name}}</dui-dropdown-item>
                </div>
            </dui-dropdown>

            <dui-button-groups [class.width-left-actions]="!readOnly">
                <dui-button-group padding="none" *ngIf="!readOnly">
                    <dui-button textured [disabled]="!selected.length" (click)="deleteSelectedJobs()"
                                icon="garbage"></dui-button>
                    <!--                <dui-button textured (click)="compareSelectedJobs()" icon="compare"></dui-button>-->
                    <dui-button textured [disabled]="!selected.length" icon="flag"
                                [openDropdown]="labelDropdown"></dui-button>
                </dui-button-group>

                <dui-button-group float="right">
                    <dui-input lightFocus semiTransparent round clearer class="search" icon="search"
                               style="width: 250px;"
                               [(ngModel)]="filter.query"
                               [maxlength]="10000"
                               (ngModelChange)="search($event)"
                               placeholder="Search: id > 54 and accuracy.validation > 0.85"></dui-input>
                    <dui-icon clickable [openDropdown]="helpDropdown" name="help"></dui-icon>
                    <dui-checkbox [(ngModel)]="filter.alive" (ngModelChange)="filterJobs(); triggerFilterChange();">
                        Alive
                    </dui-checkbox>

                    <dui-button-group padding="none">
                        <!--                        <dui-select textured [ngModel]="undefined">-->
                        <!--                            <dui-option [value]="undefined">Group</dui-option>-->
                        <!--                        </dui-select>-->

                        <dui-select textured [(ngModel)]="filter.label" (ngModelChange)="filterJobs(); triggerFilterChange();">
                            <dui-option [value]="undefined">Labels: All</dui-option>

                            <dui-option [value]="label.id" *ngFor="let label of project.experimentLabels">
                                <div *dynamicOption style="white-space: nowrap">
                                    {{label.label}} <span style="color: var(--text-gray2);">({{labelCounts[label.id]}}
                                    )</span>
                                </div>
                            </dui-option>
                        </dui-select>

                        <dui-select textured [(ngModel)]="filter.status" (ngModelChange)="filterJobs(); triggerFilterChange();">
                            <dui-option [value]="undefined">Status: All</dui-option>
                            <dui-option [value]="JobStatus.creating">Creating</dui-option>
                            <dui-option [value]="JobStatus.created">Created</dui-option>
                            <dui-option [value]="JobStatus.running">Running</dui-option>
                            <dui-option [value]="JobStatus.done">Done</dui-option>
                            <dui-option [value]="JobStatus.aborted">Aborted</dui-option>
                            <dui-option [value]="JobStatus.failed">Failed</dui-option>
                            <dui-option [value]="JobStatus.crashed">Crashed</dui-option>
                        </dui-select>
                        <dui-select textured [(ngModel)]="filter.author" (ngModelChange)="filterJobs(); triggerFilterChange();">
                            <dui-option [value]="undefined">Author: All</dui-option>

                            <dui-option
                                *ngFor="let author of availableAuthors"
                                [value]="author">
                                <dk-user-small [showImage]="false" [userId]="author"></dk-user-small>
                            </dui-option>
                        </dui-select>
                        <dui-button textured icon="arrow_down" [openDropdown]="savedFilterDropdown"></dui-button>
                    </dui-button-group>
                </dui-button-group>
            </dui-button-groups>

            <dui-dropdown #savedFilterDropdown>
                <ng-container *ngIf="!readOnly">
                    <dui-button-group style="margin: 5px">
                        <dui-input lightFocus semiTransparent round placeholder="Quick filter name"
                                   (enter)="addFilter()"
                                   [(ngModel)]="filterName"></dui-input>
                        <dui-button (click)="addFilter()">Add</dui-button>
                    </dui-button-group>
                    <dui-dropdown-splitter></dui-dropdown-splitter>
                </ng-container>
                <div *ngIf="project.filters.length == 0" style="padding: 5px 5px; color: var(--text-gray2)">
                    No quick filters created yet.
                </div>
                <ng-container *ngIf="project.filters.length > 0">
                    <dui-dropdown-item *ngFor="let f of project.filters"
                                       (click)="loadFilter(f)"
                                       [selected]="filter.getChecksum() === f.getChecksum()"
                    >
                        <div style="display: flex; width: 100%;">
                            <div style="flex: 1;">
                                {{f.name}}
                            </div>
                            <div style="flex: 0; margin-left: auto;" *ngIf="!readOnly">
                                <dui-icon clickable confirm="Really delete quick filter?"
                                          (click)="deleteFilter(filter)" name="garbage"></dui-icon>
                            </div>
                        </div>
                    </dui-dropdown-item>
                </ng-container>
                <dui-dropdown-splitter></dui-dropdown-splitter>
                <dui-dropdown-item (click)="resetAllFilter()">Reset all</dui-dropdown-item>
            </dui-dropdown>

            <dui-table
                [items]="filteredJobs"
                (sortedChange)="jobsSorted.emit($event)"
                [selectable]="true"
                [multiSelect]="true"
                [(selected)]="selected" (selectedChange)="jobsSelected.emit($event)"
                (dbclick)="openJob($event)"
                defaultSort="number"
                noFocusOutline
                defaultSortDirection="desc"
                [valueFetcher]="valueFetcher"
                [itemHeight]="36"
                [borderless]="full"
                #table
            >
                <dui-dropdown duiTableCustomRowContextMenu>
                    <dui-dropdown-item [disabled]="!selected.length" (click)="openJob(selected[0])">Open
                    </dui-dropdown-item>
                    <ng-container *ngIf="!readOnly">
                        <dui-dropdown-item *ngIf="selected.length === 1" (click)="describe()">Describe
                        </dui-dropdown-item>
                        <dui-dropdown-splitter></dui-dropdown-splitter>

                        <dui-dropdown-item (click)="newLabel()">New label</dui-dropdown-item>

                        <dui-dropdown-item
                            [disabled]="!selected.length"
                            *ngFor="let label of project.experimentLabels"
                            (click)="toggleLabel(label.id)">Label
                            <span class="labels" style="margin-left: 5px;">
                                {{label.label}}
                            </span>
                        </dui-dropdown-item>

                        <dui-dropdown-splitter></dui-dropdown-splitter>
                        <dui-dropdown-item
                            [disabled]="!selected.length"
                            (click)="moveSelectedToList(null)">
                            Move to default
                        </dui-dropdown-item>

                        <dui-dropdown-item
                            [disabled]="!selected.length"
                            *ngFor="let list of project.experimentLists"
                            (click)="moveSelectedToList(list.id)">
                            Move to {{list.name}}
                        </dui-dropdown-item>

                        <dui-dropdown-splitter></dui-dropdown-splitter>
                        <dui-dropdown-item [disabled]="!selected.length" (click)="stopSelectedJobs()">Stop
                        </dui-dropdown-item>
                        <dui-dropdown-item [disabled]="!selected.length" (click)="deleteSelectedJobs()">Delete
                        </dui-dropdown-item>
                    </ng-container>
                </dui-dropdown>

                <dui-dropdown duiTableCustomHeaderContextMenu>
                    <dui-dropdown-item (click)="startManageColumns(manageColumns)">Manage columns</dui-dropdown-item>
                    <dui-dropdown-item (click)="resetColumnsToDefault()">Reset columns</dui-dropdown-item>

                    <dui-dropdown-splitter></dui-dropdown-splitter>

                    <dui-dropdown-item
                        *ngFor="let column of table.sortedColumnDefs; trackBy: table.trackByColumn"
                        [selected]="!column.isHidden()"
                        (click)="column.toggleHidden(); table.sortColumnDefs();"
                    >
                        <ng-container *ngIf="!table.headerMapDef[column.name]">
                            {{column.header || column.name}}
                        </ng-container>
                        <ng-container
                            *ngIf="table.headerMapDef[column.name]"
                            [ngTemplateOutlet]="table.headerMapDef[column.name].template"
                            [ngTemplateOutletContext]="{$implicit: column}"></ng-container>
                    </dui-dropdown-item>
                </dui-dropdown>

                <dui-table-column class="lining" name="number" header="ID" [width]="65">
                    <ng-container *duiTableCell="let job">
                        #{{job.number}}
                    </ng-container>
                </dui-table-column>

                <dui-table-column name="created" header="Created" [width]="160">
                    <ng-container *duiTableCell="let job">
                        {{job.created | dateTime:'day'}}
                        <span style="float: right">
                        {{job.created | dateTime:'time'}}
                    </span>
                    </ng-container>
                </dui-table-column>

                <dui-table-column name="author" header="Author" [width]="90">
                    <ng-container *duiTableCell="let job">
                        <dk-user-small *ngIf="job.user" [userId]="job.user"></dk-user-small>
                    </ng-container>
                </dui-table-column>

                <dui-table-column name="description" header="Description" [width]="90"></dui-table-column>

                <dui-table-column name="config.path" header="Config" [width]="100">
                    <ng-container *duiTableCell="let job">
                        {{job.config.path || 'Script run'}}
                    </ng-container>
                </dui-table-column>

                <dui-table-column name="labels" header="Labels" [width]="80">
                    <ng-container *duiTableCell="let job">
                        <div class="labels">
                            <ng-container *ngFor="let label of project.getExperimentLabels(job.labelIds)">
                                <dk-label [label]="label.label"></dk-label>
                            </ng-container>
                        </div>
                    </ng-container>
                </dui-table-column>

                <dui-table-column name="status" header="Status" [width]="130">
                    <ng-container *duiTableCell="let job">
                        <job-status [job]="job"></job-status>
                        <span>
                        <span *ngFor="let task of job.getQueuedRootTasks()" style="font-size: 11px;">
                            Queued {{task.name}} #{{task.queue.position}}
                        </span>
                    </span>
                    </ng-container>
                </dui-table-column>

                <dui-table-column class="monospace" name="progress" header="Progress" [width]="120">
                    <ng-container *duiTableCell="let job">
                        <div class="progress monospace">
                            {{job.iteration}}/{{job.iterations}}
                            <div *ngIf="job.steps" [style.width.%]="job.step/job.steps * 100"></div>
                        </div>
                    </ng-container>
                </dui-table-column>

                <dui-table-column class="lining monospace" name="time" header="Time" [width]="100">
                    <ng-container *duiTableCell="let job">
                        <div [class.running]="job.isAlive()" *ngIf="job.started">
                            <dk-redraw>
                                <div>
                                    {{job.ended ? ((job.ended - job.started) / 1000 | humanize) : (job.started | humanize_until_now)}}
                                </div>
                            </dk-redraw>
                        </div>
                    </ng-container>
                </dui-table-column>

                <dui-table-column class="lining monospace" name="eta" header="Remaining" [width]="100">
                    <ng-container *duiTableCell="let job">
                        <dk-redraw>
                            <div style="color: var(--text-gray)">
                                {{job.eta | humanize}}
                            </div>
                        </dk-redraw>
                    </ng-container>
                </dui-table-column>

                <dui-table-column class="lining monospace" name="speed" header="Speed" [width]="100">
                    <ng-container *duiTableCell="let job">
                        {{job.speed|number:'0.2-2'}} <span
                        style="color: var(--text-gray)">{{job.speedLabel || 'samples/s'}}</span>
                    </ng-container>
                </dui-table-column>

                <dui-table-column
                    *ngFor="let channelName of filterActiveColumns(availableChannelNames, 'channel.')"
                    [name]="'channel.' + channelName" class="monospace"
                    [header]="getLabelForColumnId('channel.'+channelName)" [width]="150">
                    <ng-container *duiTableCell="let job">
                        {{job.getLastChannelValue(channelName)}}
                    </ng-container>
                </dui-table-column>

                <dui-table-column
                    *ngFor="let name of filterActiveColumns(availableHyperParameterNames, 'config.')"
                    [name]="'parameter.' + name" class="monospace"
                    [header]="'config.' + getLabelForColumnId('parameter.' + name)" [width]="100">
                    <ng-container *duiTableCell="let job">
                        {{job.config.config[name]|json}}
                    </ng-container>
                </dui-table-column>

                <dui-table-column
                    *ngFor="let name of filterActiveColumns(availableInformationNames, 'info.')"
                    [name]="'info.' + name" class="monospace" [header]="'info.' + getLabelForColumnId('info.' + name)"
                    [width]="100">
                    <ng-container *duiTableCell="let job">
                        {{job.infos[name]|json}}
                    </ng-container>
                </dui-table-column>

                <!--            <dui-table-column name="kpi" class="monospace" header="KPI" [width]="150">-->
                <!--                <ng-container *duiTableCell="let job">-->
                <!--                    <div-->
                <!--                            class="channel"-->
                <!--                            *ngIf="job.getKpiChannelName() as kpiName">-->

                <!--                        <div>-->
                <!--                            <div *ngFor="let v of job.channels[kpiName].lastValue">-->
                <!--                                {{v}}-->
                <!--                            </div>-->
                <!--                        </div>-->
                <!--&lt;!&ndash;                        <plotly&ndash;&gt;-->
                <!--&lt;!&ndash;                                style="flex: 1; margin-left: 10px; min-width: 150px; height: 24px;"&ndash;&gt;-->
                <!--&lt;!&ndash;                                [layout]="channelLayout" [trace]="getJobChannelTrace(job)"&ndash;&gt;-->
                <!--&lt;!&ndash;                                [config]="channelConfig"></plotly>&ndash;&gt;-->
                <!--                    </div>-->
                <!--                </ng-container>-->
                <!--            </dui-table-column>-->
            </dui-table>

            <div class="tabs-container">
                <div class="tabs">
                    <dui-tab-button [active]="!filter.list" (click)="loadList(undefined)">Default</dui-tab-button>
                    <dui-tab-button [active]="filter.list === 'ci'" (click)="loadList('ci')">CI</dui-tab-button>

                    <ng-container
                        *ngFor="let list of project.experimentLists"
                    >
                        <dui-input
                            focus lightFocus round
                            style="width: 70px;"
                            *ngIf="activeListEditing[list.id] !== undefined"
                            [(ngModel)]="activeListEditing[list.id]"
                            (esc)="activeListEditing[list.id] = undefined"
                            (focusChange)="$event === false ? (activeListEditing[list.id] = undefined) : undefined"
                            (enter)="saveListEdit(list.id, activeListEditing[list.id])"
                        ></dui-input>

                        <dui-tab-button
                            *ngIf="activeListEditing[list.id] === undefined"
                            (click)="loadList(list.id)"
                            [active]="list.id === filter.list" (dblclick)="activeListEditing[list.id] = list.name">
                            {{list.name}}
                        </dui-tab-button>
                    </ng-container>
                    <dui-tab-button (click)="addList()" *ngIf="!readOnly">
                        <dui-icon name="add"></dui-icon>
                    </dui-tab-button>
                </div>
                <div *ngIf="jobs" class="tabs-jobs-count">
                    <ng-container *ngIf="filteredJobs.length !== jobs.count()">
                        {{filteredJobs.length}} / {{jobs.count()}} experiment{{filteredJobs.length === 1 ? '' : 's'}}
                    </ng-container>
                    <ng-container *ngIf="filteredJobs.length === jobs.count()">
                        {{filteredJobs.length}} experiment{{filteredJobs.length === 1 ? '' : 's'}}
                    </ng-container>
                </div>
            </div>

            <ng-container *ngIf="progress">
                <ng-container *ngIf="progress|throttle|asyncRender as p">
                    <div class="loading" [class.visible]="!p.done">
                        <dui-indicator [step]="p.progress"></dui-indicator>
                    </div>
                </ng-container>
            </ng-container>
        </ng-container>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        '[class.full]': 'full !== false'
    },
    styleUrls: ['./jobs-list.component.scss'],
})
export class JobsListComponent implements OnInit, OnChanges, OnDestroy {
    JobStatus = JobStatus;

    @Input() full = false;
    @Input() project$!: EntitySubject<Project>;
    @Input() readOnly: boolean = false;

    @Input() selected: Job[] = [];
    @Output() jobsSelected: EventEmitter<Job[]> = new EventEmitter;

    @Input() filter: ProjectJobListFilter = new ProjectJobListFilter();
    @Output() filterChange: EventEmitter<ProjectJobListFilter> = new EventEmitter;

    @Output() load: EventEmitter<Job[]> = new EventEmitter;

    @Output() listChanged: EventEmitter<Job[]> = new EventEmitter;

    @Output() jobsSorted: EventEmitter<Job[]> = new EventEmitter;

    @Output() open: EventEmitter<EntitySubject<Job>> = new EventEmitter;

    @observe({unsubscribe: true})
    public jobs?: Collection<Job>;

    public jobsLoadedProjectId?: string;
    public jobsLoadedList?: string;

    public progress?: Progress;

    public searchFilter = new Search<Job>(this.searchGetter.bind(this));

    public defaultColumns = [
        'id', 'created', 'author', 'description', 'config', 'labels', 'status', 'progress', 'time', 'eta', 'speed'
    ];

    public activatedColumns: string[] = this.defaultColumns.slice(0);

    public copiedActivatedColumns: string[] = [];

    public filteredJobs: Job[] = [];

    public activeListEditing: { [id: string]: string } = {};

    public lastLabel: string = '';
    public labelCounts: { [id: string]: number } = {};

    public availableAuthors = new Set<string>();
    public channelTraceNames: { [channelName: string]: string[] } = {};
    public availableChannelNames = new Set<string>();
    public availableHyperParameterNames = new Set<string>();
    public availableInformationNames = new Set<string>();

    @ViewChild(TableComponent, {static: false}) table?: TableComponent<Job>;

    @unsubscribe()
    private subs = new Subscriptions();

    public kpiChannels: { [jobId: string]: Observable<ObservableTrace> | undefined } = {};

    public channelConfig = new BehaviorSubject<Partial<Config>>({
        displayModeBar: false,
    });

    public channelLayout: BehaviorSubject<Partial<Layout>> = new BehaviorSubject<Partial<Layout>>({
        height: 30,
        yaxis: {
            visible: false,
            showline: false,
        },
        showlegend: false,
        margin: {
            t: 0,
            l: 0,
            r: 0,
            b: 0,
        }
    });

    filterName: string = '';

    public valueFetcher = (object: Job, path: string): any => {
        if (path.startsWith('channel.')) {
            return object.getLastChannelValue(path.substr('channel.'.length));
        }

        if (path.startsWith('config.')) {
            return object.config.config[path.substr('config.'.length)];
        }

        if (path.startsWith('info.')) {
            return object.infos[path.substr('info.'.length)];
        }

        if (path === 'time') {
            if (object.started) {
                return (object.ended ? object.ended.getTime() : Date.now()) - object.started.getTime();
            }
        }

        if (path === 'progress') {
            return object.iteration;
        }

        if (path === 'config') {
            return object.config.path;
        }

        return (object as any)[path];
    }

    constructor(
        private controllerClient: ControllerClient,
        private dialog: DuiDialog,
        private cd: ChangeDetectorRef,
    ) {
        // this.cd.detach();
        if (this.filter.query) {
            this.searchFilter.parse(this.filter.query);
        }
    }

    addToSearch(name: string) {
        this.filter.query += ' ' + name;
        this.searchFilter.parse(this.filter.query);
        this.filterJobs();
        this.triggerFilterChange();
    }

    resetAllFilter() {
        this.filter.reset();
        this.searchFilter.reset();
        this.searchFilter.parse(this.filter.query);
        this.filterJobs();
        this.triggerFilterChange();
    }

    async deleteFilter(filter: ProjectJobListFilter) {
        await this.controllerClient.project().deleteFilter(this.project$.id, filter.id);
    }

    async addFilter() {
        if (!this.project$) return;

        if (!this.filterName) return;

        const filter = cloneClass(this.filter);
        filter.id = uuid();
        filter.name = this.filterName;
        this.filterName = '';

        await this.controllerClient.project().addFilter(this.project$.id, filter);
    }

    loadFilter(filter: ProjectJobListFilter) {
        this.filter = cloneClass(filter);
        delete this.filter.id;
        delete this.filter.name;
        this.searchFilter.reset();
        if (this.filter.query) this.searchFilter.parse(this.filter.query);
        this.filterJobs();
        this.triggerFilterChange();
    }

    triggerFilterChange() {
        this.filterChange.next(this.filter);
    }

    public async newLabel() {
        const a = await this.dialog.prompt('Label name', '');
        if (a && a.trim()) {
            const labelId = await this.controllerClient.project().addExperimentLabel(this.project$.id, a.trim());
            this.toggleLabel(labelId);
        }
    }

    public async saveListEdit(id: string, name: string) {
        if (!name.trim()) return;
        await this.controllerClient.project().changeExperimentListName(this.project$.id, id, name);
        delete this.activeListEditing[id];
        this.cd.detectChanges();
    }

    public async addList() {
        if (!this.project$.value) return;
        const a = await this.dialog.prompt('List name', '');
        if (a) {
            await this.controllerClient.project().addExperimentList(this.project$.id, a);
        }
    }

    public async describe() {
        const a = await this.dialog.prompt('Description', this.selected[0].description);
        if (a !== false) {
            await this.controllerClient.app().patchJob(this.selected[0].id, {description: a});
        }
    }

    public isColumnActive(id: string) {
        return -1 !== this.activatedColumns.indexOf(id);
    }

    resetManageColumns(dialog: DialogComponent) {
        this.activatedColumns = this.copiedActivatedColumns.slice(0);
        dialog.close();
    }

    applyManageColumns(dialog: DialogComponent) {
        localStorage.setItem('deepkit/jobs/columns/' + this.project$.id, JSON.stringify(this.activatedColumns));
        dialog.close();
    }

    startManageColumns(dialog: DialogComponent) {
        this.copiedActivatedColumns = this.activatedColumns.slice(0);
        dialog.show();
    }

    resetColumnsToDefault() {
        this.activatedColumns = this.defaultColumns.slice(0);
    }

    public toogleActiveColumn(id: string) {
        const index = this.activatedColumns.indexOf(id);
        if (index === -1) {
            this.activatedColumns.push(id);
        } else {
            this.activatedColumns.splice(index, 1);
        }
    }

    public filterActiveColumns(ids: string[] | Set<string>, prefix = ''): string[] | undefined {
        const items = [...ids].filter(v => -1 !== this.activatedColumns.indexOf(prefix + v));

        return items.length ? items : undefined;
    }

    public traceId(name: string): [string, number] {
        const index = name.lastIndexOf('.');
        if (-1 === index) {
            return [name, 0];
        }

        return [
            name.substr(0, index),
            parseInt(name.substr(index + 1), 10)
        ];
    }

    public getLabelForColumnId(id: string): string {
        const general: { [name: string]: string } = {
            'id': 'ID',
            'created': 'Created',
            'author': 'Author',
            'config': 'Config',
            'labels': 'Labels',
            'status': 'Status',
            'progress': 'Progress',
            'time': 'Time',
            'eta': 'ETA',
        };

        if (general[id]) return general[id];


        if (id.startsWith('channel.')) {
            const pair = this.traceId(id.substr('channel.'.length));
            if (this.channelTraceNames[pair[0]] && this.channelTraceNames[pair[0]].length > 1) {
                return pair[0] + '.' + this.channelTraceNames[pair[0]][pair[1]];
            }
            return pair[0];
        }

        if (id.startsWith('info.')) return id.substr('info.'.length);
        if (id.startsWith('parameter.')) return id.substr('parameter.'.length);

        return id;
    }

    ngOnInit() {
    }

    public loadList(id: undefined | string) {
        if (this.filter.list === id) return;
        this.filter.list = id;
        this.ngOnChanges({});
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (changes.project$) {
            if (this.project$.value && this.filter.list && this.filter.list !== 'ci' && !this.project$.value.hasExperimentList(this.filter.list)) {
                this.filter.list = undefined;
            }
            if (changes.project$.previousValue) {
                localStorage.setItem('deepkit/jobs/columns/' + changes.project$.previousValue.id, JSON.stringify(this.activatedColumns));
            }
        }

        if (this.filter.query) {
            this.searchFilter.parse(this.filter.query);
        } else {
            this.searchFilter.reset();
        }

        const loadForProject = this.project$.id;
        const loadForList = this.filter.list;

        if (this.jobsLoadedList !== loadForList || this.jobsLoadedProjectId !== loadForProject) {
            const start = Date.now();
            if (this.jobs) {
                this.jobs.unsubscribe();
            }
            this.progress = ClientProgress.trackDownload();
            this.jobs = await this.controllerClient.app().getJobs(loadForProject, loadForList);
            console.debug('loading jobs took', Date.now() - start, 'ms for', this.jobs.count(), 'items');

            if (!this.project$ || this.project$.id !== loadForProject) return;
            if (this.filter.list !== loadForList) return;

            this.jobsLoadedProjectId = loadForProject;
            this.jobsLoadedList = loadForList;

            this.selected = [];
            this.load.emit(this.jobs!.all());
            this.jobs!.subscribe(() => {
                this.listChanged.emit(this.jobs!.all());
            });
            this.jobs!.pipe(auditTime(100)).subscribe(() => {
                this.filterJobs();
            });

            try {
                this.activatedColumns = JSON.parse(localStorage.getItem('deepkit/jobs/columns/' + this.project$.id)!) || [];
            } catch (error) {
            }

            if (!this.activatedColumns || !this.activatedColumns.length) {
                this.activatedColumns = this.defaultColumns;
            }
        }

        this.filteredJobs = [];

        if (changes.project) {
            this.lastLabel = '';
            this.labelCounts = {};
            this.filter.label = undefined;
            this.filter.status = undefined;
            this.filter.author = undefined;
            this.availableAuthors.clear();
            this.availableChannelNames.clear();
        }
        this.filterJobs();
    }

    public search(query: string) {
        if (query) {
            this.searchFilter.parse(query);
        } else {
            this.searchFilter.reset();
        }
        this.filterJobs();
        this.triggerFilterChange();
    }

    public searchGetter(job: Job, path: string): any {
        if (!path) {
            return [job.id, job.number, job.description];
        }

        const [first, second] = path.split('.');

        if (path === 'labels' || path === 'label') {
            if (this.project$ && job.labelIds.length) {
                return this.project$.value.getExperimentLabels(job.labelIds).map(l => l.label);
            }
            return [];
        }

        if (job.channels[path] && job.channelLastValues[path]) {
            return job.channelLastValues[path][0];
        }

        if (job.channels[first]) {
            return job.getLastChannelValue(path);
        }

        if (first === 'config') {
            return job.config.config[second];
        }

        if (first === 'info') {
            return job.infos[second];
        }

        if (path === 'configFile') {
            return job.config.path;
        }

        if (path === 'progress') {
            return job.iteration;
        }

        if (path === 'epoch') {
            return job.iteration;
        }

        if (path === 'epochs') {
            return job.iterations;
        }

        if (path === 'id') {
            return job.number;
        }

        if (path === 'status') {
            return JobStatus[job.status];
        }

        return (job as any)[path];
    }

    public filterJobs() {
        this.filteredJobs = [];
        this.labelCounts = {};
        this.channelTraceNames = {};
        this.availableAuthors.clear();
        this.availableChannelNames.clear();
        this.availableHyperParameterNames.clear();
        this.availableInformationNames.clear();

        (window as any)['jobs'] = this.jobs!.all();

        for (const job of this.jobs!.all()) {
            if (job.user) {
                this.availableAuthors.add(job.user);
            }

            for (const labelId of job.labelIds) {
                if (!this.labelCounts[labelId]) {
                    this.labelCounts[labelId] = 1;
                } else {
                    this.labelCounts[labelId]++;
                }
            }


            const channelNames = Object.keys(job.channels);
            for (let i = 0; i < channelNames.length; i++) {
                const name = channelNames[i];
                const channel = job.channels[channelNames[i]];

                const traces = channel.traces.length || 1;
                if (!this.channelTraceNames[name]) {
                    this.channelTraceNames[name] = [];
                }

                for (let i = 0; i < traces; i++) {
                    this.channelTraceNames[name][i] = channel.traces[i];
                    this.availableChannelNames.add(name + '.' + i);
                }
            }

            Object.keys(job.config.config).map(v => this.availableHyperParameterNames.add(v));
            Object.keys(job.infos).map(v => this.availableInformationNames.add(v));


            if (this.searchFilter.compare && !this.searchFilter.compare(job)) {
                continue;
            }

            if (this.filter.label !== undefined && -1 === job.labelIds.indexOf(this.filter.label)) {
                continue;
            }

            if (this.filter.status !== undefined && job.status !== this.filter.status) {
                continue;
            }

            if (this.filter.author !== undefined && job.user !== this.filter.author) {
                continue;
            }

            if (this.filter.alive && job.connections <= 0) {
                continue;
            }

            this.filteredJobs.push(job);
        }

        detectChangesNextFrame(this.cd);
    }

    public moveSelectedToList(listId: string | 'ci' | null) {
        for (const job of this.selected) {
            if (listId === 'ci') {
                this.controllerClient.app().patchJob(job.id, {list: null, ci: true});
            } else {
                this.controllerClient.app().patchJob(job.id, {list: listId, ci: false});
            }
        }
    }

    public toggleLabel(labelId: string) {
        this.lastLabel = labelId;

        const oneUsedThatLabel = this.selected.some(v => v.labelIds.indexOf(labelId) !== -1);

        const patches: { [jobId: string]: string[] } = {};

        for (const job of this.selected) {
            if (oneUsedThatLabel) {
                //we remove it everywhere
                arrayRemoveItem(job.labelIds, labelId);
                patches[job.id] = job.labelIds;
            } else {
                if (-1 === job.labelIds.indexOf(labelId)) {
                    job.labelIds.push(labelId);
                    patches[job.id] = job.labelIds;
                }
            }
        }

        for (const [id, labelIds] of eachPair(patches)) {
            this.controllerClient.app().patchJob(id, {labelIds});
        }
    }

    // public getJobChannelTrace(job: Job): Observable<ObservableTrace> | undefined {
    //     if (!this.kpiChannels[job.id]) {
    //         const kpiChannel = job.getKpiChannelName();
    //         if (kpiChannel) {
    //             this.kpiChannels[job.id] = createTraceForJobChannel(this.controllerClient, job, kpiChannel);
    //         }
    //     }
    //
    //     return this.kpiChannels[job.id];
    // }

    ngOnDestroy(): void {
        localStorage.setItem('deepkit/jobs/columns/' + this.project$.id, JSON.stringify(this.activatedColumns));
    }

    public selectAll() {
        this.selected = copy(this.jobs!.all());
    }

    public deselect(id: string) {
        this.table!.deselect(this.jobs!.get(id)!);
    }

    public getSelectedJobIds(): string[] {
        return this.selected.map(v => v.id);
    }

    public async openJob(job: Job) {
        this.open.emit(this.jobs!.getEntitySubject(job));
    }

    @singleStack()
    public async compareSelectedJobs() {
        const jobIds = this.getSelectedJobIds();
        if (empty(jobIds)) {
            return;
        }

        // this.router.navigate(['/experiment/compare/', jobIds.join(',')]);
    }

    @singleStack()
    public async stopSelectedJobs() {
        const jobIds = this.getSelectedJobIds();

        if (empty(jobIds)) {
            return;
        }

        const a = await this.dialog.confirm(`Really stop ${jobIds.length} jobs?`);
        if (a) {
            for (const jobId of jobIds) {
                await this.controllerClient.app().stopJob(jobId);
            }
        }
    }

    @singleStack()
    public async deleteSelectedJobs() {
        const jobIds = this.getSelectedJobIds();

        if (empty(jobIds)) {
            return;
        }

        const a = await this.dialog.confirm(`Really delete ${jobIds.length} jobs?`);
        if (a) {
            const state = this.dialog.progress();
            state.title = `Deleting ${jobIds.length} jobs`;
            state.steps = jobIds.length;

            const sub = (await this.controllerClient.app().deleteJobs(jobIds)).subscribe(() => {
                state.step++;
            }, (error: any) => {
                this.dialog.alert(error);
            }, () => {
                state.close();
            });

            state.closer.subscribe((v) => {
                if (v) {
                    sub.unsubscribe();
                }
            });
        }
    }
}
