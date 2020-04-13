/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {IdInterface} from "@marcj/glut-core";
import {classToPlain, Entity, f, uuid} from "@marcj/marshal";
import {arrayRemoveItem} from "@marcj/estdlib";
import {JobStatus} from "./job";

export enum IssuePriority {
    LOW = 0,
    NORMAL = 100,
    HIGH = 200,
}

export class ProjectIssueStatus {
    @f.primary().uuid()
    id: string = uuid();

    @f title: string = '';

    @f isDefault: boolean = false;

    @f isClosing: boolean = false;

    static create(title: string, isDefault: boolean, isClosing: boolean) {
        const s = new ProjectIssueStatus;
        s.title = title;
        s.isDefault = isDefault;
        s.isClosing = isClosing;
        return s;
    }
}

@Entity('issue-base')
export class ProjectIssueBase {
    @f.primary().uuid()
    id: string = uuid();

    @f title: string = '';

    @f.array('any') content: any[] = [];

    @f.optional().uuid() statusId?: string;

    @f.array(String) labelIds: string[] = [];

    @f commentsCount: number = 0;

    @f.enum(IssuePriority) priority: IssuePriority = IssuePriority.NORMAL;

    @f closed: boolean = false;

    @f archived: boolean = false;

    @f.type(String).uuid().index().optional() assigneeId: string | null = null;

    @f fileNumber: number = 0;

    @f lastCommentDate: Date = new Date;

    @f created: Date = new Date;

    @f updated: Date = new Date;

    constructor(
        @f.uuid().index().asName('projectId') public projectId: string,
        @f.uuid().asName('reporterId') public reporterId: string,
    ) {
    }

    toggleLabel(label: ProjectLabel) {
        if (this.labelIds.includes(label.id)) {
            arrayRemoveItem(this.labelIds, label.id);
        } else {
            this.labelIds.push(label.id);
        }
    }
}

@Entity('issue')
export class ProjectIssue extends ProjectIssueBase {
    @f version: number = 1;

    constructor(
        @f.uuid().index().asName('projectId') public projectId: string,
        @f.uuid().asName('reporterId') public reporterId: string,
        @f.asName('number') public number: number,
    ) {
        super(projectId, reporterId);
    }
}


@Entity('projectSource')
export class ProjectSource {
    @f privateKey: string = '';

    constructor(
        @f.asName('projectId').uuid().primary().index({unique: true}) public projectId: string
    ) {
    }
}

export class ProjectGitProgress {
    @f progress: number = 0;
    @f receivedObjects: number = 0;
    @f indexedDeltas: number = 0;
    @f totalObjects: number = 0;
    @f totalDeltas: number = 0;
    @f error: string = '';

    /**
     * MB/s
     */
    @f speed: number = 0;
}

export class GitLastCommit {
    constructor(
        @f.asName('message') public message: string,
        @f.asName('author') public author: string,
        @f.asName('id') public id: string,
        @f.asName('date') public date: Date,
    ) {
    }
}

export class ProjectLabel {
    @f.uuid() id: string = uuid();

    @f color: string = '';

    constructor(
        @f.asName('label') public label: string = ''
    ) {
    }
}

@Entity('ProjectJobListFilter')
export class ProjectJobListFilter {
    @f.uuid() id: string = uuid();

    @f name: string = '';

    @f.type(String).optional()
    list?: string;

    @f
    alive: boolean = false;

    @f.type(String).optional()
    label?: string;

    @f.enum(JobStatus).optional()
    status?: JobStatus;

    @f.type(String).optional()
    author?: string;

    @f.type(String)
    query: string = '';

    reset() {
        this.query = '';
        this.author = undefined;
        this.status = undefined;
        this.label = undefined;
        this.alive = false;
    }

    getChecksum() {
        const p = classToPlain(ProjectJobListFilter, this);
        delete p['id'];
        delete p['name'];
        return JSON.stringify(p);
    }
}


@Entity('projectExperimentList')
export class ProjectExperimentList {
    @f.uuid() id: string = uuid();

    @f color: string = '';

    constructor(
        @f.asName('name') public name: string = ''
    ) {
    }
}

@Entity('project', 'project')
export class Project implements IdInterface {
    @f.primary().uuid()
    id: string = uuid();

    @f
    version: number = 1;

    @f
    public: boolean = false;

    @f
    jobNumber: number = 0;

    @f
    issueNumber: number = 0;

    @f
    description: string = '';

    @f
    gitUrl: string = '';

    @f
    gitBranch: string = 'master';

    @f.array(ProjectLabel)
    experimentLabels: ProjectLabel[] = [];

    @f.array(ProjectExperimentList)
    experimentLists: ProjectExperimentList[] = [];

    @f.array(ProjectLabel)
    issueLabels: ProjectLabel[] = [];

    @f.array(ProjectIssueStatus)
    issueStatus: ProjectIssueStatus[] = [
        ProjectIssueStatus.create('Open', true, false),
        ProjectIssueStatus.create('Progress', false, false),
        ProjectIssueStatus.create('Done', false, true),
    ];

    // @Field(ProjectTag).asArray()
    // tags: ProjectTag[] = [];

    @f
    created: Date = new Date();

    @f
    updated: Date = new Date();

    /**
     * Contains the url from the last cloned git. If changed or empty we should trigger a new clone.
     */
    @f gitClonedUrl: string = '';

    @f gitDeployKey: string = '';

    @f gitProgress: ProjectGitProgress = new ProjectGitProgress;

    @f.optional() gitLastCommit?: GitLastCommit;
    @f.optional() gitLastRefresh?: Date;

    @f.array(ProjectJobListFilter)
    filters: ProjectJobListFilter[] = [];

    constructor(
        @f.asName('owner').uuid().index() public owner: string,
        @f.asName('name').index() public name: string
    ) {
    }

    public needsRefresh() {
        return this.gitUrl && this.gitUrl !== this.gitClonedUrl;
    }

    public getExperimentLabels(labelIds: string[]): ProjectLabel[] {
        return this.experimentLabels.filter(v => labelIds.includes(v.id));
    }

    public getIssueLabels(labelIds: string[]): ProjectLabel[] {
        return this.issueLabels.filter(v => labelIds.includes(v.id));
    }

    public getExperimentList(name: string): ProjectExperimentList | undefined {
        return this.experimentLists.find(v => v.name === name);
    }

    public hasExperimentList(id: string): boolean {
        return !!this.experimentLists.find(v => v.id === id);
    }

    public addExperimentList(name?: string): ProjectExperimentList {
        if (!name) {
            name = 'List' + (this.experimentLists.length + 1);
        }

        const l = new ProjectExperimentList(name);
        this.experimentLists.push(l);
        return l;
    }

    public removeExperimentList(id: string) {
        const index = this.experimentLists.findIndex(v => v.id === id);
        if (index !== -1) {
            this.experimentLists.splice(index, 1);
        }
    }

    public addExperimentLabel() {
        this.experimentLabels.push(new ProjectLabel('Label' + (this.experimentLabels.length + 1)));
    }

    public removeExperimentLabel(id: string) {
        const index = this.experimentLabels.findIndex(v => v.id === id);
        if (index !== -1) {
            this.experimentLabels.splice(index, 1);
        }
    }

    public addIssueLabel() {
        this.issueLabels.push(new ProjectLabel('Label' + (this.issueLabels.length + 1)));
    }

    public removeIssueLabel(id: string) {
        const index = this.issueLabels.findIndex(v => v.id === id);
        if (index !== -1) {
            this.issueLabels.splice(index, 1);
        }
    }

    public isStatusDeletable(status: ProjectIssueStatus): boolean {
        if (status.isClosing) {
            return undefined !== this.issueStatus.find(v => v.isClosing && v.id !== status.id);
        }

        return true;
    }

    public getStatus(id?: string): ProjectIssueStatus | undefined {
        if (!id) return;
        return this.issueStatus.find(v => v.id === id);
    }

    public getDefaultStatus(): ProjectIssueStatus | undefined {
        return this.issueStatus.find(v => v.isDefault);
    }

    public addStatus() {
        this.issueStatus.push(ProjectIssueStatus.create('', false, false));
    }

    public setDefaultStatus(status: ProjectIssueStatus) {
        for (const status of this.issueStatus) {
            status.isDefault = false;
        }

        status.isDefault = true;
    }

    public removeStatus(id: string) {
        const index = this.issueStatus.findIndex(v => v.id === id);
        if (index !== -1) {
            this.issueStatus.splice(index, 1);
        }
    }

    public moveStatusUp(id: string) {
        const index = this.issueStatus.findIndex(v => v.id === id);
        if (index > 0) {
            const item = this.issueStatus[index];
            this.issueStatus.splice(index, 1);
            this.issueStatus.splice(index - 1, 0, item);
        }
    }

    public moveStatusDown(id: string) {
        const index = this.issueStatus.findIndex(v => v.id === id);
        if (index !== -1 && index < this.issueStatus.length) {
            const item = this.issueStatus[index];
            this.issueStatus.splice(index, 1);
            this.issueStatus.splice(index + 1, 0, item);
        }
    }
}
