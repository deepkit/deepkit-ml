/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output} from "@angular/core";
import {ClusterNode, ClusterNodeCredentials} from "@deepkit/core";
import {DialogComponent, ExecutionState} from "@marcj/angular-desktop-ui";
import { f, cloneClass } from "@marcj/marshal";
import {TypedFormGroup} from "../utils";
import {MainStore} from "../store";
import {ControllerClient} from "../providers/controller-client";

class FormEntity {
    @f node!: ClusterNode;
    @f credentials!: ClusterNodeCredentials;
}

@Component({
    selector: 'node-settings',
    template: `
        <ng-container *ngIf="form">
            <dui-form
                #duiForm
                [formGroup]="form"
                [disabled]="deleteExecutor.running"
                [submit]="save.bind(this)"
            >
                <ng-container formGroupName="node">
                    <dui-form-row label="Name">
                        <dui-input focus required formControlName="name"></dui-input>
                    </dui-form-row>

                    <dui-form-row label="Priority">
                        <dui-input type="number" required formControlName="priority"></dui-input>
                    </dui-form-row>

                    <dui-form-row label="Disabled">
                        <dui-checkbox formControlName="disabled"></dui-checkbox>
                    </dui-form-row>

                    <dui-form-row label="Host IP/domain">
                        <dui-input required formControlName="host"></dui-input>
                    </dui-form-row>

                    <dui-form-row label="Cluster">
                        <dui-select textured required formControlName="cluster">
                            <dui-option
                                *ngFor="let cluster of store.value.clusters|async"
                                [value]="cluster.id">{{cluster.name}}</dui-option>
                        </dui-select>
                        <ng-container *ngIf="!store.value.clusters!.count()">
                            No cluster created yet. Create one first.
                        </ng-container>
                    </dui-form-row>

                    <h4 style="margin-bottom: 5px;">Experiment settings</h4>
                    <ng-container formGroupName="jobStartConfig">
                        <dui-form-row label="Host execution">
                            <dui-checkbox formControlName="hostExecutionAllowed">Allow experiments to run without Docker</dui-checkbox>
                        </dui-form-row>
                        <dui-form-row label="Custom Docker mounts">
                            <dui-checkbox formControlName="customMountsAllowed">Allow experiments to overwrite Docker mounts</dui-checkbox>
                        </dui-form-row>
                    </ng-container>

                    <dui-form-row label="Default environment">
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
                </ng-container>

                <h4 style="margin-bottom: 5px;">SSH settings</h4>
                <ng-container formGroupName="credentials">
                    <dui-form-row label="SSH port">
                        <dui-input type="number" required formControlName="sshPort"></dui-input>
                    </dui-form-row>

                    <dui-form-row label="SSH username">
                        <dui-input required formControlName="sshUsername"></dui-input>
                    </dui-form-row>

                    <dui-form-row label="SSH password">
                        <dui-input type="password" formControlName="sshPassword"></dui-input>
                    </dui-form-row>

                    <dui-form-row label="SSH private key">
                        <dui-input type="textarea" formControlName="sshPrivateKey"></dui-input>
                    </dui-form-row>

                    <dui-form-row label="SSH private key passphrase">
                        <dui-input type="password" formControlName="sshPrivateKeyPassphrase"></dui-input>
                    </dui-form-row>

                    <dui-form-row label="Requires sudo">
                        <dui-checkbox formControlName="sshRequiresSudo">Yes</dui-checkbox>
                        <div style="margin-top: 5px;" class="text-light">
                            If sudo is required for Docker access and file access to
                            $HOME. This is probably required if you don't use root.
                        </div>
                    </dui-form-row>
                </ng-container>

                <div *ngIf="success">
                    <p class="selectable-text" style="text-align: center">
                        Successfully connected. Detect OS: {{detectedOs}}
                    </p>
                </div>

                <div *ngIf="error">
                    <h4>Error</h4>
                    <p class="selectable-text" style="text-align: center">
                        {{error}}
                    </p>
                </div>

                <dui-dialog-actions>
                    <dui-button *ngIf="node"
                                confirm="Really delete node? It will be automatically stopped."
                                (click)="deleteExecutor.execute()"
                                style="margin-right: auto">Delete
                    </dui-button>
                    <dui-button closeDialog>Cancel</dui-button>
                    <dui-button (click)="testConnection()" [disabled]="testing || form.invalid">Test Connection
                    </dui-button>
                    <dui-button [submitForm]="duiForm" [disabled]="form.invalid || !form.dirty">
                        {{node ? 'Save' : 'Create'}}
                    </dui-button>
                </dui-dialog-actions>
            </dui-form>
        </ng-container>
    `
})
export class NodeSettingsDialogComponent implements OnDestroy, OnInit {
    static dialogDefaults = {
        width: 650,
    };

    @Input() node?: ClusterNode;

    form?: TypedFormGroup<FormEntity>;

    credentials = new ClusterNodeCredentials('');

    deleteExecutor = new ExecutionState(this.cd, this.deleteNode.bind(this));

    testing = false;

    error?: string;
    success = false;
    detectedOs?: string;

    constructor(
        public store: MainStore,
        protected cd: ChangeDetectorRef,
        protected dialogRef: DialogComponent,
        protected controllerClient: ControllerClient,
    ) {
    }

    set envString(s: string) {
        this.form!.value.node.jobStartConfig.env = s.split('\n');
        this.form!.markAsDirty();
    }

    get envString(): string {
        return this.form!.value.node.jobStartConfig.env.join('\n');
    }

    set dockerBindsString(s: string) {
        this.form!.value.node.jobStartConfig.dockerBinds = s.split('\n');
        this.form!.markAsDirty();
    }

    get dockerBindsString(): string {
        return this.form!.value.node.jobStartConfig.dockerBinds.join('\n');
    }

    async ngOnInit() {
        if (this.node) {
            this.credentials = await this.controllerClient.admin().getClusterNodeCredentials(this.node.id);
            this.form = TypedFormGroup.fromEntityClass(FormEntity);
            const entity = new FormEntity();
            entity.node = this.node;
            entity.credentials = this.credentials;
            this.form.syncEntity(cloneClass(entity));
        } else {
            const firstCluster = this.store.value.clusters!.all()[0];
            const node = new ClusterNode('', firstCluster ? firstCluster.id : '');
            this.credentials = new ClusterNodeCredentials(node.id);

            const entity = new FormEntity();
            entity.node = node;
            entity.credentials = this.credentials;

            this.form = TypedFormGroup.fromEntityClass(FormEntity);
            this.form.syncEntity(cloneClass(entity));
            // console.log('node', node);
            // console.log('this.credentials', this.credentials);
            // this.form.printDeepErrors();
        }
        console.log('this.form.value.node', this.form.value.node);

        this.cd.detectChanges();
    }

    async deleteNode() {
        if (this.node) {
            this.dialogRef.close();
            await this.controllerClient.admin().deleteClusterNode(this.node.id);
        }
    }

    async testConnection() {
        this.error = undefined;
        this.detectedOs = undefined;
        this.success = false;
        this.testing = true;
        this.cd.detectChanges();

        try {
            this.detectedOs = await this.controllerClient.admin().testClusterNodeSshConnection(
                this.form!.value.node.host,
                this.form!.value.credentials.sshPort,
                this.form!.value.credentials.sshUsername,
                this.form!.value.credentials.sshPassword,
                this.form!.value.credentials.sshPrivateKey,
                this.form!.value.credentials.sshPrivateKeyPassphrase,
            );
            this.success = true;
        } catch (error) {
            console.log('testConnection error', error);
            this.error = error;
        }

        this.testing = false;
        this.cd.detectChanges();
    }

    ngOnDestroy(): void {
    }

    public async save() {
        if (this.node) {
            await this.controllerClient.admin().patchClusterNode(this.node.id, {
                name: this.form!.value.node.name,
                disabled: this.form!.value.node.disabled,
                priority: this.form!.value.node.priority,
                host: this.form!.value.node.host,
                cluster: this.form!.value.node.cluster,
                jobStartConfig: this.form!.value.node.jobStartConfig,
            });

            await this.controllerClient.admin().saveClusterNodeCredentials(this.form!.value.credentials);
        } else {
            await this.controllerClient.admin().createClusterNode(this.form!.value.node, this.form!.value.credentials);
        }

        this.dialogRef.close();
    }
}
