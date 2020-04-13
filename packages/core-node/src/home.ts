/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import {
    fetchMacOSBookmarkPermission,
    FolderLink,
    getElectron,
    getMacOSSandboxPermissionBookmark,
    HomeAccountConfig,
    HomeConfig,
    HomeDockerConfig,
    isMASBuild
} from "@deepkit/core";
import {classToPlain, plainToClass} from "@marcj/marshal";
import {Subscription} from "rxjs";

export function getUserHome(): string {
    return String(process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME']);
}

export function getJobHomeDir(id: string, ...affix: string[]): string {
    return path.join(getUserHome(), '.deepkit', 'cli', 'job', id, ...affix);
}

export function getProjectGitDir(projectId: string): string {
    if (process.env['DEEPKIT_PROJECT_GIT_DIR']) {
        return path.join(process.env['DEEPKIT_PROJECT_GIT_DIR'], projectId);
    }

    return path.join(getUserHome(), '.deepkit', 'project-git', projectId);
}

export function getJobTaskInstanceCheckoutFiles(id: string, taskName: string, replica: number, ...affix: string[]): string {
    return path.join(getJobHomeDir(id), 'instance-checkout', taskName, String(replica), ...affix);
}

export function getJobTaskInstanceFiles(id: string, taskName: string, replica: number, ...affix: string[]): string {
    return path.join(getJobHomeDir(id), 'instance', taskName, String(replica), ...affix);
}

export function getJobTaskOutputFiles(id: string, taskName: string, ...affix: string[]): string {
    return path.join(getJobHomeDir(id), 'output', taskName, ...affix);
}

export async function hasAccountForName(name: string): Promise<boolean> {
    const homeConfig = await getHomeConfig();
    return undefined !== homeConfig.getAccountByName(name);
}

/**
 * Returns the token from the local account.
 */
export async function getLocalAccount(): Promise<HomeAccountConfig | undefined> {
    const homeConfig = await getHomeConfig();
    return homeConfig.getLocalAccount();
}

/**
 * Finds the file `~/.deepkit/config` which is the home configuration, used by all CLI commands
 * and the GUI application.
 */
export async function getHomeConfig(userHome?: string): Promise<HomeConfig> {
    const homeDir = path.resolve(userHome || getUserHome());

    if (homeDir) {
        const file = path.join(homeDir, '.deepkit', 'config');

        if (await fs.pathExists(file)) {
            const config = JSON.parse(await fs.readFile(file, 'utf-8'));

            return plainToClass(HomeConfig, config);
        }
    }

    return new HomeConfig();
}

export async function setHomeConfig(homeConfig: HomeConfig): Promise<void> {
    const homeDir = path.resolve(getUserHome());
    const file = path.join(homeDir, '.deepkit', 'config');

    await fs.mkdirs(path.dirname(file));

    return fs.writeFile(file, JSON.stringify(classToPlain(HomeConfig, homeConfig), null, 4));
}

export async function setHomeFolderLink(
    config: HomeConfig,
    accountId: string,
    projectId: string,
    path: string,
    name: string,
    bookmarkPermission?: string
) {
    config.removeLink(accountId, projectId, path);

    if (bookmarkPermission) {
        config.macOSSandboxBookmark[path] = bookmarkPermission;
    } else {
        //we are on darwin and actually in a Electron environment
        if (await isMASBuild()) {
            if (!config.macOSSandboxBookmark[path]) {
                console.log('Please select the folder again to give Deepkit read and write access from macOS.');
                const res = await fetchMacOSBookmarkPermission(path);
                if (res.path === path) {
                    throw new Error('selected wrong folder');
                }
                config.macOSSandboxBookmark[path] = res.bookmark;
            }
        }
    }

    config.folderLinks.push(new FolderLink(
        projectId, path, name, accountId,
    ));
}

/**
 * In macOS sandbox process.cwd() returns the sandbox path which is for us useless.
 */
export function getCWD(): string {
    return process.env['PWD'] || process.cwd();
}

export async function startAllAccessingSecurityScopedResource(): Promise<Subscription> {
    if (await isMASBuild()) {
        const {app} = await getElectron();
        const scopes: any[] = [];
        const config = await getHomeConfig();
        for (const bookmark of Object.values(config.macOSSandboxBookmark)) {
            scopes.push(app.startAccessingSecurityScopedResource(bookmark));
        }
        return new Subscription(() => {
            for (const scope of scopes) {
                scope();
            }
        });
    } else {
        return new Subscription(() => {
        });
    }
}

export async function startAccessingSecurityScopedResource(pathToStart: string): Promise<Subscription> {
    const config = await getHomeConfig();
    let bookmark: undefined | string = '';
    let dir = pathToStart;

    while (!config.macOSSandboxBookmark[dir]) {
        dir = path.resolve(dir, '..');
        if (dir === path.resolve(dir, '..')) {
            //reached root
            break;
        }
    }

    bookmark = config.macOSSandboxBookmark[dir];

    if (bookmark && await isMASBuild()) {
        const {app} = await getElectron();
        const stopAccessingSecurityScopedResource = app.startAccessingSecurityScopedResource(bookmark);
        return new Subscription(() => {
            stopAccessingSecurityScopedResource();
        });
    } else {
        return new Subscription(() => {
        });
    }
}

export async function ensureAndActivateFileAccessTo(
    path: string,
    title: string,
    message: string,
    buttonLabel: string,
    isDirectory: boolean = false,
): Promise<Subscription> {
    if (!await isMASBuild()) return new Subscription();

    const config = await getHomeConfig();
    if (config.macOSSandboxBookmark[path]) {
        //check if valid
        try {
            const sub = await startAccessingSecurityScopedResource(path);
            sub.unsubscribe();
            return await startAccessingSecurityScopedResource(path);
        } catch (error) {
            console.log('sandbox bookmark became invalid.' + path);
            delete config.macOSSandboxBookmark[path];
        }
    }

    try {
        const bookmark = await getMacOSSandboxPermissionBookmark(path, title, message, buttonLabel, isDirectory);
        if (bookmark) {
            config.macOSSandboxBookmark[path] = bookmark;
            await setHomeConfig(config);
        }
    } catch (error) {
        console.error('Failed to get macOS permission');
    }

    return await startAccessingSecurityScopedResource(path);
}

export async function getHomeDockerConfig(): Promise<HomeDockerConfig> {
    const homeDir = path.resolve(getUserHome());

    if (homeDir) {
        const file = path.join(homeDir, '.deepkit', 'docker');
        if (await fs.pathExists(file)) {
            const config = JSON.parse(await fs.readFile(file, 'utf-8'));

            return plainToClass(HomeDockerConfig, config);
        }
    }

    return new HomeDockerConfig;
}

export async function getFolderLinksOfDirectory(dir: string): Promise<FolderLink[]> {
    const homeConfig = await getHomeConfig();
    const map = homeConfig.getFolderLinksMap();

    while (!map[dir]) {
        dir = path.resolve(dir, '..');
        if (dir === path.resolve(dir, '..')) {
            //reached root
            return [];
        }
    }

    if (map[dir]) {
        const links: FolderLink[] = [];
        for (const linksPerAccount of Object.values(map[dir])) {
            for (const link of Object.values(linksPerAccount)) {
                links.push(link);
            }
        }

        return links;
    }

    return [];
}

export async function getFolderLinkOfDirectory(dir: string, accountName?: string, projectName?: string): Promise<FolderLink | undefined> {
    const homeConfig = await getHomeConfig();
    const map = homeConfig.getFolderLinksMap();

    while (!map[dir]) {
        dir = path.join(dir, '..');
        if (dir === path.join(dir, '..')) {
            //reached root
            return;
        }
    }

    if (map[dir] && Object.keys(map[dir]).length) {
        if (accountName) {
            const account = homeConfig.getAccountByName(accountName);
            if (!account) {
                throw new Error(`No account found for ${accountName}.`);
            }
            if (!map[dir][account.id]) {
                return undefined;
            }
            if (projectName) {
                if (!map[dir][account.id][projectName]) {
                    return undefined;
                }
                return map[dir][account.id][projectName];
            }

            return Object.values(map[dir][account.id])[0];
        } else {
            const first = Object.values(map[dir])[0];

            if (projectName) {
                if (!first[projectName]) {
                    return undefined;
                }
                return first[projectName];
            }

            return Object.values(first)[0];
        }
    }

    return undefined;
}

export async function getFolderLinkAccountForDirectory(
    dir: string, accountName?: string, projectName?: string
): Promise<{ folderLink: FolderLink, account: HomeAccountConfig }> {
    const item = await getFolderLinkOfDirectory(dir, accountName, projectName);
    const home = await getHomeConfig();

    if (item) {
        return {folderLink: item, account: home.getAccount(item.accountId)};
    }

    throw new Error(`No folder link found for this directory. Use 'deepkit link' first`);
}

/**
 * Returns the given accountId of accountName if set, otherwise returns the default accountId. If given accountId does
 * not exists, throws an error.
 */
export async function getAccount(accountName?: string): Promise<HomeAccountConfig> {
    const home = await getHomeConfig();
    if (!accountName) {
        return home.getLocalAccount();
    }

    const account = home.getAccountByName(accountName);
    if (account) {
        return account;
    }

    throw new Error(`Account ${accountName} does not exist.`);
}
