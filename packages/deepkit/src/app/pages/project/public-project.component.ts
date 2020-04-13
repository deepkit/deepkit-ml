/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, OnDestroy, OnInit} from "@angular/core";
import {ActivatedRoute, Params, Router} from "@angular/router";
import {ControllerClient} from "../../providers/controller-client";
import {Project} from "@deepkit/core";
import {EntitySubject} from "@marcj/glut-core";
import {DuiDialog} from "@marcj/angular-desktop-ui";
import {observe, unsubscribe} from "../../reactivate-change-detection";
import {findRouteParameter, getResolvedUrl} from "../../utils";
import {loadQueryString, MainStore, MainStoreInterface} from "../../store";
import {classToPlain} from "@marcj/marshal";
import qs from "qs";
import { DuiApp } from "@marcj/angular-desktop-ui";

@Component({
    template: `
        <dui-window>
            <dui-window-header>
                <ng-container *ngIf="project$">
                    <dk-user-small [showImage]="false" [userId]="project$.value.owner"></dk-user-small>/{{project$.value.name|slice:0:100}}
                </ng-container>

                <div class="top-info">
                    <dui-icon clickable (click)="toggleColorTheme()" name="color-theme"></dui-icon>
                </div>
            </dui-window-header>

            <dui-window-content>
                <div *ngIf="error">
                    <h2>Could not access project</h2>
                    <p>
                        {{error}}
                    </p>
                </div>

                <dk-project-show *ngIf="!error" [readOnly]="readOnly" [project$]="project$"></dk-project-show>
            </dui-window-content>
        </dui-window>
    `,
    styles: [`
        .top-info {
            position: absolute;
            right: 13px;
            top: 2px;
        }
    `]
})
export class PublicProjectComponent implements OnInit, OnDestroy {
    @observe({unsubscribe: true})
    project$?: EntitySubject<Project>;

    public error?: string;

    public readOnly = true;

    @unsubscribe()
    protected autoConnect = this.controllerClient.subscribePublicAutoConnection(this.loadData.bind(this));

    constructor(
        protected route: ActivatedRoute,
        protected router: Router,
        protected controllerClient: ControllerClient,
        protected cd: ChangeDetectorRef,
        protected dialog: DuiDialog,
        protected store: MainStore,
        public duiApp: DuiApp,
    ) {
        if (location.search) {
            this.store.dispatch(loadQueryString({qs: location.search.substr(1)}));
        }
        this.store.onDispatch.subscribe(s => {
            const plainState: MainStoreInterface = classToPlain(MainStoreInterface, s);
            delete plainState.experimentView.filter.id;
            delete plainState.experimentView.filter.name;
            const url: string = getResolvedUrl(this.route.snapshot) + '?' + qs.stringify(plainState, {encodeValuesOnly: true});
            window.history.replaceState({path: url}, '', url);
        });
    }

    toggleColorTheme() {
        this.duiApp.theme = this.duiApp.theme === 'light' ? 'dark' : 'light';
    }

    async ngOnDestroy() {
    }

    async ngOnInit() {
        this.loadData();
    }

    protected async loadData() {
        this.error = '';
        try {
            this.project$ = await this.controllerClient.project().subscribePublicProject(
                findRouteParameter(this.route, 'username'),
                findRouteParameter(this.route, 'projectName'),
            );
        } catch (error) {
            this.error = error.message;
        }
        this.cd.detectChanges();
    }
}
