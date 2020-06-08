/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, Input, OnDestroy, OnInit} from "@angular/core";
import {Cluster, ClusterAdapter} from "@deepkit/core";
import {DialogComponent, ExecutionState} from "@marcj/angular-desktop-ui";
import {cloneClass} from "@marcj/marshal";
import {TypedFormGroup} from "../utils";
import {MainStore} from "../store";
import {ControllerClient} from "../providers/controller-client";

@Component({
    selector: 'cluster-settings',
    template: `
        <ng-container *ngIf="form">
            <dui-form
                #duiForm
                [formGroup]="form"
                [disabled]="deleteExecutor.running"
                [submit]="save.bind(this)"
            >
                <dui-form-row label="Name">
                    <dui-input focus required formControlName="name"></dui-input>
                </dui-form-row>

                <dui-form-row label="Disabled">
                    <dui-checkbox formControlName="disabled"></dui-checkbox>
                </dui-form-row>

                <dui-form-row label="Mode">
                    <dui-select textured formControlName="adapter">
                        <dui-option [value]="''">Custom</dui-option>
                        <dui-option [value]="ClusterMode.genesis_cloud">Genesis Cloud</dui-option>
                    </dui-select>
                    <ng-container *ngIf="!store.value.clusters!.count()">
                        No cluster created yet. Create one first.
                    </ng-container>
                </dui-form-row>

                <ng-container *ngIf="form.value.isCloud()">
                    <h4 style="margin-bottom: 5px;">Experiment settings</h4>
                    <ng-container formGroupName="jobStartConfig">
                        <dui-form-row label="Host execution">
                            <dui-checkbox formControlName="hostExecutionAllowed">Allow experiments to run without Docker</dui-checkbox>
                        </dui-form-row>
                        <dui-form-row label="Custom Docker mounts">
                            <dui-checkbox formControlName="customMountsAllowed">Allow experiments to overwrite Docker mounts</dui-checkbox>
                        </dui-form-row>
                    </ng-container>

                    <dui-form-row label="Default environment variables">
                        <dui-input type="textarea" [(ngModel)]="envString" [ngModelOptions]="{standalone: true}"></dui-input>
                        <div class="text-light" style="margin-top: 5px;">
                            Use format <code>NAME=value</code>, one variable per line.
                        </div>
                    </dui-form-row>

                    <dui-form-row label="Default Docker mounts">
                        <dui-input type="textarea" [(ngModel)]="dockerBindsString" [ngModelOptions]="{standalone: true}"></dui-input>
                        <div class="text-light" style="margin-top: 5px;">
                            Use format <code>/host/path:/container/path</code>, one mount per line.
                        </div>
                    </dui-form-row>

                    <dui-form-row label="Debug mode">
                        <dui-checkbox formControlName="debugMode">Print additional debugging output to node log</dui-checkbox>
                    </dui-form-row>
                </ng-container>

                <div *ngIf="error">
                    <h4>Error</h4>
                    <p class="selectable-text" style="text-align: center">
                        {{error}}
                    </p>
                </div>

                <dui-dialog-actions>
                    <dui-button *ngIf="cluster"
                                confirm="Really delete the whole cluster? All nodes will be stopped and deleted."
                                (click)="deleteExecutor.execute()"
                                style="margin-right: auto">Delete
                    </dui-button>
                    <dui-button closeDialog>Cancel</dui-button>
                    <dui-button [submitForm]="duiForm" [disabled]="form.invalid || !form.dirty">
                        {{cluster ? 'Save' : 'Create'}}
                    </dui-button>
                </dui-dialog-actions>
            </dui-form>
        </ng-container>
    `
})
export class ClusterSettingsDialogComponent implements OnDestroy, OnInit {
    static dialogDefaults = {
        width: 650,
    };

    ClusterMode = ClusterAdapter;

    @Input() cluster?: Cluster;

    form?: TypedFormGroup<Cluster>;

    deleteExecutor = new ExecutionState(this.cd, this.deleteCluster.bind(this));

    testing = false;

    error?: string;
    success = false;

    constructor(
        public store: MainStore,
        protected cd: ChangeDetectorRef,
        protected dialogRef: DialogComponent,
        protected controllerClient: ControllerClient,
    ) {
    }

    set envString(s: string) {
        this.form!.value.jobStartConfig.env = s.split('\n');
        this.form!.markAsDirty();
    }

    get envString(): string {
        return this.form!.value.jobStartConfig.env.join('\n');
    }

    set dockerBindsString(s: string) {
        this.form!.value.jobStartConfig.dockerBinds = s.split('\n');
        this.form!.markAsDirty();
    }

    get dockerBindsString(): string {
        return this.form!.value.jobStartConfig.dockerBinds.join('\n');
    }

    async ngOnInit() {
        if (this.cluster) {
            this.form = TypedFormGroup.fromEntityClass(Cluster);
            this.form.syncEntity(cloneClass(this.cluster));
        } else {
            const cluster = new Cluster('');

            this.form = TypedFormGroup.fromEntityClass(Cluster);
            this.form.syncEntity(cluster);
        }
        console.log('form', this.form);

        this.cd.detectChanges();
    }

    async deleteCluster() {
        if (this.cluster) {
            await this.controllerClient.admin().deleteCluster(this.form!.value.id);
            this.dialogRef.close();
        }
    }

    ngOnDestroy(): void {
    }

    public async save() {
        if (this.cluster) {
            await this.controllerClient.app().patchCluster(this.form!.value.id, this.form!.value);
        } else {
            await this.controllerClient.admin().createCluster(this.form!.value);
        }

        this.dialogRef.close();
    }
}
