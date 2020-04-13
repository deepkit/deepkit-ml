/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy} from "@angular/router";
import {ComponentRef} from "@angular/core";
import {getConfiguredPath, getResolvedUrl, getResolvedUrlIncludingChildren} from "./utils";

interface RouteStates {
    max: number;
    handles: {[handleKey: string]: DetachedRouteHandle};
    handleKeys: string[];
}


// function getConfiguredPathIncludingChildren(route: ActivatedRouteSnapshot): string {
//     const parts = [getConfiguredPath(route)];
//
//     let deepestChild = route;
//     while (deepestChild.firstChild) {
//         deepestChild = deepestChild.firstChild;
//         if (deepestChild.routeConfig && deepestChild.routeConfig.path) {
//             parts.push(deepestChild.routeConfig.path);
//         }
//     }
//
//     return parts.join('/');
// }

export class ReuseStrategy implements RouteReuseStrategy {
    private routes: {[routePath: string]: RouteStates } = {
        //this is currently too expensive, as it generates ticks when we have multiple views in the background
        // '/project/list': {max: 1, handles: {}, handleKeys: []},
        '/project/:projectId/experiment': {max: 1, handles: {}, handleKeys: []},
        '/project/:projectId/notes': {max: 1, handles: {}, handleKeys: []},
    };

    /** Determines if this route (and its subtree) should be detached to be reused later */
    shouldDetach(route: ActivatedRouteSnapshot): boolean {
        return !!this.routes[getConfiguredPath(route)];
    }

    /**
     * Stores the detached route.
     *
     * Storing a `null` value should erase the previously stored value.
     */
    store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
        if (route.routeConfig) {
            const config = this.routes[getConfiguredPath(route)];
            if (config) {
                const storeKey = getResolvedUrlIncludingChildren(route);
                if (handle) {
                    console.log('store handle', handle);
                    if (!config.handles[storeKey]) {
                        //add new handle
                        if (config.handleKeys.length >= config.max) {
                            const oldestUrl = config.handleKeys[0];
                            config.handleKeys.splice(0, 1);
                            console.log('destroy old state', oldestUrl);

                            //this is important to work around memory leaks, as Angular will never destroy the Component
                            //on its own once it got stored in our router strategy.
                            const oldHandle = config.handles[oldestUrl] as { componentRef: ComponentRef<any> };
                            oldHandle.componentRef.destroy();

                            delete config.handles[oldestUrl];
                        }
                        config.handles[storeKey] = handle;
                        (handle as {componentRef: ComponentRef<any>}).componentRef.changeDetectorRef.detach();
                        (handle as {componentRef: ComponentRef<any>}).componentRef.location.nativeElement.dispatchEvent(new Event('detach', { bubbles: true }));
                        config.handleKeys.push(storeKey);
                    }
                } else {
                    //we do not delete old handles on request, as we define when the handle dies
                }
            }
        }
    }

    /** Determines if this route (and its subtree) should be reattached */
    shouldAttach(route: ActivatedRouteSnapshot): boolean {
        if (route.routeConfig) {
            const config = this.routes[getConfiguredPath(route)];

            if (config) {
                const storeKey = getResolvedUrlIncludingChildren(route);
                const attach = !!config.handles[storeKey];
                console.log('shouldAttach', attach, route);
                return attach;
            }

        }

        return false;
    }

    /** Retrieves the previously stored route */
    retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
        if (route.routeConfig) {
            const config = this.routes[getConfiguredPath(route)];

            if (config) {
                const storeKey = getResolvedUrlIncludingChildren(route);
                if (config.handles[storeKey]) {
                    (config.handles[storeKey] as { componentRef: ComponentRef<any> }).componentRef.changeDetectorRef.reattach();
                    console.log('retrieve', getConfiguredPath(route), (config.handles[storeKey] as {componentRef: ComponentRef<any>}).componentRef.location.nativeElement);
                    (config.handles[storeKey] as {componentRef: ComponentRef<any>}).componentRef.location.nativeElement.dispatchEvent(new Event('reattach', { bubbles: true }));
                }
                return config.handles[storeKey];
            }
        }

        return null;
    }

    /** Determines if `curr` route should be reused */
    shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
        return getResolvedUrl(future) === getResolvedUrl(curr) && future.routeConfig === curr.routeConfig;
    }
}
