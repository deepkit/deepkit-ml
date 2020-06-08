/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, OnDestroy, OnInit, ViewContainerRef} from "@angular/core";
import {BehaviorSubject, Subscription} from "rxjs";
import {observe, unsubscribe} from "../reactivate-change-detection";
import {Collection, EntitySubject} from "@marcj/glut-core";
import {Subscriptions} from "@marcj/estdlib-rxjs";
import {ControllerClient} from "../providers/controller-client";
import {Cluster, ClusterNode, FrontendUser, HomeAccountConfig, Job, JobTaskQueue, Project, RoleType} from "@deepkit/core";
import {LocalStorage} from "ngx-store";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {getClassName, singleStack, sleep, stack} from "@marcj/estdlib";
import {detectChangesNextFrame, DuiDialog, Electron} from "@marcj/angular-desktop-ui";
import {AppSettingsComponent} from "../dialogs/app-settings.component";
import {AccountsComponent} from "../dialogs/accounts.component";
import {actionEntityDeleted, loadUserData, MainStore, selectEntity} from "../store";
import {AdminComponent} from "./admin/admin.component";
import {CreateProjectComponent} from "../dialogs/create-project.component";
import {CreateOrganisationDialogComponent} from "../dialogs/create-organisation-dialog.component";
import {UserSettingsDialogComponent} from "../dialogs/user-settings-dialog.component";
import {NodeSettingsDialogComponent} from "../dialogs/node-settings-dialog.component";
import {AppControllerInterface, createAnonSocketClient} from "@deepkit/core";
import {InstallCliComponent} from "../dialogs/install-cli.component";
import {JobQueueItem} from "@deepkit/core";
import {JobQueueDialogComponent} from "../dialogs/job-queue-dialog.component";

@Component({
    selector: 'dk-root',
    template: `
        <dui-window *ngIf="needLogin || !(ready|async)">
            <dui-window-header>
                Deepkit
            </dui-window-header>
            <dui-window-content transparent [sidebarVisible]="sidebarVisible">
                <div class="not-connected" *ngIf="needLogin">
                    <div class="logo">
                        <dui-icon name="logo" [size]="85" style="color: black"></dui-icon>
                    </div>

                    <dui-form #loginForm [formGroup]="loginFormGroup" [submit]="login.bind(this)">
                        <p style="margin-top: 25px;">
                            <dui-input formControlName="username" placeholder="Username"></dui-input>
                        </p>
                        <p>
                            <dui-input formControlName="password" type="password" placeholder="Password"></dui-input>
                        </p>

                        <dui-button [submitForm]="loginForm">Login</dui-button>
                    </dui-form>
                </div>

                <div class="not-connected" *ngIf="!needLogin && !(ready|async)">
                    <div class="logo">
                        <dui-icon name="logo" [size]="85" style="color: black"></dui-icon>
                    </div>

                    <div *ngIf="wasConnected">
                        Connecting ...
                    </div>
                    <div *ngIf="!wasConnected">
                        Loading ...
                    </div>

                    <div *ngIf="wasConnected && lastLoginError" style="color: var(--color-red)">
                        {{lastLoginError}}}
                    </div>

                    <div style="margin-top: 15px;" *ngIf="isElectron">
                        <dui-button *ngIf="wasConnected || controllerClient.getConfig().name !== 'localhost'"
                                    (click)="openAccountsSettings()">Switch account
                        </dui-button>
                    </div>
                    <div style="margin-top: 15px;" *ngIf="!isElectron">
                        <dui-button *ngIf="wasConnected"
                                    (click)="openLogin()">Login
                        </dui-button>
                    </div>
                </div>
            </dui-window-content>
        </dui-window>

        <dui-window *ngIf="(ready|async) && controllerClient.isLoggedIn()">
            <dui-menu label="Deepkit" onlyMacOs>
                <dui-menu-item role="about"></dui-menu-item>
                <dui-menu-separator></dui-menu-separator>
                <dui-menu-item label="Preferences" (click)="openAppSettings()"></dui-menu-item>
                <dui-menu-separator></dui-menu-separator>
                <dui-menu-item role="hide"></dui-menu-item>
                <dui-menu-item role="hideothers"></dui-menu-item>
                <dui-menu-item role="unhide"></dui-menu-item>
                <dui-menu-separator></dui-menu-separator>
                <dui-menu-item role="quit"></dui-menu-item>
            </dui-menu>
            <dui-menu role="editMenu"></dui-menu>
            <dui-menu role="viewMenu"></dui-menu>
            <dui-menu role="windowMenu"></dui-menu>

            <dui-window-header>
                <ng-container *ngIf="!store.value.isProjectSelected()">
                    Deepkit
                </ng-container>

                <ng-container *ngIf="store.value.isProjectSelected()">
                    {{store.value.selected.value.name}}
                </ng-container>

                <div class="top-info">
                    <div class="errors" *ngIf="errors.length" (click)="errorsDialog.show()">{{errors.length}}</div>

                    <ng-container *ngIf="controllerClient.getUser()|asyncRender as user">
                        <img
                            *ngIf="user.image"
                            class="user-image-small"
                            [src]="user.image|objectURL"/>

                        <div tabindex="0" class="user" [openDropdown]="userSelect" *ngIf="controllerClient.userLoaded">
                            {{user.username}}
                            <dui-icon [size]="10" name="arrow_down"></dui-icon>
                        </div>
                    </ng-container>

                    <div tabindex="0" class="user" [openDropdown]="accountSelect" *ngIf="!controllerClient.isBrowser">
                        {{controllerClient.getConfig().name}}
                        <dui-icon [size]="10" name="arrow_down"></dui-icon>
                    </div>

                    <div class="user"
                         *ngIf="controllerClient.getAuthenticatedUser().value.hasRole(RoleType.serverAdmin)"
                         (click)="openServerAdministration()">
                        Administration
                    </div>

                    <dui-dropdown #accountSelect>
                        <dui-dropdown-item disabled>Switch account</dui-dropdown-item>

                        <dui-dropdown-item *ngFor="let account of controllerClient.accounts"
                                           [selected]="controllerClient.getConfig().name === account.name"
                                           (click)="switchAccount(account)"
                        >
                            {{account.name}} ({{account.host}})
                        </dui-dropdown-item>
                        <dui-dropdown-splitter></dui-dropdown-splitter>
                        <dui-dropdown-item (click)="openAccountsSettings()">Manage accounts</dui-dropdown-item>
                        <dui-dropdown-item (click)="openAppSettings()">Preferences</dui-dropdown-item>
                    </dui-dropdown>

                    <dui-dropdown #userSelect>
                        <dui-dropdown-item disabled>Switch user</dui-dropdown-item>

                        <dui-dropdown-item [selected]="!controllerClient.organisation"
                                           (click)="switchOrganisation('')">
                            {{controllerClient.getAuthenticatedUser().value.username}}
                        </dui-dropdown-item>

                        <dui-dropdown-item *ngFor="let user of store.value.organisations|asyncRender"
                                           [selected]="user.id === controllerClient.organisation"
                                           (click)="switchOrganisation(user.id)"
                        >
                            {{user.username}}
                        </dui-dropdown-item>
                        <dui-dropdown-splitter></dui-dropdown-splitter>
                        <dui-dropdown-item (click)="openCreateOrganisation()">Create organisation</dui-dropdown-item>
                        <dui-dropdown-item (click)="openUserSettings()">Settings</dui-dropdown-item>
                        <dui-dropdown-splitter *ngIf="!isElectron"></dui-dropdown-splitter>
                        <dui-dropdown-item *ngIf="!isElectron" (click)="logout()">Logout</dui-dropdown-item>
                    </dui-dropdown>
                </div>

                <dui-window-toolbar>
                    <dui-button-group>
                        <dui-button textured [openDropdown]="createDropdown">
                            <dui-icon name="add"></dui-icon>
                        </dui-button>
                    </dui-button-group>

                    <dui-button-group float="sidebar">
                        <dui-button textured (click)="sidebarVisible = !sidebarVisible;"
                                    icon="toggle_sidebar"></dui-button>
                    </dui-button-group>
                </dui-window-toolbar>
            </dui-window-header>

            <dui-window-content transparent [sidebarVisible]="sidebarVisible">
                <dui-window-sidebar>
                    <!--                    <div class="icon-tabs">-->
                    <!--                        <dui-icon [class.selected]="tab === 'projects'"-->
                    <!--                                  (click)="tab = 'projects'"-->
                    <!--                                  name="projects"></dui-icon>-->
                    <!--                        <dui-icon [class.selected]="tab === 'cluster'"-->
                    <!--                                  (click)="tab = 'cluster'"-->
                    <!--                                  name="cluster"></dui-icon>-->
                    <!--                    </div>-->

                    <dui-list
                        [focusable]="false"
                        (ngModelChange)="storeLastSelected($event)"
                        [ngModel]="store.value.selected">

                        <dui-list-title>
                            Cluster

                            <ng-container *ngIf="jobQueue|async as jobQueue">
                                <div *ngIf="jobQueue.length" (click)="openJobQueue()" style="position: absolute; right: 5px; top: 5px;">{{jobQueue.length}}</div>
                            </ng-container>
                        </dui-list-title>

                        <ng-container *ngFor="let cluster of store.value.clusters|asyncRender">
                            <dui-list-item class="cluster" [value]="store.value.clusters.getEntitySubject(cluster)">
                                <dui-icon *ngIf="!hideNodes[cluster.id]"
                                          (mousedown)="$event.stopPropagation(); hideNodes[cluster.id] = true; hideNodes = hideNodes"
                                          name="triangle_down"></dui-icon>
                                <dui-icon *ngIf="hideNodes[cluster.id]"
                                          (mousedown)="$event.stopPropagation(); hideNodes[cluster.id] = false; hideNodes = hideNodes"
                                          name="triangle_right"></dui-icon>

                                {{cluster.name}}
                            </dui-list-item>

                            <ng-container *ngIf="!hideNodes[cluster.id]">
                                <dui-list-item class="node"
                                               *ngFor="let node of filterNodes(store.value.nodes|asyncRender, cluster)"
                                               [value]="store.value.nodes.getEntitySubject(node)"
                                >
                                    <div class="node-mini-utils" [class.connected]="node.connected">
                                        <div>
                                            <dk-progress-bar [height]="2"
                                                             [value]="node.connected ? node.getCpuUsageInPercent() : 0"></dk-progress-bar>
                                            <dk-progress-bar [height]="2"
                                                             [value]="node.connected ? node.getMemoryUsageInPercent() : 0"></dk-progress-bar>
                                            <dk-progress-bar [height]="2"
                                                             [value]="node.connected ? node.getGpuUsageInPercent() : 0"></dk-progress-bar>
                                        </div>
                                    </div>
                                    {{node.name}}
                                </dui-list-item>
                            </ng-container>
                        </ng-container>

                        <dui-list-title>Projects</dui-list-title>

                        <dui-list-item
                            *ngFor="let project of filterProjects(store.value.projects|asyncRender)"
                            [value]="store.value.projects.getEntitySubject(project)"
                        >
                            {{project.name}}
                        </dui-list-item>
                    </dui-list>

                    <div class="sidebar-actions">
                        <dui-input class="semi-transparent" clearer lightFocus style="flex: 1" icon="filter"
                                   [(ngModel)]="filterQuery" round (esc)="filterQuery = ''"
                                   placeholder="Filter"></dui-input>
                    </div>
                </dui-window-sidebar>

                <div class="welcome" *ngIf="welcomeVisible()">
                    <div class="logo">
                        <dui-icon name="logo" [size]="51" style="color: black"></dui-icon>
                    </div>

                    <h1>Welcome to Deepkit</h1>

                    <div class="points">
                        <div>
                            <h3>Experiments</h3>
                            Manage all your experiments in one app. Track and debug your progress.
                        </div>
                        <div>
                            <h3>Cluster</h3>
                            Connect all your servers to run experiments easily on them.
                        </div>
                        <div>
                            <h3>Collaboration</h3>
                            Run your own Deepkit server to work on projects
                            in your team.
                        </div>
                    </div>

                    <div>
                        <dui-button primary (click)="openProjectDialog()">Get started</dui-button>
                    </div>
                </div>

                <div>
                    <dui-dropdown #createDropdown>
                        <dui-dropdown-item (click)="openProjectDialog()">Project</dui-dropdown-item>
                        <dui-dropdown-item (click)="createClusterDialog.show()">Cluster</dui-dropdown-item>
                        <dui-dropdown-item (click)="openNodeSettings()">Cluster node</dui-dropdown-item>
                    </dui-dropdown>

                    <dui-dialog #errorsDialog>
                        <div class="text-selection">
                            <div class="error-item"
                                 *ngFor="let error of errors">
                                <div style="white-space: pre;">{{error.date|date:'M/d/yy HH:mm:ss.SSS'}}
                                    : {{error.error.stack}}</div>
                            </div>
                        </div>

                        <dui-dialog-actions>
                            <dui-button closeDialog>OK</dui-button>
                        </dui-dialog-actions>
                    </dui-dialog>

                    <dui-dialog #createClusterDialog [width]="400">
                        <ng-container *dialogContainer>
                            <h4>Create cluster</h4>
                            <dui-form [formGroup]="createClusterForm" #form
                                      (success)="createClusterDialog.close()"
                                      [submit]="createCluster.bind(this)">
                                <dui-form-row label="Name">
                                    <dui-input focus formControlName="name"></dui-input>
                                </dui-form-row>

                                <dui-dialog-actions>
                                    <dui-button textured [disabled]="form.submitting" closeDialog>Cancel</dui-button>
                                    <dui-button textured
                                                [submitForm]="form"
                                                [disabled]="createClusterForm.invalid || form.submitting">
                                        Create
                                    </dui-button>
                                </dui-dialog-actions>
                            </dui-form>
                        </ng-container>
                    </dui-dialog>

                    <dk-project-show *duiView="store.value.isProjectSelected()"
                                     [project$]="store.value.selectedProject"></dk-project-show>

                    <dk-cluster-show *duiView="store.value.isClusterSelected()"
                                     [cluster$]="store.value.selectedCluster"></dk-cluster-show>
                    <dk-node-show *duiView="store.value.isClusterNodeSelected()"
                                  [node$]="store.value.selectedNode"></dk-node-show>

                    <!--                    <router-outlet class="animated"></router-outlet>-->
                </div>
            </dui-window-content>
        </dui-window>
    `,
    styleUrls: ['./root.component.scss']
})
export class RootComponent implements OnDestroy, OnInit {
    RoleType = RoleType;

    @observe() public ready = new BehaviorSubject(false);

    @LocalStorage('root-sidebar-visible')
    public sidebarVisible = true;

    @LocalStorage('check-cli')
    public checkCLI = true;

    public wasConnected = false;

    public lastLoginError = '';

    public errors: { name: string, error: Error, date: Date }[] = [];

    createClusterForm = new FormGroup({
        name: new FormControl('', [Validators.required]),
    });

    @LocalStorage('root-tab')
    public tab: 'projects' | 'cluster' | 'dataset' = 'projects';

    @LocalStorage('root-hide-nodes')
    public hideNodes: { [clusterId: string]: boolean } = {};

    public filterQuery: string = '';

    loginFormGroup = new FormGroup({
        username: new FormControl('', [Validators.required]),
        password: new FormControl('', [Validators.required]),
    });

    @unsubscribe()
    private totalExperimentsSubscription?: Subscription;

    @unsubscribe()
    private activeExperimentsSubscription?: Subscription;

    @observe({unsubscribe: true})
    public activeJobs?: Collection<Job>;

    @observe({unsubscribe: true})
    public jobQueue?: Collection<JobQueueItem>;

    @unsubscribe()
    protected subs = new Subscriptions();

    @unsubscribe()
    private routerSubscription?: Subscription;

    protected lastProjectUrl = '';

    protected lastConnectTimer: any;
    protected lastConnectDisconnectSubscription?: Subscription;
    protected lastEntityStateDeletionSubscription?: Subscription;

    public needLogin = false;

    public isElectron = Electron.isAvailable();

    @LocalStorage('root/last-selected-type')
    public lastSelectedType: 'project' | 'node' | 'cluster' = 'project';

    @LocalStorage('root/last-selected-id')
    public lastSelectedId: string = '';

    @LocalStorage('root/last-account-name')
    public lastUsedAccountName = 'localhost';

    @LocalStorage('root/install-cli-shown')
    public installCliShown = false;

    @LocalStorage('root/last-login-token')
    public lastLoginToken = '';

    constructor(
        public controllerClient: ControllerClient,
        private cd: ChangeDetectorRef,
        private viewContainerRef: ViewContainerRef,
        private dialog: DuiDialog,
        public store: MainStore,
    ) {
        store.subscribe(() => {
            detectChangesNextFrame(this.cd);
        });
    }

    public openAppSettings() {
        this.dialog.open(AppSettingsComponent);
    }

    public openJobQueue() {
        this.dialog.open(JobQueueDialogComponent, {
            jobQueue: this.jobQueue
        });
    }

    public openServerAdministration() {
        this.dialog.open(AdminComponent);
    }

    public openProjectDialog() {
        const {dialog} = this.dialog.open(CreateProjectComponent);
        // dialog.closed.subscribe((id: any) => {
        //     if (id) {
        //         //todo load project
        //         this.dialog.open(ProjectSettingsComponent, {project$: this.project$});
        //     }
        // });
    }


    public openCreateOrganisation() {
        this.dialog.open(CreateOrganisationDialogComponent);
    }

    public openUserSettings() {
        this.dialog.open(UserSettingsDialogComponent, {
            user: this.controllerClient.getUser().value
        });
    }

    openNodeSettings() {
        this.dialog.open(NodeSettingsDialogComponent);
    }

    public async openLogin() {
        await this.disconnect();
        this.needLogin = true;
        this.cd.detectChanges();
    }

    public openAccountsSettings(accountId?: string, error?: Error) {
        const {component} = this.dialog.open(AccountsComponent, {
            accountId, error
        });

        component.useAccount.subscribe((accountId: string) => {
            this.switchAccount(this.controllerClient.getConfigForId(accountId));
        });
    }

    public async switchOrganisation(userId: string) {
        if (this.controllerClient.organisation === userId) return;

        this.controllerClient.organisation = userId;
        this.reconnect();
    }

    public async switchAccount(account?: HomeAccountConfig) {
        if (!account) return;

        if (this.lastUsedAccountName === account.name && this.controllerClient.getClient().isConnected()) return;

        this.lastLoginError = '';
        this.lastUsedAccountName = account.name;
        this.controllerClient.organisation = '';

        console.log('switch account', account);
        this.reconnect();
    }

    protected async reconnect() {
        if (this.lastConnectDisconnectSubscription) this.lastConnectDisconnectSubscription.unsubscribe();
        this.ready.next(false);
        await this.controllerClient.clearClient();
        await this.connect();
    }

    protected async disconnect() {
        if (this.lastConnectDisconnectSubscription) this.lastConnectDisconnectSubscription.unsubscribe();
        this.ready.next(false);
        await this.controllerClient.clearClient();
    }

    public welcomeVisible() {
        return this.store.value.projects ? this.store.value.projects.count() === 0 : false;
    }

    public async createCluster() {
        const cluster = new Cluster(this.createClusterForm.value.name);
        this.createClusterForm.reset();
        await this.controllerClient.admin().createCluster(cluster);
    }

    public storeLastSelected(selected: EntitySubject<Project> | EntitySubject<Cluster> | EntitySubject<ClusterNode>) {
        this.store.dispatch(selectEntity({entity: selected}));
    }

    async ngOnInit() {
        window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
            this.errors.push({name: getClassName(e.reason), error: e.reason, date: new Date});
            requestAnimationFrame(() => {
                this.cd.detectChanges();
            });
        });

        this.connect();
    }

    @singleStack()
    public async login() {
        await sleep(1);

        this.lastLoginToken = '';

        const client = createAnonSocketClient(this.controllerClient.getConfig());

        try {
            await client.connect();
            const controller = client.controller<AppControllerInterface>('app');
            const token = await controller.login(this.loginFormGroup.value.username, this.loginFormGroup.value.password);
            if (!token) {
                throw new Error('Credentials invalid');
            }

            this.lastLoginToken = token;
            this.loginFormGroup.patchValue({password: ''});
            await this.connect();
        } finally {
            this.cd.detectChanges();
            await client.disconnect();
        }
    }

    @stack()
    public async connect() {
        try {
            if (this.controllerClient.getClient().isConnected()) {
                console.log('already connected');
                return;
            }

            if (this.lastConnectTimer) {
                clearTimeout(this.lastConnectTimer);
            }

            if (this.lastConnectDisconnectSubscription) this.lastConnectDisconnectSubscription.unsubscribe();
            if (this.lastEntityStateDeletionSubscription) this.lastEntityStateDeletionSubscription.unsubscribe();

            if (Electron.isAvailable()) {
                if (!this.controllerClient.hasAccounts()) {
                    const accounts = await this.controllerClient.getLocalApi().getAccounts();
                    console.log('found accounts', accounts);
                    this.controllerClient.setAccounts(accounts);
                }
                try {
                    await this.controllerClient.resetClientAndLoadAccountByName(this.lastUsedAccountName);
                } catch {
                    if (!this.controllerClient.accounts[0]) {
                        this.openAccountsSettings(undefined, new Error('No accounts configured'));
                        return;
                    }

                    this.lastUsedAccountName = this.controllerClient.accounts[0].name;
                    this.controllerClient.setConfig(this.controllerClient.accounts[0]);
                    await this.controllerClient.clearClient();
                }
            } else {
                //load accounts from localStorage
                if (!this.lastLoginToken) {
                    this.needLogin = true;
                    this.cd.detectChanges();
                    return;
                }

                this.needLogin = false;
                this.controllerClient.loadConfigFromBrowser();
                this.controllerClient.getConfig().token = this.lastLoginToken;
                await this.controllerClient.clearClient();
                console.log('config', this.controllerClient.getConfig());
            }

            await this.controllerClient.loadUser();

            this.lastEntityStateDeletionSubscription = this.controllerClient.getClient().entityState.deleted.subscribe((entity) => {
                this.store.dispatch(actionEntityDeleted({entity}));
            });

            this.lastConnectDisconnectSubscription = this.controllerClient.getClient().disconnected.subscribe(() => {
                console.log('disconnected');
                this.ready.next(false);
                this.connect();
            });

            const user = this.controllerClient.getUser();
            console.log('user loaded', user.value);
            this.loadUserData(user.value);
        } catch (error) {
            this.lastLoginError = error;
            this.lastConnectTimer = setTimeout(() => this.connect(), 1000);
            console.log('failed to connect', error);
        } finally {
            this.cd.detectChanges();
        }
    }

    public filterProjects(projects: Project[]): Project[] {
        if (!this.filterQuery) {
            return projects;
        }

        return projects.filter((project) => {
            return -1 !== project.name.indexOf(this.filterQuery);
        });
    }

    public filterNodes(nodes: ClusterNode[], cluster: Cluster): ClusterNode[] {
        return nodes.filter((node) => {
            if (node.cluster !== cluster.id) {
                return false;
            }

            if (this.filterQuery) {
                return -1 !== node.name.indexOf(this.filterQuery);
            }

            return true;
        });
    }

    public async loadUserData(user: FrontendUser | undefined) {
        this.subs.unsubscribe();

        this.ready.next(false);

        if (user) {
            const projects = await this.controllerClient.app().getProjects();

            this.subs.add = projects.subscribe((projects) => {
                this.subscribeActiveExperiments(projects);
                this.subscribeTotalExperiments(projects);
                this.subscribeJobQueue();
                this.cd.detectChanges();
            });

            this.store.dispatch(loadUserData({
                user: user,
                projects: await this.controllerClient.app().getProjects(),
                clusters: await this.controllerClient.app().getClusters(),
                nodes: await this.controllerClient.app().getNodes(),
                organisations: await this.controllerClient.app().getMyOrganisations(),
            }));

            //this.activeJobs = await this.controllerClient.app().getActiveJobs();
        }

        this.wasConnected = true;
        this.ready.next(true);
        this.cd.detectChanges();

        if (user) {
            this.checkCli(user);
        }
    }

    protected async checkCli(user: FrontendUser) {
        if (!user.localUser) return;

        if (!this.installCliShown) {
            this.dialog.open(InstallCliComponent);
            this.installCliShown = true;
        }
    }

    // public login() {
    //     this.router.navigate(['login'], {queryParams: {redirect: this.router.routerState.snapshot.url}});
    // }

    public logout() {
        this.lastLoginToken = '';
        this.controllerClient.logout();
    }

    ngOnDestroy(): void {
        if (this.totalExperimentsSubscription) {
            this.totalExperimentsSubscription.unsubscribe();
        }

        if (this.activeExperimentsSubscription) {
            this.activeExperimentsSubscription.unsubscribe();
        }
    }

    protected subscribeActiveExperiments(projects: Project[]) {
        // if (this.activeExperimentsSubscription) {
        //     this.activeExperimentsSubscription.unsubscribe();
        //     delete this.activeExperimentsSubscription;
        // }
        //
        // const filters: { project: string, alive: boolean }[] = [];
        // for (const project of projects) {
        //     filters.push({
        //         project: project.id,
        //         alive: true
        //     });
        // }
        // this.activeExperimentsSubscription = this.storageClient.countAndSubscribe(Job, filters).subscribe((item) => {
        //     this.activeExperiments[filters[item.index].project] = item.count;
        //     this.cd.detectChanges();
        // });
    }

    protected async subscribeJobQueue() {
        this.jobQueue = await this.controllerClient.app().subscribeJobQueue();
    }

    protected subscribeTotalExperiments(projects: Project[]) {
        if (this.totalExperimentsSubscription) {
            this.totalExperimentsSubscription.unsubscribe();
            delete this.totalExperimentsSubscription;
        }

        const filters: { project: string }[] = [];
        for (const project of projects) {
            filters.push({
                project: project.id
            });
        }
        // this.totalExperimentsSubscription = this.storageClient.countAndSubscribe(Job, filters).subscribe((item) => {
        //     this.totalExperiments[filters[item.index].project] = item.count;
        //     this.cd.detectChanges();
        // });
    }

}
