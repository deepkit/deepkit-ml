/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnChanges,
    OnDestroy,
    Output,
    SimpleChanges
} from "@angular/core";
import {Observable, Subscription} from "rxjs";
import {unsubscribe} from "../reactivate-change-detection";
import {StreamBehaviorSubject} from "@marcj/glut-core";

@Component({
    selector: 'shell-command',
    template: `
        <dui-dialog [(visible)]="visible" minWidth="80%" [minHeight]="250">
            <ng-container *dialogContainer>
                <h3>{{title}}</h3>

                <div style="max-height: 80%">
                    <dk-term [data]="output"></dk-term>
                </div>

                <div *ngIf="error">
                    <p class="selectable-text" style="color: var(--color-red)">{{error}}</p>
                </div>

                <dui-dialog-actions>
                    <dui-button closeDialog (click)="close()" [disabled]="doing">OK</dui-button>
                </dui-dialog-actions>
            </ng-container>
        </dui-dialog>
    `
})
export class ShellCommandComponent implements OnChanges, OnDestroy {
    @Input() observable!: Observable<string>;
    @Input() title: string = '';

    @Output() done = new EventEmitter;

    visible = true;

    @unsubscribe()
    protected sub?: Subscription;

    public output = new StreamBehaviorSubject('');
    public error = '';
    public doing = false;

    constructor(
        protected cd: ChangeDetectorRef,
    ) {
    }


    ngOnChanges(changes: SimpleChanges): void {
        if (changes.observable) {
            if (this.sub) {
                this.sub.unsubscribe();
                this.sub = undefined;
            }

            this.output.next('');
            this.error = '';
            this.doing = true;

            this.visible = true;
            this.sub = this.observable.subscribe((line) => {
                this.output.appendSubject.next(line);
                this.cd.detectChanges();
            }, (error) => {
                this.error = error;
                this.doing = false;
                this.cd.detectChanges();
            }, () => {
                this.doing = false;
                this.cd.detectChanges();
            });

            this.cd.detectChanges();
        }
    }

    close() {
        this.done.emit();
    }

    ngOnDestroy(): void {
    }
}
