/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Action, Collection, Controller, StreamBehaviorSubject} from "@marcj/glut-core";
import {Role} from "../utils";
import {
    DeepKitFile,
    filterObject,
    IssueControllerInterface,
    Project,
    ProjectIssue,
    ProjectIssueBase,
    RoleType,
    UniversalComment
} from "@deepkit/core";
import {ServerSettings} from "../model/server";
import {SessionHelper} from "../session";
import {Database} from "@marcj/marshal-mongo";
import {EntityStorage, Exchange, ExchangeDatabase, FS} from "@marcj/glut-server";
import {ResourcesManager} from "../node/resources";
import {SessionPermissionManager} from "../manager/session-permission";
import {f} from "@marcj/marshal";

@Controller('issue')
export class IssueController implements IssueControllerInterface {
    constructor(
        private serverSettings: ServerSettings,
        private sessionHelper: SessionHelper,
        private database: Database,
        private exchangeDatabase: ExchangeDatabase,
        private fs: FS<DeepKitFile>,
        private exchange: Exchange,
        private entityStorage: EntityStorage,
        private resources: ResourcesManager,
        private permission: SessionPermissionManager,
    ) {
    }

    @Action()
    @Role(RoleType.anonymouse)
    async subscribeIssues(projectId: string): Promise<Collection<ProjectIssue>> {
        await this.permission.checkProjectReadAccess(projectId);

        return this.entityStorage.collection(ProjectIssue).filter({
            projectId: projectId,
            archived: {$ne: true}
        }).find();
    }

    @Action()
    @Role(RoleType.anonymouse)
    async subscribeFiles(issueId: string): Promise<Collection<DeepKitFile>> {
        await this.permission.checkIssueReadAccess(issueId);

        return this.entityStorage.collection(DeepKitFile).filter({
            issue: issueId
        }).find();
    }

    @Action()
    @Role(RoleType.anonymouse)
    async subscribeFileContent(issueId: string, path: string): Promise<StreamBehaviorSubject<Uint8Array | undefined>> {
        await this.permission.checkIssueReadAccess(issueId);

        return this.fs.subscribe(path, {
            issue: issueId
        });
    }

    @Action()
    @Role(RoleType.regular)
    async add(issue: ProjectIssueBase): Promise<string> {
        await this.permission.checkProjectWriteAccess(issue.projectId);

        const newFields = await this.exchangeDatabase.increase(Project, {id: issue.projectId}, {issueNumber: 1});
        const projectIssue = new ProjectIssue(issue.projectId, this.sessionHelper.getAuthenticatedUserId(), newFields.issueNumber);
        for (const i of Object.keys(issue)) {
            (projectIssue as any)[i] = (issue as any)[i];
        }

        //todo, check if reporterId/assigneeId is valid
        await this.exchangeDatabase.add(projectIssue);

        return projectIssue.id;
    }

    @Action()
    @Role(RoleType.regular)
    async save(issue: ProjectIssueBase) {
        await this.permission.checkIssueWriteAccess(issue.id);
        delete issue.projectId;
        issue.updated = new Date;
        //todo, check if reporterId/assigneeId is valid
        await this.exchangeDatabase.patch(ProjectIssue, issue.id, issue);
    }

    @Action()
    @Role(RoleType.regular)
    async addFile(id: string, name: string, data: Uint8Array): Promise<void> {
        await this.permission.checkIssueWriteAccess(id);
        const newFields = await this.exchangeDatabase.increase(ProjectIssue, {id: id}, {fileNumber: 1});

        await this.fs.write('attachment/' + newFields.fileNumber + '_' + name, Buffer.from(data), {
            issue: id
        });
    }

    @Action()
    @Role(RoleType.regular)
    async removeFile(id: string, path: string): Promise<void> {
        await this.permission.checkIssueWriteAccess(id);
        await this.fs.remove(path, {
            issue: id
        });
    }

    @Action()
    @Role(RoleType.anonymouse)
    async subscribeComments(issueId: string): Promise<Collection<UniversalComment>> {
        await this.permission.checkIssueReadAccess(issueId);

        return this.entityStorage.collection(UniversalComment).filter({
            parentId: issueId
        }).orderBy('created', 'desc').find();
    }

    @Action()
    @Role(RoleType.regular)
    async addComment(issueId: string, @f.array('any') content: any[]): Promise<void> {
        await this.permission.checkIssueWriteAccess(issueId);
        await this.exchangeDatabase.increase(ProjectIssue, {id: issueId}, {commentsCount: 1});
        const comment = new UniversalComment(issueId, this.sessionHelper.getAuthenticatedUserId());
        comment.content = content;
        await this.exchangeDatabase.add(comment);
    }

    @Action()
    @Role(RoleType.regular)
    async removeComment(issueId: string, id: string): Promise<void> {
        await this.permission.checkCommentWriteAccess(id);
        await this.exchangeDatabase.deleteOne(UniversalComment, {id: id});
        await this.exchangeDatabase.increase(ProjectIssue, {id: issueId}, {commentsCount: -1});
    }

    @Action()
    @Role(RoleType.regular)
    async editComment(issueId: string, id: string, @f.array('any') content: any[]): Promise<void> {
        await this.permission.checkCommentWriteAccess(id);
        await this.exchangeDatabase.patch(UniversalComment, id, {
            content: content,
            updated: new Date,
        });
    }

    @Action()
    @Role(RoleType.regular)
    async patch(id: string, @f.partial(ProjectIssueBase) issue: Partial<ProjectIssueBase>) {
        await this.permission.checkIssueWriteAccess(id);
        //todo, check if reporterId/assigneeId is valid
        const patch = filterObject(issue, ['labelIds', 'statusId', 'closed']);
        patch.updated = new Date;
        await this.exchangeDatabase.patch(ProjectIssue, id, patch);
    }

    @Action()
    @Role(RoleType.regular)
    async archive(id: string) {
        await this.permission.checkIssueWriteAccess(id);
        await this.exchangeDatabase.patch(ProjectIssue, id, {
            archived: true
        });
    }

    @Action()
    @Role(RoleType.regular)
    async remove(id: string) {
        await this.permission.checkIssueWriteAccess(id);
        await this.database.query(UniversalComment).filter({parent: id}).deleteMany();
        await this.exchangeDatabase.deleteOne(ProjectIssue, {id: id});
        await this.fs.removeAll({issue: id});
    }
}
