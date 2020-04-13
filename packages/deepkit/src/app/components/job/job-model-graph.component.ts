/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    AfterViewInit,
    ChangeDetectorRef,
    Component,
    Directive,
    ElementRef,
    Input,
    OnChanges,
    OnDestroy,
    SimpleChanges,
    ViewChild
} from "@angular/core";
import {
    DeepKitFile,
    Job,
    JobModelGraph,
    JobModelNode,
    JobModelNodeType,
    JobModelScope,
    JobModelSnapshot
} from "@deepkit/core";
import {graphlib, layout} from "dagre";
import {ControllerClient} from "../../providers/controller-client";
import {Collection, EntitySubject, StreamBehaviorSubject} from "@marcj/glut-core";
import {unsubscribe} from "../../reactivate-change-detection";
import {Subscriptions} from "@marcj/estdlib-rxjs";
import {each, stack} from "@marcj/estdlib";
import {cloneClass, plainToClass} from "@marcj/marshal";
import {HistogramParser} from "../../models";
import {default as createPanZoom, PanZoom} from "panzoom";
import {detectChangesNextFrame, DuiDialog} from "@marcj/angular-desktop-ui";
import {JobModelGraphSvgComponent} from "./job-model-graph-svg.component";
import {LocalStorageProperty} from "../../utils/local-storage";

class JobModelNodeWithChildren extends JobModelNode {
    children?: JobModelNodeWithChildren[];
}

@Directive({
    selector: '[setXLinkHref]'
})
export class SetXLinkHrefDirective implements OnChanges, OnDestroy {
    @Input('setXLinkHref') setXLinkHref?: Uint8Array;

    protected lastUrl?: string;

    constructor(protected elementRef: ElementRef) {
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes.setXLinkHref && this.setXLinkHref && this.elementRef.nativeElement) {
            if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
            this.lastUrl = URL.createObjectURL(new Blob([this.setXLinkHref]));
            (this.elementRef.nativeElement as SVGImageElement).setAttributeNS("http://www.w3.org/1999/xlink", 'xlink:href', this.lastUrl);
        }
    }

    ngOnDestroy(): void {
        if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
    }
}

@Component({
    selector: '[job-graph-node-detail]',
    template: `
        <ng-container *ngIf="outputSubject|async as buffer">
            <ng-container *ngIf="node.shape.length === 2 && node.shape[1] === 1; else image">
                <svg:svg [attr.x]="7" [attr.y]="25" width="100" height="110">
                    <svg:text>{{buffer|jsonBuffer}}</svg:text>
                </svg:svg>
            </ng-container>
            <ng-template #image>
                <svg:image [attr.x]="7" [attr.y]="18" width="100" height="110"
                           [setXLinkHref]="buffer"></svg:image>
            </ng-template>
        </ng-container>

        <ng-container *ngIf="histogramActivations">
            <svg [attr.x]="110" [attr.y]="25" job-histogram title="Activations" [data]="histogramActivations"></svg>
        </ng-container>

        <ng-container *ngIf="histogramWeights">
            <svg [attr.x]="110" [attr.y]="58" job-histogram title="Weights" [data]="histogramWeights"></svg>
        </ng-container>

        <ng-container *ngIf="histogramBiases">
            <svg [attr.x]="110" [attr.y]="93" job-histogram title="Biases" [data]="histogramBiases"></svg>
        </ng-container>

        <ng-container *ngIf="!hasData()">
            <svg:text [attr.x]="214/2" text-anchor="middle" [attr.y]="60">No debug data yet</svg:text>
        </ng-container>
    `,
    styles: [`
        text {
            font-size: 9px;
            fill: var(--text);
            pointer-events: none;
        }
    `]
})
export class JobGraphNodeDetailComponent implements OnChanges, OnDestroy {
    @Input() jobId?: string;
    @Input() node?: JobModelNode;
    @Input() layerId?: string;
    @Input() snapshotId?: string;

    @unsubscribe()
    outputSubject?: StreamBehaviorSubject<Uint8Array | undefined>;

    @unsubscribe()
    activationsSubject?: StreamBehaviorSubject<Uint8Array | undefined>;

    @unsubscribe()
    weightsSubject?: StreamBehaviorSubject<Uint8Array | undefined>;

    @unsubscribe()
    biasesSubject?: StreamBehaviorSubject<Uint8Array | undefined>;

    histogramActivations: any;
    histogramWeights: any;
    histogramBiases: any;

    lastLoadDataTimeout: any;

    constructor(protected controllerClient: ControllerClient, protected cd: ChangeDetectorRef) {
        // console.log('new JobGraphNodeDetailComponent');
    }

    ngOnDestroy(): void {
    }

    hasData() {
        return (this.outputSubject && this.outputSubject.value) || (this.activationsSubject && this.activationsSubject.value)
            || (this.weightsSubject && this.weightsSubject.value) || (this.biasesSubject && this.biasesSubject.value);
    }

    async ngOnChanges(changes: SimpleChanges) {
        if ((changes.snapshotId || changes.jobId || changes.layerId) && this.snapshotId && this.jobId) {
            clearTimeout(this.lastLoadDataTimeout);
            this.lastLoadDataTimeout = setTimeout(() => {
                this.loadData();
            }, 50);
        }
    }

    @stack()
    protected async loadData() {
        if (!this.jobId || !this.layerId) return;

        const jobId = this.jobId;
        const layerId = this.layerId;
        const isStillValid = () => {
            return jobId === this.jobId && layerId === this.layerId;
        };
        const promises: Promise<any>[] = [];

        if (this.snapshotId === 'live') {
            promises.push(this.controllerClient.publicJob().subscribeJobLiveDebugData(this.jobId, `${this.layerId}/output`).then(v => {
                if (!isStillValid()) return;
                this.outputSubject = v;
            }));
            promises.push(this.controllerClient.publicJob().subscribeJobLiveDebugData(this.jobId, `${this.layerId}/activations`).then(v => {
                if (!isStillValid()) return;
                this.activationsSubject = v;
            }));
            promises.push(this.controllerClient.publicJob().subscribeJobLiveDebugData(this.jobId, `${this.layerId}/weights`).then(v => {
                if (!isStillValid()) return;
                this.weightsSubject = v;
            }));
            promises.push(this.controllerClient.publicJob().subscribeJobLiveDebugData(this.jobId, `${this.layerId}/biases`).then(v => {
                if (!isStillValid()) return;
                this.biasesSubject = v;
            }));
        } else {
            const basePath = `.deepkit/debug/snapshot/${this.snapshotId}/${this.layerId}`;
            {
                const path = `${basePath}/output`;
                promises.push(this.controllerClient.publicJob().subscribeJobFileContent(this.jobId, path).then(v => {
                    if (!isStillValid()) return;
                    this.outputSubject = v;
                }));
            }
            {
                const path = `${basePath}/activations`;
                promises.push(this.controllerClient.publicJob().subscribeJobFileContent(this.jobId, path).then(v => {
                    if (!isStillValid()) return;
                    this.activationsSubject = v;
                }));
            }

            {
                const path = `${basePath}/weights`;
                promises.push(this.controllerClient.publicJob().subscribeJobFileContent(this.jobId, path).then(v => {
                    if (!isStillValid()) return;
                    this.weightsSubject = v;
                }));
            }

            {
                const path = `${basePath}/biases`;
                promises.push(this.controllerClient.publicJob().subscribeJobFileContent(this.jobId, path).then(v => {
                    if (!isStillValid()) return;
                    this.biasesSubject = v;
                }));
            }
        }

        //check if view is still correct
        await Promise.all(promises);

        //ngOnChange already switched
        if (!isStillValid()) return;

        if (this.activationsSubject && !this.activationsSubject.isStopped) {
            const histogram = new HistogramParser(`${this.jobId}/histograms/${this.layerId}/output.jpg`, 1);
            histogram.subscribe(v => {
                if (!isStillValid()) return;
                this.histogramActivations = v;
                detectChangesNextFrame(this.cd);
            });
            this.activationsSubject.subscribe(v => {
                if (!isStillValid()) return;
                if (!v) {
                    this.histogramActivations = undefined;
                    detectChangesNextFrame(this.cd);
                }
                histogram.feed(v);
            });
            this.activationsSubject.appendSubject.subscribe(v => histogram.feed(v));
        }

        if (this.weightsSubject && !this.weightsSubject.isStopped) {
            const histogram = new HistogramParser(`${this.jobId}/histograms/${this.layerId}/weights`, 1);
            histogram.subscribe(v => {
                if (!isStillValid()) return;
                this.histogramWeights = v;
                detectChangesNextFrame(this.cd);
            });
            this.weightsSubject.subscribe(v => {
                if (!isStillValid()) return;
                if (!v) {
                    this.histogramWeights = undefined;
                    detectChangesNextFrame(this.cd);
                }
                histogram.feed(v);
            });
            this.weightsSubject.appendSubject.subscribe(v => histogram.feed(v));
        }

        if (this.biasesSubject && !this.biasesSubject.isStopped) {
            const histogram = new HistogramParser(`${this.jobId}/histograms/${this.layerId}/biases`, 1);
            histogram.subscribe(v => {
                if (!isStillValid()) return;
                this.histogramBiases = v;
                detectChangesNextFrame(this.cd);
            });
            this.biasesSubject.subscribe(v => {
                if (!isStillValid()) return;
                if (!v) {
                    this.histogramBiases = undefined;
                    detectChangesNextFrame(this.cd);
                }
                histogram.feed(v);
            });
            this.biasesSubject.appendSubject.subscribe(v => histogram.feed(v));
        }
        detectChangesNextFrame(this.cd);
    }
}

@Component({
    selector: 'job-model-graph',
    template: `
        <ng-container *ngIf="job$|async as job">
            <div class="left">
                <div class="graph" [class.full]="full">
                    <svg id="current-graph" [attr.width]="totalGraphSize.width" [attr.height]="totalGraphSize.height">
                        <g id="graph" #graph *ngIf="graphNames() as graphNames">
                            <ng-container *ngFor="let name of graphNames; trackBy: trackByIndex">
                                <svg:text class="graph-title" *ngIf="graphNames.length > 1 || name !== 'main'"
                                          [attr.x]="getGraphX(graphNames, name)">{{name}}</svg:text>
                                <svg job-model-graph-svg
                                     [attr.y]="20"
                                     [attr.x]="getGraphX(graphNames, name)"
                                     [attr.width]="graphs[name].width"
                                     [attr.height]="graphs[name].height"
                                     [edges]="graphs[name].edges" [nodes]="graphs[name].nodes"
                                     [show]="show"
                                     [view]="view"
                                     [highlightedLayers]="highlightedLayers"
                                     [expanded]="expanded.value"
                                     [snapshotId]="snapshotId"
                                     (selectNode)="selectNode($event)"
                                     (expand)="expandChildren($event)"
                                     (watch)="watch($event)"
                                     [job]="job" [selectedNodeId]="selectedNodeId"
                                ></svg>
                            </ng-container>
                        </g>
                    </svg>
                </div>
                <div class="actions" *ngIf="full">
                    <dui-input class="semi-transparent" clearer lightFocus icon="search" style="width: 120px;"
                               [(ngModel)]="filterQuery" round (esc)="filterQuery = ''; updateFilter()"
                               (ngModelChange)="updateFilter()"
                               placeholder="Search"></dui-input>
                    <div style="font-size: 11px; margin-left: 4px; margin-right: 3px;" *ngIf="filterQuery">
                        Found {{filterCount}} layer{{filterCount !== 1 ? 's' : ''}}
                    </div>

                    <div style="margin-left: auto; display: flex; align-items: center">
                        <div style="margin-right: 4px;">
                            <dui-checkbox style="margin-right: 4px;" [(ngModel)]="debugView"
                                          (ngModelChange)="renderAllGraph()">Debug view
                            </dui-checkbox>
                            <dui-select textured small style="width: 60px;" [(ngModel)]="show"
                                        (ngModelChange)="renderAllGraph()">
                                <dui-option value="type">Type</dui-option>
                                <dui-option value="id">ID</dui-option>
                                <dui-option value="shape">Shape</dui-option>
                            </dui-select>
                        </div>

                        <dui-icon clickable name="zoom-to-fit" title="Zoom to fit" style="margin-right: 4px;"
                                  (click)="zoomToFit()"></dui-icon>
                        <dui-slider [(ngModel)]="nodePadding"
                                    (ngModelChange)="renderAllGraph()"
                                    style="width: 40px;" mini></dui-slider>
                    </div>
                </div>
            </div>

            <div class="sidebar overlay-scrollbar-small" *ngIf="full">
                <div *ngIf="!nodeToShow">
                </div>
                <div *ngIf="nodeToShow">
                    <h3>{{nodeToShow.type}}</h3>
                    <div class="text-selection">Name: {{nodeToShow.id}}</div>

                    <ng-container *ngIf="!readOnly && job.isRunning()">
                        <dui-button *ngIf="!job.debuggingState.watchingLayers[nodeToShow.id]"
                                    (click)="startWatching(nodeToShow.id)"
                                    icon="record"
                        >
                            Start Watching
                        </dui-button>
                        <dui-button *ngIf="job.debuggingState.watchingLayers[nodeToShow.id]"
                                    (click)="stopWatching(nodeToShow.id)"
                                    icon="record" iconColor="var(--color-red)"
                        >
                            Stop watching
                        </dui-button>
                    </ng-container>

                    <table class="labels">
                        <tr *ngIf="nodeToShow.shape && nodeToShow.shape.length">
                            <td>Output shape</td>
                            <td>({{nodeToShow.shape.join(',')}})</td>
                        </tr>
                        <tr>
                            <td>Parameters</td>
                            <td>{{(nodeToShow.attributes.trainable_weights || 0) + (nodeToShow.attributes.non_trainable_weights || 0)}}</td>
                        </tr>
                        <tr>
                            <td>Type</td>
                            <td>{{nodeToShow.type}}</td>
                        </tr>
                        <tr>
                            <td>Sub type</td>
                            <td>{{nodeToShow.subType}}</td>
                        </tr>
                        <tr>
                            <td>Recordable</td>
                            <td>{{nodeToShow.recordable}}</td>
                        </tr>
                        <tr>
                            <td>Scope</td>
                            <td>{{nodeToShow.scope}}</td>
                        </tr>
                        <tr>
                            <td>Inputs</td>
                            <td>{{nodeToShow.input.join(', ')}}</td>
                        </tr>
                        <tr>
                            <td colspan="2" class="delimiter"></td>
                        </tr>
                        <tr *ngFor="let attr of nodeToShow.attributes|keyvalue">
                            <td>{{attr.key}}</td>
                            <td>{{attr.value}}</td>
                        </tr>
                    </table>
                </div>
            </div>
        </ng-container>
    `,
    styleUrls: ['./job-model-graph.component.scss']
})
export class JobModelGraphSnapshot implements OnChanges, AfterViewInit, OnDestroy {
    @Input() job$!: EntitySubject<Job>;
    @Input() full = true;
    @Input() readOnly: boolean = false;

    @Input() snapshotId: string = '';
    @Input() snapshot?: JobModelSnapshot;

    @ViewChild('graph') graphElement?: ElementRef;
    graphPanZoom?: PanZoom;

    nodePadding = 0.3;

    show: 'type' | 'id' | 'shape' = 'type';
    debugView = true;

    public selectedNodeId?: string;
    public hoveredNodeId?: string;

    nodesMap: { [id: string]: JobModelNode } = {};

    showDetailsLayers: { [layerId: string]: boolean } = {};
    initialDetailsLayers = false;

    public filterQuery = '';

    @unsubscribe()
    public subs = new Subscriptions;

    public totalGraphSize = {width: 0, height: 0};

    public modelGraphs: { [name: string]: JobModelGraph } = {};
    public modelGraphsRootNodes: { [name: string]: any[] } = {};
    public modelGraphsContent: { [name: string]: StreamBehaviorSubject<string> } = {};

    @unsubscribe()
    public fileCollection!: Collection<DeepKitFile>;

    public fileSubs: { [path: string]: StreamBehaviorSubject<Uint8Array | undefined> } = {};

    protected renderGraphCache: { [name: string]: string } = {};
    public graphs: {
        [name: string]: {
            width: number,
            height: number,
            nodes: any[],
            edges: any[],
        }
    } = {};

    public highlightedLayers?: { [nodeId: string]: boolean };

    public expanded = new LocalStorageProperty<{ [nodeId: string]: boolean }>('job-model-graph/expanded', {});

    public filterCount = 0;

    get view() {
        return this.debugView ? 'debug' : 'default';
    }

    constructor(
        private controllerClient: ControllerClient,
        public cd: ChangeDetectorRef,
        public dialog: DuiDialog
    ) {
        (window as any)['kacke'] = this;
    }

    graphNames() {
        return Object.keys(this.graphs).sort(function (a, b) {
            if (a < b) return -1;
            if (a > b) return 1;
            return 0;
        });
    }

    trackByIndex(index: any) {
        return index;
    }

    trackByValue(index: any, value: any) {
        return value;
    }

    getGraphX(names: string[], name: string) {
        let x = 0;
        for (const otherName of names) {
            if (otherName === name) break;
            x += Math.ceil(this.graphs[otherName].width + 50);
        }
        return x;
    }

    ngOnDestroy(): void {
        for (const v of each(this.fileSubs)) {
            v.unsubscribe();
        }

        for (const v of each(this.modelGraphsContent)) {
            v.unsubscribe();
        }

        this.expanded.save();
    }

    ngAfterViewInit(): void {
    }

    async watch(watch: { node: string, watch: boolean }) {
        if (!this.job$) return;
        if (watch.watch) {
            await this.controllerClient.app().jobDebugStartWatchLayer(this.job$.id, watch.node);
        } else {
            await this.controllerClient.app().jobDebugStopWatchLayer(this.job$.id, watch.node);
        }
        this.showDetailsLayers[watch.node] = watch.watch;
        this.renderAllGraph();
        this.cd.detectChanges();
    }

    expandChildren(expand: { node: string, expand: boolean }) {
        this.expanded.value[expand.node] = expand.expand;
        this.expanded.save();
        this.renderAllGraph();
    }

    updateFilter() {
        this.highlightedLayers = undefined;
        if (this.filterQuery) {
            this.highlightedLayers = {};
            this.filterCount = 0;
            for (const [name, graph] of Object.entries(this.modelGraphs)) {
                for (const node of graph.nodes) {
                    if (this.show === 'id') {
                        if (node.id && node.id.toLowerCase().indexOf(this.filterQuery) !== -1) {
                            this.highlightedLayers[name + ':' + node.id] = true;
                            this.filterCount++;
                        } else {
                            this.highlightedLayers[name + ':' + node.id] = false;
                        }
                    }
                    if (this.show === 'type') {
                        if (node.subType.toLowerCase().indexOf(this.filterQuery) !== -1) {
                            this.highlightedLayers[name + ':' + node.id] = true;
                            this.filterCount++;
                        } else {
                            this.highlightedLayers[name + ':' + node.id] = false;
                        }
                    }
                    if (this.show === 'shape') {
                        if (node.shape.join(', ').indexOf(this.filterQuery) !== -1) {
                            this.highlightedLayers[name + ':' + node.id] = true;
                            this.filterCount++;
                        } else {
                            this.highlightedLayers[name + ':' + node.id] = false;
                        }
                    }
                }
            }
        }

        detectChangesNextFrame(this.cd);
    }

    get nodeToShow() {
        return this.selectedNodeId ? this.nodesMap[this.selectedNodeId] : undefined;
    }

    public getFileContent(path: string): StreamBehaviorSubject<Uint8Array | undefined> {
        if (!this.fileSubs[path]) {
            this.fileSubs[path] = new StreamBehaviorSubject<Uint8Array | undefined>(undefined);
            this.controllerClient.publicJob().subscribeJobFileContent(this.job$.id, path).then((v) => {
                if (this.fileSubs[path] && !this.fileSubs[path].isUnsubscribed()) {
                    v.subscribe(this.fileSubs[path]);
                    this.fileSubs[path].addTearDown(() => {
                        // delete this.fileSubs[f.path];
                        v.unsubscribe();
                    });
                } else {
                    v.unsubscribe();
                }
            });
        }

        return this.fileSubs[path];
    }

    public norm(p: number) {
        return Math.ceil(p);
    }

    public anorm(p: number) {
        return Math.floor(p) + 0.5;
    }

    public async startWatching(id: string) {
        await this.controllerClient.app().jobDebugStartWatchLayer(this.job$.id, id);
        this.showDetailsLayers[id] = true;
        this.renderAllGraph();
        detectChangesNextFrame(this.cd);
    }

    public async stopWatching(id: string) {
        await this.controllerClient.app().jobDebugStopWatchLayer(this.job$.id, id);
        this.showDetailsLayers[id] = false;
        this.renderAllGraph();
        detectChangesNextFrame(this.cd);
    }

    public selectNode(nodeId: string) {
        if (!this.full) return;

        if (this.selectedNodeId === nodeId) {
            this.selectedNodeId = undefined;
        } else {
            this.selectedNodeId = nodeId;
        }
        this.cd.detectChanges();
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (changes.job$) {
            this.selectedNodeId = undefined;
            this.hoveredNodeId = undefined;

            this.showDetailsLayers = {};
            this.initialDetailsLayers = false;

            this.graphs = {};
            this.modelGraphs = {};
            this.nodesMap = {};
            for (const v of Object.values(this.modelGraphsContent)) {
                v.unsubscribe();
            }
            this.modelGraphsContent = {};
            this.modelGraphsRootNodes = {};
            this.renderGraphCache = {};

            this.subs.unsubscribe();

            this.subs.add = this.job$.subscribe(async (job) => {
                const all: Promise<void>[] = [];
                for (const [name, graphInfo] of Object.entries(job.graphInfos)) {
                    if (!this.modelGraphsContent[name]) {
                        const fileContent = this.controllerClient.publicJob().subscribeJobFileContent(this.job$.id, graphInfo.path);

                        all.push(new Promise((resolve) => {
                            fileContent.then(v => {
                                if (!this.job$ || this.job$.id !== job.id) {
                                    //we job is changed, we need to stop that subscription
                                    v.unsubscribe();
                                    resolve();
                                    return;
                                }

                                const utf8Content = v.toUTF8();
                                this.modelGraphsContent[name] = utf8Content;
                                utf8Content.subscribe((v) => {
                                    if (v) {
                                        this.modelGraphs[name] = plainToClass(JobModelGraph, JSON.parse(v));
                                        this.renderGraph(name);
                                    }
                                    resolve();
                                });
                            });
                        }));
                    }
                }

                await Promise.all(all);
                this.renderAllGraph();
            });

            if (this.graphPanZoom) {
                this.graphPanZoom.dispose();
                this.graphPanZoom = undefined;
            }
        } else {
            this.renderAllGraph();
        }
    }

    public isActiveLayer(id: string) {
        if (!this.full) return false;
        if (!this.debugView) return false;

        return this.showDetailsLayers[id];
    }

    protected setDetailsLayers() {
        if (!this.job$) return;

        this.showDetailsLayers = {};

        if (this.snapshotId === 'live') {
            this.showDetailsLayers = {...this.job$.value.debuggingState.watchingLayers};
        } else if (this.snapshot) {
            for (const name of this.snapshot.layerNames) {
                this.showDetailsLayers[name] = true;
            }
        }
    }

    protected buildRootNodes(graphName: string) {
        if (!this.modelGraphs[graphName]) return [];

        const rootNodes: JobModelNodeWithChildren[] = [];
        const graph = this.modelGraphs[graphName];

        const scopes: { [scopeId: string]: { nodes: string[], inputs: string[] } } = {};
        const scopesMap: { [name: string]: JobModelScope } = {};
        const nodes: { [nodeId: string]: JobModelNode } = {};
        const ioMap: { [name: string]: JobModelNode } = {};

        for (const scope of graph.scopes) {
            scopesMap[scope.id] = scope;
        }

        for (const node of graph.nodes) {
            nodes[node.id] = node;
            if (node.type === JobModelNodeType.input || node.type === JobModelNodeType.output) {
                ioMap[node.id] = node;
            }
        }

        for (const node of graph.nodes) {
            let currentScope = node.scope;
            if (!currentScope) continue;

            //io nodes have no scopes, so we skip that
            if (ioMap[node.id]) continue;

            do {
                if (!scopes[currentScope]) {
                    scopes[currentScope] = {nodes: [], inputs: []};
                }

                //if there's a node with that scope, we pick its inputs up
                if (nodes[currentScope]) {
                    scopes[currentScope].inputs = nodes[currentScope].input;
                }

                scopes[currentScope].nodes.push(node.id);
                for (const input of node.input) {
                    //we only assign outgoing inputs to this scope
                    if (currentScope !== input && !nodes[input].scope.startsWith(currentScope)) {
                        scopes[currentScope].inputs.push(input);
                    }
                }

                const slashPos = currentScope.lastIndexOf('/');
                if (slashPos === -1) break;
                currentScope = currentScope.slice(0, slashPos);
            } while (currentScope);
        }

        //we track now scopes that need to be displayed as nodes
        const scopeNodes: { [scopeId: string]: Set<string> } = {};

        for (const [scopeId, scope] of Object.entries(scopes)) {
            // if (scope.nodes.length > 1) {
            scopeNodes[scopeId] = new Set();
            // }
        }

        function getParentScope(scopeId: string): string {
            const lastIndex = scopeId.lastIndexOf('/');
            if (lastIndex === -1) return '';
            return scopeId.substr(0, lastIndex);
        }

        //reassign node inputs correctly. Some point now to scopes, others point to
        //scope's pseudo `input` element. We also change all ids (and input refs) to contain a prefix of graph's name.
        const normalizedNodes: { [id: string]: JobModelNode } = {};
        for (const node of graph.nodes) {
            const copy = cloneClass(node);
            normalizedNodes[copy.id] = copy;

            //io nodes shouldn't change their scope
            if (ioMap[node.id]) {
                copy.scope = '';
                continue;
            }

            let myValidScope = node.scope;
            while (myValidScope && !scopeNodes[myValidScope]) {
                //search a valid scope.
                //nodes that are in conv2d for example have their own scope,
                //but there is only 1 item in it, so we treat it as non-existing scope
                myValidScope = getParentScope(myValidScope);
            }
            if (copy.scope !== myValidScope) {
                //we consolidated the scope with only one children
                copy.scope = myValidScope;
            }
        }

        //we find a common scope and add correct inputs between two scopes that share the same
        //parent scope
        for (const scopeId of Object.keys(scopeNodes)) {
            for (const input of scopes[scopeId].inputs) {

                let added = false;
                //io nodes don't change their ref and have no scope,
                // so keep any ref pointing to io intact
                if (ioMap[input]) {
                    scopeNodes[scopeId].add(input);

                    if (getParentScope(scopeId)) {
                        const pseudoInput = getParentScope(scopeId) + '/:input';
                        scopeNodes[scopeId].add(pseudoInput);
                        if (!normalizedNodes[pseudoInput]) {
                            const pseudo = new JobModelNode();
                            pseudo.id = getParentScope(scopeId) + '/:input';
                            pseudo.scope = getParentScope(scopeId);
                            pseudo.type = JobModelNodeType.scope_input;
                            normalizedNodes[pseudoInput] = pseudo;
                        }
                    }
                    continue;
                }

                for (let currentScope = scopeId; !added && currentScope; currentScope = getParentScope(currentScope)) {
                    const parentCurrentScope = getParentScope(currentScope);

                    let inputsScope = normalizedNodes[input].scope;
                    if (inputsScope === parentCurrentScope) {
                        scopeNodes[currentScope].add(input);
                        break;
                    }

                    while (inputsScope) {
                        const next = getParentScope(inputsScope);
                        if (next === parentCurrentScope && currentScope !== inputsScope) {
                            //next shares the same parent scope, so pick that one
                            scopeNodes[currentScope].add(inputsScope);
                            added = true;
                            break;
                        }
                        inputsScope = next;
                    }
                }
            }

            if (getParentScope(scopeId) && !scopeNodes[scopeId].size) {
                const pseudoInput = getParentScope(scopeId) + '/:input';
                scopeNodes[scopeId].add(pseudoInput);
                if (!normalizedNodes[pseudoInput]) {
                    const pseudo = new JobModelNode();
                    pseudo.id = getParentScope(scopeId) + '/:input';
                    pseudo.type = JobModelNodeType.scope_input;
                    pseudo.scope = getParentScope(scopeId);
                    normalizedNodes[pseudoInput] = pseudo;
                }
            }
        }

        //reassign node inputs to correct scope if necessary
        for (const node of Object.values(normalizedNodes)) {
            if (node.type === JobModelNodeType.scope_input) continue;

            const newInputs: string[] = [];
            for (const input of node.input) {
                if (node.scope && ioMap[input]) {
                    //when we are in a scope and point to a input node (which is on root)
                    //we don't keep that ref. The parent scope has that ref already.
                    const pseudoInput = node.scope + '/:input';
                    newInputs.push(pseudoInput);
                    if (!normalizedNodes[pseudoInput]) {
                        const pseudo = new JobModelNode();
                        pseudo.id = node.scope + '/:input';
                        pseudo.scope = node.scope;
                        pseudo.type = JobModelNodeType.scope_input;
                        normalizedNodes[pseudoInput] = pseudo;
                    }
                    continue;
                }

                if (!normalizedNodes[input]) {
                    console.warn(`${node.id} has an non-existing input: ${input}`);
                    continue;
                }

                if (scopeNodes[normalizedNodes[input].scope]) {
                    //this input shows to a node that is actually in a valid scope.
                    //so point to the actual scope instead.
                    if (normalizedNodes[input].scope === node.scope) {
                        //they are on the same scope, so keep the ref as is
                        newInputs.push(input);
                        continue;
                    }

                    let inputsScope = normalizedNodes[input].scope;
                    let added = false;
                    while (inputsScope) {
                        const next = getParentScope(inputsScope);
                        if (next === node.scope) {
                            //next shares the same parent scope, so pick that one
                            newInputs.push(inputsScope);
                            added = true;
                            break;
                        }
                        inputsScope = next;
                    }

                    if (!added && node.scope) {
                        const pseudoInput = node.scope + '/:input';
                        newInputs.push(pseudoInput);
                        if (!normalizedNodes[pseudoInput]) {
                            const pseudo = new JobModelNode();
                            pseudo.id = node.scope + '/:input';
                            pseudo.scope = node.scope;
                            pseudo.type = JobModelNodeType.scope_input;
                            normalizedNodes[pseudoInput] = pseudo;
                        }
                    }

                } else {
                    newInputs.push(input);
                }
            }

            if (node.scope && !newInputs.length) {
                const pseudoInput = node.scope + '/:input';
                newInputs.push(pseudoInput);
                if (!normalizedNodes[pseudoInput]) {
                    const pseudo = new JobModelNode();
                    pseudo.id = node.scope + '/:input';
                    pseudo.scope = node.scope;
                    pseudo.type = JobModelNodeType.scope_input;
                    normalizedNodes[pseudoInput] = pseudo;
                }
            }
            node.input = newInputs;
        }

        //create scope nodes and assign nodes
        const scopeNodesMap: { [scopeId: string]: JobModelNodeWithChildren } = {};
        for (const [scopeId, inputs] of Object.entries(scopeNodes)) {
            const scopeNode = new JobModelNodeWithChildren;

            const givenScopeInfo = scopesMap[scopeId];
            const givenNodeInfo = normalizedNodes[scopeId];

            scopeNode.id = scopeId;
            scopeNode.label = scopeId;
            scopeNode.type = JobModelNodeType.scope;
            scopeNode.subType = scopeId ? scopeId.substr(scopeId.lastIndexOf('/') + 1) : '';

            scopeNode.children = [];
            scopeNode.input = [...inputs];
            if (givenScopeInfo) {
                scopeNode.label = givenScopeInfo.label;
                scopeNode.type = givenScopeInfo.type;
                scopeNode.subType = givenScopeInfo.subType;
                scopeNode.attributes = givenScopeInfo.attributes;
                scopeNode.recordable = givenScopeInfo.recordable;
            } else if (givenNodeInfo) {
                scopeNode.type = givenNodeInfo.type;
                scopeNode.label = givenNodeInfo.label;
                scopeNode.type = givenNodeInfo.type;
                scopeNode.subType = givenNodeInfo.subType;
                scopeNode.attributes = givenNodeInfo.attributes;
                scopeNode.recordable = givenNodeInfo.recordable;
                scopeNode.shape = givenNodeInfo.shape;
            }

            scopeNodesMap[scopeId] = scopeNode;

            normalizedNodes[scopeNode.id] = scopeNode;
        }

        // for (const ioNodeId of Object.keys(ioMap)) {
        //     rootNodes.push(normalizedNodes[ioNodeId]);
        // }

        for (const node of Object.values(normalizedNodes)) {
            if (scopeNodesMap[node.scope]) {
                scopeNodesMap[node.scope].children!.push(node);
            } else if (scopeNodesMap[getParentScope(node.scope)]) {
                scopeNodesMap[getParentScope(node.scope)].children!.push(node);
            }
        }

        //assign scope nodes between each other
        for (const [scopeId, scopeNode] of Object.entries(scopeNodesMap)) {
            const parent = getParentScope(scopeId);
            if (parent) {
                if (!scopeNodesMap[parent]) {
                    throw new Error(`Scope ${scopeId}'s parent ${parent} has no scope node.`);
                }
                scopeNode.scope = scopeNodesMap[parent].id;
                scopeNodesMap[parent].children!.push(scopeNode);
            }
        }


        for (const node of Object.values(normalizedNodes)) {
            if (!node.scope) {
                rootNodes.push(node);
            }
        }

        // console.log('modelGraph', this.modelGraph);
        // console.log('scopes', scopes);
        // console.log('scopeNodes', scopeNodes);
        // console.log('nodes', nodes);
        // console.log('normalizedNodes', normalizedNodes);
        (window as any).graph = graph;
        (window as any).scopes = scopes;
        (window as any).scopesMap = scopesMap;
        (window as any).scopeNodes = scopeNodes;
        (window as any).nodes = nodes;
        (window as any).normalizedNodes = normalizedNodes;
        (window as any).rootNodes = rootNodes;

        //normalize all nodes ids, input to contain a graphName prefix so we can calc multiple graphs
        for (const node of Object.values(normalizedNodes)) {
            node.id = graphName + ':' + node.id;
            node.input = node.input.map(v => graphName + ':' + v);
            this.nodesMap[node.id] = node;
        }

        // console.log('rootNodes', rootNodes);
        // (window as any).rootNodes = rootNodes;
        return rootNodes;
    }

    public renderAllGraph(zoomToFit = false) {
        if (!this.job$) return;

        this.totalGraphSize = {width: 0, height: 0};
        for (const [name, graphInfo] of Object.entries(this.job$.value.graphInfos)) {
            this.renderGraph(name);
            if (this.graphs[name]) {
                this.totalGraphSize.width += this.graphs[name].width + 20;
                this.totalGraphSize.height = Math.max(this.totalGraphSize.height, this.graphs[name].height);
            }
        }

        //we need to do it NOW so zoom-to-fit works correctly
        this.cd.detectChanges();

        if (this.graphElement) {
            if (this.full) {
                if (!this.graphPanZoom) {
                    this.graphPanZoom = createPanZoom(this.graphElement.nativeElement, {
                        bounds: true,
                        zoomSpeed: 0.065,
                        zoomDoubleClickSpeed: 1
                    });
                    this.zoomToFit(true);
                } else if (zoomToFit) {
                    this.zoomToFit(true);
                }
            }
        }
    }

    protected renderGraph(graphName: string) {
        this.setDetailsLayers();

        const cache = JSON.stringify([
            this.showDetailsLayers,
            this.job$.value.debuggingState,
            this.expanded.value,
            this.nodePadding,
            this.show,
            this.debugView,
            graphName,
            this.modelGraphs[graphName]
        ]);

        if (this.renderGraphCache[graphName] === cache) {
            return;
        }

        this.renderGraphCache[graphName] = cache;
        if (!this.modelGraphs[graphName]) return;

        if (!this.modelGraphsRootNodes[graphName]) {
            this.modelGraphsRootNodes[graphName] = this.buildRootNodes(graphName);
        }

        const renderGraph = <T extends { id: string }>(nodes: T[], edges: { id: string, dependsOn: string[] }[]): graphlib.Graph => {
            const g = new graphlib.Graph({directed: true, compound: true, multigraph: false});
            g.setGraph({
                nodesep: 10 + (this.nodePadding * 50),
                ranksep: (this.nodePadding * 30),
                // ranker: 'tight-tree',
                // ranker: 'tight-tree',
                // rankdir: 'LR',
                // align: 'LR',
                // align: 'UL',
                // acyclicer: 'greedy'
            });
            g.setDefaultEdgeLabel(function () {
                return {labelpos: 'c', labeloffset: 0};
            });
            // g.setDefaultEdgeLabel(function () {
            //     return {minlen: 1, weight: 1};
            // });

            for (const node of nodes) {
                g.setNode(node.id, node);
            }

            for (const edge of edges) {
                for (const dependsOn of edge.dependsOn) {
                    g.setEdge(dependsOn, edge.id);
                }
            }

            try {
                layout(g);
            } catch (error) {
                console.error('Could not calc layout for graph', error, nodes);
            }
            return g;
        };

        const renderSubGraph = (nodes: JobModelNodeWithChildren[]) => {
            const nodesToRender: any[] = [];
            const edgesToRender: { id: string, dependsOn: string[] }[] = [];
            const existing: { [name: string]: true } = {};

            for (const node of nodes) {
                const rendererClass = JobModelGraphSvgComponent.getRenderer(node.type);
                const renderer = new rendererClass();
                renderer.node = {id: node.id, node, x: 0, y: 0, width: 0, height: 0};
                renderer.show = this.show;
                renderer.view = this.view;
                renderer.highlightedLayers = this.highlightedLayers;
                renderer.job = this.job$!.value;
                renderer.selectedNodeId = this.selectedNodeId;
                renderer.snapshotId = this.snapshotId;
                renderer.expanded = this.expanded.value;

                const dimension = renderer.getDimension();
                let width = dimension.width;
                let height = dimension.height;

                if (node.type === JobModelNodeType.scope_input) {
                    width = 1;
                    height = 1;
                }

                let g = null;
                existing[node.id] = true;

                if (this.expanded.value[node.id] && node.children && node.children.length > 0) {
                    //render subgraph
                    g = renderSubGraph(node.children);

                    width = Math.max(width, Math.floor(g.width) + 40);
                    height += g.height + 12;
                }

                nodesToRender.push({
                    id: node.id,
                    node: node,
                    width: width,
                    height: height,
                    subGraph: g
                });
            }

            for (const node of nodes) {
                const inputs = [];
                for (const i of node.input) {
                    if (existing[i]) {
                        inputs.push(i);
                    }
                }

                if (inputs.length) {
                    edgesToRender.push({id: node.id, dependsOn: inputs});
                }
            }

            const g = renderGraph(nodesToRender, edgesToRender);

            const outgoingNodes: any[] = [];
            for (const nodeName of g.nodes()) {
                const node = g.node(nodeName);
                if (!node) {
                    console.log('node not found', nodeName);
                    continue;
                }
                outgoingNodes.push(node);
            }

            let width = g.graph().width!;
            let height = g.graph().height!;
            if (!Number.isFinite(width)) width = 10;
            if (!Number.isFinite(height)) height = 10;

            //dagre calcs sometimes edges with minus coordinates. We forbid that and
            //offset everything back
            let offsetX = 0;
            let offsetY = 0;

            for (const edge of g.edges()) {
                const points = g.edge(edge).points;
                if (!points) continue;
                for (let i = 0; i < points.length; i++) {
                    if (points[i].x < offsetX) offsetX = points[i].x;
                    if (points[i].y < offsetY) offsetY = points[i].y;
                }
            }
            offsetX = offsetX * -1;
            offsetY = offsetY * -1;

            //now adjust everything
            if (offsetX !== 0 || offsetY !== 0) {
                width += offsetX;
                height += offsetY;

                // console.log('node offset', node.id, offsetX, offsetY);
                for (const edge of g.edges()) {
                    const points = g.edge(edge).points;
                    if (!points) continue;
                    for (let i = 0; i < points.length; i++) {
                        points[i].x += offsetX;
                        points[i].y += offsetY;
                    }
                }

                for (const nodeId of g.nodes()) {
                    const node = g.node(nodeId);
                    node.x += offsetX;
                    node.y += offsetY;
                }
            }

            const edges = [];
            for (const edge of g.edges()) {
                const points = g.edge(edge).points;
                if (!points) continue;

                const d: string[] = [];
                d.push('M ' + this.anorm(points[0].x) + ',' + this.anorm(points[0].y));
                if (points[0].x + 1 > width) width = points[0].x + 1;
                if (points[0].y + 1 > height) height = points[0].y + 1;
                for (let i = 1; i < points.length; i++) {
                    d.push('L ' + this.anorm(points[i].x) + ',' + this.anorm(points[i].y));
                    if (points[i].x + 1 > width) width = points[i].x + 1;
                    if (points[i].y + 1 > height) height = points[i].y + 1;
                }
                edges.push(d.join(' '));
            }

            return {
                width: width,
                height: height,
                graph: g,
                nodes: outgoingNodes,
                edges: edges
            };
        };

        const g = renderSubGraph(this.modelGraphsRootNodes[graphName]);

        this.graphs[graphName] = {
            width: g.width,
            height: g.height,
            nodes: g.nodes,
            edges: g.edges,
        };
        detectChangesNextFrame(this.cd);

        this.updateFilter();
    }

    async zoomToFit(force: boolean = false) {
        requestAnimationFrame(this._zoomToFit.bind(this, force));
    }

    async _zoomToFit(force: boolean = false) {
        try {
            if (this.graphElement && this.graphPanZoom) {
                const svg = this.graphElement.nativeElement as SVGElement;

                const parent = svg.viewportElement!;
                const rectParent = parent.getBoundingClientRect();
                const rectScene = svg.getBoundingClientRect();

                const xys = this.graphPanZoom.getTransform();
                const originWidth = rectScene.width / xys.scale;
                const originHeight = rectScene.height / xys.scale;
                const zoomX = (rectParent.width - 20) / originWidth;
                const zoomY = (rectParent.height - 20) / originHeight;

                let targetScale = zoomX < zoomY ? zoomX : zoomY;

                if (!force) {
                    if (xys.scale > 1.001) {
                        //zoom back to 100% first before to bigpicture
                        this.graphPanZoom.smoothZoomAbs(
                            rectParent.width / 2,
                            rectParent.height / 2,
                            1,
                        );
                        return;
                    } else if (Math.abs(targetScale - xys.scale) < 0.005) {
                        //when target scale is the same as currently, we reset back to 100%, so it acts as toggle.
                        //reset to 100%
                        targetScale = 1;
                    }
                }

                targetScale = Math.min(1, targetScale);

                const targetWidth = originWidth * xys.scale;
                const targetHeight = originHeight * xys.scale;
                const newX = targetWidth > rectParent.width ? -(targetWidth / 2) + rectParent.width / 2 : (rectParent.width / 2) - (targetWidth / 2);
                const newY = targetHeight > rectParent.height ? -(targetHeight / 2) + rectParent.height / 2 : (rectParent.height / 2) - (targetHeight / 2);

                //we need to cancel current running animations
                this.graphPanZoom.pause();
                this.graphPanZoom.resume();

                // console.log('zoom tha shit', {width: targetWidth, height: targetHeight}, 'parent',
                //     {width: rectParent.width, height: rectParent.height});

                // const xDiff = Math.abs(newX - xys.x);
                // const yDiff = Math.abs(newX - xys.x);
                // if (xDiff > 5 || yDiff > 5) {
                //     //everything over 5px change will be animated
                //     this.graphPanZoom.moveBy(
                //         newX - xys.x,
                //         newY - xys.y,
                //         true
                //     );
                //     await sleep(0.4);
                // } else {
                this.graphPanZoom.moveBy(
                    newX - xys.x,
                    newY - xys.y,
                    false
                );
                // }

                //correct way to zoom with center of graph as origin when scaled
                this.graphPanZoom.smoothZoomAbs(
                    xys.x + originWidth * xys.scale / 2,
                    xys.y + originHeight * xys.scale / 2,
                    targetScale,
                );
            }
        } catch (error) {
            console.log('error zooming', error);
        }
    }
}
