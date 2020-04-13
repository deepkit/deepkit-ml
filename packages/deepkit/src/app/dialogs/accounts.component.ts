/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnChanges,
    OnInit,
    Output,
    SimpleChanges,
} from "@angular/core";
import {DialogComponent, DuiDialog, ExecutionState} from "@marcj/angular-desktop-ui";
import {ControllerClient} from "../providers/controller-client";
import {
    AppControllerInterface,
    createAnonSocketClient,
    createUserSocketClient,
    FrontendUser,
    HomeAccountConfig
} from "@deepkit/core";
import {TypedFormGroup} from "../utils";
import {arrayRemoveItem} from "@marcj/estdlib";
import {cloneClass, f} from "@marcj/marshal";
import {EntitySubject} from "@marcj/glut-core";
import {RegisterAccountComponent} from "./register-account.component";

class LoginToken {
    @f username!: string;
    @f password!: string;
}

@Component({
    selector: 'accounts-token-field',
    template: `
        <div *ngIf="!loaded">Loading...</div>
        <div *ngIf="loaded">
            <div *ngIf="tokenUser">
                <dui-icon name="check" [size]="10"></dui-icon>
                Authenticated as {{tokenUser.value.username}}.

                <p>
                    <dui-button (click)="logout()">Logout</dui-button>
                </p>
            </div>

            <dui-form #form *ngIf="!tokenUser" [submit]="login.bind(this)" [formGroup]="formGroup">
                <dui-form-row label="Register">
                    <dui-button [disabled]="!config.host" (click)="register(config)">Register new account</dui-button>
                </dui-form-row>

                <dui-form-row label="Username">
                    <dui-input formControlName="username"></dui-input>
                </dui-form-row>

                <dui-form-row label="Password">
                    <dui-input formControlName="password" type="password"></dui-input>
                </dui-form-row>

                <dui-form-row *ngIf="error" style="color: var(--color-red)">
                    Error: {{error}}
                </dui-form-row>

                <dui-form-row>
                    <dui-button [submitForm]="form">Login</dui-button>
                </dui-form-row>
            </dui-form>
        </div>
    `
})
export class AccountsTokenFieldComponent implements OnChanges {
    @Input() config!: HomeAccountConfig;

    public loaded = false;
    public tokenUser?: EntitySubject<FrontendUser>;

    public model = {username: '', password: ''};
    public error?: string;

    public formGroup = TypedFormGroup.fromEntityClass(LoginToken);

    constructor(
        protected cd: ChangeDetectorRef,
        protected dialog: DuiDialog,
        protected controllerClient: ControllerClient,
    ) {
        this.formGroup.syncEntity(new LoginToken());
    }

    logout() {
        this.error = '';
        this.tokenUser = undefined;
        this.config.token = '';
    }

    async login() {
        const client = createAnonSocketClient(this.config);
        this.error = '';
        this.tokenUser = undefined;

        try {
            await client.connect();
            const controller = client.controller<AppControllerInterface>('app');
            const token = await controller.login(this.formGroup.value.username, this.formGroup.value.password);
            if (token) {
                this.config.token = token;
                this.config.username = this.formGroup.value.username;
                if (await this.isTokenValid(this.config)) {
                    this.error = undefined;
                }
            } else {
                this.error = 'Login invalid';
            }
        } catch (error) {
            this.error = error.message;
        } finally {
            await client.disconnect();
            this.cd.detectChanges();
        }
    }

    register(config: HomeAccountConfig) {
        const {component} = this.dialog.open(RegisterAccountComponent, {
            config
        });
        component.success.subscribe(() => {
            this.reloadTokenInfo();
        });
    }

    async isTokenValid(config: HomeAccountConfig): Promise<boolean> {
        const client = createUserSocketClient(config);

        try {
            await client.connect();
            const controller = client.controller<AppControllerInterface>('app');
            this.tokenUser = await controller.getAuthenticatedUser();

            return !!this.tokenUser.value.id;
        } catch (error) {
            return false;
        } finally {
            await client.disconnect();
        }
    }

    async reloadTokenInfo() {
        this.loaded = false;
        this.tokenUser = undefined;
        if (this.formGroup.value) {
            this.formGroup.value.username = '';
            this.formGroup.value.password = '';
        }
        this.cd.detectChanges();

        await this.isTokenValid(this.config);
        this.loaded = true;
        this.cd.detectChanges();
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (changes.config) {
            this.reloadTokenInfo();
        }
    }
}

@Component({
    template: `
        <div style="display: flex; height: 100%">
            <div style="width: 150px; display: flex; flex-direction: column">
                <dui-list white
                          [disabled]="saver.running"
                          [ngModel]="config" (ngModelChange)="loadConfig($event)" style="flex: 1">
                    <dui-list-item *ngFor="let config of configs"
                                   [value]="config">
                        {{config.name}}
                        <div class="text-light">{{config.host}}</div>
                    </dui-list-item>
                </dui-list>
                <dui-button-group padding="none">
                    <dui-button square icon="add" (click)="add()"></dui-button>
                    <dui-button square [disabled]="isDisabled || !config" (click)="remove()" icon="remove"
                                confirm="Really delete?
                                You need to reauthenticate when you add this account again."></dui-button>
                </dui-button-group>
            </div>

            <div
                style="flex: 1; border: 1px solid var(--line-color-light); padding: 15px; margin-left: 20px; overflow: auto;">
                <ng-container *ngIf="config">
                    <div style="padding: 20px; color: var(--color-red)" *ngIf="error && accountId === config.id">
                        Account settings became invalid. <br/>
                        {{error.message || error}}
                    </div>

                    <dui-form-row
                        *ngIf="controllerClient.hasConfigId(config.id)"
                        label="Switch account">
                        <div>
                            <dui-button (click)="useAccountAndClose(config.id)">Use this account</dui-button>
                        </div>
                    </dui-form-row>

                    <dui-form [disabled]="isDisabled" [formGroup]="form">
                        <dui-form-row *ngIf="isDisabled">
                            {{config.name}} is not allowed to be edited.
                        </dui-form-row>

                        <dui-form-row label="Name">
                            <dui-input formControlName="name"></dui-input>
                        </dui-form-row>
                        <dui-form-row label="Host">
                            <dui-input formControlName="host"></dui-input>
                        </dui-form-row>
                        <dui-form-row label="Port">
                            <dui-input type="number" formControlName="port"></dui-input>
                        </dui-form-row>
                        <dui-form-row label="SSL">
                            <dui-checkbox formControlName="ssl"></dui-checkbox>
                        </dui-form-row>
                        <dui-form-row label="Token" *ngIf="config.name !== 'localhost'">
                            <accounts-token-field [config]="config"></accounts-token-field>
                        </dui-form-row>
                    </dui-form>
                </ng-container>
            </div>
        </div>

        <dui-dialog-actions>
            <dui-button style="margin-right: auto" (click)="registerDeepkit()">Register at deepkit.ai</dui-button>

            <dui-button closeDialog [disabled]="saver.running">Cancel</dui-button>
            <dui-button (click)="saver.execute()" [disabled]="!isFormValid || saver.running">Save</dui-button>
        </dui-dialog-actions>
    `
})
export class AccountsComponent implements OnInit {
    static dialogDefaults = {
        width: 650,
        height: 450,
    };

    @Input() accountId?: string;
    @Input() error?: Error;

    @Output() useAccount: EventEmitter<string> = new EventEmitter<string>();

    form = TypedFormGroup.fromEntityClass(HomeAccountConfig);

    public config?: HomeAccountConfig;

    public configs: HomeAccountConfig[] = [];

    public saver = new ExecutionState(this.cd, this.save.bind(this));

    constructor(
        public controllerClient: ControllerClient,
        protected dialog: DuiDialog,
        protected dialogComponent: DialogComponent,
        protected cd: ChangeDetectorRef,
    ) {
        this.configs = controllerClient.accounts.map(v => cloneClass(v));

        this.config = this.configs.find((c) => {
            return c.id === this.controllerClient.getConfig().id;
        });

        if (!this.config) {
            this.config = this.configs[0];
        }
    }

    protected isNameReserved(name: string) {
        for (const config of this.configs) {
            if (config.name === name) return true;
        }

        return false;
    }

    registerDeepkit() {
        const config = new HomeAccountConfig('deepkit', 'app.deepkit.ai');
        config.port = 443;
        config.ssl = true;
        const component = this.register(config);

        component.success.subscribe(() => {
            let name = 'deepkit';
            for (let i = 0; this.isNameReserved(name); i++) {
                name = 'deepkit' + i;
            }
            config.name = name;
            this.configs.push(config);
            this.config = this.configs[this.configs.length - 1];
            this.cd.detectChanges();
        });
    }

    register(config: HomeAccountConfig): RegisterAccountComponent {
        const {component} = this.dialog.open(RegisterAccountComponent, {
            config
        });
        return component;
    }

    useAccountAndClose(id: string) {
        this.dialogComponent.close();
        this.useAccount.emit(id);
    }

    ngOnInit(): void {
        if (this.accountId) {
            this.config = this.configs.find((c) => {
                return c.id === this.accountId;
            });
        }
        if (this.config) {
            this.form.syncEntity(this.config);
        }
    }

    get isDisabled() {
        if (this.config && this.config.name === 'localhost') return true;
        return this.saver.running;
    }

    get isFormValid() {
        if (this.form) {
            this.form.valid;
        }

        return true;
    }

    async save() {
        await this.controllerClient.getLocalApi().saveAccounts(this.configs);
        await this.controllerClient.setAccounts(this.configs);
        if (this.config && !this.controllerClient.getClient().isConnected()) {
            this.useAccount.emit(this.config.id);
        }
        this.dialogComponent.close();
    }

    async add() {
        const name = await this.dialog.prompt('Create account', '');
        if (!name) return;

        this.configs.push(new HomeAccountConfig(name, ''));
        this.config = this.configs[this.configs.length - 1];
        this.form.syncEntity(this.config);
        this.cd.detectChanges();
    }

    remove() {
        arrayRemoveItem(this.configs, this.config);
    }

    async loadConfig(config: HomeAccountConfig) {
        const old = this.config;

        this.config = config;
        this.cd.detectChanges();

        if (this.form.invalid) {
            const a = await this.dialog.confirm('Invalid', 'Current values are invalid. If you leave values will be reset.');
            if (a) {
                //leave and dont save changes
                if (old) {
                    const fromOrigin = this.controllerClient.getConfigForId(old.id);
                    if (fromOrigin) {
                        const restoredOld = cloneClass(fromOrigin);
                        this.configs[this.configs.indexOf(old)] = restoredOld;
                    }
                }
            } else {
                //Cancel, stay
                this.config = old;
            }
        }

        if (this.config) {
            this.form.syncEntity(this.config);
        }
        this.cd.detectChanges();
    }
}
