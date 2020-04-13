/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    ChangeDetectorRef,
    Component, ElementRef,
    EventEmitter,
    HostListener,
    Input,
    OnChanges,
    Output,
    QueryList,
    ViewChildren
} from "@angular/core";

@Component({
    selector: 'dk-history-bar',
    template: `
        <div class="container">
            <div class="bg-line"></div>
            <div class="line" #line (click)="selected = i; selectedChange.next(i)"
                 [class.selected]="selected === i" *ngFor="let line of items; let i = index, trackBy: tracker">
                <div></div>
            </div>
        </div>
    `,
    host: {
        '[class.overlay-scrollbar-small]': 'true',
        '[attr.tabindex]': '1',
    },
    styles: [`
        :host {
            display: block;
            height: calc(44px + 10px);
        }

        .container {
            display: inline-block;
            position: relative;
            white-space: nowrap;
            min-width: 100%;
            height: 44px;
        }

        .line {
            display: inline-block;
            position: relative;
            height: 44px;
            width: 10px;
            text-align: center;
            border-radius: 10px;
        }

        .line div {
            width: 2px;
            height: 44px;
            background: linear-gradient(180deg, rgba(0, 0, 0, 0.36) 0%, rgba(0, 0, 0, 0.28) 100%);
            border-radius: 3px;
            display: inline-block;
        }

        .line.selected div {
            background: var(--dui-selection);
        }

        .line:hover {
            background: var(--dui-selection-unfocused);
        }

        .bg-line {
            position: absolute;
            top: 21px;
            height: 2px;
            left: 0;
            right: 0;
            background: linear-gradient(180deg, rgba(0, 0, 0, 0.36) 0%, rgba(0, 0, 0, 0.28) 100%);
            border-radius: 3px;
        }

    `]
})
export class HistoryBarComponent implements OnChanges {
    @Input() size: number = 0;

    @ViewChildren('line') lines?: QueryList<ElementRef>;

    items: any[] = [];

    @Input() selected: number = -1;
    @Output() selectedChange = new EventEmitter<number>();

    constructor(protected cd: ChangeDetectorRef) {
    }

    tracker(index: number) {
        return index;
    }

    @HostListener('keydown', ['$event'])
    onKeyDown(event: KeyboardEvent) {
        if (event.key === 'Home') {
            event.preventDefault();
            this.selected = 0;
        } else if (event.key === 'End') {
            event.preventDefault();
            this.selected = this.size - 1;
        } else if (event.key === 'PageUp') {
            event.preventDefault();
            this.selected = Math.max(0, this.selected - 10);
        } else if (event.key === 'PageDown') {
            event.preventDefault();
            this.selected = Math.min(this.size - 1, this.selected + 10);
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            if (event.metaKey) {
                this.selected = 0;
            } else {
                this.selected = Math.max(0, this.selected - 1);
            }
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            if (event.metaKey) {
                this.selected = this.size - 1;
            } else {
                this.selected = Math.min(this.size - 1, this.selected + 1);
            }
        }
        this.selectedChange.next(this.selected);

        if (this.lines) {
            const selected = this.lines.toArray()[this.selected];
            if (selected) {
                selected.nativeElement.scrollIntoView({block: 'nearest', inline: 'nearest'});
            }
        }

        this.cd.detectChanges();
    }

    ngOnChanges(): void {
        this.items = new Array(this.size);
        this.cd.detectChanges();

        if (this.lines) {
            const selected = this.lines.toArray()[this.selected];
            if (selected) {
                selected.nativeElement.scrollIntoView({block: 'nearest', inline: 'nearest'});
            }
        }
    }
}
