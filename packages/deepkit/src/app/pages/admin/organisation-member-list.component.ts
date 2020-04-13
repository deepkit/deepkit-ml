/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, Input, OnChanges, OnDestroy} from "@angular/core";
import {FrontendUser, OrganisationMember, OrganisationMemberRoleType} from "@deepkit/core";
import {Collection} from "@marcj/glut-core";
import {observe, observeAction} from "../../reactivate-change-detection";
import {ControllerClient} from "../../providers/controller-client";
import {DialogComponent, DuiDialog} from "@marcj/angular-desktop-ui";
import {Observable} from "rxjs";
import {sleep} from "@marcj/estdlib";
import {CachedEntityGetter} from "../../utils/cached-getter";

@Component({
    template: `
        <dui-form-row label="User">
            <dk-user-input [global]="true" [(ngModel)]="userId"></dk-user-input>
        </dui-form-row>

        <dui-form-row label="Role">
            <dui-select [(ngModel)]="role">
                <dui-option [value]="OrganisationMemberRoleType.regular">Regular</dui-option>
                <dui-option [value]="OrganisationMemberRoleType.admin">Admin</dui-option>
                <dui-option [value]="OrganisationMemberRoleType.billing">Biling</dui-option>
            </dui-select>
        </dui-form-row>

        <dui-dialog-actions>
            <dui-button closeDialog>Abort</dui-button>
            <dui-button primary (click)="assign()">Assign</dui-button>
        </dui-dialog-actions>
    `
})
export class OrganisationMemberAssignComponent {
    @Input() public organisationId!: string;

    public OrganisationMemberRoleType = OrganisationMemberRoleType;

    public role: OrganisationMemberRoleType = OrganisationMemberRoleType.regular;

    public userId!: string;

    constructor(
        protected cd: ChangeDetectorRef,
        protected dialogRef: DialogComponent,
        protected dialog: DuiDialog,
        private controllerClient: ControllerClient,
    ) {
    }

    ngAfterViewInit(): void {
    }

    @observeAction()
    async assign() {
        if (!this.userId) {
            return;
        }

        this.cd.detectChanges();

        try {
            await this.controllerClient.app().assignMemberToOrganisation(this.organisationId, this.userId, this.role);
            this.dialogRef.close(true);
        } catch (error) {
            await this.dialog.alert('Error', error.message);
        }
    }
}

@Component({
    selector: 'admin-organisation-member-list',
    template: `
        <dui-button-groups>
            <dui-button-group padding="none">
                <dui-button icon="remove" [disabled]="!selected.length" confirm="Remove member?"
                            (click)="delete()"></dui-button>
                <dui-button icon="add" (click)="openAssign()"></dui-button>
            </dui-button-group>

            <dui-button-group float="right">
                <dui-input round class="semi-transparent" lightFocus clearer [(ngModel)]="searchTerm" placeholder="Search"></dui-input>
            </dui-button-group>
        </dui-button-groups>

        <dui-dropdown #contextDropdown>
            <dui-dropdown-item (click)="delete()" confirm="Remove member?">Kick</dui-dropdown-item>
        </dui-dropdown>

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
            [contextDropdown]="contextDropdown"
        >
            <dui-table-column name="username" header="Username" [width]="150"></dui-table-column>
            <dui-table-column name="email" header="Email" [width]="170"></dui-table-column>

            <dui-table-column name="role" header="Role">
                <ng-container *duiTableCell="let row">
                    <ng-container *ngIf="orgMembershipGetter.get(row.id, organisationId)|async as orgMember">
                        {{OrganisationMemberRoleType[orgMember.role]}}
                    </ng-container>
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
export class OrganisationMemberListComponent implements OnDestroy, OnChanges {
    public searchTerm: string = '';

    public OrganisationMemberRoleType = OrganisationMemberRoleType;
    public selected: FrontendUser[] = [];

    @Input() organisationId!: string;

    @observe({unsubscribe: true})
    public users?: Collection<FrontendUser>;

    public orgMembershipGetter = new CachedEntityGetter(OrganisationMember, this.controllerClient.app().getOrganisationMember);

    constructor(
        public controllerClient: ControllerClient,
        protected dialog: DuiDialog,
        protected cd: ChangeDetectorRef,
    ) {
    }

    peter(id: string): Observable<string> {
        return new Observable<string>((observer) => {
            observer.next('loading:' + id);

            (async () => {
                await sleep(1);
                observer.next('ok:' + id);
            })();

            return {
                unsubscribe(): void {
                    console.log('unsubscribed', id);
                }
            };
        });
    }

    async ngOnChanges() {
        this.users = await this.controllerClient.app().getOrganisationMembers(this.organisationId);
        this.cd.detectChanges();
    }

    ngOnDestroy(): void {
    }

    async delete() {
        if (this.selected[0]) {
            try {
                await this.controllerClient.app().unAssignMemberOfOrganisation(this.organisationId, this.selected[0].id);
            } catch (error) {
                await this.dialog.alert('Error', error.message);
            }
        }
    }

    async open(item: FrontendUser) {
        // this.router.navigate(['/admin/user', item.id]);
    }

    async openAssign() {
        await this.dialog.open(OrganisationMemberAssignComponent, {
            organisationId: this.organisationId,
        });
    }
}
