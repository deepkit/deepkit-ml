/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output} from "@angular/core";
import {Project, selectSourceFolder} from "@deepkit/core";
import {observe} from "../reactivate-change-detection";
import {EntitySubject} from "@marcj/glut-core";
import {ControllerClient} from "../providers/controller-client";
import {DialogComponent, DuiDialog, ExecutionState} from "@marcj/angular-desktop-ui";
import {TypedFormGroup} from "../utils";
import {cloneClass} from "@marcj/marshal";

@Component({
    template: `
        <dui-form [formGroup]="formGroup"
                  [disabled]="deleteExecutor.running"
                  #duiForm [submit]="save.bind(this)">
            <dui-form-row label="Project name">
                <dui-input required focus formControlName="name"></dui-input>
            </dui-form-row>

            <dui-form-row label="Public">
                <div>
                    <dui-checkbox formControlName="public">Yes</dui-checkbox>
                    <br/>
                    <dui-button *ngIf="formGroup.value && formGroup.value.public" [openExternal]="getProjectUrl()">Open
                        in browser
                    </dui-button>
                </div>
            </dui-form-row>

            <dui-form-row label="Experiment lists" *ngIf="formGroup.value">
                <table style="max-width: 230px">
                    <tr>
                        <td style="padding: 2px">
                            <dui-input style="width: 100%;" [ngModel]="'Default'" readonly
                                       lightFocus round placeholder="Label"
                                       [ngModelOptions]="{standalone: true}"></dui-input>
                        </td>
                        <td style="width: 30px;">
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 2px">
                            <dui-input style="width: 100%;" [ngModel]="'CI'" readonly
                                       lightFocus round placeholder="Label"
                                       [ngModelOptions]="{standalone: true}"></dui-input>
                        </td>
                        <td style="width: 30px;">
                        </td>
                    </tr>
                    <tr *ngFor="let list of formGroup.value.experimentLists">
                        <td style="padding: 2px">
                            <dui-input style="width: 100%;" [(ngModel)]="list.name"
                                       lightFocus round placeholder="Name"
                                       (ngModelChange)="formGroup.markAsDirty();"
                                       [ngModelOptions]="{standalone: true}"></dui-input>
                        </td>
                        <td style="width: 30px;">
                            <dui-button small icon="garbage"
                                        (click)="formGroup.markAsDirty(); formGroup.value.removeExperimentList(list.id)"></dui-button>
                        </td>
                    </tr>
                </table>
                <div>
                    <dui-button
                        (click)="formGroup.value.addExperimentList(); formGroup.markAsDirty(); cd.detectChanges()">
                        Add list
                    </dui-button>
                </div>
            </dui-form-row>

            <dui-form-row label="Experiment labels" *ngIf="formGroup.value">
                <table style="max-width: 230px">
                    <tr *ngFor="let label of formGroup.value.experimentLabels">
                        <td style="padding: 2px">
                            <dui-input style="width: 100%;" [(ngModel)]="label.label"
                                       lightFocus round placeholder="Label"
                                       (ngModelChange)="formGroup.markAsDirty();"
                                       [ngModelOptions]="{standalone: true}"></dui-input>
                        </td>
                        <td style="width: 30px;">
                            <dui-button small icon="garbage"
                                        (click)="formGroup.markAsDirty(); formGroup.value.removeExperimentLabel(label.id)"></dui-button>
                        </td>
                    </tr>
                </table>
                <div>
                    <dui-button
                        (click)="formGroup.value.addExperimentLabel(); formGroup.markAsDirty(); cd.detectChanges()">
                        Add
                        label
                    </dui-button>
                </div>
            </dui-form-row>

            <dui-form-row label="Issue labels" *ngIf="formGroup.value">
                <table style="max-width: 230px">
                    <tr *ngFor="let label of formGroup.value.issueLabels">
                        <td style="padding: 2px">
                            <dui-input style="width: 100%;" [(ngModel)]="label.label"
                                       lightFocus round placeholder="Label"
                                       (ngModelChange)="formGroup.markAsDirty();"
                                       [ngModelOptions]="{standalone: true}"></dui-input>
                        </td>
                        <td style="width: 30px;">
                            <dui-button small icon="garbage"
                                        (click)="formGroup.markAsDirty(); formGroup.value.removeIssueLabel(label.id)"></dui-button>
                        </td>
                    </tr>
                </table>
                <div>
                    <dui-button (click)="formGroup.value.addIssueLabel(); formGroup.markAsDirty(); cd.detectChanges()">
                        Add
                        label
                    </dui-button>
                </div>
            </dui-form-row>

            <dui-form-row label="Issue statuses" *ngIf="formGroup.value">
                <table style="max-width: 430px">
                    <tr *ngFor="let status of formGroup.value.issueStatus">
                        <td style="padding: 2px">
                            <dui-input style="width: 100%;" [(ngModel)]="status.title"
                                       lightFocus round placeholder="Title..."
                                       (ngModelChange)="formGroup.markAsDirty();"
                                       [ngModelOptions]="{standalone: true}"></dui-input>
                        </td>
                        <td style="text-align: center">
                            <dui-radiobox [ngModel]="status.isDefault" [value]="true"
                                          (ngModelChange)="formGroup.value.setDefaultStatus(status); formGroup.markAsDirty();"
                                          [ngModelOptions]="{standalone: true}">Default
                            </dui-radiobox>
                        </td>
                        <td style="text-align: center">
                            <dui-checkbox [(ngModel)]="status.isClosing"
                                          (ngModelChange)="formGroup.markAsDirty();"
                                          [ngModelOptions]="{standalone: true}">Closing
                            </dui-checkbox>
                        </td>
                        <td style="width: 30px;">
                            <dui-button-group padding="none">
                                <dui-button small icon="arrow-small-up"
                                            (click)="formGroup.markAsDirty(); formGroup.value.moveStatusUp(status.id)"></dui-button>
                                <dui-button small icon="arrow-small-down"
                                            (click)="formGroup.markAsDirty(); formGroup.value.moveStatusDown(status.id)"></dui-button>
                                <dui-button small icon="garbage"
                                            [disabled]="!formGroup.value.isStatusDeletable(status)"
                                            (click)="formGroup.markAsDirty(); formGroup.value.removeStatus(status.id)"></dui-button>
                            </dui-button-group>
                        </td>
                    </tr>
                </table>
                <div>
                    <dui-button (click)="formGroup.value.addStatus(); formGroup.markAsDirty(); cd.detectChanges()">
                        Add status
                    </dui-button>
                </div>
                <div>
                    <p>
                        A status with <code>Default</code> option is the default status when a new issue is created.
                    </p>
                    <p>
                        A status with <code>Closing</code> option automatically closes the issue when that status is
                        assigned.
                        You need at least one closing status.
                    </p>
                </div>
            </dui-form-row>

            <dui-form-row label="Description">
                <dui-input type="textarea" formControlName="description"></dui-input>
            </dui-form-row>
            <dui-form-row label="Source location" *ngIf="controllerClient.isLocal()">
                <div style="display: flex;">
                    <dui-input style="flex: 1; width: auto; margin-right: 5px;" [(ngModel)]="location"
                               (ngModelChange)="formGroup.markAsDirty()"
                               [disabled]="true"
                               [ngModelOptions]="{standalone: true}"></dui-input>
                    <dui-button (click)="chooseFolder()">Choose
                    </dui-button>
                </div>
            </dui-form-row>

            <dui-form-row label="Git URL" *ngIf="!controllerClient.isLocal()">
                <dui-input formControlName="gitUrl" placeholder="e.g. git@github.com:user/project.git "></dui-input>
            </dui-form-row>

            <dui-form-row label="Git default branch" *ngIf="!controllerClient.isLocal()">
                <dui-input formControlName="gitBranch" placeholder="master"></dui-input>
            </dui-form-row>

            <dui-form-row label="Git SSH deploy key" *ngIf="!controllerClient.isLocal()">
                <dui-input type="textarea" readonly formControlName="gitDeployKey"
                           placeholder="SSH deploy key"></dui-input>

                <div>
                    <p>
                        Press "Generate" to generate a key. <br/>
                        Note for private Git repositories: that you need to copy and paste
                        this key to the "deploy keys" settings of your Git provider administration page.
                    </p>

                    <div style="color: var(--color-red)" *ngIf="generateDeployKeyExecutor.error">
                        Could not generate keys:<br/>
                        {{generateDeployKeyExecutor.error}}
                    </div>

                    <div style="color: var(--color-red)" *ngIf="testGitExecutor.error">
                        Test errored: {{testGitExecutor.error}}
                    </div>

                    <dui-button (click)="generateDeployKeyExecutor.execute()"
                                [disabled]="generateDeployKeyExecutor.running">Generate deploy key
                    </dui-button>
                    <dui-button (click)="testGitExecutor.execute()" [disabled]="testGitExecutor.running">Test access
                    </dui-button>
                </div>
            </dui-form-row>

            <dui-dialog-actions>
                <dui-dialog-error *ngIf="deleteExecutor.error">
                    Could not delete: {{deleteExecutor.error}}
                </dui-dialog-error>
                <dui-button style="margin-right: auto" confirm="Really delete the whole project?"
                            (click)="deleteExecutor.execute()">Delete
                </dui-button>

                <dui-button closeDialog>Cancel</dui-button>
                <dui-button [submitForm]="duiForm" [disabled]="formGroup.invalid || !formGroup.dirty">Save</dui-button>
            </dui-dialog-actions>
        </dui-form>
    `
})
export class ProjectSettingsComponent implements OnDestroy, OnInit {
    static dialogDefaults = {
        width: 650,
    };

    @observe()
    @Input() project$!: EntitySubject<Project>;
    @Input() tab: string = 'general';

    @Output() deleted = new EventEmitter;

    formGroup = TypedFormGroup.fromEntityClass(Project);

    lastKnownLocation: string = '';
    location: string = '';
    bookmarkPermission?: string;

    deleteExecutor = new ExecutionState(this.cd, this.deleteProject.bind(this));
    generateDeployKeyExecutor = new ExecutionState(this.cd, this.generateDeployKey.bind(this));
    testGitExecutor = new ExecutionState(this.cd, this.testGitAccess.bind(this));

    constructor(
        public controllerClient: ControllerClient,
        protected dialogRef: DialogComponent,
        protected dialog: DuiDialog,
        public cd: ChangeDetectorRef,
    ) {
    }

    async chooseFolder() {
        const {path, bookmark} = await selectSourceFolder(this.location as string);
        this.location = path;
        this.bookmarkPermission = bookmark;

        this.formGroup.markAsDirty();
        this.cd.detectChanges();
    }

    getProjectUrl() {
        const config = this.controllerClient.getConfig();
        const http = config.ssl ? 'https' : 'http';
        const base = http + '://' + config.host + ':' + (config.port !== 80 ? config.port : '') + '/public/';
        return base + this.controllerClient.getUser().value.username + '/' + this.project$.value.name;
    }

    async ngOnInit() {
        if (this.controllerClient.isLocal()) {
            this.lastKnownLocation = await this.controllerClient.getLocalApi().getSourceFolder(this.project$.id);
            this.location = this.lastKnownLocation;
        }

        (window as any)['project'] = this.project$;

        this.formGroup.syncEntity(cloneClass(this.project$.value));
        // this.formGroup.printDeepErrors();
        this.cd.detectChanges();
    }

    async testGitAccess() {
        const refs = await this.controllerClient.admin().projectTestGitAccess(this.project$.id, this.formGroup.value.gitUrl);
        this.dialog.alert('Success', 'Git URL and credentials seem to be correct.');
    }

    async generateDeployKey() {
        const gitDeployKey = await this.controllerClient.admin().projectGenerateDeployKey(this.project$.id);
        this.formGroup.patchValue({
            gitDeployKey: gitDeployKey
        }, {emitEvent: false});
    }

    async deleteProject() {
        const a = await this.dialog.prompt('Delete project', '', 'Please enter the project name. ' +
            'All experiments, issues, files, notes will be deleted. This cannot be undone.');

        if (a !== this.project$.value.name) return;

        await this.controllerClient.app().deleteProject(this.project$.id);
        this.deleted.emit();
        this.dialogRef.close();
    }

    ngOnDestroy() {
    }

    async save() {
        if (this.project$ && this.project$.value) {
            console.log(this.controllerClient.isLocal(), this.lastKnownLocation, this.location);
            if (this.controllerClient.isLocal()) {
                if (this.lastKnownLocation !== this.location || this.bookmarkPermission) {
                    console.log('setSourceFolder', this.location);
                    await this.controllerClient.getLocalApi().setSourceFolder(
                        this.controllerClient.getAccountId(),
                        this.project$.value.id,
                        this.lastKnownLocation,
                        this.location,
                        this.project$.value.name,
                        this.bookmarkPermission
                    );
                    this.lastKnownLocation = this.location as string;
                }
            }

            await this.controllerClient.app().updateProject(this.formGroup.value);
            this.formGroup.markAsPristine();
            this.cd.detectChanges();
            this.dialogRef.close();
        }
    }
}
