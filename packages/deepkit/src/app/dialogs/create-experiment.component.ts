/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output} from "@angular/core";
import {
    Cluster,
    ClusterNode,
    findNodesForQueueItem,
    JobConfig,
    JobResources,
    NodesFound,
    Project,
    selectSourceFolder
} from "@deepkit/core";
import {ControllerClient} from "../providers/controller-client";
import {StreamBehaviorSubject} from "@marcj/glut-core";
import {LocalStorage} from "ngx-store";
import {FitsStatus} from "@deepkit/core/src/resources";
import {Subscription} from "rxjs";
import {unsubscribe} from "../reactivate-change-detection";
import {detectChangesNextFrame, DialogComponent, DuiDialog} from "@marcj/angular-desktop-ui";
import {cloneClass} from "@marcj/marshal";
import {MainStore} from "../store";
import { sleep } from "@marcj/estdlib";

@Component({
    template: `
        <div *ngIf="!loaded" style="padding: 50px; text-align: center;">
            Loading ...
        </div>
        <ng-container *ngIf="loaded">
            <div *ngIf="project.gitUrl" style="float: right">
                Git {{project.gitBranch}}
                <ng-container *ngIf="project.gitLastCommit">{{project.gitLastCommit.id|slice:0:9}}
                    , {{project.gitLastCommit.date|date:'short'}}</ng-container>
            </div>

            <h3>New experiment</h3>

            <div *ngIf="controllerClient.isLocal() && !projectSourceFolder" style="padding: 5px; text-align: center;">
                No source directory assigned to this project.

                <dui-button (click)="assignDirectory()">Assign source</dui-button>
            </div>

            <div class="col" *ngIf="!controllerClient.isLocal() || projectSourceFolder">
                <dui-list white [(ngModel)]="config"
                          style="width: 220px;"
                >
                    <dui-list-item *ngFor="let config of configs"
                                   [value]="config.path">
                        {{config.getTitle()}}
                    </dui-list-item>
                </dui-list>

                <div style="flex: 1; border: 1px solid var(--line-color-light); padding: 15px;"
                     class="overlay-scrollbar-small">
                    <div *ngIf="!configs.length">
                        No deepkit.yml files found.

                        Please see the <a
                            openExternal="https://deepkit.ai/documentation/configuration">documentation</a>
                        for more information.
                    </div>

                    <ng-container *ngIf="!error && configMap[config] as jobConfig">

                        <dui-form-row label="Config file">
                            {{jobConfig.path}}
                        </dui-form-row>

                        <dui-form-row label="Target" *ngIf="controllerClient.isLocal()">
                            <dui-button-group padding="none">
                                <dui-button [active]="target === 'cluster'" textured (click)="target='cluster'">Cluster
                                </dui-button>
                                <dui-button [active]="target === 'local'" textured (click)="target='local'">Local
                                </dui-button>
                            </dui-button-group>
                        </dui-form-row>

                        <dui-form-row label="Cluster" *ngIf="target === 'cluster'">
                            <dui-select textured style="width: 100%;" [(ngModel)]="clusterOrNode">
                                <dui-option [value]="''">Automatically assign</dui-option>
                                <ng-container *ngFor="let cluster of store.value.clusters|async">
                                    <dui-option [value]="cluster">
                                        <div *dynamicOption style="font-weight: 500;">
                                            {{cluster.name}}
                                        </div>
                                    </dui-option>

                                    <dui-option
                                            *ngFor="let node of filterNodes(store.value.nodes|async, cluster)"
                                            [value]="node">
                                        <div style="padding-left: 15px;" *dynamicOption>{{node.name}}</div>
                                    </dui-option>
                                </ng-container>
                            </dui-select>
                        </dui-form-row>

                        <dui-form-row label="Resources" *ngIf="target === 'cluster'">
                            <div>
                                <dk-resources (changed)="updateFoundNodes()"
                                              [resources]="jobConfig.resources"></dk-resources>
                            </div>
                            <div *ngIf="foundNodes">
                                <div *ngIf="foundNodes.status === FitsStatus.neverFits" style="color: var(--color-red)">
                                    There is no available node in your clusters with such resources.
                                </div>

                                <div *ngIf="foundNodes.status === FitsStatus.notFree" style="color: var(--color-orange)">
                                    Currently, cluster is too busy to serve that request. The experiment will be queued.
                                </div>

                                <ng-container *ngIf="foundNodes.status === FitsStatus.fits">
                                    <div style="color: var(--color-green)">
                                        This node would be assigned with these resources reserved:
                                    </div>

                                    <ul style="margin-top: 5px;">
                                        <li *ngFor="let nodeKv of foundNodes.nodeAssignment|keyvalue">
                                            <ng-container *ngFor="let instanceKv of nodeKv.value|keyvalue">
                                                {{store.value.nodes.get(nodeKv.key).name}}:
                                                {{instanceKv.value.cpu}}x CPU cores, {{instanceKv.value.memory}} GB memory,
                                                {{instanceKv.value.gpus.length}}x GPU
                                                <ng-container *ngFor="let gpu of instanceKv.value.gpus">
                                                    {{gpu.name}}
                                                </ng-container>
                                                <!--                                            <span>({{instanceKv.key}})</span>-->
                                            </ng-container>
                                        </li>
                                    </ul>
                                </ng-container>
                            </div>
                        </dui-form-row>

                        <dk-section-header>Configuration</dk-section-header>
                        <div style="margin: 15px;">
                            <div class="label-columns">
                                <div *ngFor="let parameter of jobConfig.config | keys">
                                    <div>{{parameter}}</div>

                                    <div style="user-select: text">
                                        <dui-input style="width: auto;"
                                                   [(ngModel)]="jobConfig.config[parameter]"></dui-input>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <dk-section-header>TASKS</dk-section-header>

                        <div class="tasks">
                            <div *ngFor="let kv of jobConfig.getTasks()|keyvalue">
                                <h3>{{kv.value.name}}</h3>

                                <dui-form-row label="Docker image">
                                    <dui-input style="width: 100%;" [(ngModel)]="kv.value.image"></dui-input>
                                </dui-form-row>

                                <dui-form-row label="Image build instructions" *ngIf="kv.value.image">
                                    <dui-input type="textarea" style="width: 100%;"
                                               [(ngModel)]="kv.value.installString"></dui-input>
                                </dui-form-row>

                                <dui-form-row label="Commands">
                                    <div *ngFor="let command of kv.value.commands">
                                        <dui-input style="width: 100%;" [(ngModel)]="command.command"></dui-input>
                                    </div>
                                </dui-form-row>
                                <!--                            <dui-form-row label="Replicas">-->
                                <!--                                <dui-input type="number" style="width: 100%;" [(ngModel)]="kv.value.replicas"></dui-input>-->
                                <!--                            </dui-form-row>-->
                            </div>
                        </div>
                    </ng-container>

                    <ng-container *ngIf="error">
                        <h3>Error occurred:</h3>

                        {{error}}
                    </ng-container>
                </div>
            </div>

            <dui-dialog-actions>
                <dui-button closeDialog style="margin-right: auto;">Cancel</dui-button>
                <dui-button (click)="create()" [disabled]="starting">Start</dui-button>
            </dui-dialog-actions>
        </ng-container>
    `,
    styleUrls: ['./create-experiment.component.scss']
})
export class CreateExperimentComponent implements OnInit, OnDestroy {
    static dialogDefaults = {
        height: 750,
        width: 1000,
    };

    FitsStatus = FitsStatus;

    @Input() project!: Project;

    @Output() created = new EventEmitter();

    @LocalStorage('create-experiment/target')
    public target: 'local' | 'cluster' = 'cluster';

    public starting = false;
    public error: string = '';
    public config: string = 'deepkit.yml';

    public configs: JobConfig[] = [];
    public configMap: { [path: string]: JobConfig } = {};

    protected configContent?: StreamBehaviorSubject<string | undefined>;

    public clusterOrNode: Cluster | ClusterNode | '' = '';

    public projectSourceFolder = '';
    public foundNodes?: NodesFound;
    public loaded = false;

    @unsubscribe()
    nodeSub?: Subscription;

    constructor(
        public controllerClient: ControllerClient,
        protected cd: ChangeDetectorRef,
        protected dialog: DuiDialog,
        protected dialogRef: DialogComponent,
        public store: MainStore,
    ) {
        this.nodeSub = this.store.value.nodes!.subscribe(() => {
            this.updateFoundNodes();
        });
    }

    public async assignDirectory() {
        const {path, bookmark} = await selectSourceFolder();
        if (!path) return;

        const project = await this.controllerClient.app().getProjectForId(this.project.id);
        if (!project) throw new Error('No project found');

        await this.controllerClient.getLocalApi().setSourceFolder(this.controllerClient.getAccountId(), this.project.id, '', path, project.name, bookmark);
        this.projectSourceFolder = path;
        this.cd.detectChanges();
        this.loadConfigs();
    }

    public updateFoundNodes() {
        const jobConfig = this.configMap[this.config];
        if (jobConfig) {
            jobConfig.resources.normalizeValues();
            this.foundNodes = this.findNodes(jobConfig, jobConfig.resources);
            detectChangesNextFrame(this.cd);
        }
    }

    public findNodes(jobConfig: JobConfig, resources: JobResources): NodesFound {
        let availableClusters = this.store.value.clusters!.all().slice(0);
        let availableNodes = this.store.value.nodes!.all().slice(0);

        availableNodes = availableNodes.filter(v => v.isConnected());

        availableNodes.sort((a, b) => {
            if (a.priority < b.priority) return -1;
            if (a.priority > b.priority) return 1;
            return 0;
        });

        //we wanna have highest priority at the beginning, so those nodes get picked first
        availableNodes.reverse();

        if (this.clusterOrNode instanceof Cluster) {
            availableNodes = availableNodes.filter(v => {
                return v.cluster === (this.clusterOrNode as Cluster).id;
            });
            availableClusters = availableClusters.filter(v => {
                return v.id === (this.clusterOrNode as Cluster).id;
            });
        }

        if (this.clusterOrNode instanceof ClusterNode) {
            if (this.clusterOrNode.isConnected()) {
                availableNodes = [this.clusterOrNode];
            } else {
                availableNodes = [];
            }
            availableClusters = [];
        }

        return findNodesForQueueItem(availableClusters, availableNodes, 1, resources);
    }

    public filterNodes(nodes: ClusterNode[], cluster: Cluster): ClusterNode[] {
        return nodes.filter(v => v.cluster === cluster.id);
    }

    async ngOnInit() {
        this.loadConfigs();
    }

    public async create() {
        this.starting = true;
        this.cd.detectChanges();

        try {
            const config: JobConfig = cloneClass(this.configMap[this.config]);
            const runOnCluster = this.target === 'cluster';

            if (this.clusterOrNode instanceof ClusterNode) {
                config.nodeIds = [this.clusterOrNode.id];
            }

            if (this.clusterOrNode instanceof Cluster) {
                config.clusters = [this.clusterOrNode.id];
            }

            config.resolveInheritance();

            if (this.controllerClient.isLocal()) {
                await this.controllerClient.getLocalApi().createExperiment(
                    this.project.id,
                    runOnCluster,
                    config
                );
            } else {
                await this.controllerClient.app().createExperiment(
                    this.project.id,
                    config
                );
            }

            this.created.emit();
            this.dialogRef.close();

        } catch (error) {
            this.dialog.alert('Failed', 'Error:' + String(error.message || error));
        } finally {
            this.starting = false;
            this.cd.detectChanges();
        }
    }

    protected async loadConfigs() {
        if (this.controllerClient.isLocal()) {
            this.projectSourceFolder = await this.controllerClient.getLocalApi().getSourceFolder(this.project.id);
            if (this.projectSourceFolder) {
                this.configs = await this.controllerClient.getLocalApi().getExperimentConfigs(this.project.id);
            }
        } else {
            this.configs = await this.controllerClient.app().projectGitExperimentFiles(this.project.id, this.project.gitBranch);
        }

        this.configs.sort(function(a, b) {
            if (a.path < b.path) return -1;
            if (a.path > b.path) return 1;
            return 0;
        });

        this.configMap = {};
        if (this.configs.length) {
            this.config = this.configs[0].path;
        }
        for (const config of this.configs) {
            this.configMap[config.path] = config;
        }
        this.updateFoundNodes();
        this.loaded = true;
        this.cd.detectChanges();
    }

    ngOnDestroy(): void {
    }
}
