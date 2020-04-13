/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Component, Input} from "@angular/core";

@Component({
    selector: 'dk-label',
    template: `
        <span class="bullet">&bull;</span> {{label}}
    `,
    styles: [`
        :host {
            display: inline-block;
            background: var(--panel-background);
            padding: 0px 3px;
            padding-bottom: 2px;
            border-radius: 3px;
            margin-right: 2px;
            font-size: 11px;
            line-height: 12px;
            margin-bottom: 1px;
        }

        .bullet {
            font-size: 14px;
            font-weight: bold;
            color: var(--color);
        }
    `],
    host: {
        '[style.--color]': 'color',
    }
})
export class LabelComponent {
    @Input() label: string = '';
    @Input() color: string = '#78963f';
}
