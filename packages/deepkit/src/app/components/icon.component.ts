/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Component, HostBinding, Input} from "@angular/core";

@Component({
    selector: 'dk-icon',
    template: `{{name}}`,
    styles: [`
    :host {
        vertical-align: middle;
    }`]
})
export class IconComponent {
    @Input() name!: string;

    @Input() size: number = 18;

    @HostBinding('style.width')
    get width() {
        return this.size + 'px';
    }
    @HostBinding('style.font-size')
    get fontSize() {
        return (this.size) + 'px';
    }
}
