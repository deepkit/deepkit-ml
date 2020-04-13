/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Component, Input} from "@angular/core";

@Component({
    selector: 'dk-tag',
    template: `
        <span class="tag">{{tag}}</span>
    `,
    host: {
        '[class.tag-style]': 'styledTag',
    },
    styles: [`
        :host {
            display: inline-block;
        }

        :host.tag-style .tag {
            padding: 1px 2px;
            margin: 0 1px;
            border-radius: 2px;
            background-color: rgba(191, 191, 191, 0.2);
        }
    `]
})
export class TagComponent {
    @Input() tag!: string;
    @Input() styledTag: boolean = false;
}
