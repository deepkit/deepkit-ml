/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, SimpleChanges} from "@angular/core";
import {Subscription} from "rxjs";
import {unsubscribe} from "../../../reactivate-change-detection";
import {ControllerClient} from "../../../providers/controller-client";
import {each} from "@marcj/estdlib";
import {DeepKitFile, Job, JobFileType} from "@deepkit/core";
import {Collection, EntitySubject, StreamBehaviorSubject} from "@marcj/glut-core";
import * as FileSaver from "file-saver";

class FileListing {
    name: string;
    dir: boolean;
    path: string;
    size?: number;
    created?: Date;
    type: 'input' | 'output' = 'input';

    constructor(name: string, dir: boolean, path: string, size?: number, created?: Date) {
        this.name = name;
        this.dir = dir;
        this.path = path;
        this.size = size;
        this.created = created;
    }

    public getDirectory(): string {
        if (this.dir) {
            const path = this.path.substr(0, this.path.length - 1);
            return path.substr(0, path.lastIndexOf('/') + 1);
        }

        return this.path.substr(0, this.path.lastIndexOf('/') + 1);
    }

    public inDirectory(dir: string = '/') {
        return this.getDirectory() === dir;
    }

    get id() {
        return this.path;
    }
}

@Component({
    selector: 'dk-job-show-files',
    template: `
        <div class="left">
            <div class="dirs">
                <dui-select style="width: 70px;" [ngModel]="show" (ngModelChange)="setShow($event)" textured>
                    <dui-option value="input">Input</dui-option>
                    <dui-option value="output">Output</dui-option>
                </dui-select>

                <span *ngFor="let dir of dirNames; last as last"
                      class="location-item"
                      [class.last]="last"
                      (click)="selectDir(dir.path)">
                    {{dir.name}}
                </span>
            </div>

            <dui-table
                    [items]="files"
                    [selectable]="true"
                    (selectedChange)="selectFile($event)"
                    defaultSort="name"
                    noFocusOutline
                    borderless
                    defaultSortDirection="asc">
                <dui-table-column name="name" header="Name" [width]="240">
                    <ng-container *duiTableCell="let file">
                        <div class="text-no-break">
                            <dui-icon style="vertical-align: text-bottom;"
                                     [name]="file.dir ? 'folder' : 'file'"></dui-icon>
                            {{file.name}}
                        </div>
                    </ng-container>
                </dui-table-column>

                <dui-table-column name="size" header="Size" [width]="90">
                    <ng-container *duiTableCell="let file">
                        {{file.size !== undefined ? (file.size|fileSize) : ''}}
                    </ng-container>
                </dui-table-column>

                <dui-table-column name="created" header="Created" [width]="110">
                    <ng-container *duiTableCell="let file">
                        {{file.created ? (file.created|date) : ''}}
                    </ng-container>
                </dui-table-column>

                <dui-table-column name="download" header=" " [width]="50">
                    <ng-container *duiTableCell="let file">
                        <ng-container *ngIf="!file.dir">
                            <dui-icon clickable name="download" (mousedown)="$event.stopPropagation(); download(file)"></dui-icon>
                        </ng-container>
                    </ng-container>
                </dui-table-column>
            </dui-table>
        </div>
        <div class="right">
            <monaco-editor
                    *ngIf="content !== undefined"
                    [fileName]="fileContentPath"
                    [options]="{readOnly: true}"
                    [(ngModel)]="content"
            ></monaco-editor>
        </div>
    `,
    styleUrls: ['./job-show-files.component.scss']
})
export class JobShowFilesComponent implements OnDestroy, OnChanges {
    @Input() job$?: EntitySubject<Job>;

    public files: FileListing[] = [];
    public filesMap: { [path: string]: FileListing } = {};

    @unsubscribe()
    public collection!: Collection<DeepKitFile>;

    @unsubscribe()
    private fileContentSubject?: StreamBehaviorSubject<string>;

    public fileContentPath?: string;

    @unsubscribe()
    private jobSub = new Subscription;

    public show: 'input' | 'output' = 'input';
    public content?: string;

    public dir: string = '/';
    public dirNames: { name: string, path: string }[] = [];

    constructor(
        private cd: ChangeDetectorRef,
        private controllerClient: ControllerClient,
    ) {
    }

    async setShow(show: 'input' | 'output') {
        this.show = show;
        this.content = undefined;
        if (this.fileContentSubject) {
            await this.fileContentSubject.unsubscribe();
        }
        this.readDirPaths('/');
        this.readFiles();
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (changes.job$ && this.job$) {
            this.files = [];
            this.filesMap = {};
            this.content = undefined;
            if (this.fileContentSubject) {
                await this.fileContentSubject.unsubscribe();
            }

            this.readDirPaths('/');
            await this.subscribeFiles();
        }
    }

    async download(file: FileListing) {
        const content = await this.controllerClient.publicJob().getJobFileContent(this.job$!.id, file.path.slice(1));
        if (content) {
            const blob = new Blob([content]);
            FileSaver.saveAs(blob, this.job$!.value.number + '-' + file.name);
        }
    }

    async ngOnDestroy() {
        if (this.fileContentSubject) {
            await this.fileContentSubject.unsubscribe();
        }

        if (this.collection) {
            await this.collection.unsubscribe();
        }
    }

    public async selectFile(files: FileListing[]) {
        if (this.fileContentSubject) {
            await this.fileContentSubject.unsubscribe();
        }
        this.content = undefined;

        if (files[0].dir) {
            this.fileContentPath = undefined;
            this.selectDir(files[0].path);
        } else {
            this.fileContentPath = files[0].path.slice(1);
            this.fileContentSubject = (await this.controllerClient.publicJob().subscribeJobFileContent(this.job$!.id, files[0].path.slice(1))).toUTF8();
            this.fileContentSubject.activateNextOnAppend();
            this.fileContentSubject.subscribe((v) => {
                if (v) {
                    this.content = v;
                } else {
                    this.content = undefined;
                }
                this.cd.detectChanges();
            });
        }
    }

    public readDirPaths(dir: string) {
        this.dir = dir;
        const paths = [];
        this.dirNames = [];

        this.dirNames.push({
            name: '/',
            path: '/',
        });

        for (const p of dir.split('/')) {
            if (!p) continue;

            paths.push(p);

            this.dirNames.push({
                name: p + '/',
                path: '/' + paths.join('/') + '/',
            });
        }
    }

    public selectDir(dir: string) {
        if (!dir.endsWith('/')) {
            dir += '/';
        }

        this.readDirPaths(dir);
        this.updateFiles();
    }

    protected updateFiles() {
        this.files = [];

        for (const file of each(this.filesMap)) {
            if (file.inDirectory(this.dir)) {
                this.files.push(file);
            }
        }

        this.cd.detectChanges();
    }

    protected async subscribeFiles() {
        this.collection = await this.controllerClient.publicJob().subscribeJobFiles(this.job$!.id);
        this.collection.subscribe(() => {
            this.readFiles();
        });
    }

    protected readFiles() {
        this.files = [];
        this.filesMap = {};

        const files = this.collection.all().filter(v => {
            if (this.show === 'output') {
                return v.jobType === JobFileType.output;
            }

            return v.jobType === JobFileType.input;
        });

        function splitDirs(path: string): string[] {
            const split = path.split('/');
            split.shift();
            split.pop();
            if (!split.length) {
                return [];
            }
            const directories: string[] = [];

            do {
                let newPath = '/' + split.join('/') + '/';
                if (newPath.endsWith('/')) {
                    newPath = newPath.substr(0, newPath.length - 1);
                }
                directories.push(newPath);
            } while (split.pop() && split.length);

            return directories;
        }

        function dirName(path: string): string {
            if (path.substr(path.length - 1, 1) === '/') {
                path = path.substr(0, path.length - 1);
            }

            const lastIndex = path.lastIndexOf('/');
            if (-1 !== lastIndex) {
                return path.substr(lastIndex + 1);
            }

            return path;
        }

        for (const file of files) {
            const dirPaths = splitDirs(file.getDirectory());

            for (const dirPath of dirPaths) {
                if (!this.filesMap[dirPath]) {
                    this.filesMap[dirPath] = new FileListing(
                        dirName(dirPath),
                        true,
                        dirPath,
                    );
                }
            }

            this.filesMap[file.getFullPath()] = new FileListing(
                file.getName(),
                false,
                file.getFullPath(),
                file.size,
                file.created
            );
        }

        this.updateFiles();
    }
}
