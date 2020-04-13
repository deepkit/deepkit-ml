/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Component, EventEmitter, Input, OnChanges, Output, SimpleChanges} from "@angular/core";
import {JobResources} from "@deepkit/core";

export enum ResourcesType {
    none = 'none',
    auto = 'auto',
    exact = 'exact',
    minimum = 'minimum',
    from_to = 'from_to',
}

@Component({
    selector: 'dk-resources',
    template: `
        <div>
            <div class="label">CPU cores:</div>
            <dui-select textured [(ngModel)]="cpuType" (ngModelChange)="changedCpu($event)">
                <dui-option value="auto">Auto</dui-option>
                <dui-option value="exact">Exactly</dui-option>
                <dui-option value="minimum">Minimum</dui-option>
                <dui-option value="from_to">Min/Max</dui-option>
            </dui-select>

            <dui-input round *ngIf="cpuType === 'exact'" [(ngModel)]="resources.cpu" (ngModelChange)="changed.emit()" type="number" placeholder="cores"></dui-input>
            <dui-input round *ngIf="cpuType === 'minimum' || cpuType === 'from_to'" [(ngModel)]="resources.minCpu"
                       (ngModelChange)="changed.emit()" type="number" placeholder="cores"></dui-input>

            <ng-container *ngIf="cpuType === 'from_to'">
                <div class="text-block">up to</div>
                <dui-input round [(ngModel)]="resources.maxCpu" (ngModelChange)="changed.emit()" type="number" placeholder="cores"></dui-input>
            </ng-container>
        </div>
        <div>
            <div class="label">Memory:</div>
            <dui-select textured [(ngModel)]="memoryType" (ngModelChange)="changedMemory($event)">
                <dui-option value="auto">Auto</dui-option>
                <dui-option value="exact">Exactly</dui-option>
                <dui-option value="minimum">Minimum</dui-option>
                <dui-option value="from_to">Min/Max</dui-option>
            </dui-select>

            <dui-input round *ngIf="memoryType === 'exact'" [(ngModel)]="resources.memory" (ngModelChange)="changed.emit()" type="number" placeholder="GB"></dui-input>
            <dui-input round *ngIf="memoryType === 'minimum' || memoryType === 'from_to'" [(ngModel)]="resources.minMemory"
                       (ngModelChange)="changed.emit()" type="number" placeholder="GB"></dui-input>

            <ng-container *ngIf="memoryType === 'from_to'">
                <div class="text-block">up to</div>
                <dui-input round [(ngModel)]="resources.maxMemory" (ngModelChange)="changed.emit()" type="number" placeholder="GB"></dui-input>
            </ng-container>
            <div class="text-block">GB</div>
        </div>
        <div>
            <div class="label">GPU cores:</div>
            <dui-select textured [(ngModel)]="gpuType" (ngModelChange)="changedGpu($event)">
                <dui-option value="none">None</dui-option>
                <dui-option value="exact">Exactly</dui-option>
                <dui-option value="minimum">Minimum</dui-option>
                <dui-option value="from_to">Min/Max</dui-option>
            </dui-select>

            <dui-input round *ngIf="gpuType === 'exact'" [(ngModel)]="resources.gpu" (ngModelChange)="changed.emit()" type="number" placeholder="cores"></dui-input>
            <dui-input round *ngIf="gpuType === 'minimum' || gpuType === 'from_to'" [(ngModel)]="resources.minGpu"
                       (ngModelChange)="changed.emit()" type="number" placeholder="cores"></dui-input>

            <ng-container *ngIf="gpuType === 'from_to'">
                <div class="text-block">up to</div>
                <dui-input round [(ngModel)]="resources.maxGpu" (ngModelChange)="changed.emit()" type="number" placeholder="cores"></dui-input>
            </ng-container>

            <ng-container *ngIf="gpuType !== 'none'">
                <div class="text-block">with at least</div>
                <dui-input round [(ngModel)]="resources.minGpuMemory" (ngModelChange)="changed.emit()" type="number" placeholder="GB"></dui-input>
                <div class="text-block">GB</div>
            </ng-container>
        </div>
    `,
    styleUrls: [`./resources.component.scss`]
})
export class ResourcesComponent implements OnChanges {
    @Input() resources!: JobResources;

    @Output() changed = new EventEmitter();

    cpuType: ResourcesType = ResourcesType.auto;
    gpuType: ResourcesType = ResourcesType.auto;
    memoryType: ResourcesType = ResourcesType.auto;


    detectTypeFor(resources: JobResources, name = 'cpu'): ResourcesType {
        const r = resources as any;

        if (r[name] > 0) {
            return ResourcesType.exact;
        }

        const capitalised = name.substr(0, 1).toUpperCase() + name.substr(1);

        const hasMin = r['min' + capitalised] > 0;
        const hasMax = r['max' + capitalised] > 0;

        if (hasMin) {
            if (hasMax) {
                return ResourcesType.from_to;
            } else {
                return ResourcesType.minimum;
            }
        }

        if (name === 'gpu') {
            return ResourcesType.none;
        }

        return ResourcesType.auto;
    }

    public changedMemory(type: ResourcesType) {
        if (type === ResourcesType.auto) {
            this.resources.memory = 0;
            this.resources.minMemory = 0;
            this.resources.maxMemory = 0;
        }

        if (type === ResourcesType.exact) {
            if (this.resources.memory === 0 && this.resources.minMemory) {
                this.resources.memory = this.resources.minMemory;
            }
            this.resources.minMemory = 0;
            this.resources.maxMemory = 0;
        }

        if (type === ResourcesType.minimum) {
            this.resources.memory = 0;
            this.resources.maxMemory = 0;
        }

        if (type === ResourcesType.from_to) {
            this.resources.maxMemory = this.resources.minMemory + 1;
        }
        this.changed.emit();
    }


    public changedCpu(type: ResourcesType) {
        if (type === ResourcesType.auto) {
            this.resources.cpu = 0;
            this.resources.minCpu = 0;
            this.resources.maxCpu = 0;
        }

        if (type === ResourcesType.exact) {
            if (this.resources.cpu === 0 && this.resources.minCpu) {
                this.resources.cpu = this.resources.minCpu;
            }
            this.resources.minCpu = 0;
            this.resources.maxCpu = 0;
        }

        if (type === ResourcesType.minimum) {
            this.resources.cpu = 0;
            this.resources.maxCpu = 0;
        }
        if (type === ResourcesType.from_to) {
            this.resources.maxCpu = this.resources.minCpu + 1;
        }
        this.changed.emit();
    }

    public changedGpu(type: ResourcesType) {
        if (type === ResourcesType.none) {
            this.resources.gpu = 0;
            this.resources.minGpu = 0;
            this.resources.maxGpu = 0;
        }

        if (type === ResourcesType.exact) {
            if (this.resources.gpu === 0 && this.resources.minGpu) {
                this.resources.gpu = this.resources.minGpu;
            }
            this.resources.minGpu = 0;
            this.resources.maxGpu = 0;
        }

        if (type === ResourcesType.minimum) {
            this.resources.gpu = 0;
            this.resources.maxGpu = 0;
        }

        if (type === ResourcesType.from_to) {
            this.resources.maxGpu = this.resources.minGpu + 1;
        }
        this.changed.emit();
    }

    ngOnChanges(changes: SimpleChanges) {
        if (this.resources) {
            this.cpuType = this.detectTypeFor(this.resources, 'cpu');
            this.gpuType = this.detectTypeFor(this.resources, 'gpu');
            this.memoryType = this.detectTypeFor(this.resources, 'memory');
        }
    }
}
