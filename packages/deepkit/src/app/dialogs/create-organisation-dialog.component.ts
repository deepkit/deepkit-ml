/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {AfterViewInit, ChangeDetectorRef, Component, Input} from "@angular/core";
import {observeAction, reactiveComponent} from "../reactivate-change-detection";
import {ControllerClient} from "../providers/controller-client";
import {FrontendUser, RoleType, UserType, Validators} from "@deepkit/core";
import {f} from "@marcj/marshal";
import {DialogComponent} from "@marcj/angular-desktop-ui";
import {TypedFormGroup} from "../utils";

class UserForm extends FrontendUser {
    @f.validator(Validators.username) username!: string;
    @f.validator(Validators.email) email!: string;
}

@reactiveComponent()
@Component({
    template: `
        <dui-form #form [formGroup]="formGroup" [submit]="send.bind(this)">
            <dui-form-row label="Organisation account name">
                <dui-input focus formControlName="username"></dui-input>
            </dui-form-row>

            <dui-form-row label="Email">
                <dui-input formControlName="email"></dui-input>
            </dui-form-row>

            <dui-dialog-actions>
                <dui-button closeDialog>Cancel</dui-button>
                <dui-button [submitForm]="form" [disabled]="form.invalid">Create</dui-button>
            </dui-dialog-actions>
        </dui-form>
    `,
})
export class CreateOrganisationDialogComponent implements AfterViewInit {
    public RoleType = RoleType;

    @Input() public user: UserForm = new UserForm('', '', RoleType.regular);

    public formGroup = TypedFormGroup.fromEntityClass(UserForm);

    constructor(
        protected cd: ChangeDetectorRef,
        private controllerClient: ControllerClient,
        private dialog: DialogComponent,
    ) {
        this.user.type = UserType.organisation;
        this.formGroup.syncEntity(this.user);
    }

    ngAfterViewInit(): void {
    }

    @observeAction()
    async send() {
        this.cd.detectChanges();

        await this.controllerClient.app().createOrganisation(this.user);

        this.dialog.close(true);
    }
}
