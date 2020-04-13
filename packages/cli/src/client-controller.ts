/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {SocketClient, AuthenticationError, OfflineError} from "@marcj/glut-client";
import {
    AppServerAdminControllerInterface,
    AppControllerInterface,
    createJobSocketClient,
    createNodeSocketClient,
    createUserSocketClient,
    HomeAccountConfig,
    JobControllerInterface, NodeControllerInterface, FolderLink
} from "@deepkit/core";
import {RemoteController} from "@marcj/glut-core";
import {getFolderLinkAccountForDirectory} from "@deepkit/core-node";

export class UserClient {
    constructor(public readonly client: SocketClient) {
    }

    public app(): RemoteController<AppControllerInterface> {
        return this.client.controller<AppControllerInterface>('app');
    }

    public admin(): RemoteController<AppServerAdminControllerInterface> {
        return this.client.controller<AppServerAdminControllerInterface>('admin');
    }

    public async disconnect() {
        await this.client.disconnect();
    }
}

export class JobClient {
    constructor(public readonly client: SocketClient) {
    }

    public job(): RemoteController<JobControllerInterface> {
        return this.client.controller<JobControllerInterface>('job');
    }

    public async disconnect() {
        await this.client.disconnect();
    }
}

export class NodeClient {
    constructor(public readonly client: SocketClient) {
    }

    public node(): RemoteController<NodeControllerInterface> {
        return this.client.controller<NodeControllerInterface>('node');
    }

    public async disconnect() {
        await this.client.disconnect();
    }
}

export class ClientController {
    static async forUser(account: HomeAccountConfig): Promise<UserClient> {
        return new UserClient(createUserSocketClient(account));
    }

    static forJob(
        account: HomeAccountConfig,
        job: string,
        jobAccessToken: string,
    ): JobClient {
        return new JobClient(createJobSocketClient(account, job, jobAccessToken));
    }

    static forNode(
        account: HomeAccountConfig,
        id: string,
        token: string,
    ): NodeClient {
        return new NodeClient(createNodeSocketClient(account, id, token));
    }
}
