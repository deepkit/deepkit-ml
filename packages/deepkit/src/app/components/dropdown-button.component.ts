/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Component, EventEmitter, HostListener, Input, OnDestroy, Output,} from "@angular/core";
import {unsubscribe} from "../reactivate-change-detection";
import {Subscriptions} from "@marcj/estdlib-rxjs";

@Component({
    selector: 'dk-dropdown-button-option',
    template: `
        <ng-content></ng-content>
    `
})
export class DropdownButtonOptionComponent {
    @Input('name') name?: string;
}

@Component({
    selector: 'dk-dropdown-button',
    template: `
        <button (click)="click.emit($event)">
            <ng-content></ng-content>
        </button>
        <span class="arrow" (click)="openDropDown()">
            <img src="assets/images/arrow.svg"/>
        </span>
        <div class="dropdown">
            <ng-content select="dk-dropdown-button-option"></ng-content>
        </div>
    `,
    styleUrls: ['./dropdown-button.component.scss']
})
export class DropdownButtonComponent<T> implements OnDestroy {
    @Input() model?: T;

    @Output() modelChange = new EventEmitter<T>();

    @Output() click = new EventEmitter<MouseEvent>();

    // @ContentChildren(DropdownButtonOptionComponent) options?: QueryList<DropdownButtonOptionComponent>;

    @unsubscribe()
    private subscriptions = new Subscriptions;

    ngOnDestroy(): void {
    }

    // ngAfterViewInit() {
    //     if (this.options) {
    //         this.subscriptions.add = this.options.changes.subscribe(() => {
    //             this.updateOptions();
    //         });
    //     }
    // }
    //
    // private updateOptions() {
    //     for (const column of this.options.toArray()) {
    //         // this.displayedColumns.push(column.name!);
    //     }
    // }


    public openDropDown() {
        // this.model = !this.model;
        // this.modelChange.emit(this.model);
    }

    @HostListener('click')
    public onClick() {
        // this.model = !this.model;
        // this.modelChange.emit(this.model);
    }
}
