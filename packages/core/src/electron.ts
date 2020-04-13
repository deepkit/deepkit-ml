/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

/**
 * We do some nasty hacks here because we want use this function in cli, server, and frontend.
 * However, in some cases this doesn't exists for example Deepkit Team Server or standalone cli tools.
 */
export async function getElectron(): Promise<any> {
    const name = 'electron';
    let electron: any;
    if ('undefined' !== typeof global) {
        electron = (global as any).electron;
        if (!electron) {
            electron = (global as any).require('electron');
        }
    }

    if (!electron && 'undefined' !== typeof require) {
        electron = (require as any)(name);

    }

    if (electron.remote) {
        electron = electron.remote;
    }
    if (!electron.app.isReady()) {
        return await new Promise<any>((resolve) => {
            electron.app.on('ready', () => {
                resolve(electron);
            });
        });
    } else {
        return electron;
    }
}

/**
 * When its a MAC (mac app store) build we need special permission stuff
 */
export async function isMASBuild(): Promise<boolean> {
    return await isElectronEnvironment() && process.cwd().includes('Library/Containers/ai.deepkit.app');
}

export async function isElectronEnvironment(): Promise<boolean> {
    try {
        return !!await getElectron();
    } catch (e) {
        return false;
    }
}

export async function selectSourceFolder(path?: string): Promise<{ path: string, bookmark: string }> {
    const {dialog} = await getElectron();
    const {filePaths, bookmarks} = await dialog.showOpenDialog({
        defaultPath: path,
        title: 'Please select the source folder',
        properties: ['openDirectory', 'dontAddToRecent', 'noResolveAliases'], securityScopedBookmarks: true
    }) as { filePaths: string[], bookmarks: string[] };
    console.log('showOpenDialog', filePaths, bookmarks);

    if (filePaths && filePaths.length === 1) {
        if (bookmarks && bookmarks.length === 1) {
            return {path: filePaths[0], bookmark: bookmarks[0]};
        } else {
            return {path: filePaths[0], bookmark: ''};
        }
    }
    throw new Error('Could not confirm source folder ' + path);
}

export async function fetchMacOSBookmarkPermission(path?: string, message?: string): Promise<{ path: string, bookmark: string }> {
    const {dialog} = await getElectron();
    const {filePaths, bookmarks} = await dialog.showOpenDialog({
        defaultPath: path,
        title: 'Please confirm the source folder to give Deepkit read and write access from macOS',
        message: message,
        buttonLabel: 'Confirm access',
        properties: ['openDirectory', 'dontAddToRecent', 'noResolveAliases'], securityScopedBookmarks: true
    }) as { filePaths: string[], bookmarks: string[] };
    console.log('showOpenDialog', filePaths, bookmarks);

    if (filePaths && filePaths.length === 1) {
        if (filePaths[0] !== path) {
            return await fetchMacOSBookmarkPermission(path, 'Please do not switch the folder and press confirm access.');
        }

        if (bookmarks && bookmarks.length === 1) {
            return {path: filePaths[0], bookmark: bookmarks[0]};
        }
    }

    throw new Error('Could not confirm source folder ' + path);
}

export async function getMacOSSandboxPermissionBookmark(
    path: string,
    title: string,
    message: string,
    buttonLabel: string,
    isDirectory: boolean = false
): Promise<string> {
    const {dialog} = await getElectron();
    const {filePaths, bookmarks} = await dialog.showOpenDialog({
        defaultPath: path,
        title: title,
        message: message,
        buttonLabel: buttonLabel,
        filters: [{name: 'Sock', extensions: ['sock']}],
        properties: [isDirectory ? 'openDirectory' : 'openFile', 'showHiddenFiles', 'dontAddToRecent', 'noResolveAliases'],
        securityScopedBookmarks: true
    }) as { filePaths: string[], bookmarks: string[] };
    console.log('showOpenDialog', filePaths, bookmarks);

    if (filePaths && filePaths.length === 1) {
        if (filePaths[0] !== path) {
            return await getMacOSSandboxPermissionBookmark(path, title, message, buttonLabel, isDirectory);
        }

        if (bookmarks && bookmarks.length === 1) {
            return bookmarks[0];
        }
    }

    return '';
}
