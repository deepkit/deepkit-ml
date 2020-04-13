/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Component, Input, OnChanges, SimpleChanges} from "@angular/core";

@Component({
    selector: '[job-histogram]',
    template: `
        <svg:text [attr.x]="0" [attr.y]="0">{{title}}</svg:text>
        <svg [attr.y]="10">
            <svg:polygon [attr.points]="points"/>
        </svg>
<!--        <svg:text class="monospace" [attr.x]="110" [attr.y]="4">min</svg:text>-->
<!--        <svg:text class="monospace" [attr.x]="110" [attr.y]="14">avg</svg:text>-->
<!--        <svg:text class="monospace" [attr.x]="110" [attr.y]="24">max</svg:text>-->
<!--        <svg:text class="monospace" text-anchor="end" [attr.x]="200" [attr.y]="4">{{minValue|number:'0.4-7'|slice:0:9}}</svg:text>-->
<!--        <svg:text class="monospace" text-anchor="end" [attr.x]="200" [attr.y]="14">{{avgValue|number:'0.4-7'|slice:0:9}}</svg:text>-->
<!--        <svg:text class="monospace" text-anchor="end" [attr.x]="200" [attr.y]="24">{{maxValue|number:'0.4-7'|slice:0:9}}</svg:text>-->
    `,
    host: {},
    styles: [`
        :host {
            pointer-events: none;
        }

        text {
            font-size: 9px;
            fill: var(--text);
            pointer-events: none;
        }

        text.monospace {
            font-size: 8px;
        }

        polygon {
            fill: #714229;
            stroke: #a06028;
        }

        :host-context(.light) polygon {
            fill: #eaaa87;
            stroke: #bfa173;
        }
    `]
})
export class JobHistogramComponent implements OnChanges {
    @Input() data!: [number, number, number[], number[]][];
    @Input() title = '';

    width = 100;
    height = 20;

    minValue = 0;
    maxValue = 0;
    avgValue = 0;
    points = '';

    ngOnChanges(changes: SimpleChanges): void {
        this.points = this.getPoints(0);
    }

    getPoints(i: number): string {
        let points = '0,' + this.height;
        let pos = 0;
        const maxYValue = Math.max.apply(null, this.data[i][3]);
        this.avgValue = 0;
        for (const v of this.data[i][2]) {
            this.avgValue += v;
        }
        this.avgValue /= this.data[i][2].length;
        this.maxValue = Math.max.apply(null, this.data[i][2]);
        this.minValue = Math.min.apply(null, this.data[i][2]);
        const items = this.data[i][3].length;

        for (const v of this.data[i][3]) {
            pos += this.width / (items + 1);
            points += ` ${pos},${this.height - (v * this.height / maxYValue)}`;
        }
        pos += this.width / (items + 1);
        points += ` ${pos},${this.height} 0,${this.height}`;
        return points;
    }
}
