/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {AfterViewInit, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, SimpleChanges} from "@angular/core";
import {ControllerClient} from "../../providers/controller-client";
import {observe, unsubscribe} from "../../reactivate-change-detection";
import {EntitySubject, StreamBehaviorSubject} from "@marcj/glut-core";
import {ClusterNode} from "@deepkit/core";
import {Subscriptions} from "@marcj/estdlib-rxjs";
import {Observable, ReplaySubject} from "rxjs";
import {LocalStorage} from "ngx-store";
import {detectChangesNextFrame, DuiDialog, ViewState} from "@marcj/angular-desktop-ui";
import {NodeSettingsDialogComponent} from "../../dialogs/node-settings-dialog.component";
import compareVersions = require("compare-versions");

@Component({
    selector: 'dk-node-show',
    template: `
        <shell-command *ngIf="installDockerObservable" [observable]="installDockerObservable"
                       title="Install Docker"></shell-command>
        <shell-command *ngIf="installNvidiaObservable" [observable]="installNvidiaObservable"
                       title="Install NVIDIA"></shell-command>

        <dui-dialog [(visible)]="startDialogVisible">
            <ng-container *dialogContainer>
                Starting ...
            </ng-container>
        </dui-dialog>

        <dui-window-toolbar *ngIf="viewState.attached">
            <dui-button-group *ngIf="node$">
                <dui-button textured *ngIf="node$.value.isConnected()"
                            (click)="stop()">Stop</dui-button>
                <dui-button textured *ngIf="!node$.value.isConnected() && node$.value.tunnelActive" (click)="closeTunnel()">Disconnect</dui-button>
            </dui-button-group>

            <dui-button-group padding="none" float="right">
                <dui-button textured [highlighted]="showList" (click)="showList = !showList"
                            icon="toggle_bottom"></dui-button>
            </dui-button-group>

            <dui-button-group padding="none">
                <dui-button textured (click)="openNodeSettings()" icon="settings"></dui-button>
            </dui-button-group>
        </dui-window-toolbar>

        <div class="left overlay-scrollbar-small" *ngIf="node$|async as node">
            <div class="sidebar-title">NODE <strong>{{node.name}}</strong></div>

            <div>
                <div *ngIf="node.isConnected()" style="color: var(--color-green)">ONLINE</div>
                <div *ngIf="!node.isConnected()" style="color: var(--color-red)">
                    <div *ngIf="node.machineError" class="selectable-text">
                        {{node.machineError}}
                    </div>
                    <div *ngIf="node.tunnelError" class="selectable-text">
                        Tunnel: {{node.tunnelError}}
                    </div>
                    <div *ngIf="!node.machineError && !node.tunnelError" style="text-transform: uppercase">
                        {{node.getStatusLabel()}}
                    </div>
                </div>
            </div>
            <div *ngIf="node.sudoFailed" style="padding: 5px 0; color: var(--color-orange)">
                Sudo failed. Please make sure sudo is correctly configured.
            </div>

            <div class="header-desc">
                <div>
                    {{node.information.deviceDescription}}
                </div>
                <div>
                    {{node.information.osDescription}}
                </div>
                <div>
                    {{node.information.cpuDescription}}
                </div>
            </div>

            <div *ngIf="!node.isDockerReady()" style="margin: 10px 0;">
                No Docker installed.

                <dui-button *ngIf="node.isConnected()" textured (click)="installDocker()">Install Docker automatically
                </dui-button>
            </div>

            <div style="margin: 10px 0;" *ngIf="!node.nvidiaInfo">
                No NVIDIA installed.

                <dui-button *ngIf="node.isConnected()" textured (click)="installNvidia()">Install NVIDIA automatically
                </dui-button>
            </div>

            <div class="tabled-values" style="margin: 20px 0;">
                <div>
                    <div>Ready</div>
                    <div>
                        <ng-container *ngIf="node.disabled">
                            Disabled
                        </ng-container>

                        <ng-container *ngIf="!node.disabled">
                            <div class="monospace">
                                {{node.isConnected() && node.ready ? 'Yes' : 'No'}}
                            </div>
                            <div *ngIf="node.isConnected() && !node.ready && !node.isDockerReady()">Docker required
                            </div>
                        </ng-container>
                    </div>
                </div>
                <div *ngIf="node.dockerInfo.ServerVersion">
                    <div>Docker version</div>
                    <div>
                        <div class="monospace">{{node.dockerInfo.ServerVersion}}</div>
                        <div *ngIf="isDockerTooOld(node.dockerInfo.ServerVersion)">
                            <div style="color: var(--color-orange)">
                                Version too old for GPU support.
                                Use at least 19.03.1.
                            </div>

                            <dui-button *ngIf="node.isConnected()" textured (click)="installDocker()">Install Docker
                            </dui-button>
                        </div>
                    </div>
                </div>
                <div *ngIf="node.nvidiaInfo">
                    <div>NVIDIA / CUDA</div>
                    <div class="monospace">{{node.nvidiaInfo.driverVersion}} / {{node.nvidiaInfo.cudaVersion}}</div>
                </div>
                <div>
                    <div>Host</div>
                    <div class="monospace">{{node.host || 'n/a'}}</div>
                </div>
                <div>
                    <div>Connection established</div>
                    <div class="monospace">
                        {{node.tunnelActive ? 'Yes' : 'No'}}
                    </div>
                </div>
                <div *ngIf="node.isConnected()">
                    <div>Connected since</div>
                    <div class="monospace">
                        <dk-redraw>{{node.connectedTime|humanize_until_now}}</dk-redraw>
                    </div>
                </div>
                <div *ngIf="!node.isConnected()">
                    <div>Disconnected since</div>
                    <div class="monospace">
                        <dk-redraw>{{node.ping|humanize_until_now}}</dk-redraw>
                    </div>
                </div>
                <div *ngIf="node.isConnected()">
                    <div>Uptime</div>
                    <div class="monospace">
                        <dk-redraw>{{node.stats.uptime|humanize}}</dk-redraw>
                    </div>
                </div>
                <div *ngIf="node.isConnected()">
                    <div>Ping</div>
                    <div class="monospace">
                        <ng-container *ngIf="node.peerConnections['server'] as con">
                            {{con.ping | number:'.0-2'}} ms
                        </ng-container>
                    </div>
                </div>
            </div>

            <dk-section-header [center]="true">RESOURCES</dk-section-header>
            <div style="display: flex; justify-content: space-between;">
                <ng-container>
                    <dk-gauge
                        label="CPU"
                        [current]="node.resources.cpu.reserved"
                        [total]="node.resources.cpu.total"
                        affix="cores"
                    ></dk-gauge>
                </ng-container>

                <ng-container>
                    <dk-gauge
                        label="MEM"
                        [current]="node.resources.memory.reserved"
                        [total]="node.resources.memory.total"
                        affix="GB"
                    ></dk-gauge>
                </ng-container>

                <ng-container>
                    <dk-gauge
                        label="GPU"
                        [current]="node.resources.getReservedGpuCount()"
                        [total]="node.resources.getGpuCount()"
                        affix="cores"
                    ></dk-gauge>
                </ng-container>
            </div>


            <dk-section-header style="margin-top: 20px;" [center]="true">UTILISATION</dk-section-header>
            <table class="hardware-utilisation">
                <tr>
                    <td>CPU</td>
                    <td>
                        {{node.stats.getCPUCoreCount()}}x
                        <span *ngIf="node.information.getCpuMaxSpeed() === node.information.getCpuMinSpeed()">
                                    {{node.information.getCpuMaxSpeed() / 1024  | number:'1.0-2'}}GHz
                                </span>
                        <span *ngIf="node.information.getCpuMaxSpeed() !== node.information.getCpuMinSpeed()">
                                    {{node.information.getCpuMinSpeed() / 1024  | number:'1.0-2'}}
                            ->{{node.information.getCpuMaxSpeed() / 1024  | number:'1.0-2'}}GHz
                        </span>
                    </td>
                    <td>
                        <dk-progress-bar [height]="12" [value]="node.getCpuUsageInPercent()"></dk-progress-bar>
                    </td>
                </tr>
                <tr>
                    <td>MEM</td>
                    <td>{{node.information.memoryTotal | number:'1.0-2'}} GB</td>
                    <td>
                        <dk-progress-bar [height]="12" [value]="node.getMemoryUsageInPercent()"></dk-progress-bar>
                    </td>
                </tr>
                <tr>
                    <td>GPU</td>
                    <td>
                        {{node.information.gpus.length}}x
                    </td>
                    <td>
                        <dk-progress-bar [height]="12" [value]="node.getGpuUsageInPercent()"></dk-progress-bar>
                    </td>
                </tr>
                <tr *ngIf="node.information.gpus.length">
                    <td>GPU MEM</td>
                    <td>
                        <ng-container *ngIf="node.information.gpus.length">
                            <ng-container
                                *ngIf="node.information.getGpuMemoryMin() !== node.information.getGpuMemoryMax()">
                                {{node.information.getGpuMemoryMin() | number:'1.0-0'}}
                                -> {{node.information.getGpuMemoryMax() | number:'1.0-0'}}
                                GB
                            </ng-container>
                            <ng-container
                                *ngIf="node.information.getGpuMemoryMin() === node.information.getGpuMemoryMax()">
                                {{node.information.getGpuMemoryMax() | number:'1.0-0'}} GB
                            </ng-container>
                        </ng-container>
                    </td>

                    <td>
                        <dk-progress-bar [height]="12" [value]="node.getGpuMemoryUsageInPercent()"></dk-progress-bar>
                    </td>
                </tr>

                <tr *ngFor="let drive of node.information.drives; index as i">
                    <td colspan="2">
                        <div>Drive {{drive.device}}</div>
                        {{drive.size|number:'1.0-0'}} GB
                    </td>
                    <td>
                        <dk-progress-bar [height]="12"
                                         [value]="node.stats.driveUsage[i]"></dk-progress-bar>
                    </td>
                </tr>

            </table>

            <div class="gpu" *ngFor="let gpu of node.information.gpus">
                <div class="title"><strong>{{gpu.name}}</strong>, {{gpu.memory|number:'1.2'}} GB @ {{gpu.clock}} MHz
                </div>
                <div class="sub" *ngIf="node.stats.getGpu(gpu.uuid) as gpuStats">
                    {{gpuStats.temperature}} C, {{gpuStats.powerDraw}} Watt

                    <ng-container *ngIf="node.resources.getGpu(gpu.uuid) as reservation">
                        <div class="online-chip" *ngIf="reservation.reserved">IN USE</div>
                    </ng-container>
                </div>
                <div *ngIf="node.stats.getGpu(gpu.uuid) as gpuStats">
                    <div class="util">
                        <div class="label">GPU</div>
                        <div class="value">{{gpuStats.gpuUtilization * 100|number:'1.0'}} %</div>
                        <div>
                            <dk-progress-bar [height]="10" [value]="gpuStats.gpuUtilization"></dk-progress-bar>
                        </div>
                    </div>
                    <div class="util">
                        <div class="label">MEMORY</div>
                        <div class="value">{{gpuStats.memory * 100|number:'1.0'}} %</div>
                        <div>
                            <dk-progress-bar [height]="10" [value]="gpuStats.memory"></dk-progress-bar>
                        </div>
                    </div>
                </div>
            </div>

        </div>

        <div class="right">
            <div class="right-tabs">
                <dui-button-groups align="center">
                    <dui-button-group padding="none">
                        <dui-button textured (click)="tab = 'logs'" [active]="tab === 'logs'">Logs</dui-button>
                        <dui-button textured (click)="tab = 'docker'" [active]="tab === 'docker'">Docker</dui-button>
                        <!--                        <dui-button textured (click)="tab = 'shell'" [active]="tab === 'shell'">Shell</dui-button>-->
                    </dui-button-group>
                </dui-button-groups>
            </div>

            <div class="right-content" *ngIf="tab === 'logs'">
                <dk-term style="margin-left: 5px;" [data]="stdout"></dk-term>
            </div>

            <div class="right-content scroll" *ngIf="tab === 'docker'">
                <div class="docker-layout">
                    <div style="flex: 0 0 20px; text-align: right;">
                        <dui-button [disabled]="pruningImages"
                                    confirm="Really delete ALL unsued images on the server?"
                                    (click)="pruneImages()">Prune unused images
                        </dui-button>

                        <dui-button [disabled]="pruningImages"
                                    confirm="Really delete ALL unused container on the server?"
                                    (click)="pruneContainer()">Prune unused container
                        </dui-button>
                    </div>

                    <dui-table
                        [items]="images"
                        noFocusOutline
                        style="flex: 1 1 50%"
                    >
                        <dui-table-column class="selectable-text" name="repo" header="Image repo"
                                          [width]="250"></dui-table-column>
                        <dui-table-column class="selectable-text" name="tag" header="tag"
                                          [width]="120"></dui-table-column>
                        <dui-table-column class="monospace selectable-text" name="id" [width]="120">
                            <ng-container *duiTableCell="let row">
                                {{row.id | slice:0:12}}
                            </ng-container>
                        </dui-table-column>
                        <dui-table-column name="created" [width]="166">
                            <ng-container *duiTableCell="let row">
                                {{row.created | dateTime}}
                            </ng-container>
                        </dui-table-column>
                        <dui-table-column name="size">
                            <ng-container *duiTableCell="let row">
                                {{row.size | fileSize}}
                            </ng-container>
                        </dui-table-column>
                        <dui-table-column>
                            <ng-container *duiTableCell="let row">
                                <dui-button square style="line-height: 18px; height: 18px;"
                                            confirm="Really delete that image?"
                                            [disabled]="deletingImage[row.id] === true" (click)="deleteImage(row.id)">
                                    Delete
                                </dui-button>
                            </ng-container>
                        </dui-table-column>
                    </dui-table>
                    <dui-table
                        [items]="containers"
                        noFocusOutline
                        style="flex: 1 1 50%"
                    >
                        <dui-table-column class="monospace selectable-text" name="id" header="Container ID"
                                          [width]="120">
                            <ng-container *duiTableCell="let row">
                                {{row.id | slice:0:12}}
                            </ng-container>
                        </dui-table-column>
                        <dui-table-column name="name" header="Name"></dui-table-column>
                        <dui-table-column name="state" header="State"></dui-table-column>
                        <dui-table-column name="status" header="Status"></dui-table-column>
                        <dui-table-column name="command" header="Command" [width]="200"></dui-table-column>
                        <dui-table-column name="image" header="Image" [width]="200"></dui-table-column>
                        <dui-table-column name="created" [width]="166">
                            <ng-container *duiTableCell="let row">
                                {{row.created | dateTime}}
                            </ng-container>
                        </dui-table-column>

                    </dui-table>
                </div>
            </div>

            <div class="right-content scroll" *ngIf="tab === 'shell'">
                Hi shell
            </div>
        </div>
    `,
    styleUrls: ['./node.component.scss']
})
export class NodeComponent implements OnDestroy, AfterViewInit, OnChanges {
    @Input() @observe() node$?: EntitySubject<ClusterNode>;

    @unsubscribe()
    stdout?: StreamBehaviorSubject<string>;

    startDialogVisible = false;

    starting = false;

    @LocalStorage('node-tab')
    tab: 'logs' | 'docker' | 'shell' = 'logs';

    showList = true;
    listHeight = 220;

    installDockerObservable?: Observable<string>;
    installNvidiaObservable?: Observable<string>;

    @unsubscribe()
    subs = new Subscriptions;

    dockerData: { containers: any[], images: any[] } = {containers: [], images: []};

    images: {
        created: number,
        id: string,
        repo: string,
        tag: string,
        size: number,
    }[] = [];

    containers: {
        id: string,
        state: string,
        status: string,
        command: string,
        created: number,
        image: string,
        imageId: string,
        name: string,
    }[] = [];

    protected updateDockerTimeout: any;

    public pruningImages = false;
    public deletingImage: { [id: string]: true } = {};

    readonly viewState = new ViewState;

    constructor(
        public controllerClient: ControllerClient,
        public cd: ChangeDetectorRef,
        public dialog: DuiDialog,
    ) {
    }

    ngAfterViewInit() {
    }

    openNodeSettings() {
        if (this.node$) {
            this.dialog.open(NodeSettingsDialogComponent, {
                node: this.node$.value
            });
        }
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (changes.node$) {
            if (this.stdout) {
                await this.stdout.unsubscribe();
            }

            this.images = [];
            this.containers = [];

            if (!this.node$) return;

            (window as any).node = this.node$.value;
            this.stdout = (await this.controllerClient.app().subscribeClusterNodeStdout(this.node$!.id)).toUTF8();
            detectChangesNextFrame(this.cd);

            this.loadDocker();
        }
    }

    public isDockerTooOld(version: string): boolean {
        return compareVersions(version, '19.03.1') === -1;
    }

    public async deleteImage(id: string) {
        this.deletingImage[id] = true;
        this.cd.detectChanges();

        try {
            await this.controllerClient.admin().clusterNodeRemoveDockerImage(this.node$!.id, id);
            delete this.deletingImage[id];
            this.loadDocker();
        } catch (error) {
            this.dialog.alert('Could not delete', error.message);
        } finally {
            this.cd.detectChanges();
        }
    }

    public async pruneImages() {
        this.pruningImages = true;
        this.cd.detectChanges();

        try {
            await this.controllerClient.admin().clusterNodePruneDockerImages(this.node$!.id);
            this.loadDocker();
        } finally {
            this.pruningImages = false;
            this.cd.detectChanges();
        }
    }

    public async pruneContainer() {
        this.pruningImages = true;
        this.cd.detectChanges();

        try {
            await this.controllerClient.admin().clusterNodePruneDockerContainer(this.node$!.id);
            this.loadDocker();
        } finally {
            this.pruningImages = false;
            this.cd.detectChanges();
        }
    }

    public async loadDocker() {
        if (this.updateDockerTimeout) {
            clearTimeout(this.updateDockerTimeout);
        }

        try {
            if (!this.node$ || !this.node$.value.isConnected()) {
                return;
            }

            const loadId = this.node$!.id;
            this.dockerData = await this.controllerClient.admin().clusterNodeGetDocker(this.node$!.id);
            if (this.node$!.id !== loadId) return;

            this.images = [];
            for (const image of this.dockerData.images) {
                const repoTags = image.RepoTags && image.RepoTags[0] ? image.RepoTags[0] : '';
                const tag = repoTags ? repoTags.substr(repoTags.indexOf(':') + 1) : '';

                this.images.push({
                    id: image.Id.startsWith('sha256:') ? image.Id.slice('sha256:'.length) : image.Id,
                    created: image.Created,
                    repo: repoTags ? repoTags.substr(0, repoTags.indexOf(':')) : undefined,
                    tag: tag.startsWith('sha256:') ? '' : tag,
                    size: image.Size,
                });
            }

            this.containers = [];
            for (const container of this.dockerData.containers) {
                this.containers.push({
                    id: container.Id,
                    name: container.Names.join(','),
                    status: container.Status,
                    state: container.State,
                    image: container.Image,
                    created: container.Created,
                    command: container.Command,
                    imageId: container.ImageID.startsWith('sha256:') ? container.ImageID.slice('sha256:'.length) : container.ImageID,
                });
            }
        } finally {
            this.updateDockerTimeout = setTimeout(() => {
                this.loadDocker();
            }, 20 * 1000);
        }

        detectChangesNextFrame(this.cd);
    }

    async installDocker() {
        const a = await this.dialog.confirm(
            'Install Docker?',
            'Warning: This installs the newest Docker version using apt-get. Linux Ubuntu/Debian only.'
        );
        if (!a) return;

        const observable = await this.controllerClient.admin().clusterNodeInstallDocker(this.node$!.id);
        const subject = new ReplaySubject<string>();
        observable.subscribe(subject);
        this.installDockerObservable = subject;

        let total = '';
        subject.subscribe((v) => {
            total += v;
        }, () => {
        }, () => {
            if (total.indexOf('')) {

            }
            this.dockerInstallationDone();
        });

        this.cd.detectChanges();
    }

    async installNvidia() {
        const a = await this.dialog.confirm(
            'Install NVIDIA driver?',
            'Warning: This installs the proprietary nvidia driver and the newest nvidia-docker using apt-get. Linux Ubuntu/Debian only.'
        );
        if (!a) return;

        const observable = await this.controllerClient.admin().clusterNodeInstallNvidia(this.node$!.id);
        const subject = new ReplaySubject<string>();
        this.installNvidiaObservable = subject;

        let total = '';
        observable.subscribe((v) => {
            total += v;
            subject.next(v);
        }, () => {
        }, async () => {
            this.nvidiaInstallationDone();

            setTimeout(() => {
                this.nvidiaInstallationDone();
            }, 1000);

            setTimeout(() => {
                this.nvidiaInstallationDone();
            }, 5000);

            if (-1 !== total.indexOf('Nouveau kernel driver')) {
                const a = await this.dialog.confirm(
                    'Installation failed',
                    'Should the Nouveau kernel driver be disabled now? You need to restart the system after that operation.\n' +
                    'WARNING: If you use that system als Desktop workstation, you graphical system might not work after reboot.'
                );

                if (a) {
                    try {
                        subject.next('Disabling Nouveau kernel driver ...');
                        await this.controllerClient.admin().clusterNodeDisableNouveau(this.node$!.id);
                        subject.next('Successfully disabled.');
                        await this.dialog.alert('Nouveau driver disabled.', 'Please restart now this server.');
                    } catch (error) {
                        subject.next('Error disabling Nouveau.');
                        await this.dialog.alert('Failed.', error.message);
                    }
                }
            }
            subject.complete();
        });

        this.cd.detectChanges();
    }

    async dockerInstallationDone() {
        await this.controllerClient.admin().clusterNodeCheckDocker(this.node$!.id);
        this.cd.detectChanges();
    }

    async nvidiaInstallationDone() {
        await this.controllerClient.admin().clusterNodeCheckNvidia(this.node$!.id);
        this.cd.detectChanges();
    }

    async stop() {
        const a = await this.dialog.confirm('Stop node',
            `All running experiments on this node will be stopped and node disconnected. Node reconnects automatically if not disabled.`
        );
        if (a) {
            await this.controllerClient.admin().stopClusterNode(this.node$!.id);
        }
    }

    async closeTunnel() {
        const a = await this.dialog.confirm('Disconnect node',
            `The current active tunnel will be disconnected. Connection is established automatically if not disabled.`
        );
        if (a) {
            await this.controllerClient.admin().closeConnectionClusterNode(this.node$!.id);
        }
    }

    ngOnDestroy(): void {
        // this.root.setSelectedClusterNode();
        if (this.updateDockerTimeout) {
            clearTimeout(this.updateDockerTimeout);
        }
    }
}
