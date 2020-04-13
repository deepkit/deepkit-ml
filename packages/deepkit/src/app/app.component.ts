/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ApplicationRef, ChangeDetectionStrategy, Component, OnDestroy} from '@angular/core';
import {MainStore} from "./store";

@Component({
    selector: 'app-root',
    template: `
        <router-outlet></router-outlet>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnDestroy {
    public ready = false;

    constructor(
        a: ApplicationRef,
        private store: MainStore,
    ) {
        (window as any)['store'] = this.store;
    }

    ngOnDestroy(): void {
    }
}
