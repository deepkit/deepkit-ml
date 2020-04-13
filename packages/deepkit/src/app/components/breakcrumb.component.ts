/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    AfterViewInit,
    ChangeDetectorRef,
    Component,
    ComponentFactoryResolver,
    ComponentRef,
    Injector, Input,
    ViewChild,
    ViewContainerRef
} from "@angular/core";
import {ActivatedRoute, ActivatedRouteSnapshot, NavigationEnd, Router} from "@angular/router";
import {PlatformLocation} from "@angular/common";
import {ControllerClient} from "../providers/controller-client";
import {eachPair} from "@marcj/estdlib";
import {Breadcrumbs} from "../providers/breadcrumbs";
import {getResolvedUrl} from "../utils";

@Component({
    template: `
        <a class="breadcrumb-item" >{{title}}</a>
    `
})
export class BreadCrumbTextComponent {
    @Input() title?: string;
}

@Component({
    selector: 'dk-breakcrump',
    template: `
        <button class="icon" (click)="location.back()" *ngIf="!controllerClient.isBrowser">
            <dk-icon name="keyboard_arrow_left"></dk-icon>
        </button>

        <div #crumpsContainer style="display: none"></div>
    `,
    styleUrls: ['./breakcrumb.component.scss']
})
export class BreakCrumbComponent implements AfterViewInit {
    @ViewChild('crumpsContainer', {read: ViewContainerRef, static: false}) crumpsContainer?: ViewContainerRef;

    private lastBreakCrumps: ComponentRef<any>[] = [];

    constructor(
        private router: Router,
        private cd: ChangeDetectorRef,
        private injector: Injector,
        public location: PlatformLocation,
        private resolver: ComponentFactoryResolver,
        public controllerClient: ControllerClient,
        private breadcrumbs: Breadcrumbs,
    ) {
    }

    ngAfterViewInit() {
        this.loadCrumbs();

        this.breadcrumbs.breadcrumbAdded.subscribe(() => {
            this.loadCrumbs();
        });

        this.router.events.subscribe(e => {
            if (e instanceof NavigationEnd) {
                this.loadCrumbs();
            }
        });
    }

    private loadCrumbs() {
        if (!this.crumpsContainer) {
            return;
        }

        for (const comp of this.lastBreakCrumps) {
            comp.destroy();
        }

        this.lastBreakCrumps = [];

        const root = this.router.routerState.root.firstChild;
        if (root) {
            let current: ActivatedRoute | undefined = root;

            while (current) {
                if (current.component && 'string' !== typeof current.component) {
                    const breadcrumbType = this.breadcrumbs.getBreadcrumbType(current.component);

                    if (breadcrumbType) {
                        const factory = this.resolver.resolveComponentFactory(breadcrumbType.breadcrumbType);
                        const injector = Injector.create({providers: breadcrumbType.providers, parent: this.injector});

                        const componentRef = this.crumpsContainer.createComponent(factory, this.lastBreakCrumps.length, injector);
                        for (const [i, v] of eachPair(breadcrumbType.inputs)) {
                            (componentRef.instance as any)[i] = v;
                        }
                        this.lastBreakCrumps.push(componentRef);
                    }

                    const breadcrumbTexts = this.breadcrumbs.getBreadcrumbTexts(current.component);
                    if (breadcrumbTexts.length) {
                        for (const breadcrumbText of breadcrumbTexts) {
                            const factory = this.resolver.resolveComponentFactory(BreadCrumbTextComponent);
                            const componentRef = this.crumpsContainer.createComponent(factory, this.lastBreakCrumps.length, this.injector);
                            (componentRef.instance as any).title = breadcrumbText.title;

                            if (Array.isArray(breadcrumbText.url)) {
                                const urlTree = this.router.createUrlTree(breadcrumbText.url, {
                                    relativeTo: current
                                });
                                (componentRef.instance as any).url = urlTree.toString();
                            } else if (breadcrumbText.url instanceof ActivatedRoute) {
                                (componentRef.instance as any).url = getResolvedUrl(breadcrumbText.url.snapshot);
                            } else if (breadcrumbText.url === false) {
                                (componentRef.instance as any).url = '';
                            } else if (breadcrumbText.url === undefined) {
                                (componentRef.instance as any).url = getResolvedUrl(current.snapshot);
                            } else {
                                (componentRef.instance as any).url = breadcrumbText.url;
                            }

                            this.lastBreakCrumps.push(componentRef);
                        }
                    }
                }

                current = current.firstChild || undefined;
            }
        }

        this.cd.detectChanges();
    }


    // private loadCrumps() {
    //     if (!this.crumpsContainer) {
    //         return;
    //     }
    //
    //     for (const comp of this.lastBreakCrumps) {
    //         comp.destroy();
    //     }
    //
    //     this.lastBreakCrumps = [];
    //
    //     const root = this.router.routerState.snapshot.root.firstChild;
    //     if (root) {
    //         let current: ActivatedRouteSnapshot | undefined = root;
    //         while (current) {
    //             if (!current.data['breadcrumb']) {
    //                 current = current.firstChild || undefined;
    //                 continue;
    //             }
    //
    //             const breadcrumbClasses = Array.isArray(current.data['breadcrumb']) ? current.data['breadcrumb'] : [current.data['breadcrumb']];
    //
    //             // this.router.config
    //             if (breadcrumbClasses.length > 0) {
    //                 for (const breadcrumbClass of breadcrumbClasses) {
    //                     const factory = this.resolver.resolveComponentFactory(breadcrumbClass);
    //                     const componentRef = this.crumpsContainer.createComponent(factory, this.lastBreakCrumps.length, this.injector);
    //                     this.lastBreakCrumps.push(componentRef);
    //                 }
    //             }
    //
    //             current = current.firstChild || undefined;
    //         }
    //     }
    //     this.cd.detectChanges();
    // }
}
