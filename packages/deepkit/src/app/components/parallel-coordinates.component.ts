/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {AfterViewInit, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, SimpleChanges,} from "@angular/core";
import {JobsListComponent} from "./jobs-list.component";
import {BehaviorSubject, ReplaySubject, Subscription} from "rxjs";
import {Config, Layout} from "plotly.js";
import {createAndReactTrace, ReactTrace} from "./plotly.component";
import {Project} from "@deepkit/core";

@Component({
    selector: 'dk-parallel-coordinates',
    template: `
        <div class="left">
            <plotly *duiView="!!selectedParallelColumnsSorted.length" class="full" [layout]="graphLayout" [config]="graphConfig"
                    [react]="parallelGraph"></plotly>
        </div>

        <div class="right">
            <dui-dropdown #dropdown>
                <dui-dropdown-item [closeOnClick]="false" (click)="toggleParallelColumn(name)"
                                   [selected]="isParallelColumn(name)"
                                   *ngFor="let name of defaultParallelColumns">{{name}}</dui-dropdown-item>

                <dui-dropdown-splitter></dui-dropdown-splitter>
                <dui-list-title>Metrics</dui-list-title>

                <dui-dropdown-item [closeOnClick]="false"
                                   (click)="toggleParallelColumn('channel.' + name)"
                                   [selected]="isParallelColumn('channel.' + name)"
                                   *ngFor="let name of jobList.availableChannelNames">{{jobList.getLabelForColumnId('channel.' + name)}}</dui-dropdown-item>

                <dui-dropdown-splitter></dui-dropdown-splitter>
                <dui-list-title>Configuration values</dui-list-title>
                <dui-dropdown-item [closeOnClick]="false"
                                   (click)="toggleParallelColumn('config.' + name)"
                                   [selected]="isParallelColumn('config.' + name)"
                                   *ngFor="let name of jobList.availableHyperParameterNames">{{name}}</dui-dropdown-item>

                <dui-dropdown-splitter></dui-dropdown-splitter>
                <dui-list-title>Information</dui-list-title>
                <dui-dropdown-item [closeOnClick]="false"
                                   (click)="toggleParallelColumn('info.' + name)"
                                   [selected]="isParallelColumn('info.' + name)"
                                   *ngFor="let name of jobList.availableInformationNames">{{name}}</dui-dropdown-item>
            </dui-dropdown>
            <div style="padding-bottom: 5px; padding-right: 20px; text-align: right">
                <dui-button [openDropdown]="dropdown">Add column</dui-button>
            </div>

            <dui-list class="parallel-selected-columns" cdkDropList
                      (cdkDropListDropped)="parallelDrop($event)">
                <dui-list-item class="parallel-column"
                               *ngFor="let name of selectedParallelColumnsSorted" cdkDrag
                               cdkDragLockAxis="y">
                    <dui-icon name="drag"></dui-icon>
                    <div>{{jobList.getLabelForColumnId(name)}}</div>
                    <dui-icon name="garbage" (click)="toggleParallelColumn(name)"></dui-icon>
                </dui-list-item>
            </dui-list>
        </div>
    `,
    styleUrls: ['./parallel-coordinates.component.scss']
})
export class ParallelCoordinatesComponent implements OnChanges, OnDestroy, AfterViewInit {
    @Input() project!: Project;
    @Input() jobList?: JobsListComponent;

    public defaultParallelColumns = [
        'created', 'author', 'config', 'tags', 'status', 'progress', 'time', 'eta'
    ];

    protected selectedParallelColumns: { [name: string]: boolean } = {};

    public selectedParallelColumnsSorted: string[] = [];

    protected lastGraphFrameRequest: any;

    public graphLayout: BehaviorSubject<Partial<Layout>> = new BehaviorSubject<Partial<Layout>>({
        // xaxis: {
        //     title: 'Bla',
        //     showgrid: false,
        //     visible: false,
        //     autorange: true,
        //     rangemode: 'nonnegative',
        // },
        legend: {},
        xaxis: {},
        yaxis: {},
        margin: {
            // t: 50,
            // r: 50,
            // l: 50,
            // b: 50,
        },
        height: undefined,
        // yaxis: {
        //     showgrid: false,
        //     visible: false,
        // },
        // dragmode: 'pan',
        // showlegend: false
    });

    public graphConfig: BehaviorSubject<Partial<Config>> = new BehaviorSubject<Partial<Config>>({
        displayModeBar: false,
    });
    public parallelGraph = new ReplaySubject<ReactTrace>();

    public dimensions: any[] = [];
    public parallelGraphTrace = createAndReactTrace(this.parallelGraph, 'Test', {
        type: 'parcoords',
        line: {
            color: 'blue'
        },
        dimensions: this.dimensions,
    } as any);

    protected sub = new Subscription();

    constructor(protected cd: ChangeDetectorRef) {
    }

    ngOnDestroy() {
        this.saveLocalStorageColumns(this.project.id);
    }

    protected saveLocalStorageColumns(projectId: string) {
        localStorage.setItem('deepkit/jobs/parallel-columns/' + projectId, JSON.stringify(this.selectedParallelColumnsSorted));
    }

    protected loadLocalStorageColumns() {
        try {
            this.selectedParallelColumnsSorted = JSON.parse(localStorage.getItem('deepkit/jobs/parallel-columns/' + this.project.id)!) || [];
        } catch (error) {}

        this.selectedParallelColumns = {};
        for (const name of this.selectedParallelColumnsSorted) {
            this.selectedParallelColumns[name] = true;
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes.project) {
            if (changes.project.previousValue) {
                this.saveLocalStorageColumns(changes.project.previousValue.id);
            }
            this.loadLocalStorageColumns();
        }

        this.sub.unsubscribe();
        this.sub = this.jobList!.jobsSorted.subscribe(() => {
            this.loadGraph();
        });
        this.loadGraph();
    }

    public parallelDrop(event: { previousIndex: number, currentIndex: number }) {
        const name = this.selectedParallelColumnsSorted[event.previousIndex];
        this.selectedParallelColumnsSorted.splice(event.previousIndex, 1);
        this.selectedParallelColumnsSorted.splice(event.currentIndex, 0, name);

        this.saveLocalStorageColumns(this.project.id);
        this.loadGraph();
        this.cd.detectChanges();
    }

    public toggleParallelColumn(name: string) {
        this.selectedParallelColumns[name] = !this.selectedParallelColumns[name];

        if (this.selectedParallelColumns[name]) {
            this.selectedParallelColumnsSorted.push(name);
        } else {
            const index = this.selectedParallelColumnsSorted.indexOf(name);
            if (-1 !== index) {
                this.selectedParallelColumnsSorted.splice(index, 1);
            }
        }

        this.saveLocalStorageColumns(this.project.id);
        this.loadGraph();
    }

    loadGraph() {
        if (this.lastGraphFrameRequest) {
            cancelAnimationFrame(this.lastGraphFrameRequest);
        }

        this.lastGraphFrameRequest = requestAnimationFrame(() => {
            // const data = {};
            if (!this.jobList) return;
            if (!this.jobList.jobs) return;

            const jobs = this.jobList.jobs.all();
            this.dimensions.splice(0, this.dimensions.length);
            const jobLen = jobs.length;

            for (const name of this.selectedParallelColumnsSorted) {
                let label = name;
                const blockValues: any[] = [];

                for (let i = 0; i < jobLen; i++) {
                    const job = jobs[i];
                    let v = (job as any)[name];
                    if (name.startsWith('channel.')) {
                        label = name.substr('channel.'.length);
                        v = job.getLastChannelValue(label);
                    }

                    if (name.startsWith('config.')) {
                        label = name.substr('config.'.length);
                        v = job.config.config[name.substr('config.'.length)];
                    }

                    if (name.startsWith('info.')) {
                        label = name.substr('info.'.length);
                        v = job.infos[name.substr('info.'.length)];
                    }

                    blockValues.push(v);
                }
                this.dimensions.push({
                    label: label,
                    values: blockValues
                });
            }

            this.parallelGraphTrace.react.next();
        });
    }

    public isParallelColumn(name: string) {
        return !!this.selectedParallelColumns[name];
    }

    ngAfterViewInit() {

    }
}
