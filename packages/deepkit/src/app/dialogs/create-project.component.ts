/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Component, OnInit} from "@angular/core";
import {AbstractControl, FormControl, FormGroup, Validators} from "@angular/forms";
import {ControllerClient} from "../providers/controller-client";
import {DialogComponent} from "@marcj/angular-desktop-ui";
import {selectSourceFolder} from "@deepkit/core";

@Component({
    template: `
        <h4>Create project</h4>
        <dui-form [formGroup]="createProjectForm" #form
                  [submit]="createProject.bind(this)">

            <dui-form-row label="Name">
                <dui-input focus formControlName="name"></dui-input>
            </dui-form-row>

            <dui-form-row label="Source location" *ngIf="controllerClient.isLocal()">
                <div style="display: flex;">
                    <dui-input style="flex: 1; width: auto; margin-right: 5px;" [disabled]="true"
                               formControlName="location"></dui-input>
                    <dui-button (click)="assignDirectory()">Choose</dui-button>
                </div>
            </dui-form-row>

            <dui-dialog-actions>
                <dui-button textured [disabled]="form.submitting" closeDialog>Cancel</dui-button>
                <dui-button textured
                            [submitForm]="form"
                            [disabled]="createProjectForm.invalid || form.submitting">
                    Create
                </dui-button>
            </dui-dialog-actions>
        </dui-form>
    `,
})
export class CreateProjectComponent implements OnInit {
    public createProjectForm!: FormGroup;

    lastBookmarkPermission?: string;

    constructor(
        public controllerClient: ControllerClient,
        protected dialog: DialogComponent,
    ) {
    }

    ngOnInit() {
        const controls: { [key: string]: AbstractControl } = {
            name: new FormControl('', [Validators.required]),
        };

        if (this.controllerClient.isLocal()) {
            controls['location'] = new FormControl('', []);
        }

        this.createProjectForm = new FormGroup(controls);
    }

    public async assignDirectory() {
        const {path, bookmark} = await selectSourceFolder();
        if (!path) return;

        this.lastBookmarkPermission = bookmark;
        this.createProjectForm.patchValue({location: path});
        this.createProjectForm.markAsDirty();
    }

    public async createProject() {
        const id = await this.controllerClient.app().createProject(
            this.createProjectForm.value.name,
            this.createProjectForm.value.location,
            this.lastBookmarkPermission
        );
        this.dialog.close(id);
    }
}
