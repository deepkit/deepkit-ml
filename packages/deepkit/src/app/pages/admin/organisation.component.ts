/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, OnDestroy} from "@angular/core";
import {FrontendUser} from "@deepkit/core";
import {ActivatedRoute, Router} from "@angular/router";
import {findRouteParameter} from "../../utils";
import {ControllerClient} from "../../providers/controller-client";
import {EntitySubject} from "@marcj/glut-core";
import {observe} from "../../reactivate-change-detection";
import {Breadcrumbs} from "../../providers/breadcrumbs";

@Component({
    template: `
        <div class="main-container" *ngIf="user$|async as user">
            <div class="header-banner">
                <div class="header-left">
                    <div style=" float: left; width: 70px; height: 70px; border: 1px solid silver; text-align: center; margin-right: 15px;">
                        <img
                            *ngIf="user.image"
                            style="max-width: 70px; max-height: 70px;"
                            [src]="user.image|objectURL"/>
                    </div>
                    <div class="title">{{user.username}}</div>
                </div>

                <div class="header-columns">
                    <div>
                        <label>Email</label>
                        {{user.email}}
                    </div>
                    <div>
                        <label>Registered</label>
                        {{user.created | date:'short'}}
                    </div>
                    <div>
                        <label>Updated</label>
                        {{user.updated | date:'short'}}
                    </div>
                </div>
            </div>

            <div class="tabs">
                <button>Projects</button>

                <button>Members</button>

                <button>Teams</button>

                <button>Settings</button>
            </div>

<!--            <router-outlet></router-outlet>-->
        </div>
    `
})
export class OrganisationComponent implements OnDestroy {
    @observe({unsubscribe: true})
    public user$?: EntitySubject<FrontendUser>;

    public userId?: string;

    constructor(
        public route: ActivatedRoute,
        public router: Router,
        public controllerClient: ControllerClient,
        protected cd: ChangeDetectorRef,
        protected breadcrumbs: Breadcrumbs,
    ) {
        this.breadcrumbs.addBreadCrumbTitleAtPosition(OrganisationComponent, 0, 'Organisation', ['../']);

        route.params.subscribe(async () => {
            if (this.user$) {
                await this.user$.unsubscribe();
            }

            this.userId = findRouteParameter(route, 'userId');
            this.user$ = await controllerClient.serverAdmin().getUser(this.userId);
            this.breadcrumbs.addBreadCrumbTitleAtPosition(OrganisationComponent, 1, this.user$.value.username);

            this.cd.detectChanges();
        });
    }

    ngOnDestroy(): void {
        this.breadcrumbs.deleteBreadCrumbs(OrganisationComponent);
    }
}
