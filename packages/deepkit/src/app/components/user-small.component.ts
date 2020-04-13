/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Component, Input} from "@angular/core";
import {PublicUser} from "@deepkit/core";

@Component({
    selector: 'dk-user-small',
    template: `
        <ng-container *ngIf="userId && !user">
            <ng-container *ngIf="userId|user|asyncRender as user">
                <img
                    *ngIf="showImage && user.image"
                    class="user-image-small"
                    [src]="user.image|objectURL"/>
                <span class="username" *ngIf="showUsername">{{user.username}}</span>
            </ng-container>
        </ng-container>

        <ng-container *ngIf="user && !userId">
            <img
                *ngIf="showImage && user.image"
                class="user-image-small"
                [src]="user.image|objectURL"/>
            <span class="username" *ngIf="showUsername">{{user.username}}</span>
        </ng-container>
    `,
    styles: [`
        :host {
            display: inline-block;
        }

        .username {
            margin-left: 4px;
        }

    `]
})
export class UserSmallComponent {
    @Input() user?: PublicUser;
    @Input() userId?: string;

    @Input() showUsername: boolean = true;
    @Input() showImage: boolean = true;
}
