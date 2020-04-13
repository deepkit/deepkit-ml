/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Component, Input, OnInit} from "@angular/core";
import {FrontendUser} from "@deepkit/core";
import {ControllerClient} from "../providers/controller-client";
import {MainStore} from "../store";
import {TypedFormGroup} from "../utils";
import {cloneClass} from "@marcj/marshal";
import {DuiDialog} from "@marcj/angular-desktop-ui";

@Component({
    template: `
        <div style="position: absolute; left: 0; right: 0; top: 14px; display: flex; justify-content: center">
            <dui-select textured [ngModel]="user" (ngModelChange)="setUser($event)" style="position: absolute; left: 32px;">
                <dui-option [value]="controllerClient.getAuthenticatedUser().value">
                    {{controllerClient.getAuthenticatedUser().value.username}}
                </dui-option>
                <dui-option *ngFor="let user of store.value.organisations|async" [value]="user">
                    {{user.username}}
                </dui-option>
            </dui-select>

            <dui-button-group padding="none">
                <dui-button textured [active]="tab === 'general'" (click)="tab = 'general'">General</dui-button>
                <dui-button textured *ngIf="userForm.value.isOrganisation()"
                            [active]="tab === 'members'" (click)="tab = 'members'">Members</dui-button>
            </dui-button-group>
        </div>

        <div class="dui-panel" *ngIf="user" style="height: calc(100% - 11px); margin-top: 11px; padding: 12px;">
            <ng-container *ngIf="tab === 'members'">
                <admin-organisation-member-list [organisationId]="userForm.value.id"></admin-organisation-member-list>
            </ng-container>
            <ng-container *ngIf="tab === 'general'">
                <dui-form #form [formGroup]="userForm" [submit]="save.bind(this)">
                    <dui-form-row label="Type">
                        <div *ngIf="userForm.value.isOrganisation()">Organisation</div>
                        <div *ngIf="!userForm.value.isOrganisation()">User</div>
                    </dui-form-row>

                    <dui-form-row label="Image">
                        <img
                            *ngIf="userForm.value.image"
                            class="user-image"
                            [src]="userForm.value.image|objectURL"/>

                        <dui-input type="file" formControlName="image"></dui-input>
                    </dui-form-row>

                    <dui-form-row label="Username">
                        <dui-input formControlName="username"></dui-input>
                    </dui-form-row>

                    <dui-form-row label="Email">
                        <dui-input formControlName="email"></dui-input>
                    </dui-form-row>

                    <dui-form-row label="Password" *ngIf="!userForm.value.isOrganisation()">
                        <div>
                            <dui-button (click)="updatePassword()">Change password</dui-button>
                        </div>
                    </dui-form-row>
                </dui-form>

                <dui-button [submitForm]="form" [disabled]="userForm.invalid || !userForm.touched">Save</dui-button>
            </ng-container>
        </div>

        <dui-dialog-actions>
            <dui-button closeDialog>Close</dui-button>
        </dui-dialog-actions>
    `
})
export class UserSettingsDialogComponent implements OnInit {
    static dialogDefaults = {
        minWidth: 750,
        minHeight: 450,
    };

    tab: 'general' | 'members' = 'general';

    @Input() user?: FrontendUser;

    userForm = TypedFormGroup.fromEntityClass(FrontendUser);

    constructor(
        public controllerClient: ControllerClient,
        public store: MainStore,
        public dialog: DuiDialog,
    ) {
    }

    async updatePassword() {
        const password = await this.dialog.prompt('New password', '');
        if (password) {
            await this.controllerClient.app().updatePassword(this.userForm.value.id, password);
        }
    }

    setUser(user: FrontendUser) {
        if (user) {
            this.userForm.reset(cloneClass(user));
            this.tab = 'general';
        }
    }

    ngOnInit() {
        if (this.user) {
            this.setUser(this.user);
        }
    }

    async save() {
        await this.controllerClient.app().updateUser(this.userForm.value);
        this.userForm.reset(this.userForm.value);
    }
}
