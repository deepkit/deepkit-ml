/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {AfterViewInit, ChangeDetectorRef, Component, Input, OnDestroy} from "@angular/core";
import {ReactiveChangeDetectionModule} from "../reactivate-change-detection";
import {arrayRemoveItem, empty} from "@marcj/estdlib";

@Component({
    selector: 'dk-redraw',
    template: `
        <ng-content></ng-content>
    `
})
export class RedrawComponent implements AfterViewInit, OnDestroy {
    public static readonly intervals: { [time: number]: { timer: any, callbacks: Function[] } } = {};

    @Input() timesPerSecond: number = 1;

    interval?: any;

    protected markForCheck: Function;

    constructor(private cd: ChangeDetectorRef) {
        this.markForCheck = () => {
            cd.markForCheck();
        };
    }

    ngOnDestroy(): void {
        arrayRemoveItem(RedrawComponent.intervals[this.timesPerSecond].callbacks, this.markForCheck);

        if (empty(RedrawComponent.intervals[this.timesPerSecond].callbacks)) {
            clearInterval(RedrawComponent.intervals[this.timesPerSecond].timer);
            delete RedrawComponent.intervals[this.timesPerSecond];
        }
    }

    ngAfterViewInit(): void {
        if (!RedrawComponent.intervals[this.timesPerSecond]) {
            RedrawComponent.intervals[this.timesPerSecond] = {
                callbacks: [this.markForCheck],
                timer: setInterval(() => {
                    for (const cb of RedrawComponent.intervals[this.timesPerSecond].callbacks) {
                        cb();
                    }
                    ReactiveChangeDetectionModule.tick();
                }, 1000 / this.timesPerSecond)
            };
        } else {
            RedrawComponent.intervals[this.timesPerSecond].callbacks.push(this.markForCheck);
        }
    }
}
