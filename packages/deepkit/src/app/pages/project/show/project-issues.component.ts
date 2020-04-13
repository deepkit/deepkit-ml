/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {AfterViewInit, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, SimpleChanges} from "@angular/core";
import {Collection, EntitySubject} from "@marcj/glut-core";
import {ControllerClient} from "../../../providers/controller-client";
import {
    DeepKitFile,
    IssuePriority,
    ProjectIssue,
    ProjectIssueBase,
    ProjectLabel,
    ProjectIssueStatus, UniversalComment, Project
} from "@deepkit/core";
import {observe} from "../../../reactivate-change-detection";
import {LocalStorage} from "ngx-store";
import {detectChangesNextFrame, DuiDialog, ViewState, FilePickerItem} from "@marcj/angular-desktop-ui";
import {stack} from "@marcj/estdlib";
import {IssueDialogComponent} from "../../../dialogs/issue-dialog.component";
import {auditTime} from "rxjs/operators";

@Component({
    selector: 'dk-project-issues',
    template: `
        <dui-window-toolbar *ngIf="viewState.attached && !readOnly" for="main">
            <dui-button-group padding="none">
                <dui-button textured (click)="addIssue()" icon="add"></dui-button>
            </dui-button-group>

            <ng-container *ngIf="issue$|asyncRender as issue">
                <dui-button-group padding="none">
                    <dui-button textured [openDropdown]="labelDropdown" icon="flag"></dui-button>
                    <dui-button textured (click)="edit()">Edit</dui-button>
                    <ng-container *ngIf="project$|asyncRender as project">
                        <dui-button textured [openDropdown]="statusDropdown" icon="arrow_down" iconRight>
                            <ng-container *ngIf="project.getStatus(issue.statusId) as status; else noStatus">
                                {{status.title}}
                            </ng-container>
                            <ng-template #noStatus>Status</ng-template>
                        </dui-button>
                    </ng-container>
                </dui-button-group>

                <dui-dropdown #statusDropdown>
                    <ng-container *ngIf="project$|asyncRender as project">
                        <dui-dropdown-item
                            (click)="assignStatus(issue, status)"
                            [selected]="issue.statusId === status.id"
                            *ngFor="let status of project.issueStatus">
                            {{status.title}}
                        </dui-dropdown-item>
                    </ng-container>
                </dui-dropdown>

                <dui-dropdown #labelDropdown>
                    <ng-container *ngIf="project$|asyncRender as project">
                        <dui-dropdown-item
                            (click)="toggleLabel(label)"
                            [selected]="issue.labelIds.includes(label.id)"
                            *ngFor="let label of project.issueLabels"
                        >
                            {{label.label}}
                        </dui-dropdown-item>
                    </ng-container>
                </dui-dropdown>
            </ng-container>
        </dui-window-toolbar>

        <dui-window-toolbar *ngIf="viewState.attached" for="main_right">
            <dui-button-group padding="none">
                <dui-button textured (click)="showDetail = !showDetail" title="Show/Hide details"
                            [highlighted]="showDetail" icon="toggle_right"></dui-button>
            </dui-button-group>
            <ng-container *ngIf="!readOnly">
                <dui-button-group padding="none" *ngIf="issue$|asyncRender as issue">
                    <dui-button textured confirm="Archive issue?" title="Archive issue" (click)="archive()"
                                icon="archive"></dui-button>
                </dui-button-group>
            </ng-container>
        </dui-window-toolbar>

        <div class="left" [style.width.px]="tab === 'list' ? sidebarWidth : undefined"
             [class.board]="tab === 'board'"
             [class.full-width]="!showDetail"
             *ngIf="project$|asyncRender as project">
            <div style="padding: 12px; flex: 0; padding-bottom: 12px; border-bottom: 1px solid var(--line-color-light)">
                <div style="margin-bottom: 14px;">
                    <dui-button-group>
                        <dui-tab-button (click)="tab = 'list'" [active]="tab === 'list'">List</dui-tab-button>
                        <dui-tab-button (click)="tab = 'board'" [active]="tab === 'board'">Board</dui-tab-button>
                    </dui-button-group>
                </div>

                <dui-button-group style="display: flex; max-width: 500px;">
                    <dui-select textured [(ngModel)]="filterAssignee" (ngModelChange)="updateList()"
                                style="flex: 1; height: 22px;">
                        <dui-option [value]="null">All Assignees</dui-option>
                        <dui-option [value]="''">Unassigned</dui-option>
                        <dui-option
                            *ngFor="let userId of foundAssigneesIds"
                            [value]="userId">
                            <dk-user-small [showImage]="false" [userId]="userId"></dk-user-small>
                        </dui-option>
                    </dui-select>

                    <dui-select textured [(ngModel)]="filterStatus" (ngModelChange)="updateList()"
                                style="flex: 1; height: 22px;">
                        <dui-option [value]="null">All Status</dui-option>
                        <ng-container *ngIf="project$|asyncRender as project">
                            <dui-option
                                *ngFor="let status of project.issueStatus"
                                [value]="status.id">{{status.title}} ({{issuesCountPerStatus[status.id] || 0}})
                            </dui-option>
                        </ng-container>
                    </dui-select>

                    <dui-select textured [(ngModel)]="filterLabel" (ngModelChange)="updateList()"
                                style="flex: 1; height: 22px;">
                        <dui-option [value]="null">All labels</dui-option>
                        <ng-container *ngIf="project$|asyncRender as project">
                            <dui-option
                                *ngFor="let label of project.issueLabels"
                                [value]="label.id">{{label.label}} ({{issuesCountPerLabel[label.id] || 0}})
                            </dui-option>
                        </ng-container>
                    </dui-select>

                    <dui-input class="semi-transparent" *ngIf="tab === 'board'"
                               [(ngModel)]="filterQuery" (ngModelChange)="updateList()"
                               clearer round lightFocus icon="filter" placeholder="Filter"></dui-input>

                </dui-button-group>
            </div>

            <div *ngIf="tab === 'board'" class="columns overlay-scrollbar" cdkDropListGroup>
                <ng-container *ngIf="project$|asyncRender as project">
                    <div class="status-column"
                         *ngFor="let status of project.issueStatus"
                    >
                        <h4>{{status.title}}</h4>
                        <dui-list class="overlay-scrollbar-small"
                                  [(ngModel)]="issue$" (ngModelChange)="loadIssue($event)"
                                  cdkDropList
                                  [cdkDropListData]="status"
                                  (cdkDropListDropped)="issueColumnDrop($event)"
                        >
                            <dui-list-item
                                *ngFor="let issue of issuesPerStatus[status.id]; trackBy: trackIssues"
                                [value]="issues.getEntitySubject(issue)"
                                (dblclick)="showDetail = true"
                                cdkDrag [cdkDragData]="issue"
                            >
                                <div style="margin-bottom: 2px;">
                                    <div class="issue-title" [class.closed]="issue.closed">
                                        <span class="text-light">#{{issue.number}}</span>
                                        {{issue.title}}
                                    </div>
                                </div>
                                <div style="display: flex;">
                                    <div class="text-light" style="flex: 0; white-space: nowrap">
                                        <dk-user-small *ngIf="issue.assigneeId"
                                                       [userId]="issue.assigneeId"></dk-user-small>
                                        <div *ngIf="!issue.assigneeId">Unassigned</div>
                                    </div>
                                    <div style="margin-left: auto; text-align: right; opacity: 0.8;">
                                        <dk-label *ngFor="let label of project.getIssueLabels(issue.labelIds)"
                                                  [label]="label.label"></dk-label>
                                    </div>
                                </div>
                            </dui-list-item>
                        </dui-list>
                    </div>
                </ng-container>
            </div>

            <ng-container *ngIf="tab === 'list'">
                <dui-list [(ngModel)]="issue$" (ngModelChange)="loadIssue($event)"
                          delimiterLine
                >
                    <ng-container *ngIf="issues|asyncRender as list">

                        <ng-container *ngFor="let status of project.issueStatus; trackBy: trackStatus">
                            <ng-container *ngIf="issuesPerStatus[status.id] && issuesPerStatus[status.id].length">
                                <dui-list-title>
                                    {{status.title}}
                                </dui-list-title>

                                <dui-list-item
                                    *ngFor="let issue of issuesPerStatus[status.id]; trackBy: trackIssues"
                                    [value]="issues.getEntitySubject(issue)"
                                    (dblclick)="showDetail = true"
                                >
                                    <div style="margin-bottom: 2px;">
                                        <div style="float: right; white-space: nowrap" class="text-light">
                                            <dui-icon name="comment"
                                                      style="vertical-align: top; opacity: 0.8;"></dui-icon>
                                            {{issue.commentsCount}}
                                        </div>

                                        <div class="issue-title" [class.closed]="issue.closed">
                                            <span class="text-light">#{{issue.number}}</span>
                                            {{issue.title}}
                                        </div>
                                    </div>
                                    <div style="display: flex;">
                                        <div class="text-light" style="flex: 0; white-space: nowrap">
                                            <dk-user-small *ngIf="issue.assigneeId"
                                                           [userId]="issue.assigneeId"></dk-user-small>
                                            <div *ngIf="!issue.assigneeId">Unassigned</div>
                                        </div>
                                        <div style="margin-left: auto; text-align: right; opacity: 0.8;">
                                            <dk-label *ngFor="let label of project.getIssueLabels(issue.labelIds)"
                                                      [label]="label.label"></dk-label>
                                        </div>
                                    </div>
                                </dui-list-item>
                            </ng-container>
                        </ng-container>
                    </ng-container>
                </dui-list>

                <div style="padding: 5px 8px;">
                    <dui-input class="semi-transparent" style="margin-left: auto; width: 100%;"
                               [(ngModel)]="filterQuery" (ngModelChange)="updateList()"
                               clearer round lightFocus icon="filter" placeholder="Filter"></dui-input>
                </div>
            </ng-container>

            <dui-splitter *ngIf="tab === 'list'" position="right"
                          (modelChange)="sidebarWidth = $event; cd.detectChanges()"></dui-splitter>
        </div>

        <div class="detail overlay-scrollbar" [style.width.px]="tab === 'board' ? boardDetailWidth : undefined"
             [class.board]="tab==='board'"
             [class.list]="tab==='list'"
             *ngIf="showDetail">
            <ng-container *ngIf="issue$|asyncRender as issue">
                <div class="header">
                    <div class="title">
                        <h3>#{{issue.number}} {{issue.title}}</h3>
                    </div>
                </div>

                <div class="content">
                    <div style="flex: 1">
                        <dk-section-header>Details</dk-section-header>
                        <div class="label-columns left-aligned">
                            <div>
                                <div>Created</div>
                                <div class="monospace">{{issue.created|date:'d. MMM yy, HH:mm'}}</div>
                            </div>
                            <div>
                                <div>Modified</div>
                                <div class="monospace">{{issue.updated|date:'d. MMM yy, HH:mm'}}</div>
                            </div>
                            <div>
                                <div>Status</div>
                                <div class="monospace">
                                    <ng-container *ngIf="project$|asyncRender as project">
                                        <ng-container
                                            *ngIf="project.getStatus(issue.statusId) as status; else noStatus">
                                            {{status.title}}
                                        </ng-container>
                                        <ng-template #noStatus>Status</ng-template>
                                    </ng-container>
                                </div>
                            </div>
                            <div>
                                <div>Priority</div>
                                <div class="monospace">
                                    {{issue.priority == IssuePriority.LOW ? 'Low' : (issue.priority == IssuePriority.NORMAL ? 'Normal' : 'High')}}
                                </div>
                            </div>
                        </div>
                        <div class="label-columns" style="margin-top: 4px;">
                            <div>
                                <div style="flex: 0 0 50px;">Labels</div>
                                <div class="monospace" style="padding-top: 4px;">
                                    <ng-container *ngIf="project$|asyncRender as project">
                                        <dk-label *ngFor="let label of project.getIssueLabels(issue.labelIds)"
                                                  [label]="label.label"></dk-label>
                                    </ng-container>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="infos">
                        <dk-section-header>People</dk-section-header>
                        <div class="label-columns">
                            <div>
                                <div>Reporter</div>
                                <div>
                                    <dk-user-small [userId]="issue.reporterId"></dk-user-small>
                                </div>
                            </div>
                            <div>
                                <div>Assigned</div>
                                <div>
                                    <div *ngIf="!issue.assigneeId">Unassigned</div>
                                    <dk-user-small *ngIf="issue.assigneeId" [userId]="issue.assigneeId"></dk-user-small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="content">
                    <div class="description">
                        <dk-section-header>Description</dk-section-header>
                        <dk-text-editor [viewOnly]="true" [ngModel]="issue.content"></dk-text-editor>
                    </div>
                </div>

                <div class="content">
                    <div class="description">
                        <dk-section-header>Attachments</dk-section-header>
                        <div>
                            <dk-file-thumbnail *ngFor="let file of files|asyncRender"
                                               [readOnly]="readOnly"
                                               (remove)="removeAttachment($event)"
                                               [file]="file"></dk-file-thumbnail>
                        </div>

                        <ng-container *ngIf="!readOnly">
                            <dui-button duiFilePicker (duiFilePickerChange)="uploadFile($event)" duiFileMultiple>Add file
                            </dui-button>

                            <span class="file-drop" duiFileDrop (duiFileDropChange)="uploadFile($event)"
                                  duiFileDropMultiple>
                                Or drop file here
                            </span>
                        </ng-container>
                    </div>
                </div>

                <div class="comments">
                    <dk-section-header>Comments</dk-section-header>

                    <ng-container *ngIf="!readOnly">
                        <dk-text-editor toolbar="small" [(ngModel)]="commentContent"></dk-text-editor>
                        <div style="margin-top: 4px;">
                            <dui-button (click)="addComment()">Send</dui-button>
                        </div>
                    </ng-container>

                    <dk-comment *ngFor="let comment of comments|async"
                                (removed)="removeComment($event)"
                                (edited)="editComment($event)"
                                [editable]="readOnly ? false : undefined"
                                [removable]="readOnly ? false : undefined"
                                [comment]="comment"></dk-comment>
                </div>
            </ng-container>
            <dui-splitter *ngIf="tab === 'board'" position="left"
                          (modelChange)="boardDetailWidth = $event; cd.detectChanges()"></dui-splitter>
        </div>
    `,
    styleUrls: ['./project-issues.component.scss']
})
export class ProjectIssuesComponent implements OnChanges, OnDestroy, AfterViewInit {
    IssuePriority = IssuePriority;

    @Input() project$!: EntitySubject<Project>;
    @Input() public readOnly: boolean = false;

    @LocalStorage('issues-sidebar-width')
    public sidebarWidth = 445;

    @LocalStorage('issues-board-detail-width')
    public boardDetailWidth = 245;

    @LocalStorage('issues-tab')
    public tab: 'list' | 'board' = 'list';

    @observe({unsubscribe: true})
    public issues?: Collection<ProjectIssue>;

    @observe({unsubscribe: true})
    public comments?: Collection<UniversalComment>;

    showDetail = true;

    commentContent: any[] = [];

    public issueBoard$?: EntitySubject<ProjectIssue>;

    public issue$?: EntitySubject<ProjectIssue>;

    @observe({unsubscribe: true})
    public files?: Collection<DeepKitFile>;

    readonly viewState = new ViewState;

    public issuesPerStatus: { [statusId: string]: ProjectIssue[] } = {};
    public issuesCountPerStatus: { [statusId: string]: number } = {};
    public issuesCountPerAssignee: { [userId: string]: number } = {};
    public issuesCountPerLabel: { [labelId: string]: number } = {};
    public foundAssigneesIds: Set<string> = new Set<string>();

    public filterAssignee: string | null = null;
    public filterStatus: string | null = null;
    public filterLabel: string | null = null;
    public filterQuery: string = '';

    constructor(
        public cd: ChangeDetectorRef,
        public controllerClient: ControllerClient,
        protected dialog: DuiDialog,
    ) {
    }

    ngAfterViewInit() {
    }

    async issueColumnDrop(event: any) {
        const item = event.item.data as ProjectIssue;
        const status = event.container.data as ProjectIssueStatus;
        this.assignStatus(item, status);
    }

    async addComment() {
        if (!this.issue$) return;
        await this.controllerClient.issue().addComment(this.issue$.id, this.commentContent);
        this.commentContent = [];
        this.cd.detectChanges();
    }

    async editComment(comment: UniversalComment) {
        if (!this.issue$) return;
        await this.controllerClient.issue().editComment(this.issue$.id, comment.id, comment.content);
        this.cd.detectChanges();
    }

    async removeComment(comment: UniversalComment) {
        if (!this.issue$) return;
        const a = await this.dialog.confirm('Really delete comment?');
        if (a) {
            try {
                await this.controllerClient.issue().removeComment(this.issue$.id, comment.id);
            } catch (error) {
                await this.dialog.alert('Failed', error.message);
            }
        }
    }

    async assignStatus(item: ProjectIssue, status: ProjectIssueStatus) {
        if (this.readOnly) return;

        item.closed = status.isClosing;
        item.statusId = status.id;
        this.updateList();
        await this.controllerClient.issue().patch(item.id, {
            statusId: status.id,
            closed: item.closed
        });
    }

    async loadIssue(item: EntitySubject<ProjectIssue>) {
        this.issue$ = item;
        this.files = undefined;
        this.comments = undefined;
        this.cd.detectChanges();
        this.files = await this.controllerClient.issue().subscribeFiles(this.issue$.id);
        this.comments = await this.controllerClient.issue().subscribeComments(this.issue$.id);
        this.cd.detectChanges();
    }

    trackStatus(index: number, item: ProjectIssueStatus) {
        return item.id;
    }

    trackIssues(index: number, item: ProjectIssue) {
        return item.id;
    }

    async uploadFile(event: FilePickerItem | FilePickerItem[]) {
        if (!this.issue$) return;
        if (Array.isArray(event)) {
            for (const item of event) {
                await this.controllerClient.issue().addFile(this.issue$.id, item.name, item.data);
            }
        }
    }

    async removeAttachment(file: DeepKitFile) {
        if (!this.issue$) return;
        const a = await this.dialog.confirm('Really delete attachment?');
        if (a) {
            await this.controllerClient.issue().removeFile(this.issue$.id, file.path);
        }
    }

    async toggleLabel(label: ProjectLabel) {
        if (this.issue$) {
            this.issue$.value.toggleLabel(label);
            await this.controllerClient.issue().patch(this.issue$.id, {labelIds: this.issue$.value.labelIds});
        }
    }

    @stack()
    async addIssue() {
        const issue = new ProjectIssueBase(this.project$.id, this.controllerClient.getAuthenticatedUser().id);
        const defaultStatus = this.project$.value.getDefaultStatus();

        if (defaultStatus) {
            issue.statusId = defaultStatus.id;
        }

        this.dialog.open(IssueDialogComponent, {
            project$: this.project$,
            issue: issue,
        });
    }

    async edit() {
        this.dialog.open(IssueDialogComponent, {
            project$: this.project$,
            issue: this.issue$!.value,
        });
    }

    async archive() {
        if (this.issue$) {
            await this.controllerClient.issue().archive(this.issue$.id);
            this.issue$ = undefined;
            detectChangesNextFrame(this.cd);
        }
    }

    async remove() {
        if (this.issue$) {
            await this.controllerClient.issue().remove(this.issue$.id);
            this.issue$ = undefined;
            detectChangesNextFrame(this.cd);
        }
    }

    ngOnDestroy() {
    }

    public updateList() {
        this.issuesPerStatus = {
            unassigned: []
        };
        this.issuesCountPerAssignee = {};
        this.issuesCountPerStatus = {};
        this.issuesCountPerLabel = {};
        this.foundAssigneesIds = new Set<string>();
        if (!this.issues || !this.project$) {
            detectChangesNextFrame(this.cd);
            return;
        }

        const allStatus = this.project$.value.issueStatus;
        for (const status of allStatus) {
            this.issuesPerStatus[status.id] = [];
        }

        for (const issue of this.issues.all()) {
            if (issue.assigneeId) {
                this.foundAssigneesIds.add(issue.assigneeId);
                if (!this.issuesCountPerAssignee[issue.assigneeId]) {
                    this.issuesCountPerAssignee[issue.assigneeId] = 1;
                } else {
                    this.issuesCountPerAssignee[issue.assigneeId]++;
                }
            }
            for (const labelId of issue.labelIds) {
                if (!this.issuesCountPerLabel[labelId]) {
                    this.issuesCountPerLabel[labelId] = 1;
                } else {
                    this.issuesCountPerLabel[labelId]++;
                }
            }
            if (issue.statusId) {
                if (!this.issuesCountPerStatus[issue.statusId]) {
                    this.issuesCountPerStatus[issue.statusId] = 1;
                } else {
                    this.issuesCountPerStatus[issue.statusId]++;
                }
            }
        }

        for (const issue of this.issues.all()) {
            if (this.filterQuery && !issue.title.includes(this.filterQuery)) continue;

            if (this.filterAssignee && issue.assigneeId !== this.filterAssignee) continue;
            if (this.filterAssignee === '' && issue.assigneeId !== null) continue;

            if (this.filterLabel && !issue.labelIds.includes(this.filterLabel)) continue;
            if (this.filterStatus && issue.statusId !== this.filterStatus) continue;

            if (!issue.statusId) {
                this.issuesPerStatus['unassigned'].push(issue);
            } else {
                if (!this.issuesPerStatus[issue.statusId]) {
                    this.issuesPerStatus[issue.statusId] = [];
                }
                this.issuesPerStatus[issue.statusId].push(issue);
            }
        }

        detectChangesNextFrame(this.cd);
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (changes.project$) {
            this.issue$ = undefined;
            this.issues = await this.controllerClient.issue().subscribeIssues(this.project$.value.id);
            this.issues.pipe(auditTime(1000 / 15)).subscribe(() => {
                this.updateList();
            });
            this.updateList();
            detectChangesNextFrame(this.cd);
        }
    }
}
