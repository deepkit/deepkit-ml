/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Component, Directive, EventEmitter, Input, OnChanges, Output} from "@angular/core";
import {Node} from "dagre";
import {Job, JobModelNode, JobModelNodeType} from "@deepkit/core";

// import ColorHash from 'color-hash';
export type NodeWithJobModelNode = Node & { node: JobModelNode };

class BrowserText {
    protected canvas = document.createElement('canvas');

    protected context = this.canvas.getContext('2d')!;

    constructor(public fontSize: number = 11, public fontFamily: string = getComputedStyle(document.body).fontFamily) {
        document.body.appendChild(this.canvas);
    }

    destroy() {
        document.body.removeChild(this.canvas);
    }

    getDimensions(text: string) {
        this.context.font = this.fontSize + 'px ' + this.fontFamily;
        const m = this.context.measureText(text);
        return {
            width: m.width,
            height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
        };
    }
}

const browserText = new BrowserText;

// const colorHash = new ColorHash({lightness: 0.1, saturation: 0.2});

@Directive({
    selector: 'job-model-graph-svg-base'
})
export class JobModelGraphSvgBase {
    @Input() node!: NodeWithJobModelNode;
    @Input() show: 'type' | 'id' | 'shape' = 'type';
    @Input() view: 'default' | 'debug' = 'default';
    @Input() highlightedLayers?: { [nodeId: string]: boolean };
    @Input() expanded: { [nodeId: string]: boolean } = {};
    @Input() snapshotId = '';
    @Input() job!: Job;
    @Input() selectedNodeId?: string;
    @Output() selectNode = new EventEmitter();
    @Output() expand = new EventEmitter<{ node: string, expand: boolean }>();
    @Output() watch = new EventEmitter<{ node: string, watch: boolean }>();

    titleY = 4;

    public getDimension() {
        const d = this.getLabelDimension();
        if (this.isDebugView() && this.activeWatching()) {
            //debugger view is 210x110
            d.height += 110;
            d.width = Math.max(d.width, 214);
        }
        return d;
    }

    public getLabelDimension() {
        const dimension = browserText.getDimensions(this.getShownLabel());
        dimension.width = Math.ceil(dimension.width);
        dimension.width += 6;
        dimension.height = 18;
        return dimension;
    }

    getShownLabel(): string {
        if (this.show === 'id') {
            return this.node.node.id;
        }
        if (this.show === 'shape') {
            return this.node.node.shape.join(', ');
        }
        return this.getLabelType();
    }

    getLabelType() {
        return this.node.node.label;
    }

    public isDebugView() {
        return this.view === 'debug';
    }

    isRecordable() {
        return this.node.node.recordable;
    }

    activeWatching() {
        return this.job.debuggingState.watchingLayers[this.node.node.id];
    }

    toggleWatch() {
        this.watch.emit({node: this.node.node.id, watch: !this.job.debuggingState.watchingLayers[this.node.node.id]});
    }
}

@Component({
    selector: '[job-model-graph-svg-op]',
    template: `
        <svg:g [class.decent]="highlightedLayers && !highlightedLayers[node.node.id]"
               [class.selected]="node.node.id === selectedNodeId">
            <svg:rect class="bg" rx="3" ry="3" (click)="selectNode.emit(node.node.id)"
                      x="0.5" y="0.5"
                      [attr.width]="node.width - 1" [attr.height]="node.height - 1"
            ></svg:rect>
            <ng-container *ngIf="show === 'type' && validIcons.has(node.node.subType.toLowerCase()); else asText">
                <svg:text x="8.5" y="8.5" text-anchor="middle" class="ui-icon">
                    graph-icon-{{node.node.subType.toLowerCase()}}</svg:text>
            </ng-container>
            <ng-template #asText>
                <svg:text class="label" [attr.y]="titleY"
                          [attr.x]="node.width / 2"
                          text-anchor="middle"
                          [attr.font-size.ox]="12">
                    {{getShownLabel()}}
                </svg:text>
            </ng-template>
        </svg:g>
    `,
    styles: [`
        text.label {
            fill: #979797;
        }

        .ui-icon {
            font-size: 15px
        }

        rect.bg {
            stroke: rgba(112, 112, 112, 0.53);
        }
    `]
})
export class JobModelGraphSvgOPComponent extends JobModelGraphSvgBase {
    public validIcons = new Set(['add', 'sub', 'div', 'mul']);

    getLabelDimension(): { width: number; height: number } {
        if (this.show === 'type' && this.validIcons.has(this.node.node.subType.toLowerCase())) {
            return {width: 17, height: 17};
        }

        return super.getLabelDimension();
    }

    getLabelType() {
        return this.node.node.subType;
    }
}

@Component({
    selector: '[job-model-graph-svg-primitive]',
    template: `
        <svg:g [class.decent]="highlightedLayers && !highlightedLayers[node.node.id]"
               [class.selected]="node.node.id === selectedNodeId">
            <svg:rect class="bg" rx="3" ry="3" (click)="selectNode.emit(node.node.id)"
                      x="0.5" y="0.5"
                      [attr.width]="node.width - 1" [attr.height]="node.height - 1"
            ></svg:rect>
            <ng-container *ngIf="show === 'type' && validIcons.has(node.node.subType.toLowerCase()); else asText">
                <svg:text x="8.5" y="8.5" text-anchor="middle" class="ui-icon">
                    graph-icon-{{node.node.subType.toLowerCase()}}</svg:text>
            </ng-container>
            <ng-template #asText>
                <svg:text class="label" [attr.y]="titleY"
                          [attr.x]="node.width / 2"
                          text-anchor="middle"
                          [attr.font-size.ox]="12">
                    {{getShownLabel()}}
                </svg:text>
            </ng-template>
        </svg:g>
    `,
    styles: [`
        text.label {
            fill: #979797;
        }

        .ui-icon {
            font-size: 15px
        }

        rect.bg {
            stroke: var(--rect-stroke);
        }
    `]
})
export class JobModelGraphSvgPrimitiveComponent extends JobModelGraphSvgBase {
    public validIcons = new Set(['tupleconstruct', 'listconstruct']);

    getLabelDimension(): { width: number; height: number } {
        if (this.show === 'type' && this.validIcons.has(this.node.node.subType.toLowerCase())) {
            return {width: 17, height: 17};
        }

        return super.getLabelDimension();
    }

    getLabelType() {
        return this.node.node.subType;
    }
}

@Component({
    selector: '[job-model-graph-svg-activation]',
    template: `
        <svg:g [class.decent]="highlightedLayers && !highlightedLayers[node.node.id]"
               [class.selected]="node.node.id === selectedNodeId">
            <svg:rect class="bg" rx="3" ry="3" (click)="selectNode.emit(node.node.id)"
                      x="0.5" y="0.5"
                      [attr.width]="node.width - 1" [attr.height]="node.height - 1"
            ></svg:rect>
            <svg:text class="label" [attr.y]="3"
                      [attr.x]="textX"
                      text-anchor="middle"
                      [attr.font-size.ox]="12">{{getShownLabel()}}</svg:text>

            <svg:text *ngIf="isDebugView() && isRecordable()" text-anchor="end" [attr.x]="node.width-2" y="8"
                      (click)="toggleWatch()"
                      [style.fill]="activeWatching() ? 'red': ''" class="ui-icon record">record
            </svg:text>

            <svg *ngIf="isDebugView() && activeWatching()"
                 [attr.x]="node.width / 2 - 214/2">
                <g job-graph-node-detail [jobId]="job.id" [node]="node.node" [snapshotId]="snapshotId"
                   [layerId]="node.node.id"></g>
            </svg>
        </svg:g>
    `,
    styles: [`
        rect.bg {
            stroke: rgba(255, 102, 42, 0.43);
        }
    `]
})
export class JobModelGraphSvgActivationComponent extends JobModelGraphSvgBase {
    get textX() {
        return this.node.width / 2 + (this.isDebugView() && this.isRecordable() ? -7 : 0);
    }
    getLabelDimension(): { width: number; height: number } {
        const d = super.getLabelDimension();
        if (this.isDebugView() && this.isRecordable()) {
            //we added a record button, so add 17px
            d.width += 20;
        }

        d.height = 16;
        return d;
    }

    getLabelType() {
        return this.node.node.subType;
    }
}


@Component({
    selector: '[job-model-graph-svg-io]',
    template: `
        <svg:g [class.decent]="highlightedLayers && !highlightedLayers[node.node.id]"
               [class.selected]="node.node.id === selectedNodeId">
            <svg:rect class="bg" rx="8" ry="8" (click)="selectNode.emit(node.node.id)"
                      x="0.5" y="0.5"
                      [attr.width]="node.width - 1" [attr.height]="node.height - 1"
            ></svg:rect>
            <svg:text class="label" [attr.y]="titleY"
                      [attr.x]="textX"
                      text-anchor="middle"
                      [attr.font-size.ox]="12">{{getShownLabel()}}</svg:text>

            <svg:text *ngIf="isDebugView() && isRecordable()" text-anchor="end" [attr.x]="node.width-2" y="9"
                      (click)="toggleWatch()"
                      [style.fill]="activeWatching() ? 'red': ''" class="ui-icon record">record
            </svg:text>

            <svg *ngIf="isDebugView() && activeWatching()"
                 [attr.x]="node.width / 2 - 214/2">
                <g job-graph-node-detail [jobId]="job.id" [node]="node.node" [snapshotId]="snapshotId"
                   [layerId]="node.node.id"></g>
            </svg>
        </svg:g>
    `,
    styles: [`
        rect.bg {
            stroke: var(--rect-stroke);
        }
    `]
})
export class JobModelGraphSvgInputOutputComponent extends JobModelGraphSvgBase {
    get textX() {
        return this.node.width / 2 + (this.isDebugView() && this.isRecordable() ? -7 : 0);
    }

    getLabelType() {
        return this.node.node.type + ' ' + this.node.node.label;
    }

    getLabelDimension() {
        const d = super.getLabelDimension();
        if (this.isDebugView() && this.isRecordable()) {
            //we added a record button, so add 17px
            d.width += 20;
        } else {
            d.width += 10;
        }
        return d;
    }
}

@Component({
    selector: '[job-model-graph-svg-scope]',
    template: `
        <svg:g [class.decent]="highlightedLayers && !highlightedLayers[node.node.id]"
               [class.selected]="node.node.id === selectedNodeId"
               [attr.data-node-height]="node.height"
        >
            <svg:rect class="bg" (click)="selectNode.emit(node.node.id)"
                      x="0.5" y="0.5" rx="3" ry="3"
                      [attr.width]="node.width - 1" [attr.height]="node.height - 1"
            ></svg:rect>

            <svg:svg class="expand" fill="#D9D9D9" fill-rule="nonzero"
                     (click)="expand.emit({node: node.id, expand: !expanded[node.id]})">
                <svg:rect class="bg" x="0.5" y="0.5" rx="3" ry="3" height="17" width="18"></svg:rect>
                <svg:text x="1" y="8" *ngIf="!expanded[node.id]" class="ui-icon">add</svg:text>
                <svg:text x="1" y="8" *ngIf="expanded[node.id]" class="ui-icon">remove</svg:text>
            </svg:svg>

            <svg:text class="label" [attr.y]="titleY" [attr.x]="node.width / 2" text-anchor="middle"
                      [attr.font-size.ox]="12">{{getShownLabel()}}</svg:text>

            <svg:text *ngIf="isDebugView() && isRecordable()" text-anchor="end" [attr.x]="node.width-2" y="9"
                      (click)="toggleWatch()"
                      [style.fill]="activeWatching() ? 'red': ''" class="ui-icon record">record
            </svg:text>

            <svg *ngIf="isDebugView() && activeWatching()" [attr.y]="node.height - 130"
                 [attr.x]="node.width / 2 - 214/2">
                <g job-graph-node-detail [jobId]="job.id" [node]="node.node" [snapshotId]="snapshotId"
                   [layerId]="node.node.id"></g>
            </svg>
        </svg:g>
        <ng-container *ngIf="node.subGraph">
            <svg:svg class="children"
                     [attr.y]="20"
                     [attr.x]="floor(node.width/2 - node.subGraph.width/2)"
                     [attr.data-graph-height]="node.subGraph.height"
                     job-model-graph-svg [edges]="node.subGraph.edges" [nodes]="node.subGraph.nodes"
                     [show]="show"
                     [view]="view"
                     [highlightedLayers]="highlightedLayers"
                     [snapshotId]="snapshotId"
                     [expanded]="expanded"
                     [selectedNodeId]="selectedNodeId"
                     (selectNode)="selectNode.emit($event)"
                     (expand)="expand.emit($event)"
                     (watch)="watch.emit($event)"
                     [job]="job" selectedNode="selectedNode"
            ></svg:svg>
        </ng-container>
    `,
    styles: [`
        rect.bg {
            stroke: var(--rect-stroke);
        }

        .expand svg {
            pointer-events: none;
        }
    `]
})
export class JobModelGraphSvgScopeComponent extends JobModelGraphSvgBase implements OnChanges {
    // color = '#3a3a3a';

    ngOnChanges(): void {
        // this.color = colorHash.hex(this.node.node.subType);
    }

    getShownLabel() {
        if (this.show === 'id') {
            return this.node.node.id;
        }
        if (this.show === 'shape') {
            return this.getLabelType();
        }
        return this.getLabelType();
    }

    getLabelType(): string {
        return this.node.node.subType;
    }

    ceil(v: number) {
        return Math.ceil(v);
    }

    floor(v: number) {
        return Math.floor(v);
    }

    getLabelDimension() {
        const d = super.getLabelDimension();
        d.width += 26 * 2; //for left side + icon
        return d;
    }
}

@Component({
    selector: '[job-model-graph-svg-layer]',
    template: `
        <svg:g [class.decent]="highlightedLayers && !highlightedLayers[node.node.id]"
               [class.selected]="node.node.id === selectedNodeId">
            <rect class="bg" rx="2" ry="2" (click)="selectNode.emit(node.node.id)"
                  x="0.5" y="0.5"
                  [attr.width]="node.width - 1" [attr.height]="node.height - 1"
            ></rect>

            <text class="label" [attr.y]="titleY"
                  [attr.x]="x"
                  text-anchor="middle"
                  [attr.font-size.ox]="12">{{getShownLabel()}}</text>

            <svg:text *ngIf="isDebugView() && isRecordable()" text-anchor="end" [attr.x]="node.width-2" y="9"
                      (click)="toggleWatch()"
                      [style.fill]="activeWatching() ? 'red': ''" class="ui-icon record">record
            </svg:text>

            <svg *ngIf="isDebugView() && activeWatching()"
                 [attr.x]="node.width / 2 - 214/2">
                <g job-graph-node-detail [jobId]="job.id" [node]="node.node" [snapshotId]="snapshotId"
                   [layerId]="node.node.id"></g>
            </svg>
        </svg:g>

        <ng-container *ngIf="node.subGraph">
            <svg class="children"
                 [attr.y]="20"
                 [attr.x]="floor(node.width/2 - node.subGraph.width/2)"
                 job-model-graph-svg
                 [edges]="node.subGraph.edges" [nodes]="node.subGraph.nodes"
                 [show]="show"
                 [view]="view"
                 [highlightedLayers]="highlightedLayers"
                 [snapshotId]="snapshotId"
                 [expanded]="expanded"
                 (selectNode)="selectNode.emit($event)"
                 (expand)="expand.emit($event)"
                 (watch)="watch.emit($event)"
                 [job]="job" selectedNode="selectedNode"
            ></svg>
        </ng-container>
    `,
    styles: [`
        rect.bg {
            stroke: var(--rect-stroke);
        }
    `]
})
export class JobModelGraphSvgLayerComponent extends JobModelGraphSvgBase {
    get x() {
        return this.node.width / 2 + (this.isDebugView() && this.isRecordable() ? -8 : 0);
    }

    getLabelDimension(): { width: number; height: number } {
        const d = super.getLabelDimension();
        if (this.isDebugView() && this.isRecordable()) {
            //we added a record button, so add 17px
            d.width += 20;
        } else {
            d.width += 8;
        }
        return d;
    }

    getLabelType(): string {
        return this.node.node.subType;
    }

    floor(v: number) {
        return Math.floor(v);
    }
}

@Component({
    selector: '[job-model-graph-svg]',
    template: `
        <svg:path *ngFor="let edge of edges; trackBy: trackIndex" [attr.d]="edge"></svg:path>

        <svg:svg *ngFor="let node of nodes; trackBy: trackNodeId"
                 [attr.data-id]="node.id" [attr.data-type]="node.node.type"
                 [attr.x]="norm(node.x - (node.width/2))" [attr.y]="norm(node.y - (node.height/2))"
                 [attr.width]="node.width" [attr.height]="node.height"
        >
            <ng-container *ngIf="shouldRender(node.node)">
                <svg
                    job-model-graph-svg-io
                    *ngIf="node.node.type === 'input' || node.node.type === 'output'"
                    [node]="node"
                    [show]="show"
                    [view]="view"
                    [highlightedLayers]="highlightedLayers"
                    [snapshotId]="snapshotId"
                    [expanded]="expanded"
                    (selectNode)="selectNode.emit($event)"
                    (expand)="expand.emit($event)"
                    (watch)="watch.emit($event)"
                    [job]="job"
                    [selectedNodeId]="selectedNodeId"></svg>
                <svg
                    job-model-graph-svg-activation
                    *ngIf="node.node.type === 'activation'"
                    [node]="node"
                    [show]="show"
                    [view]="view"
                    [highlightedLayers]="highlightedLayers"
                    [snapshotId]="snapshotId"
                    [expanded]="expanded"
                    (selectNode)="selectNode.emit($event)"
                    (expand)="expand.emit($event)"
                    (watch)="watch.emit($event)"
                    [job]="job"
                    [selectedNodeId]="selectedNodeId"></svg>
                <svg
                    job-model-graph-svg-op
                    *ngIf="node.node.type === 'op'"
                    [node]="node"
                    [show]="show"
                    [view]="view"
                    [highlightedLayers]="highlightedLayers"
                    [snapshotId]="snapshotId"
                    [expanded]="expanded"
                    (selectNode)="selectNode.emit($event)"
                    (expand)="expand.emit($event)"
                    (watch)="watch.emit($event)"
                    [job]="job"
                    [selectedNodeId]="selectedNodeId"></svg>
                <svg
                    job-model-graph-svg-primitive
                    *ngIf="node.node.type === 'primitive'"
                    [node]="node"
                    [show]="show"
                    [view]="view"
                    [highlightedLayers]="highlightedLayers"
                    [snapshotId]="snapshotId"
                    [expanded]="expanded"
                    (selectNode)="selectNode.emit($event)"
                    (expand)="expand.emit($event)"
                    (watch)="watch.emit($event)"
                    [job]="job"
                    [selectedNodeId]="selectedNodeId"></svg>
                <svg
                    job-model-graph-svg-layer
                    *ngIf="node.node.type === 'layer'"
                    [node]="node"
                    [show]="show"
                    [view]="view"
                    [highlightedLayers]="highlightedLayers"
                    [snapshotId]="snapshotId"
                    [expanded]="expanded"
                    (selectNode)="selectNode.emit($event)"
                    (expand)="expand.emit($event)"
                    (watch)="watch.emit($event)"
                    [job]="job"
                    [selectedNodeId]="selectedNodeId"></svg>
                <svg
                    job-model-graph-svg-scope
                    *ngIf="node.node.type === 'scope'"
                    [node]="node"
                    [show]="show"
                    [view]="view"
                    [highlightedLayers]="highlightedLayers"
                    [snapshotId]="snapshotId"
                    [expanded]="expanded"
                    (selectNode)="selectNode.emit($event)"
                    (expand)="expand.emit($event)"
                    (watch)="watch.emit($event)"
                    [job]="job"
                    [selectedNodeId]="selectedNodeId"></svg>
            </ng-container>
        </svg:svg>
    `,
    styleUrls: ['./job-model-graph-svg.component.scss']
})
export class JobModelGraphSvgComponent {
    @Input() nodes: NodeWithJobModelNode[] = [];
    @Input() edges: string[] = [];
    @Input() show: 'type' | 'id' | 'shape' = 'type';
    @Input() view: 'default' | 'debug' = 'default';
    @Input() highlightedLayers?: { [nodeId: string]: boolean };
    @Input() expanded?: { [nodeId: string]: boolean };
    @Input() snapshotId = '';
    @Input() job!: Job;
    @Input() selectedNodeId?: string;

    @Output() selectNode = new EventEmitter();
    @Output() expand = new EventEmitter<{ node: string, expand: boolean }>();
    @Output() watch = new EventEmitter<{ node: string, watch: boolean }>();

    static getRenderer(type: JobModelNodeType): typeof JobModelGraphSvgBase {
        if (type === JobModelNodeType.input) return JobModelGraphSvgInputOutputComponent;
        if (type === JobModelNodeType.output) return JobModelGraphSvgInputOutputComponent;
        if (type === JobModelNodeType.scope) return JobModelGraphSvgScopeComponent;
        if (type === JobModelNodeType.activation) return JobModelGraphSvgActivationComponent;
        if (type === JobModelNodeType.primitive) return JobModelGraphSvgPrimitiveComponent;
        if (type === JobModelNodeType.op) return JobModelGraphSvgOPComponent;

        return JobModelGraphSvgLayerComponent;
    }

    shouldRender(node: JobModelNode) {
        return node.type !== JobModelNodeType.scope_input;
    }


    trackIndex(index: number) {
        return index;
    }

    trackNodeId(index: number, node: NodeWithJobModelNode) {
        return node.node.id;
    }

    public norm(p: number) {
        return Math.ceil(p);
    }
}
