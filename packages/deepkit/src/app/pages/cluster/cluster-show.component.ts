/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, Input, OnChanges, SimpleChanges} from "@angular/core";
import {observe, unsubscribe} from "../../reactivate-change-detection";
import {Collection, EntitySubject} from "@marcj/glut-core";
import {Cluster, ClusterNode, getPeerId, Job, NodeResourceReservation} from "@deepkit/core";
import {Subscriptions} from "@marcj/estdlib-rxjs";
import {ControllerClient} from "../../providers/controller-client";
import {average} from "@marcj/estdlib";
import {graphlib, layout, Node} from "dagre";
import {Subscription} from "rxjs";
import {FormGroup} from "@angular/forms";
import {detectChangesNextFrame, DuiDialog, ViewState} from "@marcj/angular-desktop-ui";
import {MainStore, selectEntity} from "../../store";
import {ClusterSettingsDialogComponent} from "../../dialogs/cluster-settings-dialog.component";

@Component({
    selector: 'dk-cluster-show',
    template: `
        <dui-window-toolbar *ngIf="viewState.attached">
            <dui-button-group padding="none" float="right">
                <dui-button textured [highlighted]="showList" (click)="showList = !showList"
                            icon="toggle_bottom"></dui-button>
                <dui-button textured [highlighted]="graphRightShow" (click)="graphRightShow = !graphRightShow"
                            icon="toggle_right"></dui-button>
            </dui-button-group>

            <dui-button-group padding="none">
                <dui-button textured (click)="showEditCluster()" icon="settings"></dui-button>
            </dui-button-group>
        </dui-window-toolbar>

        <div class="top-overview">
            <div class="grid" *ngIf="cluster$|async as cluster">
                <div>
                    <dk-section-header center>RESERVATION</dk-section-header>
                    <div style="display: flex; justify-content: space-between;">
                        <ng-container *ngIf="getCpu(cluster) as cpu">
                            <dk-gauge
                                label="CPU"
                                [current]="cpu.reserved"
                                [total]="cpu.total"
                                affix="cores"
                            ></dk-gauge>
                        </ng-container>

                        <ng-container *ngIf="getMemory(cluster) as memory">
                            <dk-gauge
                                label="MEM"
                                [current]="memory.reserved"
                                [total]="memory.total"
                                affix="GB"
                            ></dk-gauge>
                        </ng-container>

                        <ng-container *ngIf="getGpu(cluster) as gpu">
                            <dk-gauge
                                label="GPU"
                                [current]="gpu.reserved"
                                [total]="gpu.total"
                                affix="cores"
                            ></dk-gauge>
                        </ng-container>
                    </div>
                </div>
                <div *ngIf="getUtilisation(cluster) as util">
                    <dk-section-header>UTILISATION</dk-section-header>
                    <table class="hardware-utilisation">
                        <tr>
                            <td>CPU</td>
                            <td>
                                {{util.cpuCount}}x
                                <span *ngIf="util.cpuHerzRange[0] === util.cpuHerzRange[1]">
                                    {{util.cpuHerzRange[1] / 1024  | number:'1.0-2'}}GHz
                                </span>
                                <span *ngIf="util.cpuHerzRange[0] !== util.cpuHerzRange[1]">
                                    {{util.cpuHerzRange[0] / 1024  | number:'1.0-2'}}
                                    ->{{util.cpuHerzRange[1] / 1024  | number:'1.0-2'}}GHz
                                </span>
                            </td>
                            <td>
                                <dk-progress-bar [height]="12" [value]="util.cpuUtil"></dk-progress-bar>
                            </td>
                        </tr>
                        <tr>
                            <td>MEM</td>
                            <td>{{util.memory | number:'1.0-2'}} GB</td>
                            <td>
                                <dk-progress-bar [height]="12" [value]="util.memoryUtil"></dk-progress-bar>
                            </td>
                        </tr>
                        <tr>
                            <td>GPU</td>
                            <td>
                                {{util.gpuCount}}x
                            </td>
                            <td>
                                <dk-progress-bar [height]="12" [value]="util.gpuUtil"></dk-progress-bar>
                            </td>
                        </tr>
                        <tr>
                            <td>GPU MEM</td>
                            <td>
                                <ng-container *ngIf="util.gpuCount">
                                    | {{util.gpuMemoryRange[0] | number:'.0-0'}}
                                    -> {{util.gpuMemoryRange[1] | number:'.0-0'}}
                                    GB
                                </ng-container>
                            </td>
                            <td>
                                <dk-progress-bar [height]="12" [value]="util.gpuUtil"></dk-progress-bar>
                            </td>
                        </tr>
                    </table>
                    <!--                    <table class="hardware-utilisation">-->
                    <!--                        <tr>-->
                    <!--                            <td>Disk</td>-->
                    <!--                            <td>{{util.diskSize | number:'.0-2'}} GB</td>-->
                    <!--                            <td>-->
                    <!--                                <dk-progress-bar [height]="12" [value]="util.diskUtil"></dk-progress-bar>-->
                    <!--                            </td>-->
                    <!--                        </tr>-->
                    <!--                        <tr>-->
                    <!--                            <td>Network</td>-->
                    <!--                            <td colspan="2">-->
                    <!--                                UP | DOWN-->
                    <!--                            </td>-->
                    <!--                        </tr>-->
                    <!--                        <tr>-->
                    <!--                            <td>Block</td>-->
                    <!--                            <td colspan="2">-->

                    <!--                            </td>-->
                    <!--                        </tr>-->
                    <!--                    </table>-->
                </div>
            </div>
        </div>

        <div class="graph-top-info">
            <div class="tabled-values">
                <div>
                    <div>Average latency</div>
                    <div class="monospace">{{averageLatency | number:'.0-4'}} ms</div>
                </div>
            </div>
        </div>

        <div class="graph"
             [style.right.px]="selectedNode && graphRightShow ? graphRightWidth : 0"
             [style.bottom.px]="showList ? listHeight : 0">

            <div class="graph-container">
                <div style="position: relative;" [style.width.px]="graphWidth" [style.height.px]="graphHeight">
                    <svg
                        [style.width.px]="graphWidth"
                        [style.height.px]="graphHeight">
                        <ng-container *ngFor="let edge of graphEdges; trackBy: trackGraphEdge">
                            <ng-container
                                *ngIf="!(edge.nodeRight.isConnected() && (!edge.nodeLeft || edge.nodeLeft.isConnected()))">
                                <path [attr.d]="edge.path()"></path>
                            </ng-container>

                            <ng-container
                                *ngIf="edge.nodeRight.isConnected() && (!edge.nodeLeft || edge.nodeLeft.isConnected())">
                                <path [attr.d]="edge.path(-1)" class="down"></path>
                                <path [attr.d]="edge.path(1)" class="up"></path>
                            </ng-container>

                        </ng-container>
                    </svg>
                    <div
                        *ngFor="let node of graphNodes; let i = index; trackBy: trackGraphNode"
                        [style.left.px]="(node.x - (node.width/2)) + offset.x"
                        [style.top.px]="(node.y - (node.height/2)) + offset.y"
                        [class.cluster-node]="!node.deepkit"
                        [style.width.px]="node.width"
                        [style.height.px]="node.height"
                        [class.multiple-nodes]="nodeClusterCount > 1"
                        [class.selected]="selectedNode && selectedNode === node.id"
                        (click)="selectNode(node.id)"
                        class="node">
                        <div *ngIf="node.deepkit">
                            <dui-icon name="logo"
                                      style="position: relative; left: -10px; top: 3px; color: var(--text-color)"
                                      [size]="68"></dui-icon>
                        </div>
                        <ng-container *ngIf="!node.deepkit && getNode(node.id) as clusterNode">

                            <div class="connection-info monospace"
                                 *ngIf="clusterNode.isConnected()">
                                <ng-container *ngIf="getPeerSpeed(clusterNode.id, 'server') as stats">
                                    <div>
                                        {{stats.upload | number:'.0-0'}} Mbits/s
                                        <dui-icon name="arrow-small-left" [size]="12"></dui-icon>
                                    </div>
                                    <div>
                                        {{stats.download | number:'.0-0'}} Mbits/s
                                        <dui-icon name="arrow-small-right" [size]="12"></dui-icon>
                                    </div>
                                </ng-container>
                                <div style="margin-top: -3px; font-size: 10px;">
                                    <ng-container *ngIf="clusterNode.peerConnections['server'] as con">
                                        {{con.ping | number:'.0-2'}} ms
                                    </ng-container>
                                </div>
                            </div>

                            <div class="connection-info-right monospace"
                                 *ngIf="selectedNode && node.id !== selectedNode && getNode(selectedNode).isConnected() && clusterNode.isConnected()">
                                <ng-container *ngIf="getPeerSpeed(clusterNode.id, selectedNode) as stats">
                                    <div>
                                        {{stats.upload | number:'.0-0'}} Mbits/s
                                        <dui-icon name="arrow-small-left" [size]="12"></dui-icon>
                                    </div>
                                    <div>
                                        {{stats.download | number:'.0-0'}} Mbits/s
                                        <dui-icon name="arrow-small-right" [size]="12"></dui-icon>
                                    </div>
                                </ng-container>
                                <div style="margin-top: -3px; font-size: 10px;">
                                    <ng-container *ngIf="clusterNode.peerConnections[selectedNode] as con">
                                        {{con.ping | number:'.0-2'}} ms
                                    </ng-container>
                                    <ng-container *ngIf="!clusterNode.peerConnections[selectedNode]">
                                        <div style="white-space: nowrap; color: var(--color-red)">
                                            <dui-icon name="arrow-small-left" [size]="12"></dui-icon>
                                            CONNERR
                                            <dui-icon name="arrow-small-left" [size]="12"></dui-icon>
                                        </div>
                                    </ng-container>
                                </div>
                            </div>

                            <div>
                                <span class="number monospace">{{clusterNode.priority|number:'2.0-0'}}</span>
                                <span class="title">{{node.label}}</span>
                            </div>
                            <div class="desc">
                                <div *ngIf="!clusterNode.isConnected()" style="color: var(--color-red)">OFFLINE</div>
                                <ng-container *ngIf="clusterNode.isConnected()">
                                    <div>
                                        <div class="small-bar">
                                            <div class="active"
                                                 [style.width.%]="clusterNode.getCpuUsageInPercent() * 100"></div>
                                        </div>
                                        <div class="small-bar">
                                            <div class="active"
                                                 [style.width.%]="clusterNode.getMemoryUsageInPercent() * 100"></div>
                                        </div>
                                        <div class="small-bar">
                                            <div class="active"
                                                 [style.width.%]="clusterNode.getGpuUsageInPercent() * 100"></div>
                                        </div>
                                    </div>
                                    <div *ngIf="clusterNode.host">Host: <span
                                        class="monospace">{{clusterNode.host}}</span>
                                    </div>
                                </ng-container>
                            </div>
                        </ng-container>
                    </div>
                </div>
            </div>
        </div>

        <div class="graph-right overlay-scrollbar-small"
             [style.width.px]="selectedNode && graphRightShow ? graphRightWidth : 0"
             [style.bottom.px]="showList ? listHeight : 0"
             *ngIf="getNode(selectedNode) as node"
        >
            <div style="padding: 20px;">
                <h3>{{node.name}}</h3>
                <div *ngIf="!node.isConnected()" style="color: var(--color-red)">OFFLINE</div>

                <p>
                    <dui-button (click)="openNode(node)" textured>Open</dui-button>
                </p>

                <div style="margin: 5px 0;">
                    <div>{{node.information.deviceDescription}}</div>
                    <div>{{node.information.osDescription}}</div>
                    <div>{{node.information.cpuDescription}}</div>
                </div>

                <div class="tabled-values" style="margin-top: 8px;">
                    <div>
                        <div>Host</div>
                        <div class="monospace">{{node.host}}</div>
                    </div>
                    <div>
                        <div>Priority</div>
                        <div class="monospace">{{node.priority}}</div>
                    </div>
                    <div *ngIf="node.isConnected()">
                        <div>Connected since</div>
                        <div class="monospace">
                            <dk-redraw>{{node.connectedTime|humanize_until_now}}</dk-redraw>
                        </div>
                    </div>
                    <div *ngIf="!node.isConnected()">
                        <div>Disconnected since</div>
                        <div class="monospace">
                            <dk-redraw>{{node.ping|humanize_until_now}}</dk-redraw>
                        </div>
                    </div>
                    <div>
                        <div>Uptime</div>
                        <div class="monospace">{{node.stats.uptime|humanize}}</div>
                    </div>
                </div>

                <dk-section-header center>RESOURCES</dk-section-header>

                <div class="tabled-values">
                    <div>
                        <div>CPU cores</div>
                        <div class="monospace">{{node.resources.cpu.reserved}}/{{node.resources.cpu.total}}</div>
                    </div>
                    <div>
                        <div>Memory</div>
                        <div class="monospace">{{node.resources.memory.reserved}}/{{node.resources.memory.total}}</div>
                    </div>
                    <div>
                        <div>GPU cores</div>
                        <div class="monospace">{{node.resources.getReservedGpuCount()}}/{{node.resources.getGpuCount()}}</div>
                    </div>
                </div>

                <dk-section-header center>GPUS</dk-section-header>

                <p style="text-align:center" *ngIf="!node.information.gpus.length">
                    No supported GPUs detected.
                </p>
                <div class="labeled-values" *ngIf="node.information.gpus.length">
                    <div *ngFor="let gpu of node.information.gpus">
                        <div>{{gpu.name}}</div>
                        <div class="monospace">{{gpu.memory}} GB</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="list" *ngIf="showList"
             [style.height.px]="listHeight"
        >
            <dui-splitter position="top" (modelChange)="listHeight = $event; cd.detectChanges()"></dui-splitter>
            <dui-table
                style="height: 100%"
                [items]="jobs$"
                defaultSort="name"
                noFocusOutline
                borderless
            >
                <dui-table-column name="project" header="Project" [width]="120">
                    <ng-container *duiTableCell="let job">
                        <ng-container *ngIf="store.value.projects!.get(job.project) as project">
                            {{project.name}}
                        </ng-container>
                    </ng-container>
                </dui-table-column>

                <dui-table-column name="number" header="ID" [width]="65">
                    <ng-container *duiTableCell="let job">
                        #{{job.fullNumberCombat}}
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

                <dui-table-column name="config.path" header="Config" [width]="100">
                    <ng-container *duiTableCell="let job">
                        {{job.config.path}}
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
                        {{job.iteration}}/{{job.iterations}}
                    </ng-container>
                </dui-table-column>

                <dui-table-column class="lining monospace" name="time" header="Time" [width]="80">
                    <ng-container *duiTableCell="let job">
                        <div [class.running]="job.isAlive()" *ngIf="job.started">
                            <dk-redraw>
                                {{job.ended ? ((job.ended - job.started) / 1000 | humanize) : (job.started | humanize_until_now)}}
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
                        {{job.speed|number:'0.2-2'}} <span style="color: var(--text-gray)">{{job.speedLabel || 'samples/s'}}</span>
                    </ng-container>
                </dui-table-column>


            </dui-table>
        </div>

    `,
    styleUrls: ['./cluster-show.component.scss'],
})
export class ClusterShowComponent implements OnChanges {
    @Input() @observe() cluster$?: EntitySubject<Cluster>;

    @observe({unsubscribe: true})
    public jobs$?: Collection<Job>;

    @observe()
    public nodes: Collection<ClusterNode>;

    @unsubscribe()
    private sub = new Subscriptions();

    public graphNodes: Node[] = [];
    public graphEdges: { v: string, w: string, nodeLeft?: ClusterNode, nodeRight?: ClusterNode, path: (offset?: number) => string }[] = [];

    clusterForm?: FormGroup;

    graphRightShow = true;
    graphRightWidth = 310;

    showList = true;
    listHeight = 220;
    public graphWidth = 0;
    public graphHeight = 0;
    public nodeWidth = 200;
    public nodeHeight = 75;

    public selectedNode?: string;

    public offset = {x: 0, y: 0, mostY: 0};
    public offsetLineY = 0;

    public averageBandwidth = 0;
    public averageLatency = 0;

    public nodeClusterCount = 0;

    protected lastGraphCacheKey = '';

    protected nodeSub?: Subscription;

    readonly viewState = new ViewState;

    constructor(
        public cd: ChangeDetectorRef,
        protected controllerClient: ControllerClient,
        private dialog: DuiDialog,
        public store: MainStore,
    ) {
        this.nodes = store.value.nodes!;

        this.nodeSub = this.nodes.subscribe(() => {
            this.setAverageValues();
        });
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (this.cluster$) {
            this.selectedNode = undefined;
            (window as any)['cluster'] = this.cluster$.value;
            this.jobs$ = await this.controllerClient.app().getJobsForCluster(this.cluster$!.id);
            this.rebuildGraph();
            this.setAverageValues();
            detectChangesNextFrame(this.cd);
        } else {
            this.jobs$ = undefined;
        }
    }

    ngOnDestroy(): void {
        if (this.nodeSub) {
            this.nodeSub.unsubscribe();
        }
    }

    showEditCluster() {
        if (this.cluster$) {
            this.dialog.open(ClusterSettingsDialogComponent, {
                cluster: this.cluster$.value
            });
        }
    }

    public getPeerSpeed(node1: string, node2: string) {
        if (this.cluster$) {
            const peerId = getPeerId(node1, node2);
            return this.cluster$.value.peerSpeed[peerId];
        }
    }

    public trackGraphNode(index: number, node: Node) {
        return node.id;
    }

    public trackGraphEdge(index: number, edge: { v: string, w: string, nodeLeft?: ClusterNode, nodeRight?: ClusterNode, path: (offset?: number) => string }) {
        return edge.v + '-' + edge.w;
    }

    public setAverageValues() {
        if (!this.cluster$) return;

        const numbers = [];
        const pings = [];
        const nodes = this.getAssignedNodes(this.cluster$.value);

        for (const node of nodes) {
            if (node.isConnected()) {
                if (node.peerConnections.server.ping) {
                    pings.push(node.peerConnections.server.ping);
                }

                const peerId = getPeerId(node.id, 'server');
                const speed = this.cluster$.value.peerSpeed[peerId];
                if (speed) {
                    numbers.push(speed.upload);
                    numbers.push(speed.download);
                }

                for (const peer of nodes) {
                    if (peer === node || !peer.isConnected()) {
                        continue;
                    }

                    const peerId = getPeerId(node.id, peer.id);
                    const speed = this.cluster$.value.peerSpeed[peerId];
                    if (speed) {
                        numbers.push(speed.upload);
                        numbers.push(speed.download);
                    }
                }
            }
        }

        this.averageBandwidth = average(numbers);
        this.averageLatency = average(pings);
        detectChangesNextFrame(this.cd);
    }

    public openNode(node: ClusterNode) {
        this.store.dispatch(selectEntity({entity: this.nodes.getEntitySubject(node)}));
    }

    public selectNode(id: string) {
        this.selectedNode = id;
        this.rebuildGraph();
        detectChangesNextFrame(this.cd);
    }

    public getNode(nodeId: string): ClusterNode | undefined {
        return this.store.value.nodes!.get(nodeId);
    }

    public rebuildGraph() {
        let nodes = this.forThisCluster(this.store.value.nodes!.all()).slice(0);
        this.nodeClusterCount = nodes.length;

        const cacheKey = JSON.stringify([nodes.map(n => [n.id, n.priority]), this.selectedNode]);
        if (cacheKey === this.lastGraphCacheKey) {
            return;
        }
        this.lastGraphCacheKey = cacheKey;

        const g = new graphlib.Graph({directed: true, compound: true, multigraph: true});
        g.setGraph({
            nodesep: 10,
            ranksep: 110,
            // ranker: 'tight-tree',
            rankdir: 'LR',
            // align: 'UL'
        });
        g.setDefaultEdgeLabel(function () {
            return {};
        });

        nodes = nodes.sort((a, b) => {
            if (a.priority < b.priority) return -1;
            if (a.priority > b.priority) return 1;
            return 0;
        });

        g.setNode('deepkit', {id: 'deepkit', deepkit: true, label: 'Deepkit', width: 50, height: 90});

        for (const node of nodes) {
            g.setNode(node.id, {id: node.id, label: node.name, width: this.nodeWidth, height: this.nodeHeight});
            g.setEdge('deepkit', node.id);
        }

        if (this.selectedNode && this.nodeClusterCount > 1) {
            for (const node of nodes) {
                if (this.selectedNode !== node.id) {
                    g.setEdge(node.id, this.selectedNode);
                }
            }
        }

        layout(g);

        this.offset.x = 0;
        this.offset.y = 0;
        this.offsetLineY = 0;
        for (const edge of g.edges()) {
            const points = g.edge(edge).points;
            for (const point of points) {
                if (point.x < this.offset.x) {
                    this.offset.x = Math.abs(point.x);
                }
                if (point.y < this.offset.y) {
                    this.offset.y = Math.abs(point.y);
                }

                if (point.y < this.offsetLineY) {
                    this.offsetLineY = point.y;
                }
            }
        }

        this.offset.y++;

        // console.log('layout', g.graph().width, g.graph().height, this.offset, nodes);

        this.graphWidth = g.graph().width!;
        this.graphHeight = g.graph().height!;
        this.graphNodes = [];

        for (const nodeName of g.nodes()) {
            const node = g.node(nodeName);
            if (!node) continue;
            if (node.width + (node.x - (node.width / 2)) > this.graphWidth) {
                this.graphWidth = node.width + (node.x - (node.width / 2));
            }
            if ((node.height / 2) + node.y > this.graphHeight) {
                this.graphHeight = (node.height / 2) + node.y;
            }
            if (node.y < this.offset.y) {
                this.offset.y = node.y;
            }
            this.graphNodes.push(node);
        }

        this.graphHeight += this.offset.y;
        this.graphHeight += 27;

        this.graphEdges = [];
        for (const edge of g.edges()) {

            const nodeLeft = edge.v === 'deepkit' ? undefined : this.getNode(edge.v);
            const nodeRight = this.getNode(edge.w);
            this.graphEdges.push({
                w: edge.w,
                v: edge.v,
                nodeLeft: nodeLeft,
                nodeRight: nodeRight,
                path: (offset: number = 0) => {
                    const points = g.edge(edge).points;
                    const d: string[] = [];
                    d.push('M ' + ((points[0].x + this.offset.x).toFixed(0) + '.5') + ',' + ((points[0].y + this.offset.y + offset).toFixed(0) + '.5'));
                    for (let i = 1; i < points.length; i++) {
                        d.push('L ' + ((points[i].x + this.offset.x).toFixed(0) + '.5') + ',' + ((points[i].y + this.offset.y + offset).toFixed(0) + '.5'));
                    }
                    return d.join();
                }
            });
        }

        detectChangesNextFrame(this.cd);
    }

    public forThisCluster(nodes: ClusterNode[]): ClusterNode[] {
        if (this.cluster$) {
            return nodes.filter(v => this.cluster$!.id === v.cluster);
        }

        return [];
    }

    public getAssignedNodes(cluster: Cluster): ClusterNode[] {
        return this.store.value.nodes!.all().filter(v => cluster.id === v.cluster && v.isConnected());
    }

    public getCpu(cluster: Cluster): NodeResourceReservation {
        const res = new NodeResourceReservation;

        for (const node of this.getAssignedNodes(cluster)) {
            res.total += node.resources.cpu.total;
            res.reserved += node.resources.cpu.reserved;
        }

        return res;
    }

    public getMemory(cluster: Cluster): NodeResourceReservation {
        const res = new NodeResourceReservation;

        for (const node of this.getAssignedNodes(cluster)) {
            res.total += node.resources.memory.total;
            res.reserved += node.resources.memory.reserved;
        }

        return res;
    }

    public getGpu(cluster: Cluster): NodeResourceReservation {
        const res = new NodeResourceReservation;

        for (const node of this.getAssignedNodes(cluster)) {
            res.total += node.resources.getGpuCount();
            res.reserved += node.resources.getReservedGpuCount();
        }

        return res;
    }

    public getUtilisation(cluster: Cluster): {
        cpuCount: number,
        cpuUtil: number,
        cpuHerzRange: [number, number],
        memory: number,
        memoryUtil: number,
        gpuCount: number,
        gpuMemoryRange: [number, number],
        gpuUtil: number,
        diskSize: number,
        diskUtil: number,
    } {
        const nodes = this.getAssignedNodes(cluster);
        const totalCpuCount = nodes.reduce((total, v) => total + v.stats.cpus.length, 0);
        const cpuRange = {min: 0, max: 0};
        const gpuGBRange = {min: 0, max: 0};
        const disk = {size: 0, used: 0};

        for (const node of nodes) {
            if (cpuRange.max < node.information.getCpuMaxSpeed()) {
                cpuRange.max = node.information.getCpuMaxSpeed();
            }

            if (cpuRange.min === 0 || cpuRange.min > node.information.getCpuMinSpeed()) {
                cpuRange.min = node.information.getCpuMinSpeed();
            }

            if (gpuGBRange.max < node.information.getGpuMemoryMax()) {
                gpuGBRange.max = node.information.getGpuMemoryMax();
            }

            if (gpuGBRange.min === 0 || gpuGBRange.min > node.information.getGpuMemoryMin()) {
                gpuGBRange.min = node.information.getGpuMemoryMin();
            }

            disk.size += node.information.getTotalDriveSize();
            disk.used += node.stats.driveUsage.reduce((p, v) => p + v, 0);
        }

        const totalMemory = nodes.reduce((total, v) => total + v.information.memoryTotal, 0);
        const totalMemoryUsage = nodes.filter(v => v.isConnected()).reduce((total, v) => total + v.stats.memoryUsage, 0);

        const gpuCount = nodes.reduce((total, v) => total + v.information.gpus.length, 0);

        return {
            cpuCount: totalCpuCount,
            cpuUtil: nodes.reduce((total, v) => total + v.stats.getTotalCPUUsage(), 0) / totalCpuCount,
            cpuHerzRange: [cpuRange.min, cpuRange.max],
            memory: totalMemory,
            memoryUtil: totalMemoryUsage / totalMemory,
            gpuCount: gpuCount,
            gpuMemoryRange: [gpuGBRange.min, gpuGBRange.max],
            gpuUtil: nodes.reduce((total, v) => total + v.stats.getTotalGpuUsage(), 0) / gpuCount,
            diskSize: disk.size,
            diskUtil: disk.used / disk.size,
        };
    }
}
