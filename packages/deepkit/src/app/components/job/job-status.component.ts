/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Component, Input} from '@angular/core';
import {Job, JobStatus} from "@deepkit/core";

@Component({
    selector: 'job-status',
    template: `
        <span *ngIf="getStatus() as status" [class]="'color-' + status.color">{{status.status}}</span>
    `,
    styles: [
            `
            :host {
                display: inline-block;
            }
        `
    ]
})
export class JobStatusComponent {
    @Input() public job?: Job;

    public status: string = '';
    public color: string = 'inherit';

    getStatus(): { status: string, color: string } | undefined {
        if (!this.job) return;

        if (JobStatus.creating === this.job.status) {
            this.status = 'Creating';
            this.color = 'orange';
        }

        if (JobStatus.created === this.job.status) {
            this.status = 'Created';
            this.color = 'orange';
        }

        // if (JobStatus.queued === this.job.status) {
        //     this.status = 'Queued';
        //     this.color = 'orange';
        // }
        //
        // if (JobStatus.assigned === this.job.status) {
        //     this.status = 'Assigned';
        //     this.color = 'inherit';
        // }

        if (JobStatus.running === this.job.status) {
            this.status = 'Running';
            this.color = 'orange';

            if (!this.job.isAlive()) {
                this.color = 'red';
            }
        }

        if (JobStatus.failed === this.job.status) {
            this.status = 'Failed';
            this.color = 'red';
        }

        if (JobStatus.aborted === this.job.status) {
            this.status = 'Aborted';
            this.color = 'red';
        }

        if (JobStatus.done === this.job.status) {
            this.status = 'Done';
            this.color = 'green';
        }

        if (JobStatus.crashed === this.job.status) {
            this.status = 'Crashed';
            this.color = 'red';
        }

        return {
            status: this.status,
            color: this.color,
        };
    }
}
