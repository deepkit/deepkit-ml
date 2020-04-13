/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    Input,
    OnChanges,
    OnDestroy,
    SimpleChanges
} from '@angular/core';
import {JobTaskInstance, JobTaskInstanceStatus} from "@deepkit/core";
import {Observable, Subscription} from "rxjs";
import {unsubscribe} from "../../reactivate-change-detection";

@Component({
    selector: 'job-task-instance-status',
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
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobTaskInstanceStatusComponent implements OnChanges, OnDestroy {
    @Input() public instance$!: Observable<JobTaskInstance>;

    public status: string = '';
    public color: string = 'inherit';

    @unsubscribe()
    protected sub?: Subscription;

    constructor(private cd: ChangeDetectorRef) {
    }

    ngOnDestroy(): void {
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (this.sub) this.sub.unsubscribe();
        this.sub = this.instance$.subscribe(this.update.bind(this));
    }

    update(instance: JobTaskInstance) {
        if (!instance) return;

        if (JobTaskInstanceStatus.pending === instance.status) {
            this.status = 'Pending';
            this.color = 'orange';
        }

        if (JobTaskInstanceStatus.booting === instance.status) {
            this.status = 'Booting';
            this.color = 'orange';
        }

        if (JobTaskInstanceStatus.docker_pull === instance.status) {
            this.status = 'Docker Pull';
            this.color = 'orange';
        }

        if (JobTaskInstanceStatus.docker_build === instance.status) {
            this.status = 'Docker Build';
            this.color = 'orange';
        }
        if (JobTaskInstanceStatus.docker_build_await === instance.status) {
            this.status = 'Docker Build Queued';
            this.color = 'orange';
        }

        if (JobTaskInstanceStatus.joining_network === instance.status) {
            this.status = 'Joining network';
            this.color = 'orange';
        }

        if (JobTaskInstanceStatus.checkout_files === instance.status) {
            this.status = 'Checkout files';
            this.color = 'orange';
        }

        if (JobTaskInstanceStatus.started === instance.status) {
            this.status = 'Running';
            this.color = 'orange';
        }

        if (JobTaskInstanceStatus.aborted === instance.status) {
            this.status = 'Aborted';
            this.color = '#8aab2d';
        }

        if (JobTaskInstanceStatus.done === instance.status) {
            this.status = 'Done';
            this.color = 'green';
        }

        if (JobTaskInstanceStatus.crashed === instance.status) {
            this.status = 'Crashed';
            this.color = 'red';
        }

        if (JobTaskInstanceStatus.failed === instance.status) {
            this.status = 'Failed';
            this.color = 'red';
        }

        this.cd.detectChanges();
    }
}
