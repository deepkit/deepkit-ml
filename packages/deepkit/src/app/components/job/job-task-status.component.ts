/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, SimpleChanges} from '@angular/core';
import {JobTaskStatus, JobTask} from "@deepkit/core";
import {Observable, Subscription} from "rxjs";
import {unsubscribe} from "../../reactivate-change-detection";

@Component({
    selector: 'job-task-status',
    template: `
        <span [class]="'color-' + color">{{status}}</span>
    `,
    styles: [
            `
            :host {
                display: inline-block;
                font-size: 11px;
                font-weight: normal;
                text-transform: uppercase;
            }
        `
    ]
})
export class JobTaskStatusComponent implements OnChanges, OnDestroy {
    @Input() public task$!: Observable<JobTask>;

    public status: string = '';
    public color: string = 'inherit';

    @unsubscribe()
    protected sub?: Subscription;

    constructor(private cd: ChangeDetectorRef) {
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (this.sub) {
            this.sub.unsubscribe();
        }

        this.sub = this.task$.subscribe(this.update.bind(this));
    }

    ngOnDestroy(): void {
    }

    update(task: JobTask) {
        if (!task) return;

        if (JobTaskStatus.pending === task.status) {
            this.status = 'Pending';
            this.color = '';
        }

        if (JobTaskStatus.queued === task.status) {
            this.status = 'Queued';
            this.color = '';
        }

        if (JobTaskStatus.assigned === task.status) {
            this.status = 'Assigned';
            this.color = '';
        }

        if (JobTaskStatus.started === task.status) {
            this.status = 'Running';
            this.color = 'orange';
        }

        if (JobTaskStatus.aborted === task.status) {
            this.status = 'Aborted';
            this.color = '#8aab2d';
        }

        if (JobTaskStatus.done === task.status) {
            this.status = 'Done';
            this.color = 'green';
        }

        if (JobTaskStatus.crashed === task.status) {
            this.status = 'Crashed';
            this.color = 'red';
        }

        if (JobTaskStatus.failed === task.status) {
            this.status = 'Failed';
            this.color = 'red';
        }
        this.cd.detectChanges();
    }
}
