/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, Input, OnInit} from "@angular/core";
import {DialogComponent, ExecutionState} from "@marcj/angular-desktop-ui";
import {ControllerClient} from "../providers/controller-client";
import {Job, JobQueueItem} from "@deepkit/core";
import {Collection} from "@marcj/glut-core";
import {MainStore} from "../store";

interface JobQueueTableItem {
    userId: string;
    projectName: string;
    jobNumber: number;

    task: string;
    priority: number;

    position: number;
    tries: number;
    result: string;

    added: Date;
}

@Component({
    template: `
        <ng-container>
            <h3 style="margin-bottom: 10px;">Queued experiments</h3>

            <dui-button-group>
                <dui-button (click)="assignJobsExecutor.execute()" [disabled]="assignJobsExecutor.running">Assign experiments</dui-button>
            </dui-button-group>

            <dui-table
                style="flex: 1; margin: 8px;"
                [autoHeight]="false"
                [items]="jobQueueItems"
                noFocusOutline
                [selectable]="true"
            >
                <dui-table-column name="userId" header="User" [width]="130">
                    <ng-container *duiTableCell="let row">
                        <dk-user-small [userId]="row.userId"></dk-user-small>
                    </ng-container>
                </dui-table-column>

                <dui-table-column name="projectName" header="project" [width]="130"></dui-table-column>
                <dui-table-column name="jobNumber" header="Job ID" [width]="50"></dui-table-column>

                <dui-table-column name="task" header="Task name" [width]="100"></dui-table-column>
                <dui-table-column name="priority" header="Priority" [width]="60"></dui-table-column>

                <dui-table-column name="position" header="Position" [width]="60"></dui-table-column>

                <dui-table-column name="tries" header="Tries" [width]="50"></dui-table-column>

                <dui-table-column name="added" header="Added" [width]="130">
                    <ng-container *duiTableCell="let row">
                        {{row.added | date:'short'}}
                    </ng-container>
                </dui-table-column>

                <dui-table-column name="status" header="Status" [width]="150"></dui-table-column>
            </dui-table>

            <dui-dialog-actions>
                <dui-button closeDialog>Close</dui-button>
            </dui-dialog-actions>
        </ng-container>
    `
})
export class JobQueueDialogComponent implements OnInit {
    static dialogDefaults = {
        height: '90%',
        width: 950,
    };

    @Input() jobQueue!: Collection<JobQueueItem>;

    jobQueueItems: JobQueueTableItem[] = [];

    assignJobsExecutor = new ExecutionState(this.cd, this.assignJobs.bind(this));

    constructor(
        protected store: MainStore,
        protected cd: ChangeDetectorRef,
        protected controllerClient: ControllerClient,
        protected dialogRef: DialogComponent,
    ) {
    }

    async ngOnInit() {

        this.jobQueue.subscribe(async (items) => {
            //load job data a
            const jobQueueItems: JobQueueTableItem[] = [];
            const jobMap: {[id: string]: Job} = {};
            const promises: Promise<void>[] = [];

            for (const item of items) {
                promises.push(this.controllerClient.getJob(item.job).then(job => {
                    jobMap[job.id] = job.value;
                }));
            }

            await Promise.all(promises);
            console.log('items', items);
            console.log('jobMap', jobMap);

            for (const item of items) {
                const task = jobMap[item.job].getTask(item.task);
                let projectName = '';
                if (this.store.value.projects) {
                    projectName = this.store.value.projects.get(jobMap[item.job].project)!.name;
                }
                jobQueueItems.push({
                    userId: item.userId,
                    added: item.added,
                    task: item.task,
                    priority: item.priority,
                    jobNumber: jobMap[item.job].number,
                    projectName: projectName,
                    position: task.queue.position,
                    tries: task.queue.tries,
                    result: task.queue.result,
                });
            }

            this.jobQueueItems = jobQueueItems;
            this.cd.detectChanges();
        });
    }

    async assignJobs() {
        await this.controllerClient.admin().assignJobs();
    }
}
