/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component} from "@angular/core";
import {ActivatedRoute} from "@angular/router";
import {ControllerClient} from "../../providers/controller-client";
import {findRouteParameter} from "../../utils";
import {Collection} from "@marcj/glut-core";
import {Project} from "@deepkit/core";

@Component({
    template: `
        <div class="inset-h">
            <dui-table
                [items]="projects"
                defaultSort="title"
                [selectable]="true"
                [filterFields]="['username']"
            >
                <dui-table-column name="name" header="Name"></dui-table-column>

                <dui-table-column name="created" header="Created">
                    <ng-container *duiTableCell="let row">
                        {{row.created | date:'short'}}
                    </ng-container>
                </dui-table-column>

                <dui-table-column name="updated" header="Updated">
                    <ng-container *duiTableCell="let row">
                        {{row.updated | date:'short'}}
                    </ng-container>
                </dui-table-column>

                <dui-table-column name="public" header="Public">
                    <ng-container *duiTableCell="let row">
                        {{row.public ? 'Yes' : 'No'}}
                    </ng-container>
                </dui-table-column>
            </dui-table>
        </div>
    `
})
export class UserProjectsComponent {
    public projects?: Collection<Project>;

    constructor(
        public route: ActivatedRoute,
        public controllerClient: ControllerClient,
        protected cd: ChangeDetectorRef,
    ) {
        console.log('UserProjectsComponent');
        route.params.subscribe(async () => {
            const userId = findRouteParameter(route, 'userId');

            if (this.projects) {
                await this.projects.unsubscribe();
            }

            this.projects = await controllerClient.serverAdmin().getProjects(userId);

            this.cd.detectChanges();
        });
    }

}
