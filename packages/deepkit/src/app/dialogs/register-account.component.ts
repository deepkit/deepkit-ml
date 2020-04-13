/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Component, EventEmitter, Input, Output} from "@angular/core";
import {createAnonSocketClient, HomeAccountConfig, PublicControllerInterface, RoleType, User} from "@deepkit/core";
import {TypedFormGroup} from "../utils";
import {DialogComponent} from "@marcj/angular-desktop-ui";
import {FormComponent} from "@marcj/angular-desktop-ui";

@Component({
    template: `
        <h3>Register at {{config.host}}</h3>

        <dui-form #form [formGroup]="formGroup"
                  [disabled]="isFuckingSubmitting(form)"
                  [submit]="submit.bind(this)">
            <dui-form-row label="Username">
                <dui-input focus formControlName="username"></dui-input>
            </dui-form-row>

            <dui-form-row label="Email">
                <dui-input formControlName="email"></dui-input>
            </dui-form-row>

            <dui-form-row label="Password">
                <dui-input type="password" formControlName="password"></dui-input>
            </dui-form-row>
        </dui-form>

        <dui-dialog-actions>
            <dui-button closeDialog>Cancel</dui-button>
            <dui-button [submitForm]="form" [disabled]="formGroup.invalid">Submit</dui-button>
        </dui-dialog-actions>
    `
})
export class RegisterAccountComponent {
    @Input() config!: HomeAccountConfig;

    @Output() success = new EventEmitter();

    formGroup = TypedFormGroup.fromEntityClass(User);

    constructor(
        protected dialogRef: DialogComponent
    ) {
        this.formGroup.syncEntity(new User('', '', RoleType.regular, ''));
    }

    isFuckingSubmitting(form?: FormComponent) {
        return form && form.submitting;
    }

    async submit() {
        const client = createAnonSocketClient(this.config);
        const controller = client.controller<PublicControllerInterface>('public');

        const token = await controller.registerUser(
            this.formGroup.value.username,
            this.formGroup.value.email,
            this.formGroup.value.password,
        );
        this.config.token = token;

        this.success.emit();
        this.dialogRef.close(token);
    }
}
