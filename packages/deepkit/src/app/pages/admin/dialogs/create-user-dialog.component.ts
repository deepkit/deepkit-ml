/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {AfterViewInit, ChangeDetectorRef, Component, Input} from "@angular/core";
import {RoleType, User, UserType} from "@deepkit/core";
import {f} from "@marcj/marshal";
import {DialogComponent} from "@marcj/angular-desktop-ui";
import {Validators} from "@deepkit/core";
import {TypedFormGroup} from "../../../utils";
import {ControllerClient} from "../../../providers/controller-client";

class UserForm extends User {
    @f.validator(Validators.username) username!: string;
    @f.validator(Validators.email) email!: string;
    @f.validator(Validators.password) password!: string;
}

@Component({
    template: `
        <dui-form #form [formGroup]="formGroup" [submit]="send.bind(this)">
            <dui-form-row label="Username">
                <dui-input focus formControlName="username"></dui-input>
            </dui-form-row>

            <dui-form-row label="Email">
                <dui-input formControlName="email"></dui-input>
            </dui-form-row>

            <dui-form-row label="Password">
                <dui-input type="password" formControlName="password"></dui-input>
            </dui-form-row>

            <dui-form-row label="Role">
                <dui-select formControlName="role">
                    <dui-option [value]="RoleType.regular">Regular</dui-option>
                    <dui-option [value]="RoleType.admin">Admin</dui-option>
                    <dui-option [value]="2323">Invalid</dui-option>
                </dui-select>
            </dui-form-row>

            <dui-dialog-actions>
                <dui-button closeDialog>Cancel</dui-button>
                <dui-button [submitForm]="form" [disabled]="form.invalid">Create</dui-button>
            </dui-dialog-actions>
        </dui-form>
    `,
})
export class AdminCreateUserDialogComponent implements AfterViewInit {
    public RoleType = RoleType;

    @Input() public user: UserForm = new UserForm('', '', RoleType.regular, '');

    public formGroup = TypedFormGroup.fromEntityClass(UserForm);

    constructor(
        protected cd: ChangeDetectorRef,
        private controllerClient: ControllerClient,
        private dialog: DialogComponent,
    ) {
        this.user.type = UserType.user;
        this.formGroup.syncEntity(this.user);
    }

    ngAfterViewInit(): void {
    }

    async send() {
        this.cd.detectChanges();

        await this.controllerClient.serverAdmin().createUser(this.user);
        this.dialog.close(true);
    }
}
