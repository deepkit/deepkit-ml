/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, ElementRef, Injector, Input, SkipSelf, ViewChild} from "@angular/core";
import {ControllerClient} from "../providers/controller-client";
import {PublicUser} from "@deepkit/core";
import {ngValueAccessor, ValueAccessorBase} from "@marcj/angular-desktop-ui";

@Component({
    selector: 'dk-user-input',
    template: `
        <dui-button-group padding="none" style="display: flex; margin-right: 0;">
            <dui-button style="flex: 1" textured icon="arrow_down" [openDropdown]="dropdown" iconRight>
                <dk-user-small *ngIf="innerValue" [userId]="innerValue"></dk-user-small>
                <div *ngIf="!innerValue">No user selected</div>
            </dui-button>
            <dui-button textured icon="garbage" tight *ngIf="innerValue && resettable" (click)="reset()"></dui-button>
        </dui-button-group>

        <dui-dropdown #dropdown (shown)="search()">
            <div style="padding: 5px;">
                <dui-input focus class="semi-transparent" round lightFocus clearer icon="filter" placeholder="Filter"
                           (esc)="query = ''; search()" [(ngModel)]="query" (ngModelChange)="search()"></dui-input>
            </div>

            <dui-dropdown-item
                [selected]="innerValue === user.id"
                (click)="choose(user)"
                *ngFor="let user of users">
                <dk-user-small [user]="user"></dk-user-small>
            </dui-dropdown-item>
        </dui-dropdown>
    `,
    styles: [`
        :host {
            width: 100px;
            display: block;
        }

        .user:hover {
            background-color: rgba(99, 99, 99, 0.2);
        }

        .result {
            margin: 5px 0;
        }
    `],
    providers: [ngValueAccessor(UserInputComponent)]
})
export class UserInputComponent extends ValueAccessorBase<any> {
    @Input() resettable: boolean = true;
    @Input() global: boolean = false;

    users: PublicUser[] = [];

    query: string = '';

    constructor(
        protected injector: Injector,
        public readonly cd: ChangeDetectorRef,
        @SkipSelf() public readonly cdParent: ChangeDetectorRef,
        public controllerClient: ControllerClient,
    ) {
        super(injector, cd, cdParent);
    }

    reset() {
        this.innerValue = undefined;
        this.cd.detectChanges();
    }

    choose(user: PublicUser) {
        this.innerValue = user.id;
        this.cd.detectChanges();
    }

    public async search() {
        try {
            this.users = await this.controllerClient.app().findUser(this.query, this.global);
        } catch (error) {
            this.users = [];
        }
        this.cd.detectChanges();
    }
}
