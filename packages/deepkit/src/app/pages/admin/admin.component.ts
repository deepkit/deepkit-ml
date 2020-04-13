/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Component, OnDestroy} from "@angular/core";

@Component({
    template: `
        <div style="position: absolute; left: 0; right: 0; top: 14px; display: flex; justify-content: center">
            <dui-button-group padding="none">
                <dui-button textured [active]="tab === 'stats'" (click)="tab = 'stats'">Statistics</dui-button>
                <dui-button textured [active]="tab === 'projects'" (click)="tab = 'projects'">Projects</dui-button>
                <dui-button textured [active]="tab === 'users'" (click)="tab = 'users'">Users</dui-button>
                <dui-button textured [active]="tab === 'orgas'" (click)="tab = 'orgas'">Organisations</dui-button>
            </dui-button-group>
        </div>

        <div class="dui-panel" style="height: calc(100% - 11px); margin-top: 11px;">
            <ng-container *ngIf="tab === 'stats'">
                Hi1
            </ng-container>
            <ng-container *ngIf="tab === 'projects'">
                <admin-project-list></admin-project-list>
            </ng-container>
            <ng-container *ngIf="tab === 'users'">
                <admin-user-list></admin-user-list>
            </ng-container>
            <ng-container *ngIf="tab === 'orgas'">
                <admin-organisation-list></admin-organisation-list>
            </ng-container>
        </div>
        <dui-dialog-actions>
            <dui-button closeDialog>Close</dui-button>
        </dui-dialog-actions>
    `
})
export class AdminComponent {
    static dialogDefaults = {
        width: '80%',
        height: '80%',
    };

    tab: 'stats' | 'projects' | 'users' | 'orgas' = 'users';
}
