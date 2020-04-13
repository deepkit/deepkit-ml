/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Location} from "@angular/common";
import {Component, OnDestroy} from "@angular/core";
import {NavigationEnd, Router} from "@angular/router";
import {unsubscribe} from "../reactivate-change-detection";
import {Subscriptions} from "@marcj/estdlib-rxjs";

@Component({
    selector: 'dk-header',
    template: `
        <div style="flex: 0 0 100px;">

        </div>
        <div class="middle">
            <div class="main-tabs">
                <!--<button class="icon transparent" (click)="goBack()"><dk-icon name="keyboard_arrow_left"></dk-icon></button>-->
                <!--<button class="icon transparent" (click)="goForward()"><dk-icon name="keyboard_arrow_right"></dk-icon></button>-->

                <!--<button  >-->
                    <!--Cluster-->
                <!--</button>-->
            </div>
        </div>

        <div class="right">
            Account: Local
        </div>
    `,
    styles: [`
        :host {
            display: flex;
            height: 36px;
            border-bottom: 1px solid #000000;
            align-items: center;
            justify-content: center;
            background-image: linear-gradient(#40454a -46%, #35393d);
            -webkit-app-region: drag;
        }

        :host > div {
            flex: 1;
        }

        .right {
            text-align: right;
            padding-right: 10px;
            color: white;
            font-weight: 500;
            font-size: 11px;
        }

        .middle {
            /*text-align: center;*/
        }

        .main-tabs {
            /*background-color: var(--secondary-color);*/
            /*border-radius: 5px;*/
            display: inline-block;
            -webkit-app-region: no-drag;
        }

        button {
            /*margin: 4px;*/
            /*border: 0;*/
            /*line-height: 25px;*/
            /*padding: 0 13px;*/
            /*border-radius: 3px;*/
            /*background-image: none;*/
            /*background-color: transparent;*/
            /*min-width: auto;*/
            /*transition: all 0.1s ease-out;*/
            font-weight: 500;
            height: 24px;
            line-height: 24px;
        }

        /*button:hover {*/
            /*background-color: rgba(201, 201, 201, 0.4);*/
        /*}*/

        /*button:active {*/
            /*background-color: rgba(201, 201, 201, 0.6);*/
        /*}*/

        /*button.active {*/
            /*background-color: var(--primary-color);*/
            /*color: white;*/
        /*}*/
    `]
})
export class HeaderComponent implements OnDestroy {
    public projectLink = '/project';
    public clusterLink = '/cluster';

    @unsubscribe()
    private subs = new Subscriptions;

    constructor(
        public router: Router,
        private location: Location,
    ) {
        this.setUrl();
        this.subs.add = router.events.subscribe((event) => {
            if (event instanceof NavigationEnd) {
                this.setUrl();
            }
        });
    }

    ngOnDestroy(): void {
    }

    public goForward() {
        this.location.forward();
    }

    public goBack() {
        this.location.back();

    }

    private setUrl() {
        if (this.router.isActive('/project', false)) {
            this.projectLink = this.router.url;
        }

        if (this.router.isActive('/cluster', false)) {
            this.clusterLink = this.router.url;
        }
    }
}
