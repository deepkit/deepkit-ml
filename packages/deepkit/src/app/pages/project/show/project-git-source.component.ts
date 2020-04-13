/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, SimpleChanges} from "@angular/core";
import {EntitySubject} from "@marcj/glut-core";
import {Project, SourceFile} from "@deepkit/core";
import {ControllerClient} from "../../../providers/controller-client";
import {Subscription} from "rxjs";
import {unsubscribe} from "../../../reactivate-change-detection";
import {auditTime, skip} from "rxjs/operators";
import {ExecutionState} from "@marcj/angular-desktop-ui";
import {DuiDialog} from "@marcj/angular-desktop-ui";

@Component({
    selector: 'dk-project-git-source',
    template: `
        <div *ngIf="project$|asyncRender as project" style="display: flex; flex-direction: column; height: 100%;">

            <div style="display: flex; height: 40px; justify-content: space-between; align-items: center;">
                <div style="text-align: right; flex: 1; margin-right: 8px;">
                    <div *ngIf="project.gitUrl" class="selectable-text">

                        <ng-container *ngIf="project.gitProgress.progress < 1">
                            <ng-container *ngIf="project.gitProgress.error">
                                <a style="cursor: pointer; color: var(--color-red)"
                                   (click)="showError(project.gitProgress.error)">Error</a>
                            </ng-container>
                            <ng-container *ngIf="!project.gitProgress.error">
                                {{(project.gitProgress.progress * 100)|number:'0.2-2'}}%
                                <dui-indicator style="width: 80px;"
                                               [step]="project.gitProgress.progress"></dui-indicator>
                            </ng-container>
                        </ng-container>

                        {{project.gitUrl}}
                        ({{branch}}
                        <ng-container *ngIf="project.gitLastCommit">
                            {{project.gitLastCommit.id|slice:0:9}}, {{project.gitLastCommit.date|date:'short'}}</ng-container>)

                        <ng-container *ngIf="!readOnly">
                            <dui-button textured small (click)="refreshingExecutor.execute()"
                                        [disabled]="refreshingExecutor.running || project.gitProgress.progress < 1">Refresh
                            </dui-button>
                        </ng-container>
                    </div>

                    <div *ngIf="!project.gitUrl">
                        Git not configured. Open project settings to configure a Git server.
                    </div>
                </div>
            </div>

            <div style="display: flex; flex-direction: row; flex: 1; border-top: 1px solid var(--line-color-light)">
                <div style="height: 100%; position: relative;">
                    <dui-table
                        [items]="sort(gitFiles)"
                        style="height: 100%"
                        [style.width.px]="sidebarWidth"
                        selectable
                        (selectedChange)="selected($event)"
                        (dbclick)="dbclick($event)"
                        borderless
                        noFocusOutline
                    >
                        <dui-table-column name="name" [width]="180">
                            <ng-container *duiTableCell="let file">
                                <dui-icon [name]="file.dir ? 'folder' : 'file'"></dui-icon>
                                {{file.getName()}}
                            </ng-container>
                        </dui-table-column>
                        <dui-table-column name="size" header="Size" [width]="80">
                            <ng-container *duiTableCell="let file">
                                <ng-container *ngIf="!file.dir">
                                    {{file.size|fileSize}}
                                </ng-container>
                            </ng-container>
                        </dui-table-column>
                    </dui-table>
                    <dui-splitter position="right"
                                  (modelChange)="sidebarWidth = $event; cd.detectChanges()"></dui-splitter>
                </div>

                <div style="border-left: 1px solid var(--line-color-light); flex: 1;">
                    <ng-container *ngIf="shownFile">
                        <monaco-editor [fileName]="shownFile.path"
                                       style="height: 100%;"
                                       [ngModel]="fileContent" [options]="{readOnly: true}"
                        ></monaco-editor>
                    </ng-container>
                </div>
            </div>

            <div style="height: 25px; border-top: 1px solid var(--line-sidebar); padding: 3px;">
                Selected <span style="color: var(--text-grey)">/{{dir}}</span>
            </div>
        </div>
    `
})
export class ProjectGitSourceComponent implements OnChanges, OnDestroy {
    @Input()
    public project$?: EntitySubject<Project>;
    @Input() public readOnly: boolean = false;

    public sidebarWidth = 270;

    @unsubscribe()
    entitySub?: Subscription;

    gitFiles: SourceFile[] = [];

    dir = '';
    branch = 'master';
    loadedGitUrl = '';
    loadedLastRefresh?: Date;

    fileContent?: string;
    shownFile?: SourceFile;

    refreshingExecutor = new ExecutionState(this.cd, this.refresh.bind(this));

    constructor(
        protected controllerClient: ControllerClient,
        public cd: ChangeDetectorRef,
        protected dialog: DuiDialog,
    ) {
    }

    async showError(error: string) {
        await this.dialog.alert('Refreshing error', 'Error: ' + error + '\n\nPlease adjust project settings.');
    }

    async dbclick(file: SourceFile) {
        if (file.dir) {
            if (file.id === '..') {
                this.dir = this.dir.substr(0, this.dir.lastIndexOf('/'));
            } else {
                this.dir = file.path;
            }
            await this.loadFiles();
            this.fileContent = '';
        }
    }

    selected(files: SourceFile[]) {
        if (files.length && !files[0].dir) {
            this.loadFileContent(files[0]);
        }
    }

    async loadFileContent(file: SourceFile) {
        if (!this.project$) return;
        if (this.shownFile === file) return;

        this.shownFile = file;
        const content = await this.controllerClient.app().projectGitFileUtf8Content(this.project$.id, this.branch, file.path);

        if (this.shownFile === file) {
            //file is still selected.
            this.fileContent = content;
            this.cd.detectChanges();
        }
    }

    sort(files?: SourceFile[]): SourceFile[] | undefined {
        if (!files) return files;

        files.sort((a: SourceFile, b: SourceFile) => {
            if (a.dir && !b.dir) {
                return -1;
            }

            if (!a.dir && b.dir) {
                return +1;
            }

            return a.getName() > b.getName() ? +1 : -1;
        });
        if (this.dir) {
            files.splice(0, 0, new SourceFile(
                '..',
                true,
                0,
                new Date,
                new Date,
            ));
        }

        return files;
    }

    ngOnDestroy(): void {
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (changes.project$ && this.project$) {
            this.refreshingExecutor.execute();

            this.entitySub = this.project$.pipe(skip(1), auditTime(1000)).subscribe(async (project) => {
                if (project.gitProgress.progress === 1) {
                    let requiresLoadFiles = false;
                    if (this.loadedGitUrl !== project.gitUrl) {
                        requiresLoadFiles = true;
                    }
                    if (!this.loadedLastRefresh || (project.gitLastRefresh && this.loadedLastRefresh.getTime() !== project.gitLastRefresh.getTime())) {
                        requiresLoadFiles = true;
                    }
                    if (this.branch !== project.gitBranch) {
                        requiresLoadFiles = true;
                    }

                    if (requiresLoadFiles) {
                        this.branch = project.gitBranch;
                        this.dir = '';
                        this.loadFiles();
                    }
                }
            });

            this.loadFiles();
        }
    }

    async refresh() {
        if (!this.project$) return;
        try {
            await this.controllerClient.app().projectGitRefresh(this.project$.id);
        } catch (error) {}
        this.loadFiles();
    }

    async loadFiles() {
        if (!this.project$) return;

        this.loadedGitUrl = this.project$.value.gitUrl;
        this.loadedLastRefresh = this.project$.value.gitLastRefresh;
        this.gitFiles = await this.controllerClient.app().projectGitFiles(this.project$.id, this.branch, this.dir);
        this.cd.detectChanges();
    }

}
