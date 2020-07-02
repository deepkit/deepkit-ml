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
    templateUrl: './root.component.html',
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

    @LocalStorage('active-jobs-height')
    public activeJobsHeight = 80;

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
        public cd: ChangeDetectorRef,
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
                activeJobs: await this.controllerClient.app().getActiveJobs()
            }));
        }

        this.wasConnected = true;
        this.ready.next(true);
        this.cd.detectChanges();

        if (user) {
            this.checkCli(user);
        }
    }

    public trackById(index: number, item: any) {
        return item.id;
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
