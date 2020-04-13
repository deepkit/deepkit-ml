/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Injectable} from "@angular/core";
import {
    ActivatedRouteSnapshot,
    CanActivate,
    CanActivateChild,
    Router,
    RouterStateSnapshot,
    UrlTree
} from "@angular/router";
import {ControllerClient} from "./controller-client";
import {hasRole, RoleType} from "@deepkit/core";

async function checkRoute(url: string, requiredRole: RoleType, controllerClient: ControllerClient): Promise<true | string> {
    if (!controllerClient.connected.value) {
        //login handles waiting for reconnect
        return '/login?redirect=' + encodeURIComponent(url);
    }

    if (url === '/login') {
        return true;
    }

    const currentRole = controllerClient.isLoggedIn() ? controllerClient.getAuthenticatedUser().value.role : RoleType.anonymouse;

    // console.log('checkRoute', controllerClient.isLoggedIn(), url, requiredRole, currentRole, hasRole(currentRole, requiredRole));

    if (hasRole(currentRole, requiredRole)) {
        return true;
    }

    //login page handles the loading of user data from session storage and restarts this check when user is loaded
    if (requiredRole > RoleType.anonymouse && controllerClient.isLoggedIn()) {
        return '/login?insufficientPermissions=1&redirect=' + encodeURIComponent(url);
    }

    return '/login?redirect=' + encodeURIComponent(url);
}

function getNearestRole(route: ActivatedRouteSnapshot): RoleType {
    //first get deepest
    while (route.firstChild) {
        route = route.firstChild;
    }

    let current: ActivatedRouteSnapshot | null = route;
    do {
        if (undefined !== current.data.role) {
            return current.data.role;
        }

        current = current.parent;
    } while (current);

    return RoleType.anonymouse;
}

@Injectable()
export class CanActivateRoute implements CanActivateChild, CanActivate {
    constructor(
        private router: Router,
        private controllerClient: ControllerClient,
    ) {
    }

    async canActivate(
        route: ActivatedRouteSnapshot,
        state: RouterStateSnapshot
    ): Promise<boolean | UrlTree> {
        const result = await checkRoute(state.url, getNearestRole(route), this.controllerClient);

        if (result === true) {
            return true;
        }

        return this.router.parseUrl(result);
    }

    async canActivateChild(
        route: ActivatedRouteSnapshot,
        state: RouterStateSnapshot
    ): Promise<boolean | UrlTree> {

        const result = await checkRoute(state.url, getNearestRole(route), this.controllerClient);
        if (result === true) {
            return true;
        }


        return this.router.parseUrl(result);

    }
}
