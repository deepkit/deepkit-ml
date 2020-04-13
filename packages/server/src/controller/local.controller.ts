/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Action, Collection, Controller, StreamBehaviorSubject} from "@marcj/glut-core";
import {Subscriptions} from "@marcj/estdlib-rxjs";
import {NotFoundError, Role} from "../utils";
import {
    HomeAccountConfig,
    isElectronEnvironment,
    isMASBuild,
    JobConfig,
    LocalControllerInterface,
    Project,
    RoleType,
    SourceFile
} from "@deepkit/core";
import {
    findParentPath,
    getHomeConfig,
    getJobConfig,
    LocalPathReader,
    setHomeConfig,
    setHomeFolderLink,
    startAccessingSecurityScopedResource
} from "@deepkit/core-node";
import {watch} from "chokidar";
import fs, {writeFile} from "fs-extra";
import {dirname, join} from "path";
import fastGlob from 'fast-glob';
import execa from "execa";
import {classToPlain, f} from "@marcj/marshal";
import {Exchange} from "@marcj/glut-server";
import * as os from "os";
import {Database} from "@marcj/marshal-mongo";
import * as path from "path";

const sudo = require('sudo-prompt');
const tmp = require('tmp');

@Controller('local')
export class LocalController implements LocalControllerInterface {
    private subs = new Subscriptions();

    // @Action()
    // @Role(RoleType.local)
    // @ReturnType(JobConfig)
    // async getExperimentConfigs(projectId: string): Promise<string[]> {
    //     const config = await getHomeConfig();
    //     // return config.getSourceFolder(projectId);
    // }

    constructor(
        protected exchange: Exchange,
        protected database: Database,
    ) {
    }

    @Action()
    @Role(RoleType.local)
    @f.array(HomeAccountConfig)
    async getAccounts(): Promise<HomeAccountConfig[]> {
        const config = await getHomeConfig();
        return config.accounts;
    }

    @Action()
    @Role(RoleType.local)
    async saveAccounts(@f.array(HomeAccountConfig) accounts: HomeAccountConfig[]): Promise<void> {
        const config = await getHomeConfig();
        config.accounts = accounts;
        await setHomeConfig(config);
    }

    @Action()
    @Role(RoleType.local)
    async getSourceFolder(projectId: string): Promise<string> {
        const config = await getHomeConfig();
        return config.getFolderLinkPath(projectId);
    }

    @Action()
    @Role(RoleType.local)
    async createExperiment(projectId: string, runOnCluster: boolean, config: JobConfig): Promise<void> {
        const homeConfig = await getHomeConfig();
        const folder = homeConfig.getFolderLinkPath(projectId);
        const project = await this.database.query(Project).filter({id: projectId}).findOne();

        const buffer = Buffer.from(JSON.stringify(classToPlain(JobConfig, config)), 'utf8');

        const cliArgs: string[] = [];
        cliArgs.push(...['run', '--configBase64', buffer.toString('base64')]);

        cliArgs.push('--project', project.name);
        cliArgs.push('--dir', folder);
        cliArgs.push('--account', 'localhost');

        if (runOnCluster) {
            cliArgs.push('--cluster');
        }

        const {path, args} = await this.getCliPath();

        console.log('createExperiment', [...args, ...cliArgs]);

        execa(path, [...args, ...cliArgs], {
            stderr: 'inherit',
            stdout: 'inherit',
        });
    }

    protected async getCliPath(): Promise<{ path: string, args: string[] }> {
        if (await isElectronEnvironment()) {
            return {path: process.execPath, args: ['--cli']};
        }

        //dev
        return {path: await findParentPath('cli/bin/run'), args: []};
    }

    @Action()
    @Role(RoleType.local)
    @f.any()
    async getDeepkitCliInfo(): Promise<{path: string, platform: string}> {
        const cliPath = path.join(__dirname, '../bin/deepkit');

        return {path: cliPath, platform: os.platform()};
    }

    @Action()
    @Role(RoleType.local)
    async setSourceFolder(accountId: string, projectId: string, oldPath: string, path: string,
                          name: string, @f.optional() bookmarkPermission?: string): Promise<void> {
        const config = await getHomeConfig();
        if (oldPath) {
            config.removeLink(accountId, projectId, oldPath);
        }

        await setHomeFolderLink(config, accountId, projectId, path, name, bookmarkPermission);
        await setHomeConfig(config);

        await this.exchange.publish('local/project/folder-change/' + projectId, {path: path});
    }

    @Action()
    @Role(RoleType.local)
    @f.array(JobConfig)
    async getExperimentConfigs(projectId: string): Promise<JobConfig[]> {
        //todo, how to find the correct files?
        // we should read also the content and send the whole stuff instead of SourceFile
        // check for *deepkit.yml
        // check for deepkit/*.yml
        const config = await getHomeConfig();
        const localPath = config.getFolderLinkPath(projectId);
        if (!localPath) throw new Error('path_not_exists');

        const permissionSub = await startAccessingSecurityScopedResource(localPath);

        try {
            const files = await fastGlob.async([
                'deepkit.yml',
                '*.deepkit.yml',
                '**/*/*.deepkit.yml',
                '**/*/deepkit.yml',
            ], {
                cwd: localPath,
                onlyFiles: true,
                ignore: ['.git', '__pycache__'],
                deep: 10,
                unique: true,
                matchBase: true,
            });

            console.log('files', localPath, files);
            const result: JobConfig[] = [];

            for (const file of files) {
                try {
                    const config = await getJobConfig(file.toString(), new LocalPathReader(localPath), localPath);
                    result.push(config);
                } catch (error) {
                }
            }
            return result;
        } finally {
            permissionSub.unsubscribe();

        }
    }

    @Action()
    @Role(RoleType.local)
    async subscribeSourceFiles(projectId: string, folder: string = '/'): Promise<Collection<SourceFile>> {
        const config = await getHomeConfig();
        const rootDir = config.getFolderLinkPath(projectId);
        if (!rootDir) throw new Error('path_not_exists');
        const permissionSub = await startAccessingSecurityScopedResource(rootDir);

        const collection: Collection<SourceFile> = new Collection(SourceFile);

        const files: SourceFile[] = [];
        let initialDone = false;

        const localPath = join(rootDir, folder);

        const watcher = watch(localPath, {
            ignored: ['.git'],
            depth: 0,
            alwaysStat: true,
            followSymlinks: false
        }).on('all', (eventName: 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir', path: string, stats?: fs.Stats) => {
            let normalizedPath = path.substr(rootDir.length);

            if (normalizedPath.startsWith('/')) {
                normalizedPath = normalizedPath.substr(1);
            }

            if (normalizedPath === '' || normalizedPath === folder) {
                return;
            }

            if (!initialDone && stats) {
                files.push(new SourceFile(
                    normalizedPath,
                    stats.isDirectory(),
                    stats.size,
                    stats.ctime,
                    stats.mtime,
                ));
            } else {
                if (eventName === 'unlinkDir') {
                    //remove all items that start with normalizedPath
                    const idsToRemove: string[] = [];
                    for (const file of collection.all().slice(0)) {
                        if (file.id.startsWith(normalizedPath)) {
                            idsToRemove.push(file.id);
                        }
                    }
                    collection.removeMany(idsToRemove);
                } else if (eventName === 'unlink') {
                    collection.remove(normalizedPath);
                } else if (eventName === 'add' && stats) {
                    collection.add(new SourceFile(
                        normalizedPath,
                        stats.isDirectory(),
                        stats.size,
                        stats.ctime,
                        stats.mtime,
                    ));
                } else if (eventName === 'addDir' && stats) {
                    collection.add(new SourceFile(
                        normalizedPath,
                        stats.isDirectory(),
                        stats.size,
                        stats.ctime,
                        stats.mtime,
                    ));
                } else if (eventName === 'change' && stats) {
                    const file = collection.get(normalizedPath);
                    if (file) {
                        collection.add(new SourceFile(
                            normalizedPath,
                            stats.isDirectory(),
                            stats.size,
                            stats.ctime,
                            stats.mtime,
                        ));
                    }
                }
            }
        }).on('ready', () => {
            initialDone = true;
            collection.set(files);
        });

        collection.addTeardown(() => {
            watcher.close();
            permissionSub.unsubscribe();
        });

        return collection;
    }

    protected async getLocalFolderFromPath(projectId: string, path: string) {
        const config = await getHomeConfig();
        const localPath = config.getFolderLinkPath(projectId);
        if (!localPath) throw new Error('path_not_exists');

        path = path.replace(/\.\.\//g, '');
        path = join(localPath, path);

        return path;
    }

    @Action()
    @Role(RoleType.local)
    async deleteSourceFile(projectId: string, path: string): Promise<void> {
        const localPath = await this.getLocalFolderFromPath(projectId, path);
        const permissionSub = await startAccessingSecurityScopedResource(localPath);
        try {
            if (!await fs.pathExists(localPath)) throw new NotFoundError(path);
            await fs.remove(localPath);
        } finally {
            permissionSub.unsubscribe();
        }
    }

    @Action()
    @Role(RoleType.local)
    async createSourceFolder(projectId: string, path: string): Promise<void> {
        const localPath = await this.getLocalFolderFromPath(projectId, path);
        const permissionSub = await startAccessingSecurityScopedResource(localPath);
        try {
            await fs.ensureDir(localPath);
        } finally {
            permissionSub.unsubscribe();
        }
    }

    @Action()
    @Role(RoleType.local)
    async createSourceFile(projectId: string, path: string, content: string = ''): Promise<void> {
        const localPath = await this.getLocalFolderFromPath(projectId, path);

        const permissionSub = await startAccessingSecurityScopedResource(localPath);
        try {
            await fs.ensureDir(dirname(localPath));
            await fs.writeFile(localPath, content);
        } finally {
            permissionSub.unsubscribe();
        }
    }

    @Action()
    @Role(RoleType.local)
    async renameSourceFile(projectId: string, path: string, newPath: string): Promise<void> {
        const localPath = await this.getLocalFolderFromPath(projectId, path);
        const newLocalPath = await this.getLocalFolderFromPath(projectId, newPath);

        const permissionSub = await startAccessingSecurityScopedResource(localPath);
        try {
            if (!await fs.pathExists(localPath)) throw new NotFoundError(path);
            await fs.rename(localPath, newLocalPath);
        } finally {
            permissionSub.unsubscribe();
        }
    }

    @Action()
    @Role(RoleType.local)
    async subscribeFolderChange(projectId: string): Promise<StreamBehaviorSubject<string>> {
        const subject = new StreamBehaviorSubject<string>('');

        const sub = this.exchange.subscribe('local/project/folder-change/' + projectId, (m: { path: string }) => {
            subject.next(m.path);
        });

        subject.addTearDown(() => {
            sub.unsubscribe();
        });

        return subject;
    }

    @Action()
    @Role(RoleType.local)
    async subscribeSourceFileContent(projectId: string, path: string): Promise<StreamBehaviorSubject<Buffer | undefined>> {
        const localPath = await this.getLocalFolderFromPath(projectId, path);
        const permissionSub = await startAccessingSecurityScopedResource(localPath);
        try {
            if (!await fs.pathExists(localPath)) throw new NotFoundError(path);

            const subject = new StreamBehaviorSubject<Buffer | undefined>(await fs.readFile(localPath));

            const watcher = watch(localPath, {}).on('all', async (eventName: 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir', path: string, stats?: fs.Stats) => {
                if (eventName === 'change') {
                    subject.next(await fs.readFile(path));
                } else if (eventName === 'unlink') {
                    subject.next(undefined);
                }
            });

            subject.addTearDown(() => {
                watcher.close();
                permissionSub.unsubscribe();
            });

            return subject;
        } catch (error) {
            permissionSub.unsubscribe();
            throw error;
        }
    }

    @Action()
    @Role(RoleType.local)
    async saveSourceFileContent(projectId: string, path: string, content: string): Promise<void> {
        const config = await getHomeConfig();
        const localPath = config.getFolderLinkPath(projectId);
        if (!localPath) throw new Error('path_not_exists');

        const permissionSub = await startAccessingSecurityScopedResource(localPath);
        try {
            if (!await fs.pathExists(localPath)) throw new NotFoundError(localPath);

            path = path.replace(/\.\.\//g, '');
            path = join(localPath, path);

            await writeFile(path, content, {encoding: 'utf8'});
        } finally {
            permissionSub.unsubscribe();
        }
    }
}
