/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, Input, OnInit} from "@angular/core";
import {DialogComponent, ExecutionState} from "@marcj/angular-desktop-ui";
import {MainStore} from "../store";
import {ControllerClient} from "../providers/controller-client";
import {ProjectIssue, ProjectIssueBase, IssuePriority, Project} from "@deepkit/core";
import {TypedFormGroup} from "../utils";
import {cloneClass} from "@marcj/marshal";
import {EntitySubject} from "@marcj/glut-core";

@Component({
    template: `
        <ng-container *ngIf="form">
            <dui-form
                    #duiForm
                    [formGroup]="form"
                    [submit]="save.bind(this)"
            >
                <dui-form-row label="Title">
                    <dui-input focus required formControlName="title"></dui-input>
                </dui-form-row>

                <dui-form-row label="Reporter">
                    <div>
                        <dk-user-input [resettable]="false" formControlName="reporterId"
                                       style="width: 135px"></dk-user-input>
                    </div>
                </dui-form-row>

                <dui-form-row label="Assignee">
                    <div>
                        <dk-user-input formControlName="assigneeId" style="width: 135px"></dk-user-input>
                    </div>
                </dui-form-row>

                <dui-form-row label="Priority">
                    <div>
                        <dui-select textured formControlName="priority" style="width: 135px">
                            <dui-option [value]="IssuePriority.LOW">Low</dui-option>
                            <dui-option [value]="IssuePriority.NORMAL">Normal</dui-option>
                            <dui-option [value]="IssuePriority.HIGH">High</dui-option>
                        </dui-select>
                    </div>
                </dui-form-row>

                <dui-form-row label="Status">
                    <div>
                        <ng-container *ngIf="project$|asyncRender as project">
                            <dui-select textured formControlName="statusId" style="width: 135px">
                                <dui-option *ngFor="let status of project.issueStatus"
                                            [value]="status.id">{{status.title}}</dui-option>
                            </dui-select>
                        </ng-container>
                    </div>
                </dui-form-row>

                <dui-form-row label="Labels">
                    <div>
                        <ng-container *ngIf="project$|asyncRender as project">
                            <div>
                                <dui-button [openDropdown]="labelDropdown" style="width: 135px"
                                            icon="arrow_down" iconRight>
                                    Select label
                                </dui-button>
                            </div>

                            <dui-dropdown #labelDropdown>
                                <dui-dropdown-item
                                        (click)="form.value.toggleLabel(label); form.markAsDirty()"
                                        [selected]="form.value.labelIds.includes(label.id)"
                                        *ngFor="let label of project.issueLabels"
                                >
                                    {{label.label}}
                                </dui-dropdown-item>
                            </dui-dropdown>

                            <dk-label *ngFor="let label of project.getIssueLabels(form.value.labelIds)"
                                            [label]="label.label"></dk-label>
                        </ng-container>
                    </div>
                </dui-form-row>


                <dui-form-row label="Description">
                </dui-form-row>

                <dk-text-editor formControlName="content"></dk-text-editor>

                <dui-dialog-actions>
                    <dui-button closeDialog>Cancel</dui-button>
                    <dui-button [submitForm]="duiForm" [disabled]="form.invalid || !form.dirty">Save</dui-button>
                </dui-dialog-actions>
            </dui-form>
        </ng-container>
    `
})
export class IssueDialogComponent implements OnInit {
    static dialogDefaults = {
        height: '90%',
        width: 750,
    };

    IssuePriority = IssuePriority;

    @Input() project$!: EntitySubject<Project>;
    @Input() issue!: ProjectIssueBase;

    form?: TypedFormGroup<ProjectIssueBase>;

    constructor(
        public store: MainStore,
        protected cd: ChangeDetectorRef,
        protected controllerClient: ControllerClient,
        protected dialogRef: DialogComponent,
    ) {
    }

    async ngOnInit() {
        this.form = TypedFormGroup.fromEntityClass(ProjectIssueBase);
        this.form.value = cloneClass(this.issue);
        this.cd.detectChanges();
    }

    async save() {
        if (this.issue instanceof ProjectIssue) {
            await this.controllerClient.issue().save(this.form!.value);
        } else {
            await this.controllerClient.issue().add(this.form!.value);
        }
        this.dialogRef.close(this.form!.value.id);
    }
}
