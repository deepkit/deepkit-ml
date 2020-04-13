/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, OnDestroy, OnInit} from "@angular/core";
import {Project} from "@deepkit/core";
import {Collection} from "@marcj/glut-core";
import {observe} from "../../reactivate-change-detection";
import {ControllerClient} from "../../providers/controller-client";
import {DuiDialog} from "@marcj/angular-desktop-ui";
import {AdminCreateUserDialogComponent} from "./dialogs/create-user-dialog.component";

@Component({
    selector: 'admin-project-list',
    template: `
        <dui-button-groups>
            <dui-button-group padding="none">
                <dui-button icon="remove" [disabled]="!selected.length" confirm="Delete selected project?"
                            (click)="delete()"></dui-button>
                <dui-button icon="add" (click)="openCreate()"></dui-button>
            </dui-button-group>

            <dui-button-group float="right">
                <dui-input round [(ngModel)]="searchTerm" placeholder="Search"></dui-input>
            </dui-button-group>
        </dui-button-groups>

        <dui-table
            style="flex: 1; margin: 8px;"
            [autoHeight]="false"
            [items]="projects"
            noFocusOutline
            defaultSort="username"
            [selectable]="true"
            [(selected)]="selected"
            [filterQuery]="searchTerm"
            [filterFields]="['name']"
            (dbclick)="open($event)"
        >
            <dui-table-column name="name" header="Name" [width]="150"></dui-table-column>

            <dui-table-column name="public" header="Public" [width]="50">
                <ng-container *duiTableCell="let row">
                    <dui-icon [size]="12" [name]="row.public ? 'check' : 'remove'"></dui-icon>
                </ng-container>
            </dui-table-column>

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
export class ProjectListComponent implements OnDestroy, OnInit {
    public searchTerm: string = '';

    public selected: Project[] = [];

    @observe({unsubscribe: true})
    public projects?: Collection<Project>;

    constructor(
        public controllerClient: ControllerClient,
        protected dialog: DuiDialog,
        protected cd: ChangeDetectorRef,
    ) {
    }

    async ngOnInit() {
        this.projects = await this.controllerClient.serverAdmin().getAllProjects();
        this.cd.detectChanges();
    }

    ngOnDestroy(): void {
    }

    async delete() {
        if (this.selected[0]) {
            this.controllerClient.serverAdmin().removeProject(this.selected[0].id);
        }
    }

    async open(item: Project) {
        // this.router.navigate(['/admin/user', item.id]);
    }

    async openCreate() {
        // await this.dialog.open(AdminCreateUserDialogComponent);
    }
}
