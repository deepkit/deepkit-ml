/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    AppAdminControllerInterface,
    AppControllerInterface,
    AppServerAdminControllerInterface,
    createAnonSocketClient,
    createUserSocketClient,
    FrontendUser,
    hasRole,
    HomeAccountConfig,
    IssueControllerInterface,
    Job,
    LocalControllerInterface,
    NoteControllerInterface,
    ProjectControllerInterface,
    PublicControllerInterface,
    PublicJobControllerInterface,
    RoleType,
    PermissionControllerInterface
} from "@deepkit/core";
import {SocketClient} from "@marcj/glut-client";
import {EntitySubject, RemoteController} from "@marcj/glut-core";
import {BehaviorSubject, Subject, Subscription} from "rxjs";
import {Injectable} from "@angular/core";
import {Subscriptions} from "@marcj/estdlib-rxjs";
import {Electron} from "@marcj/angular-desktop-ui";

@Injectable()
export class ControllerClient {
    public accounts: HomeAccountConfig[] = [];
    protected config?: HomeAccountConfig;
    protected client?: SocketClient;
    protected authenticatedUser?: EntitySubject<FrontendUser>;
    public sessionId = '';
    public sessionRole = RoleType.anonymouse;
    protected user?: EntitySubject<FrontendUser>;

    public isBrowser: boolean = true;

    //user can switch between user and organisation. If empty the user is selected
    public organisation: string = '';

    public readonly connected = new BehaviorSubject<boolean>(false);
    public readonly userLoaded = new Subject<FrontendUser | undefined>();
    public readonly clientSubject = new BehaviorSubject<SocketClient | undefined>(undefined);

    protected connectedSubs = new Subscriptions;

    protected localClient?: SocketClient;
    protected localController?: RemoteController<LocalControllerInterface>;

    protected lastPublicConnectDisconnectSubscription?: Subscription;

    constructor() {
        if (Electron.isAvailable()) {
            this.isBrowser = false;
        }
    }

    public setConfig(config: HomeAccountConfig) {
        this.config = config;
    }

    public isAdmin() {
        return hasRole(this.sessionRole, RoleType.admin);
    }

    public hasConfigId(id: string) {
        return !!this.getConfigForId(id);
    }

    public getConfigForId(id: string): HomeAccountConfig | undefined {
        for (const account of this.accounts) {
            if (account.id === id) return account;
        }
    }

    public getAccountId(): string {
        if (!this.getConfig().id) {
            throw new Error('No account id given.');
        }

        return this.getConfig().id;
    }

    public loadConfigFromBrowser() {
        this.config = this.createConfigFromBrowser();
    }

    public createConfigFromBrowser(): HomeAccountConfig {
        const config = new HomeAccountConfig('server', location.hostname, '');
        config.id = '';
        if (location.protocol.startsWith('file:')) {
            config.port = 8960;
            config.host = 'localhost';
        } else {
            config.port = location.port ? parseInt(location.port, 10) : 80;
            config.ssl = location.protocol.startsWith('https');
            if (config.ssl && !location.port) {
                config.port = 443;
            }
        }
        config.name = config.host;

        return config;
    }

    public getConfig(): HomeAccountConfig {
        if (!this.config) {
            this.config = this.createConfigFromBrowser();
            console.log('ControllerClient.config', this.config);
        }

        return this.config;
    }

    public isLocal() {
        return this.isLocalUser();
    }

    /**
     * Defines whether we connected to a localApp-server as owner.
     */
    public isLocalUser() {
        return this.authenticatedUser && this.authenticatedUser.value.localUser;
    }

    public getLocalApi(): RemoteController<LocalControllerInterface> {
        if (!this.localController) {
            this.localClient = this.createLocalClient();
            this.localController = this.localClient.controller<LocalControllerInterface>('local');
        }

        return this.localController;
    }

    public setAccounts(accounts: HomeAccountConfig[]) {
        this.accounts = accounts;
    }

    public hasAccounts(): boolean {
        return this.accounts.length > 0;
    }

    public async resetClientAndLoadAccountByName(name: string) {
        for (const account of this.accounts) {
            if (account.name === name) {
                this.setConfig(account);
                await this.clearClient();
                return;
            }
        }

        throw new Error(`No account for name ${name} defined`);
    }

    public async clearClient() {
        if (this.client) {
            try {
                await this.client.disconnect();
            } catch (e) {
            }
        }

        if (this.connectedSubs) {
            this.connectedSubs.unsubscribe();
        }

        this.client = undefined;
        this.clientSubject.next(this.client);

        if (this.localClient) {
            await this.localClient.disconnect();
            delete this.localClient;
        }
        delete this.localController;

        this.authenticatedUser = undefined;
    }

    public hasToken(): boolean {
        return Boolean(this.getConfig().token);
    }

    public async logout() {
        //disconnect
        this.clearClient();
        this.userLoaded.next(undefined);
    }

    public isLoggedIn(): boolean {
        return this.authenticatedUser !== undefined;
    }

    public async loadUser() {
        this.authenticatedUser = await this.app().getAuthenticatedUser();
        this.user = await this.app().getUser();
        this.sessionId = await this.app().getSessionId();
        this.sessionRole = await this.app().getSessionRole();
        this.userLoaded.next(this.authenticatedUser!.value);
    }

    public getUser(): EntitySubject<FrontendUser> {
        if (!this.user) {
            throw new Error(`Not logged in`);
        }

        return this.user;
    }

    public getAuthenticatedUser(): EntitySubject<FrontendUser> {
        if (!this.authenticatedUser) {
            throw new Error(`Not logged in`);
        }

        return this.authenticatedUser;
    }

    public createAnonDefaultClient() {
        const config = this.createConfigFromBrowser();
        return new SocketClient({
            host: config.host,
            port: config.port,
            ssl: config.ssl,
        });
    }

    public createLocalClient() {
        return new SocketClient({
            host: 'localhost',
            port: 8960,
            ssl: false,
            token: {
                id: 'local'
            }
        });
    }

    public getClient(): SocketClient {
        if (!this.client) {
            if (this.getConfig().token) {
                //todo, fallback to accountId='' if accountId is invalid.
                this.client = createUserSocketClient(this.getConfig(), this.organisation);
            } else {
                this.client = createAnonSocketClient(this.getConfig());
            }
            this.clientSubject.next(this.client);

            if (this.connectedSubs) {
                this.connectedSubs.unsubscribe();
            }
        }

        return this.client;
    }

    public app() {
        return this.getClient().controller<AppControllerInterface>('app');
    }

    public publicJob() {
        return this.getClient().controller<PublicJobControllerInterface>('public/job');
    }

    public issue() {
        return this.getClient().controller<IssueControllerInterface>('issue');
    }

    public note() {
        return this.getClient().controller<NoteControllerInterface>('note');
    }

    public permission() {
        return this.getClient().controller<PermissionControllerInterface>('permission');
    }

    public admin() {
        return this.getClient().controller<AppAdminControllerInterface>('admin');
    }

    public public() {
        return this.getClient().controller<PublicControllerInterface>('public');
    }

    public project() {
        return this.getClient().controller<ProjectControllerInterface>('project');
    }

    public serverAdmin() {
        return this.getClient().controller<AppServerAdminControllerInterface>('server/admin');
    }

    public async getJob(id: string): Promise<EntitySubject<Job>> {
        const store = this.getClient().entityState.getStore(Job);

        if (store.hasStoreItem(id)) {
            const fork = store.createFork(id);

            this.publicJob().subscribeJob(id).then((job: EntitySubject<Job>) => {
                if (fork.isUnsubscribed()) {
                    job.unsubscribe();
                } else {
                    fork.subscribe(job);
                }
            }, (error) => {
                console.log('error in subscribeJob', id, error);
            });

            return fork;
        }

        return await this.publicJob().subscribeJob(id);
    }

    /**
     * Makes sure a anonymous connection is established. And is reconnected upon disconnect.
     */
    public subscribePublicAutoConnection(callback: () => any): Subscription {
        let lastTimeout: any;

        const reconnect = async () => {
            if (lastTimeout) clearTimeout(lastTimeout);
            try {
                if (this.lastPublicConnectDisconnectSubscription) this.lastPublicConnectDisconnectSubscription.unsubscribe();
                await this.clearClient(); //this triggers `disconnected`
                this.lastPublicConnectDisconnectSubscription = this.getClient().disconnected.subscribe(() => {
                    reconnect();
                });
                await this.getClient().connect();
                callback();
            } catch (error) {
                lastTimeout = setTimeout(() => {
                    reconnect();
                }, 1000);
            }
        };

        this.lastPublicConnectDisconnectSubscription = this.getClient().disconnected.subscribe(() => {
            reconnect();
        });

        return new Subscription(() => {
            if (lastTimeout) clearTimeout(lastTimeout);
        });
    }
}
