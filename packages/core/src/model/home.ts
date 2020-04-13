/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {f, uuid, Entity} from "@marcj/marshal";
import {arrayRemoveItem} from "@marcj/estdlib";
import {Validators} from "./validators";
import { fetchMacOSBookmarkPermission } from "../electron";

export class HomeDockerConfig {
    @f.array(String)
    env: string[] = []; //e.g. ["PATH=bla"]

    @f.array(String)
    binds: string[] = []; //e.g. ["/tmp:/tmp"]

    @f.array(String)
    links: string[] = []; //e.g. ["redis3:redis"]
}

@Entity('home-account-config')
export class HomeAccountConfig {
    @f.uuid()
    id: string = uuid();

    @f
    port: number = 8960;

    @f
    ssl: boolean = false;

    @f username: string = '';

    constructor(
        @f.asName('name').validator(Validators.username)
        public name: string,
        @f.asName('host')
        public host: string,
        /**
         * This is the user access token, not job or node token.
         */
        @f.optional().uuid().asName('token')
        public token?: string,
    ) {
    }
}

export function normalizePath(path: string): string {
    if (path.endsWith('/')) path = path.substr(0, path.length - 1);
    return path;
}

@Entity('home-folder-link')
export class FolderLink {
    constructor(
        @f.asName('projectId') public projectId: string,
        @f.asName('path') public path: string,
        @f.asName('name') public name: string,
        @f.asName('accountId') public accountId: string,
    ) {
    }
}

@Entity('home-config')
export class HomeConfig {
    @f.array(HomeAccountConfig)
    accounts: HomeAccountConfig[] = [];

    @f.array(FolderLink)
    folderLinks: FolderLink[] = [];

    /**
     * Contains the base64 entitlement we get from macOS
     * to have access to folders outside of our sandbox.
     */
    @f.map(String)
    macOSSandboxBookmark: { [path: string]: string } = {};

    public setLocalToken(token?: string): HomeAccountConfig {
        let account = this.getAccountByName('localhost');

        if (!token) {
            token = uuid();
        }

        if (!account) {
            account = new HomeAccountConfig('localhost', 'localhost', token);
            this.accounts.push(account);
        }

        account.token = token;

        return account;
    }

    /**
     * @deprecated
     */
    public async setFolderLink(
    ) {
    }


    public getFolderLinkPath(projectId: string): string {
        for (const item of this.folderLinks) {
            if (item.projectId === projectId) return item.path;
        }

        return '';
    }

    public removeLinkForProject(projectId: string) {
        this.folderLinks = this.folderLinks.filter(v => v.projectId !== projectId);
    }

    public removeLink(accountId: string, projectId: string, path: string) {
        this.folderLinks = this.folderLinks.filter(v => !(v.accountId === accountId && v.projectId === projectId && v.path === path));
    }

    public add(homeAccountConfig: HomeAccountConfig) {
        this.deleteAccount(homeAccountConfig.name);
        this.accounts.push(homeAccountConfig);
    }

    public deleteAccount(name: string) {
        for (const account of this.accounts.slice(0)) {
            if (name === account.name) {
                arrayRemoveItem(this.accounts, account);
            }
        }

        return;
    }

    public getAccount(id: string): HomeAccountConfig {
        for (const account of this.accounts) {
            if (account.id === id) {
                return account;
            }
        }

        throw new Error(`No account found for id ${id}.`);
    }

    public getAccountByName(name: string): HomeAccountConfig | undefined {
        for (const account of this.accounts) {
            if (name === account.name) {
                return account;
            }
        }

        return;
    }

    public getLocalAccount(): HomeAccountConfig {
        const account = this.getAccountByName('localhost');

        if (!account) {
            throw new Error('No account found for localhost.');
        }

        return account;
    }

    public getFolderLink(path: string): FolderLink | undefined {
        for (const item of this.folderLinks) {
            if (item.path === path) {
                return item;
            }
        }
    }

    public getFolderLinksMap() {
        const registeredFoldersMap: { [path: string]: { [accountId: string]: { [projectName: string]: FolderLink } } } = {};

        for (const item of this.folderLinks) {
            if (!registeredFoldersMap[item.path]) {
                registeredFoldersMap[item.path] = {};
            }
            if (!registeredFoldersMap[item.path][item.accountId]) {
                registeredFoldersMap[item.path][item.accountId] = {};
            }
            registeredFoldersMap[item.path][item.accountId][item.name] = item;
        }

        return registeredFoldersMap;
    }

}
