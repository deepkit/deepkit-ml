/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnChanges,
    OnDestroy,
    Output,
    SimpleChanges,
    ViewChild
} from "@angular/core";
import {ControllerClient} from "../../../providers/controller-client";
import {Project, selectSourceFolder, SourceFile} from "@deepkit/core";
import {arrayRemoveItem, eachPair} from "@marcj/estdlib";
import {observe, unsubscribe} from "../../../reactivate-change-detection";
import {Collection, EntitySubject, StreamBehaviorSubject} from "@marcj/glut-core";
import {editor, Uri} from "monaco-editor";
import {BehaviorSubject, Subscription} from "rxjs";
import {LocalStorage} from "ngx-store";
import {DropdownComponent, DuiDialog} from "@marcj/angular-desktop-ui";


export const savedContent: { [projectId: string]: { [path: string]: string | undefined } } = {};
export const models: { [projectId: string]: { [path: string]: editor.ITextModel | undefined } } = {};

@Component({
    selector: 'dk-source-directory-item',
    template: `
        <div class="file"
             [class.selected]="selected.value && selected.value.path === file.path"
             (mousedown)="mouseDown(file, $event)"
             [style.paddingLeft.px]="depth * 12"
        >
            <dui-icon
                [style.visibility]="file.dir ? 'visible' : 'hidden'"
                (mousedown)="$event.preventDefault(); $event.stopPropagation(); toggleChildren.emit(file);"
                [name]="openFolder[file.path] ? 'triangle_down' : 'triangle_right'"></dui-icon>

            <dui-icon [name]="file.dir ? 'folder' : 'file'"></dui-icon>
            <div class="title">
                {{file.getName()}}
            </div>
            <span class="icons"
                  *ngIf="models[file.path] && savedContent[file.path] !== models[file.path]!.getValue()">
                M
            </span>
        </div>
    `,
    styleUrls: ['./project-source-directory-item.component.scss']
})
export class SourceDirectoryItemComponent implements OnDestroy {
    @Input() depth: number = 1;

    @Input() file!: SourceFile;

    @observe()
    @Input() selected!: BehaviorSubject<SourceFile>;

    @Input() models: { [path: string]: editor.ITextModel | undefined } = {};

    @Input() savedContent: { [path: string]: string | undefined } = {};

    @Input() openFolder: { [path: string]: boolean } = {};

    @Output() rightClick = new EventEmitter<{ file: SourceFile, event: MouseEvent }>();
    @Output() toggleChildren = new EventEmitter<SourceFile>();

    public mouseDown(file: SourceFile, event: MouseEvent) {
        this.selectFile(file);

        if (event.button === 2) {
            event.stopPropagation();
            event.preventDefault();
            this.rightClick.emit({file, event});
        }
    }

    public selectFile(file: SourceFile) {
        this.selected.next(file);
    }

    ngOnDestroy() {

    }
}

@Component({
    selector: 'dk-source-directory-listing',
    template: `
        <div *ngFor="let file of sort(files|async)" class="file">
            <dk-source-directory-item
                [models]="models" [savedContent]="savedContent"
                (rightClick)="rightClick.emit($event)"
                [file]="file"
                [depth]="depth + 1"
                (toggleChildren)="toggleChildren.emit($event)"
                [openFolder]="openFolder"
                [selected]="selected"
            ></dk-source-directory-item>
            <div *ngIf="openFolder[file.path]">
                <dk-source-directory-listing [models]="models" [savedContent]="savedContent"
                                             (rightClick)="rightClick.emit($event)" [openFolder]="openFolder"
                                             (toggleChildren)="toggleChildren.emit($event)"
                                             [dropContainer]="dropContainer"
                                             [projectDir]="projectDir"
                                             [projectId]="projectId" [depth]="depth + 1" [path]="file.path"
                                             [selected]="selected"></dk-source-directory-listing>
            </div>
        </div>
    `,
    styleUrls: ['./project-source-directory-listing.component.scss']
})
export class SourceDirectoryListingComponent implements OnChanges, OnDestroy {
    @Input() depth: number = 1;
    @Input() projectDir: string = '';
    @Input() projectId: string = '';
    @Input() path: string = '';
    @Input() models: { [path: string]: editor.ITextModel | undefined } = {};
    @Input() savedContent: { [path: string]: string | undefined } = {};
    @Input() dropContainer: any;

    @Input() openFolder: { [path: string]: boolean } = {};

    @observe()
    @Input() selected!: BehaviorSubject<SourceFile>;

    @Output() rightClick = new EventEmitter();
    @Output() toggleChildren = new EventEmitter<SourceFile>();

    @observe({unsubscribe: true})
    public files?: Collection<SourceFile>;


    constructor(
        protected controllerClient: ControllerClient,
        protected cd: ChangeDetectorRef,
    ) {
    }

    ngOnDestroy() {
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
        return files;
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (changes.path || changes.projectId || changes.projectDir) {
            this.files = await this.controllerClient.getLocalApi().subscribeSourceFiles(this.projectId, this.path);

            let lastPaths: string[] = [];

            this.files.subscribe((v) => {
                const newPaths = v.map(v => v.path);

                for (const path of newPaths) {
                    arrayRemoveItem(lastPaths, path);
                }

                //last items in lastPaths are the removed ones.
                for (const path of lastPaths) {
                    if (path.startsWith(this.path) && this.models[path]) {
                        // this.models[path]!.dispose();
                        delete this.models[path];
                        delete this.savedContent[path];
                    }
                }

                lastPaths = newPaths;

            });
            this.cd.detectChanges();
        }
    }
}

@Component({
    selector: 'dk-project-source',
    template: `
        <dui-menu role="fileMenu">
            <dui-menu-item label="Save" accelerator="CmdOrCtrl+S" (click)="saveFiles()"></dui-menu-item>
        </dui-menu>

        <dui-dropdown #contextMenu>
            <dui-dropdown-item *ngIf="rightClickFile && rightClickFile.dir" (click)="createFile()">New file
            </dui-dropdown-item>
            <dui-dropdown-item *ngIf="rightClickFile && rightClickFile.dir" (click)="createFolder()">New folder
            </dui-dropdown-item>
            <dui-dropdown-item (click)="rename()">Rename</dui-dropdown-item>
            <dui-dropdown-splitter></dui-dropdown-splitter>
            <dui-dropdown-item confirm="Really delete that file?" (click)="delete()">Delete</dui-dropdown-item>
        </dui-dropdown>

        <ng-container *ngIf="init">
            <div *ngIf="!projectSourceFolder" style="padding: 5px; text-align: center; flex: 1;">
                No source directory assigned to this project.

                <dui-button (click)="assignDirectory()">Assign source</dui-button>
            </div>

            <ng-container *ngIf="projectSourceFolder">
                <div class="sidebar" [style.width.px]="sidebarWidth">
                    <div class="container overlay-scrollbar-small">
                        <div class="table">
                            <dk-source-directory-item
                                [models]="models"
                                [savedContent]="savedContent"
                                (rightClick)="rightClick($event)"
                                [file]="rootFile"
                                [depth]="1"
                                [openFolder]="{'/': true}"
                                [selected]="selected"
                            ></dk-source-directory-item>
                            <dk-source-directory-listing [models]="models" [savedContent]="savedContent"
                                                         (rightClick)="rightClick($event)"
                                                         [openFolder]="openFolder"
                                                         (toggleChildren)="toggleChildren($event)"
                                                         [projectId]="project$.id" [path]="'/'"
                                                         [projectDir]="projectSourceFolder"
                                                         [selected]="selected"></dk-source-directory-listing>
                        </div>
                    </div>
                    <dui-splitter position="right"
                                  (modelChange)="sidebarWidth = $event; cd.detectChanges()"></dui-splitter>
                </div>

                <div class="editor">
                    <monaco-editor
                        *ngIf="selected.value"
                        [hidden]="models[selected.value.path] === undefined"
                        [options]="{}"
                        [textModel]="models[selected.value.path]"
                    ></monaco-editor>
                </div>
            </ng-container>
        </ng-container>
    `,
    styleUrls: ['./project-source.component.scss']
})
export class ProjectSourceComponent implements OnChanges, OnDestroy {
    @Input() project$!: EntitySubject<Project>;
    @Input() public readOnly: boolean = false;

    @ViewChild('contextMenu', {static: false}) contextMenu?: DropdownComponent;

    @LocalStorage('sources-sidebar')
    public sidebarWidth = 250;

    @unsubscribe()
    private fileContentSubject?: StreamBehaviorSubject<string>;

    selected = new BehaviorSubject<SourceFile | undefined>(undefined);

    @unsubscribe()
    lastSelectedSub?: Subscription;

    @unsubscribe()
    folderChange?: StreamBehaviorSubject<string>;

    public projectSourceFolder: string = '';

    public savedContent: { [path: string]: string | undefined } = {};
    public models: { [path: string]: editor.ITextModel | undefined } = {};
    public fileName?: string;

    public init = false;

    public rootFile = new SourceFile('/', true, 0, new Date, new Date);
    public openFolder: { [path: string]: boolean } = {};

    public loadedFilePath = '';
    public rightClickFile?: SourceFile;

    constructor(
        protected dialog: DuiDialog,
        public cd: ChangeDetectorRef,
        protected controllerClient: ControllerClient,
    ) {
    }

    protected saveOpenFolder() {
        localStorage.setItem('deepkit/sources/' + this.project$.id, JSON.stringify(this.openFolder));
    }

    ngOnDestroy(): void {
        // for (const model of each(this.models)) {
        //     model!.dispose();
        // }
        console.log('this.openFolder', this.openFolder);
        this.saveOpenFolder();
    }

    toggleChildren(file: SourceFile) {
        this.openFolder[file.path] = !this.openFolder[file.path];
        this.saveOpenFolder();
        this.cd.detectChanges();
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (changes.project$) {
            if (!models[this.project$.id]) {
                models[this.project$.id] = {};
                savedContent[this.project$.id] = {};
            }
            this.projectSourceFolder = '';

            try {
                this.openFolder = JSON.parse(localStorage.getItem('deepkit/sources/' + this.project$.id)!) || {};
            } catch (error) {
            }

            this.models = models[this.project$.id];
            this.savedContent = savedContent[this.project$.id];

            this.folderChange = await this.controllerClient.getLocalApi().subscribeFolderChange(this.project$.id);
            this.folderChange.subscribe(v => {
                this.loadFolder();
            });

            this.loadFolder();
        }
    }

    protected async loadFolder() {
        this.projectSourceFolder = await this.controllerClient.getLocalApi().getSourceFolder(this.project$.id);
        console.log('project folder', this.projectSourceFolder);
        this.fileContentSubject = undefined;
        this.rootFile.customName = this.project$.value.name;
        this.init = true;
        this.selected.next(undefined);
        this.loadedFilePath = '';
        this.lastSelectedSub = this.selected.subscribe((v) => {
            if (v) {
                this.selectFile(v);
            }
        });
        this.cd.detectChanges();
    }

    public rightClick(event: { file: SourceFile, event: MouseEvent }) {
        this.rightClickFile = event.file;
        if (this.contextMenu) {
            this.contextMenu.open(event.event);
        }
    }

    public async createFile() {
        const a = await this.dialog.prompt(
            'New file',
            '',
            '',
            {width: 350},
        );

        if (a) {
            await this.controllerClient.getLocalApi().createSourceFile(
                this.project$.id,
                (this.rightClickFile!.path === '/' ? '/' : this.rightClickFile!.path + '/') + a,
                ''
            );
        }
    }

    public async createFolder() {
        const a = await this.dialog.prompt(
            'New folder',
            '',
            '',
            {width: 350},
        );

        if (a) {
            await this.controllerClient.getLocalApi().createSourceFolder(
                this.project$.id,
                (this.rightClickFile!.path === '/' ? '/' : this.rightClickFile!.path + '/') + a
            );
        }
    }

    public async rename() {
        const a = await this.dialog.prompt(
            'Rename file',
            this.rightClickFile!.getName(),
            '',
            {width: 350},
        );

        if (a) {
            await this.controllerClient.getLocalApi().renameSourceFile(
                this.project$.id,
                this.rightClickFile!.path,
                this.rightClickFile!.rename(a),
            );
        }
    }

    public async delete() {
        await this.controllerClient.getLocalApi().deleteSourceFile(
            this.project$.id,
            this.rightClickFile!.path,
        );
    }

    public async selectFile(file: SourceFile) {
        if (this.loadedFilePath === file.path) {
            return;
        }

        if (this.fileContentSubject) {
            await this.fileContentSubject.unsubscribe();
        }

        this.loadedFilePath = file.path;
        this.fileName = undefined;

        if (!file.dir) {
            this.fileName = file.path;
            this.fileContentSubject = (await this.controllerClient.getLocalApi().subscribeSourceFileContent(this.project$.id, file.path)).toUTF8();
            this.fileContentSubject.activateNextOnAppend();

            if (!this.models[file.path]) {
                const uri = Uri.file('project:' + this.project$.id + '/' + this.fileName || '');
                this.models[file.path] = editor.createModel('', undefined, uri);
            }

            this.fileContentSubject.subscribe((v) => {
                if (this.models[file.path] && this.savedContent[file.path] !== v) {
                    this.models[file.path]!.setValue(v || '');
                    this.savedContent[file.path] = v;
                    this.cd.detectChanges();
                }

            });
        }

        this.cd.detectChanges();
    }


    public async saveFiles() {
        for (const [path, model] of eachPair(this.models)) {
            if (model!.getValue() !== this.savedContent[path]) {
                await this.controllerClient.getLocalApi().saveSourceFileContent(this.project$.id, path, model!.getValue() || '');
                this.savedContent[path] = model!.getValue();
            }
        }
        this.cd.detectChanges();
    }

    public async assignDirectory() {
        const {path, bookmark} = await selectSourceFolder();
        if (!path) return;

        const project = await this.controllerClient.app().getProjectForId(this.project$.id);
        if (!project) throw new Error('No project found');

        await this.controllerClient.getLocalApi().setSourceFolder(this.controllerClient.getAccountId(), this.project$.id, '', path, project.name, bookmark);
        this.loadFolder();
    }
}
