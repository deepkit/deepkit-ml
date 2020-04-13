/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ClassType} from "@marcj/estdlib";
import {StaticProvider} from "@angular/core";
import {Subject} from "rxjs";
import {ActivatedRoute} from "@angular/router";

export interface BreadcrumbType {
    breadcrumbType: ClassType<any>;
    inputs: {[name: string]: any};
    providers: StaticProvider[];
}

export interface BreadcrumbText {
    title: string;

    /**
     * any[] means it constructs the url based on Router.createUrlTree (same as routerLink)
     * string defines a url.
     * false defines the current crumb has NO url/link.
     * ActivatedRoute a custom route.
     */
    url?: any[] | string | false | ActivatedRoute;
}

export class Breadcrumbs {
    public readonly breadCrumbTypes = new Map<ClassType<any>, BreadcrumbType>();
    public readonly breadCrumbTexts = new Map<ClassType<any>, BreadcrumbText[]>();
    public readonly breadcrumbAdded = new Subject();

    public getBreadcrumbTexts(routerComponentType: ClassType<any>): BreadcrumbText[] {
        return this.breadCrumbTexts.get(routerComponentType) || [];
    }

    public getBreadcrumbType(routerComponentType: ClassType<any>): BreadcrumbType | undefined {
        return this.breadCrumbTypes.get(routerComponentType);
    }

    public deleteBreadCrumbs(routerComponentType: ClassType<any>) {
        this.breadCrumbTypes.delete(routerComponentType);
        this.breadCrumbTexts.delete(routerComponentType);
    }

    public addBreadCrumbTitleAtPosition<T>(
        routerComponentType: ClassType<any>,
        position: number,
        title: string,
        url?: any[] | string | false | ActivatedRoute
    ) {
        let titles = this.breadCrumbTexts.get(routerComponentType);
        if (!titles) {
            titles = [];
            this.breadCrumbTexts.set(routerComponentType, titles);
        }

        titles.splice(position, titles.length);

        titles.push({
            title: title,
            url: url
        });
        this.breadcrumbAdded.next();
    }

    public addBreadCrumbTitle<T>(
        routerComponentType: ClassType<any>,
        title: string,
        url?: any[] | string | false | ActivatedRoute
    ) {
        let titles = this.breadCrumbTexts.get(routerComponentType);
        if (!titles) {
            titles = [];
            this.breadCrumbTexts.set(routerComponentType, titles);
        }

        titles.push({
            title: title,
            url: url
        });

        this.breadcrumbAdded.next();
    }

    public addBreadCrumb<T>(
        routerComponentType: ClassType<any>,
        breadcrumbType: ClassType<T>,
        inputs: Partial<T>,
        providers: StaticProvider[] = [],
    ) {
        console.log('addBreadCrumb');

        if (this.breadCrumbTypes.get(routerComponentType)) {
            const type = this.breadCrumbTypes.get(routerComponentType);
            // type.breadcrumbType.
        }

        this.breadCrumbTypes.set(routerComponentType,
            {
                breadcrumbType: breadcrumbType,
                inputs: inputs,
                providers: providers,
            }
        );

        this.breadcrumbAdded.next();
    }
}
