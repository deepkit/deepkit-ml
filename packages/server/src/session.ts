/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {RoleType} from "@deepkit/core";
import {SessionStack} from "@marcj/glut-server";
import {Injectable} from "injection-js";
import { uuid } from "@marcj/marshal";

export class UserSession {
    public readonly id = uuid();

    constructor(
        public readonly authenticatedUserId: string,
        public readonly chosenOrganisationOrUserId: string,
        public readonly isOrganisation: boolean,
        public readonly username: string,
        /**
         * This is the role at user level or when `isOrganisation` is true, then this is the role the
         * user has within the organisation.
         */
        public readonly role: RoleType,
        public readonly localUser: boolean,
    ) {
    }
}

export class NodeSession {
    constructor(public readonly nodeId: string, public readonly name: string) {
    }
}

export class JobSession {
    constructor(
        public readonly jobId: string,
        public readonly projectId: string,
    ) {
    }
}

@Injectable()
export class SessionHelper {
    constructor(private sessionStack: SessionStack) {

    }

    get session() {
        return this.sessionStack.getSession();
    }

    public hasSession() {
        return this.sessionStack.isSet();
    }

    /**
     * Returns either the authenticated user id or the chosen organisation id.
     */
    public getUserId(): string {
        return this.getUserSession().chosenOrganisationOrUserId;
    }

    /**
     * Returns the authenticated user id.
     */
    public getAuthenticatedUserId(): string {
        return this.getUserSession().authenticatedUserId;
    }

    public hasUserSession(): boolean {
        return this.hasSession() && this.session instanceof UserSession;
    }

    public getUserSession(): UserSession {
        if (!this.hasSession() || !(this.session instanceof UserSession)) {
            throw new Error('No user authenticated.');
        }
        return this.session;
    }

    public getNodeSession(): NodeSession {
        if (!this.hasSession() || !(this.session instanceof NodeSession)) {
            throw new Error('No node authenticated.');
        }
        return this.session;
    }

    public getJobSession(): JobSession {
        if (!this.hasSession() || !(this.session instanceof JobSession)) {
            throw new Error('No job authenticated.');
        }
        return this.session;
    }

    public isJobSession(): boolean {
        return this.session instanceof JobSession;
    }
}
