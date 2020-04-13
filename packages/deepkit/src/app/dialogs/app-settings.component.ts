/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Component} from "@angular/core";
import {DuiApp, DuiDialog, Electron} from "@marcj/angular-desktop-ui";
import {ControllerClient} from "../providers/controller-client";
import {InstallCliComponent} from "./install-cli.component";

@Component({
    template: `
        <dui-form-row label="Theme">
            <dui-select [(ngModel)]="duiApp.theme">
                <dui-option value="auto">Automatically</dui-option>
                <dui-option value="light">Light</dui-option>
                <dui-option value="dark">Dark</dui-option>
            </dui-select>
        </dui-form-row>

        <dui-form-row label="Install CLI" *ngIf="isElectron">
            <div>
                <dui-button textured (click)="installCLI()">Install CLI</dui-button>
            </div>
        </dui-form-row>

        <dui-dialog-actions>
            <dui-button closeDialog primary>OK</dui-button>
        </dui-dialog-actions>
    `
})
export class AppSettingsComponent {
    static dialogDefaults = {
        width: 450,
    };

    isElectron = Electron.isAvailable();

    constructor(
        public duiApp: DuiApp,
        public dialog: DuiDialog,
        public controllerClient: ControllerClient,
    ) {

    }

    async installCLI() {
        this.dialog.open(InstallCliComponent);
    }
}
