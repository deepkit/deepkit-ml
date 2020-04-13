/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, OnDestroy, ViewContainerRef} from "@angular/core";
import {FrontendUser} from "@deepkit/core";
import {observe} from "../../reactivate-change-detection";
import {ActivatedRoute, Router} from "@angular/router";
import {EntitySubject, ItemObserver} from "@marcj/glut-core";
import {ControllerClient} from "../../providers/controller-client";
import {Breadcrumbs} from "../../providers/breadcrumbs";
import {findRouteParameter} from "../../utils";
import {DuiDialog} from "@marcj/angular-desktop-ui";

@Component({
    template: `
        <ng-container *ngIf="user$|async as user">
            <div>
                <div class="actions topless">
                    <div class="right">
                        <button class="primary" [disabled]="!watcher.changed()" (click)="save()">
                            Save
                        </button>

                        <button (click)="updatePassword()" *ngIf="user.isOrganisation()">
                            Update password
                        </button>

                        <button class="danger last" (click)="remove()">
                            Delete
                        </button>
                    </div>
                </div>
            </div>

            <div class="inset-h columns" *ngIf="user">
                <div style="width: 50%;">
                    <div>
                        <div>Image</div>
                        <div>
                            <dk-file [(model)]="user.image" ></dk-file>
                        </div>
                    </div>

                    <div>
                        <div>Username</div>
                        <div>
                            <input type="text" required [(ngModel)]="user.username" />
                        </div>
                    </div>

                    <div>
                        <div>Email</div>
                        <div>
                            <input type="text" required [(ngModel)]="user.email" />
                        </div>
                    </div>
                </div>
            </div>
        </ng-container>
    `
})
export class UserSettingsComponent implements OnDestroy {
    @observe({unsubscribe: true})
    public user$?: EntitySubject<FrontendUser>;

    public userId?: string;

    public watcher = new ItemObserver<FrontendUser>();

    constructor(
        public route: ActivatedRoute,
        public router: Router,
        public controllerClient: ControllerClient,
        protected dialog: DuiDialog,
        protected cd: ChangeDetectorRef,
        protected breadcrumbs: Breadcrumbs,
    ) {

        route.params.subscribe(async () => {
            if (this.user$) {
                await this.user$.unsubscribe();
            }

            this.userId = findRouteParameter(route, 'userId');
            this.user$ = await controllerClient.serverAdmin().getUser(this.userId);

            (window as any)['user'] = this.user$.value;
            this.watcher.start(this.user$);

            this.cd.detectChanges();
        });
    }

    ngOnDestroy(): void {
    }

    async remove() {
        if (this.userId) {
            const a = await this.dialog.confirm('Delete user?');
            if (a) {
                await this.controllerClient.serverAdmin().removeUser(this.userId);
                this.router.navigate(['/admin/organisation']);
            }
        }
    }

    async updatePassword() {
        if (this.userId) {
            const password = await this.dialog.prompt('New password', '');
            if (password) {
                await this.controllerClient.serverAdmin().updatePassword(this.userId, password);
            }
        }
    }

    async save() {
        if (this.userId && this.watcher && this.watcher.changed()) {
            this.user$!.value.updated = new Date();
            try {
                await this.controllerClient.serverAdmin().patchUser(this.userId, this.watcher.getPatches());
                this.watcher.reset();
                this.cd.detectChanges();
            } catch (error) {
                console.error(error);
                //todo, show error
            }
        }
    }
}
