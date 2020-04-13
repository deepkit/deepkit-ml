/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, OnInit} from "@angular/core";
import {ControllerClient} from "../providers/controller-client";

@Component({
    template: `
        <h4>Install CLI</h4>

        <ng-container *ngIf="cliInfo.platform === 'linux'">
            <p>
                If you have installed Deepkit via snap, you
                can use <code>/snap/bin/deepkit</code>.<br/>
                If not, you can setup it like so:
            </p>

            <pre class="selectable-text">sudo mkdir -p /usr/local/bin;
sudo ln -s {{cliInfo.path}} /usr/local/bin/deepkit</pre>

            <p>
                Then you an use <code>deepkit</code> in your terminal.
            </p>
        </ng-container>

        <ng-container *ngIf="cliInfo.platform === 'win32'">
            <p>
                Run following command in administrative CMD to make the CLI available.
            </p>

            <pre class="selectable-text">mklink %USERPROFILE%\\AppData\\Local\\Microsoft\\WindowsApps\\deepkit.bar {{cliInfo.path}}.bat</pre>

            <p>
                Then you an use <code>deepkit.bar</code> in your terminal.
            </p>
        </ng-container>

        <ng-container *ngIf="cliInfo.platform === 'darwin'">
            <p>
                To make the CLI tools available in your terminal, please execute following command:
            </p>

            <pre class="selectable-text">sudo ln -s {{cliInfo.path}} /usr/local/bin/deepkit</pre>

            <p>
                Make sure <code>/usr/local/bin</code> is in your $PATH, or choose a different folder.
            </p>
        </ng-container>

        <dui-dialog-actions>
            <dui-button textured closeDialog>Ok</dui-button>
        </dui-dialog-actions>
    `,
})
export class InstallCliComponent implements OnInit {
    public cliInfo = {path: '', platform: ''};

    constructor(
        protected controllerClient: ControllerClient,
        protected cd: ChangeDetectorRef,
    ) {
    }

    async ngOnInit() {
        this.cliInfo = await this.controllerClient.getLocalApi().getDeepkitCliInfo();
        this.cd.detectChanges();
    }
}
