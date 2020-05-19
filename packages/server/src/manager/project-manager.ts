/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Injectable} from 'injection-js';
import {
    DeepKitFile,
    GitLastCommit,
    Job,
    JobConfig,
    JobFileType,
    JobStatus,
    Project,
    ProjectExperimentList,
    ProjectGitProgress,
    ProjectLabel,
    ProjectSource,
    SourceFile
} from '@deepkit/core';
import {Database} from '@marcj/marshal-mongo';
import {ConfigReader, getJobConfig, getProjectGitDir} from "@deepkit/core-node";
import {pathExists, remove} from "fs-extra";
import {Subject} from "rxjs";
import {auditTime} from "rxjs/operators";
import {Exchange, ExchangeDatabase, FS} from "@marcj/glut-server";
import {CustomError} from '@marcj/estdlib';
import * as path from "path";
import {dirname} from "path";
import micromatch from 'micromatch';
import {JobManager} from "./job-manager";
import nodegitModule from 'nodegit';

let nodegit: typeof nodegitModule | undefined;
try {
    nodegit = require('nodegit');
} catch (error) {
}

class ProjectNotFoundError extends CustomError {
}

interface IndexerProgress {
    indexedDeltas: () => number;
    indexedObjects: () => number;
    localObjects: () => number;
    receivedBytes: () => number;
    receivedObjects: () => number;
    totalDeltas: () => number;
    totalObjects: () => number;
}


@Injectable()
export class ProjectManager {
    constructor(
        protected database: Database,
        protected fs: FS<DeepKitFile>,
        protected exchangeDatabase: ExchangeDatabase,
        protected exchange: Exchange,
    ) {
    }

    public async get(id: string): Promise<Project> {
        const project = await this.database.query(Project).filter({id}).findOneOrUndefined();

        if (!project) {
            throw new ProjectNotFoundError(`Project '${id}' not found.`);
        }

        return project;
    }

    public async getProjectByName(name: string): Promise<Project> {
        const project = await this.database.query(Project).filter({name}).findOneOrUndefined();
        if (!project) {
            throw new ProjectNotFoundError(`Project '${name}' not found.`);
        }

        return project;
    }

    public async getExperimentLabelIdOrUndefined(projectId: string, name: string, color?: string): Promise<string | undefined> {
        const labels: ProjectLabel[] = await this.database.query(Project).filter({id: projectId}).findOneField('experimentLabels');
        for (const label of labels) {
            if (label.label === name.trim()) {
                return label.id;
            }
        }
    }

    public async changeExperimentListName(projectId: string, listId: string, name: string): Promise<void> {
        if (!name.trim()) return;
        const lock = await this.exchange.lock('project/list/' + projectId);
        try {
            const lists: ProjectExperimentList[] = await this.database.query(Project).filter({id: projectId}).findOneField('experimentLists');
            if (lists) {
                for (const list of lists) {
                    if (list.id === listId) {
                        list.name = name;
                    }
                }
            }

            await this.exchangeDatabase.patch(Project, projectId, {experimentLists: lists || []});
        } finally {
            lock.unlock();
        }
    }

    public async addOrReturnExperimentList(projectId: string, name: string, color?: string): Promise<string> {
        const lock = await this.exchange.lock('project/list/' + projectId);
        try {
            let lists: ProjectExperimentList[] = await this.database.query(Project).filter({id: projectId}).findOneField('experimentLists');
            if (lists) {
                for (const list of lists) {
                    if (list.name === name.trim()) {
                        return list.id;
                    }
                }
            } else {
                lists = [];
            }

            const list = new ProjectExperimentList();
            list.name = name.trim();
            if (color) list.color = color;
            lists.push(list);
            await this.exchangeDatabase.patch(Project, projectId, {experimentLists: lists});
            return list.id;
        } finally {
            lock.unlock();
        }
    }

    public async addOrReturnExperimentLabel(id: string, name: string, color?: string): Promise<string> {
        const lock = await this.exchange.lock('project/label/' + id);
        try {
            let labels: ProjectLabel[] = await this.database.query(Project).filter({id: id}).findOneField('experimentLabels');
            if (labels) {
                for (const label of labels) {
                    if (label.label === name.trim()) {
                        return label.id;
                    }
                }
            } else {
                labels = [];
            }

            const label = new ProjectLabel();
            label.label = name.trim();
            if (color) label.color = color;
            labels.push(label);
            await this.exchangeDatabase.patch(Project, id, {experimentLabels: labels});
            return label.id;
        } finally {
            lock.unlock();
        }
    }

    public async refreshGit(projectId: string) {
        if (!nodegit) return;

        const isLocked = await this.exchange.isLocked('project/' + projectId + '/git-refresh');
        if (isLocked) {
            //someone else is already refreshing,
            return;
        }
        const project = await this.database.query(Project).filter({id: projectId}).findOne();

        const lock = await this.exchange.lock('project/' + projectId + '/git-refresh');
        try {
            if (!project.gitUrl) {
                return;
            }
            const projectSource = await this.database.query(ProjectSource).filter({projectId: projectId}).findOneOrUndefined();

            const localPath = getProjectGitDir(project.id);
            if (project.gitClonedUrl !== project.gitUrl) {
                await remove(localPath);
            }

            let tries = 0;
            const subject = new Subject<ProjectGitProgress>();
            subject.pipe(auditTime(1000)).subscribe(async (progress) => {
                await this.exchangeDatabase.patch(Project, project.id, {
                    gitProgress: progress
                });
            });
            const progress = new ProjectGitProgress();
            subject.next(progress);

            let lastReceivedBytes = 0;
            let lastReceivedBytesTime = Date.now();

            const callbacks = {
                transferProgress: (stats: IndexerProgress) => {
                    progress.progress = ((100 * (stats.receivedObjects() + stats.indexedObjects())) / (stats.totalObjects() * 2)) / 100;
                    progress.receivedObjects = stats.receivedObjects();
                    progress.indexedDeltas = stats.indexedDeltas();
                    progress.totalObjects = stats.totalObjects();
                    progress.totalDeltas = stats.totalDeltas();
                    const diffBytes = stats.receivedBytes() - lastReceivedBytes;
                    const diffMs = Date.now() - lastReceivedBytesTime;

                    lastReceivedBytes = stats.receivedBytes();
                    lastReceivedBytesTime = Date.now();

                    progress.speed = (diffBytes * 1000 * 1000) / diffMs;
                    subject.next(progress);
                },
                certificateCheck: () => 0,
                credentials: (url: string, userName: string) => {
                    if (!nodegit) return;

                    tries++;
                    if (tries > 2) {
                        throw new Error('Could not authenticate clone');
                    }
                    if (!projectSource || !projectSource.privateKey) {
                        throw new Error('Could not authenticate clone. Use deploy key.');
                    }

                    return nodegit.Cred.sshKeyMemoryNew(
                        userName,
                        project.gitDeployKey,
                        projectSource.privateKey,
                        ''
                    );
                }
            };

            try {
                if (!await pathExists(localPath)) {
                    console.log('git clone', project.gitUrl, localPath);
                    await nodegit.Clone.clone(project.gitUrl, localPath, {
                        bare: 1,
                        fetchOpts: {
                            callbacks: callbacks,
                            downloadTags: 1,
                        }
                    });

                    await this.exchangeDatabase.patch(Project, project.id, {
                        gitClonedUrl: project.gitUrl
                    });
                } else {
                    console.log('git fetchAll', project.gitUrl, localPath);
                    const repo = await nodegit.Repository.openBare(localPath);
                    await repo.fetchAll({
                        prune: 1,
                        downloadTags: 1,
                        callbacks: callbacks
                    });
                }
                const repo = await this.getRepo(projectId);
                const lastCommit = await repo.getBranchCommit('remotes/origin/' + (project.gitBranch || 'master'));
                await this.exchangeDatabase.patch(Project, project.id, {
                    gitLastCommit: new GitLastCommit(
                        lastCommit.message(),
                        lastCommit.author().name(),
                        String(lastCommit.id()),
                        lastCommit.date()
                    )
                });

                progress.progress = 1;
                subject.next(progress);
                console.log('git refresh done', project.gitUrl, localPath);

            } catch (error) {
                console.log('git refresh failed', project.gitUrl, localPath, error);
                progress.error = String(error.message || error);
                subject.next(progress);
            }
        } finally {
            lock.unlock();
            await this.exchangeDatabase.patch(Project, project.id, {
                gitLastRefresh: new Date()
            });
        }
    }

    public async projectGitFileUtf8Content(projectId: string, branch: string, path: string): Promise<string | undefined> {
        const repo = await this.getRepo(projectId);
        const lastCommit = await repo.getBranchCommit('remotes/origin/' + branch);
        try {
            const entry = await lastCommit.getEntry(path);
            if (entry.isBlob()) {
                const blob = await repo.getBlob(entry.id());
                return blob.content().toString('utf8');
            }
        } catch (e) {
        }
    }

    protected async getRepo(projectId: string) {
        if (!nodegit) throw new Error('Nodegit not supported on localhost');

        const localPath = getProjectGitDir(projectId);
        if (!await pathExists(localPath)) {
            throw new Error('Repository does not exist');
        }
        return await nodegit.Repository.openBare(localPath);
    }

    public async getGitFiles(projectId: string, branch: string, path: string): Promise<SourceFile[]> {
        try {
            const repo = await this.getRepo(projectId);
            const lastCommit = await repo.getBranchCommit('remotes/origin/' + branch);
            let tree = await lastCommit.getTree();
            if (path) {
                const entry = await lastCommit.getEntry(path);
                if (!entry.isTree()) return [];
                tree = await entry.getTree();
            }

            const files: SourceFile[] = [];
            for (const entry of tree.entries()) {
                const blob = entry.isBlob() ? await repo.getBlob(entry.id()) : undefined;

                files.push(new SourceFile(
                    entry.path(),
                    entry.isDirectory(),
                    blob ? blob.rawsize() : 0,
                    new Date(),
                    new Date(),
                ));
            }

            return files;
        } catch (e) {
            return [];
        }
    }

    public async createExperimentFromConfig(
        jobManager: JobManager,
        userId: string,
        projectId: string,
        config: JobConfig,
        refOrBranch?: string,
    ): Promise<Job> {
        const project = await this.database.query(Project).filter({id: projectId}).findOne();
        if (!project.gitUrl) {
            throw new Error('No Git url configured.');
        }

        const newFields = await this.exchangeDatabase.increase(Project, {id: project.id}, {jobNumber: 1});

        const job = new Job(projectId);
        job.number = newFields.jobNumber;
        job.config = config;
        job.user = userId;
        const repo = await this.getRepo(projectId);
        const commit = await repo.getReferenceCommit('remotes/origin/' + (refOrBranch || project.gitBranch || 'master'));

        const walker = (await commit.getTree()).walk();

        job.status = JobStatus.creating;
        await jobManager.handleNewJob(job);
        job.prepareTaskInstances();

        await this.exchangeDatabase.add(job);

        const pattern: string[] = [];
        const files = job.config.files.length > 0 ? job.config.files : [dirname(job.config.path)];

        for (const file of job.config.getBuildFiles()) {
            const [filePattern, target] = file.split(':');
            files.push(filePattern);
        }

        for (const file of files) {
            pattern.push(file);
            pattern.push(file + '/**/*');
        }

        for (const ignore of config.ignore) {
            pattern.push('!' + ignore);
        }

        const addFile = async (path: string) => {
            const entry = await commit.getEntry(path);
            const blob = await entry.getBlob();

            await this.fs.write(path, blob.content(), {
                job: job.id,
                jobType: JobFileType.input,
            });
        };

        const allFiles: string[] = [];

        await new Promise((resolve, reject) => {
            walker.on('entry', (entry) => {
                allFiles.push(entry.path());
            });
            walker.on('error', (error) => {
                reject(error);
            });
            walker.on('end', () => {
                resolve();
            });
            walker.start();
        });

        const promises: Promise<any>[] = [];
        for (const path of micromatch(allFiles, pattern)) {
            promises.push(addFile(path));
        }
        await Promise.all(promises);

        job.status = JobStatus.created;
        await this.exchangeDatabase.update(job);

        //schedule in queue
        await jobManager.queueJob(project, job);

        return job;
    }

    public async getGitExperimentFiles(projectId: string, refOrBranch: string): Promise<JobConfig[]> {
        try {
            const repo = await this.getRepo(projectId);
            const commit = await repo.getReferenceCommit('remotes/origin/' + refOrBranch);

            const walker = (await commit.getTree()).walk();

            const result: JobConfig[] = [];

            class GitReader implements ConfigReader {
                constructor(protected baseDir: string = '') {
                }

                async exist(filePath: string) {
                    const p = path.join(this.baseDir, filePath);
                    try {
                        const entry = await commit.getEntry(p);
                        return entry.isBlob();
                    } catch (error) {
                        return false;
                    }
                }

                fromImport(filePath: string): ConfigReader {
                    return new GitReader(path.dirname(filePath));
                }

                async read(filePath: string) {
                    const p = path.join(this.baseDir, filePath);
                    const entry = await commit.getEntry(p);
                    const blob = await entry.getBlob();
                    return blob.content().toString('utf8');
                }
            }

            const reader = new GitReader();
            const promises: Promise<any>[] = [];

            async function loadConfig(path: string) {
                /**
                 * Valid:
                 * /deepkit.yml
                 * /experiments/deep/deepkit.yml
                 * /experiments/another.deepkit.yml
                 * /experiments/deepkit.yml
                 */
                if (path.match(/([^\/]+\.|^|\/)deepkit\.yml$/)) {
                    try {
                        const config = await getJobConfig(path, reader);
                        result.push(config);
                    } catch (e) {}
                }
            }

            await new Promise((resolve, reject) => {
                walker.on('entry', (entry) => {
                    promises.push(loadConfig(entry.path()));
                });
                walker.on('error', (error) => {
                    reject(error);
                });
                walker.on('end', () => {
                    resolve();
                });
                walker.start();
            });

            await Promise.all(promises);

            return result;
        } catch (error) {
            return [];
        }
    }

    async projectTestGitAccess(projectId: string, gitUrl: string): Promise<boolean> {
        if (!nodegit) throw new Error('Nodegit not supported on localhost');
        const project = await this.database.query(Project).filter({id: projectId}).findOne();

        const projectSource = await this.database.query(ProjectSource).filter({projectId: projectId}).findOneOrUndefined();

        const remote = await nodegit.Remote.createDetached(gitUrl);

        let tries = 0;
        await remote.connect(nodegit.Enums.DIRECTION.FETCH, {
            certificateCheck: () => 0,
            credentials: (url: string, userName: string) => {
                if (!nodegit) return;

                tries++;
                if (tries > 2) {
                    throw new Error('Could not authenticate');
                }
                if (!projectSource) {
                    throw new Error('Could not authenticate. Use deploy key.');
                }

                return nodegit.Cred.sshKeyMemoryNew(
                    userName,
                    project.gitDeployKey,
                    projectSource.privateKey,
                    ''
                );
            }
        });

        await remote.referenceList();

        return true;
    }
}
