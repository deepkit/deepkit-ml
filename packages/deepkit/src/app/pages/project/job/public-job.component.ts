/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, OnDestroy, OnInit} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import {findRouteParameter} from "../../../utils";
import {ControllerClient} from "../../../providers/controller-client";
import {Job, Project} from "@deepkit/core";
import {EntitySubject} from "@marcj/glut-core";
import {DuiDialog} from "@marcj/angular-desktop-ui";
import {unsubscribe} from "../../../reactivate-change-detection";

@Component({
    template: `
        <dui-window>
            <dui-window-header size="small">
                <ng-container *ngIf="job$ && project$">
                    {{project$.value.name|slice:0:25}} - Experiment #{{job$.value.number}}
                </ng-container>

                <dui-window-toolbar>
                    <dui-window-toolbar-container name="main"></dui-window-toolbar-container>

                    <dui-window-toolbar-container name="main_right"
                                                  style="margin-left: auto;"></dui-window-toolbar-container>
                </dui-window-toolbar>
            </dui-window-header>

            <dui-window-content>

                <div *ngIf="error">
                    <h2>Could not access experiment</h2>
                    <p>
                        {{error}}
                    </p>
                </div>
                <dk-job-show *ngIf="project$ && job$"
                             [readOnly]="true"
                             [project$]="project$" [job$]="job$"></dk-job-show>
            </dui-window-content>
        </dui-window>
    `
})
export class PublicJobComponent implements OnInit, OnDestroy {
    project$?: EntitySubject<Project>;
    job$?: EntitySubject<Job>;

    public error?: string;

    @unsubscribe()
    protected autoConnect = this.controllerClient.subscribePublicAutoConnection(this.loadData.bind(this));

    constructor(
        protected route: ActivatedRoute,
        protected router: Router,
        protected controllerClient: ControllerClient,
        protected cd: ChangeDetectorRef,
        protected dialog: DuiDialog,
    ) {
    }

    ngOnDestroy() {
    }

    async ngOnInit() {
        this.loadData();
    }

    protected async loadData() {
        const api = this.controllerClient.publicJob();
        const jobId = findRouteParameter(this.route, 'jobId');
        const token = findRouteParameter(this.route, 'token');
        this.error = '';
        try {
            await api.authorizeConnection(jobId, token);
            this.project$ = await api.subscribeProjectForJob(jobId);
            this.job$ = await api.subscribeJob(jobId);
        } catch (e) {
            this.error = e.message || e;
        } finally {
            this.cd.detectChanges();
        }
    }
}
