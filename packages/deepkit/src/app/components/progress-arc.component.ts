/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges} from '@angular/core';

//from angular-progress-arc
@Component({
    selector: 'progress-arc',
    template: `
        <svg [attr.width]="size" [attr.height]="size">
            <circle fill="none" *ngIf="background"
                    [attr.cx]="size/2"
                    [attr.cy]="size/2"
                    [attr.r]="radius"
                    [attr.stroke]="background"
                    [attr.stroke-width]="strokeWidthCapped"/>

            <circle fill="none"
                    [attr.cx]="size/2"
                    [attr.cy]="size/2"
                    [attr.r]="radius"
                    [attr.stroke]="stroke"
                    [attr.stroke-width]="strokeWidthCapped"
                    [attr.stroke-dasharray]="circumference"
                    [attr.stroke-dashoffset]="(1 - complete) * circumference"
                    [attr.transform]="transform"/>
        </svg>
    `,
    // changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProgressArcComponent implements OnChanges {
    @Input() public size: number = 200;
    @Input() public strokeWidth: number = 20;
    @Input() public stroke: string = 'black';
    @Input() public counterClockwise: boolean = false;
    @Input() public complete: number = 0;
    @Input() public background: string | null = null;

    public offset: number = -90;
    public strokeWidthCapped: number = 0;
    public radius: number = 0;
    public circumference: number = 0;

    ngOnChanges(changes: SimpleChanges): void {
        this.strokeWidthCapped = Math.min(this.strokeWidth, this.size / 2 - 1);
        this.radius = Math.max((this.size - this.strokeWidthCapped) / 2 - 1, 0);
        this.circumference = 2 * Math.PI * this.radius;
    }

    get transform() {
        let transform = `rotate(${this.offset}, ${this.size / 2}, ${this.size / 2})`;

        if (this.counterClockwise) {
            transform += `translate3d(0, ${this.size}) scale(1, -1)`;
        }

        return transform;
    }
}
