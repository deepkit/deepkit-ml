/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    AfterViewInit,
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter,
    Input,
    OnChanges,
    OnDestroy,
    Output,
    SimpleChanges,
    ViewChild
} from "@angular/core";
import {Subscription} from "rxjs";
import {Subscriptions} from "@marcj/estdlib-rxjs";
import {graphlib, layout, Node} from "dagre";
import {DomSanitizer} from "@angular/platform-browser";
import {observe, unsubscribe} from "../../reactivate-change-detection";
import {EntitySubject} from "@marcj/glut-core";
import {Job} from "@deepkit/core";
import {ControllerClient} from "../../providers/controller-client";
import {DuiDialog} from "@marcj/angular-desktop-ui";
import {MainStore} from "../../store";

@Component({
    selector: 'job-task-graph',
    template: `
        <div class="container" *ngIf="job$|async as job">

            <div class="nodes-container"
                 [style.height]="actualHeight + 'px'"
            >
                <div class="nodes"
                     #nodesElement
                     [style.top]="(actualHeight - graphHeight)/2 + 'px'"
                     [style.width]="graphWidth + 'px'"
                     [style.height]="graphHeight + 'px'"
                >
                    <svg
                            [style.width]="graphWidth + 'px'"
                            [style.height]="graphHeight + 'px'">
                        <path
                                *ngFor="let edge of edges"
                                [attr.d]="edge"></path>
                    </svg>
                    <div
                            *ngFor="let node of nodes"
                            [style.left]="(node.x - (nodeWidth/2)) + 'px'"
                            [style.top]="(node.y - (nodeHeight/2)) + 'px'"
                            class="node">

                        <div class="label" [class.help]="!node.isTask">
                            {{node.label}}
                        </div>

                        <ng-container *ngIf="node.isTask">
                            <div class="left">
                                <dk-redraw>
                                    <div>{{job.getTask(node.label).elapsedTime() | humanize}}</div>
                                </dk-redraw>
                                <job-task-status [task$]="job.getTask(node.label)|observe:job$"></job-task-status>
                            </div>

                            <div class="he"
                                 *ngFor="let instance of job.getInstancesFor(node.label); let i = index"
                                 [style.--z-instance]="i"
                                 [class.selected]="node.label === task && taskInstance === instance.id"
                                 [class.started]="instance.isStarted()"
                                 [class.running]="instance.isRunning()"
                                 [class.ended]="instance.isEnded()"
                                 (click)="selectInstance(node.label, instance.id)"
                            >
                                <div class="front"></div>
                                <div class="back"></div>
                                <div class="right"></div>
                                <div class="left"></div>
                                <div class="top"></div>
                                <div class="bottom"></div>
                            </div>
                        </ng-container>

                        <ng-container *ngIf="!node.isTask">
                            <div class="he help"
                                 [style]="getInstanceVariable(0)"
                                 (click)="showTaskHelp()"
                            >
                                <div class="front"></div>
                                <div class="back"></div>
                                <div class="right"></div>
                                <div class="left"></div>
                                <div class="top"></div>
                                <div class="bottom"></div>
                            </div>
                        </ng-container>
                    </div>
                </div>
            </div>

            <div class="inspector">
                <div class="inspector-box" *ngIf="taskInfo">
                    <div>
                        <h4>Task
                            <strong>{{taskInfo.name}}</strong>
                            <job-task-status style="margin-left: 5px;"
                                             [task$]="taskInfo|observe:job$"></job-task-status>
                        </h4>
                    </div>

                    <div class="header">Command</div>

                    <div class="commands monospace">
                        <div *ngFor="let command of taskConfig.commands">{{command.command}}</div>
                    </div>
                </div>

                <div class="instance-inspector inspector-box" *ngIf="instance">
                    <div>
                        <h4>
                            Instance <strong>#{{taskInstance}}</strong>
                            <job-task-instance-status style="margin-left: 5px;"
                                                      [instance$]="instance|observe:job$"></job-task-instance-status>
                        </h4>
                    </div>

                    <div class="label-columns">
                        <div>
                            <div>Started</div>
                            <div class="monospace">{{instance.started|date:'short'}}</div>
                        </div>
                        <div>
                            <div>Elapsed</div>
                            <div class="monospace">{{instance.elapsedTime()|humanize}}</div>
                        </div>
                        <div>
                            <div>CPU cores</div>
                            <div class="monospace">{{instance.assignedResources.cpu}}</div>
                        </div>
                        <div>
                            <div>Memory</div>
                            <div class="monospace">{{instance.assignedResources.memory}} GB</div>
                        </div>
                        <div>
                            <div>GPU cores</div>
                            <div class="monospace">{{instance.assignedResources.gpus.length}}</div>
                        </div>
                        <div>
                            <div>GPU memory</div>
                            <div class="monospace">
                                {{instance.assignedResources.gpus.length ? instance.assignedResources.getGpuMemoryRange() : '0'}}
                                GB
                            </div>
                        </div>
                        <div>
                            <div>Server</div>
                            <div>
                                <ng-container
                                        *ngIf="instance.node; else serverLocalhost"
                                >
                                    <ng-container
                                            *ngIf="store.value.nodes && store.value.nodes.get(instance.node) as node; else serverUnknown">
                                        {{node.name}}
                                    </ng-container>
                                    <ng-template #serverUnknown>Unknown</ng-template>
                                </ng-container>
                                <ng-template #serverLocalhost>Localhost</ng-template>
                            </div>
                        </div>
                        <div>
                            <div>Exit code</div>
                            <div>
                                {{instance.exitCode === undefined ? 'pending' : instance.exitCode}}
                            </div>
                        </div>
                    </div>

                    <div *ngIf="instance.error" class="text-selection" style="color: var(--color-red)">
                        {{instance.error}}
                    </div>

                    <div style="padding: 15px 0;" *ngIf="instance.isDockerPull()">
                        <div>Docker pull {{taskConfig.image}}</div>
                        <table style="width: 100%; font-size: 10px;">
                            <tr *ngFor="let kv of instance.dockerPullStats|keyvalue">
                                <td style="width: 105px" class="monospace">{{kv.key}}</td>
                                <td style="width: 105px" class="monospace">
                                    {{kv.value.status}}
                                </td>
                                <td>
                                    <dk-progress-bar [height]="10"
                                                     [value]="kv.value.current / kv.value.total"></dk-progress-bar>
                                </td>
                            </tr>
                        </table>
                    </div>

                    <job-task-hardware-graph
                            [job$]="job$"
                            [taskName]="task"
                            [replica]="taskInstance">
                    </job-task-hardware-graph>
                </div>
            </div>
        </div>

        <!--        <div class="logs" *ngIf="fileContentSubject">{{fileContentSubject|async}}</div>-->
    `,
    styleUrls: ['./job-task-graph.component.scss']
})
export class JobTaskGraphComponent implements OnChanges, AfterViewInit, OnDestroy {
    @Input()
    @observe()
    public job$!: EntitySubject<Job>;

    @Input()
    public task?: string;

    @Input()
    public taskInstance?: number;

    @Output()
    public taskChange = new EventEmitter<string>();

    @Output()
    public taskInstanceChange = new EventEmitter<number>();

    @unsubscribe()
    private subs = new Subscriptions();

    @unsubscribe()
    private jobSubscription = new Subscription();

    @ViewChild('nodesElement', {static: false}) nodesElement?: ElementRef;

    public nodes: Node[] = [];
    public edges: string[] = [];
    public graphWidth = 0;
    public graphHeight = 0;

    //dimensions after transformation applied
    public actualHeight = 0;
    public actualWidth = 0;

    public nodeWidth = 100;
    public nodeHeight = 75;

    // @observe({unsubscribe: true})
    // public fileContentSubject?: StreamBehaviorSubject<string | undefined>;

    constructor(
        private cd: ChangeDetectorRef,
        private sanitizer: DomSanitizer,
        private controllerClient: ControllerClient,
        private dialog: DuiDialog,
        public store: MainStore,
    ) {
    }

    ngAfterViewInit(): void {
    }

    ngOnDestroy(): void {
    }

    showTaskHelp(): void {
        this.dialog.alert('Task pipeline', 'Here comes a little more text to explain the user that Deepkit supports pipelines.');
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (!changes.job$) return;
        this.nodes = [];
        this.edges = [];

        this.subs.unsubscribe();

        const last = this.job$.value.getLatestTaskInstance();
        this.task = last.task;
        this.taskInstance = last.instance;

        const job = this.job$.value;

        const g = new graphlib.Graph({directed: true, compound: true, multigraph: false});
        g.setGraph({
            nodesep: 100,
            ranksep: 100,
            // ranker: 'tight-tree',
            // rankdir: 'BT',
            // align: 'UR'
        });
        g.setDefaultEdgeLabel(function () {
            return {};
        });

        const width = this.nodeWidth;
        const height = this.nodeHeight;

        const tasks = job.getAllTaskConfigs();
        tasks.reverse();

        for (const task of job.getAllTaskConfigs()) {
            g.setNode(task.name, {isTask: true, label: task.name, width: width, height: height});
        }

        for (const task of tasks) {
            for (const dependsOn of task.depends_on) {
                g.setEdge(dependsOn, task.name);
            }
        }

        if (tasks.length === 1) {
            const lastTask = tasks[0];
            //add helper boxes, to explain users what's possible
            g.setNode('__deepkit_start', {help: true, label: 'Pre-Processing', width, height});
            g.setNode('__deepkit_end', {help: true, label: 'Verifying', width, height});

            g.setEdge('__deepkit_start', lastTask.name);
            g.setEdge(lastTask.name, '__deepkit_end');
        }

        layout(g);

        this.graphWidth = 0;
        this.graphHeight = 0;
        for (const nodeName of g.nodes()) {
            const node = g.node(nodeName);
            if (node.width + (node.x - (width / 2)) > this.graphWidth) {
                this.graphWidth = node.width + (node.x - (width / 2));
            }
            if (node.height + (node.y - (height / 2)) > this.graphHeight) {
                this.graphHeight = node.height + (node.y - (height / 2));
            }
            this.nodes.push(node);
        }

        for (const edge of g.edges()) {
            const points = g.edge(edge).points;
            const d: string[] = [];
            d.push('M ' + (points[0].x + 0.5) + ',' + (points[0].y + 0.5));
            for (let i = 1; i < points.length; i++) {
                d.push('L ' + (points[i].x + 0.5) + ',' + (points[i].y + 0.5));
            }
            this.edges.push(d.join(' '));
        }

        this.cd.detectChanges();
        const rect = this.nodesElement!.nativeElement.getBoundingClientRect();
        this.actualHeight = rect.height;
        this.actualWidth = rect.width;
        this.cd.detectChanges();
    }

    get taskInfo() {
        if (this.job$ && this.task) {
            return this.job$.value.getTask(this.task);
        }
    }
    get taskConfig() {
        if (this.job$ && this.task) {
            return this.job$.value.getTaskConfig(this.task);
        }
    }

    get instance() {
        if (this.job$ && this.task && this.taskInstance !== undefined) {
            return this.job$.value.getInstanceFor(this.task, this.taskInstance);
        }
    }

    public selectInstance(taskName: string, instanceId: number) {
        this.task = taskName;
        this.taskInstance = instanceId;
        this.taskChange.emit(this.task);
        this.taskInstanceChange.emit(this.taskInstance);
        this.cd.detectChanges();
    }

    public getInstanceVariable(i: number) {
        return this.sanitizer.bypassSecurityTrustStyle('--z-instance: ' + i);
    }
}
