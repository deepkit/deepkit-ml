/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, OnDestroy, OnInit} from "@angular/core";
import {FrontendUser, RoleType} from "@deepkit/core";
import {observe} from "../../reactivate-change-detection";
import {Collection} from "@marcj/glut-core";
import {ControllerClient} from "../../providers/controller-client";
import {DuiDialog} from "@marcj/angular-desktop-ui";

@Component({
    selector: 'admin-organisation-list',
    template: `
        <dui-button-groups>
            <dui-button-group padding="none">
                <dui-button icon="remove" [disabled]="!selected.length" confirm="Delete selected organisation?"
                            (click)="delete()"></dui-button>
                <dui-button icon="add" (click)="openCreate()"></dui-button>
            </dui-button-group>

            <dui-button-group float="right">
                <dui-input round class="semi-transparent" lightFocus clearer [(ngModel)]="searchTerm" placeholder="Search"></dui-input>
            </dui-button-group>
        </dui-button-groups>

        <dui-table
            style="flex: 1; margin: 8px;"
            [autoHeight]="false"
            [items]="users"
            noFocusOutline
            defaultSort="username"
            [selectable]="true"
            [(selected)]="selected"
            [filterQuery]="searchTerm"
            [filterFields]="['username']"
            (dbclick)="open($event)"
        >
            <dui-table-column name="username" header="Username" [width]="150"></dui-table-column>
            <dui-table-column name="email" header="Email" [width]="170"></dui-table-column>

            <dui-table-column name="created" header="Created" [width]="130">
                <ng-container *duiTableCell="let row">
                    {{row.created | date:'short'}}
                </ng-container>
            </dui-table-column>

            <dui-table-column name="updated" header="Updated" [width]="130">
                <ng-container *duiTableCell="let row">
                    {{row.updated | date:'short'}}
                </ng-container>
            </dui-table-column>
        </dui-table>
    `, styles: [`
        :host {
            height: 100%;
            display: flex;
            flex-direction: column;
        }
    `]
})
export class OrganisationListComponent implements OnDestroy, OnInit {
    public searchTerm: string = '';

    public RoleType = RoleType;
    public selected: FrontendUser[] = [];

    @observe({unsubscribe: true})
    public users?: Collection<FrontendUser>;

    constructor(
        public controllerClient: ControllerClient,
        protected dialog: DuiDialog,
        protected cd: ChangeDetectorRef,
    ) {
    }

    async ngOnInit() {
        this.users = await this.controllerClient.serverAdmin().getOrganisations();
        this.cd.detectChanges();
    }

    ngOnDestroy(): void {
    }

    async delete() {
        if (this.selected[0]) {
            this.controllerClient.serverAdmin().removeOrganisation(this.selected[0].id);
        }
    }

    async open(item: FrontendUser) {
        // this.router.navigate(['/admin/user', item.id]);
    }

    async openCreate() {
        // await this.dialog.open(CreateUserDialogComponent);
    }
}
