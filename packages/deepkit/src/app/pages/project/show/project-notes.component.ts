/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    AfterViewInit,
    ChangeDetectorRef,
    Component,
    Input,
    OnChanges,
    OnDestroy,
    SimpleChanges,
    ViewChild
} from "@angular/core";
import {Collection, EntitySubject} from "@marcj/glut-core";
import {ControllerClient} from "../../../providers/controller-client";
import {Note, Project} from "@deepkit/core";
import {observe} from "../../../reactivate-change-detection";
import {LocalStorage} from "ngx-store";
import {detectChangesNextFrame, ViewState} from "@marcj/angular-desktop-ui";
import {TextEditorChangeEvent, TextEditorComponent} from "../../../components/text-editor.component";
import {interval, Subject, Subscription} from "rxjs";
import {auditTime} from "rxjs/operators";

@Component({
    selector: 'dk-project-notes',
    template: `
        <dui-window-toolbar *ngIf="viewState.attached && !readOnly" for="main">
            <dui-button-group padding="none">
                <dui-button textured (click)="addNote()" icon="add"></dui-button>
            </dui-button-group>
        </dui-window-toolbar>

        <dui-window-toolbar *ngIf="viewState.attached && !readOnly" for="main_right">
            <dui-button-group padding="none">
                <dui-button textured confirm="Delete selected note?" [disabled]="!note" (click)="deleteNote()"
                            icon="garbage"></dui-button>
            </dui-button-group>
        </dui-window-toolbar>

        <dui-list [ngModel]="note ? note.id : undefined" (ngModelChange)="loadNote($event)"
                  [style.width.px]="sidebarWidth"
                  delimiterLine
        >
            <dui-splitter position="right" (modelChange)="sidebarWidth = $event; cd.detectChanges()"></dui-splitter>

            <ng-container *ngIf="notes|async as list">
                <dui-list-item
                    *ngFor="let note of list"
                    [value]="note.id">
                    <div style="font-weight: 600; margin-bottom: 5px;">{{note.title}}</div>
                    {{note.updated|date:'d. MMM yy, HH:mm'}}
                </dui-list-item>
            </ng-container>
        </dui-list>
        <div class="editor" [style.display]="note ? 'block': 'none'" [class.read-only]="readOnly">
            <dk-text-editor #editor [historyId]="modelPath" transparent
                            [applyDelta]="applyDelta"
                            [viewOnly]="readOnly"
                            (selection)="onSelection.next($event)"
                            (fullChange)="setContent($event)"></dk-text-editor>
        </div>
    `,
    styleUrls: ['./project-notes.component.scss']
})
export class ProjectNotesComponent implements OnChanges, OnDestroy, AfterViewInit {
    @Input() project$!: EntitySubject<Project>;
    @Input() public readOnly: boolean = false;

    @ViewChild('editor', {static: true}) editor?: TextEditorComponent;

    @LocalStorage('notes-sidebar')
    public sidebarWidth = 250;

    @observe({unsubscribe: true})
    public notes?: Collection<Note>;

    @observe()
    public note?: EntitySubject<Note>;

    readonly viewState = new ViewState;

    applyDelta: Subject<any[]> = new Subject<any[]>();

    protected lastEntitySub?: Subscription;
    protected lastEntityCursorsSub?: Subscription;
    protected noteObservableSub?: Subscription;

    modelPath: string = '';
    protected activeCursors: { [sessionId: string]: any } = {};

    public onSelection = new Subject<any>();

    constructor(
        public cd: ChangeDetectorRef,
        protected controllerClient: ControllerClient,
    ) {
        this.onSelection.pipe(auditTime(60)).subscribe(async (event: any) => {
            if (!this.note) return;
            if (!event) return;
            if (this.readOnly) return;
            await this.controllerClient.note().updateCursor(this.note.id, event);
        });
    }

    ngAfterViewInit() {
    }

    getNote() {
    }

    async deleteNote() {
        const note = this.getNote();
        if (this.note) {
            await this.controllerClient.note().deleteNote(this.project$.id, this.note.id);
            this.note = undefined;
            detectChangesNextFrame(this.cd);
        }
    }

    async ngOnDestroy() {
        if (this.noteObservableSub) this.noteObservableSub.unsubscribe();

        if (this.note && !this.readOnly) {
            await this.controllerClient.note().updateCursor(this.note.id, undefined);
        }
    }

    async setContent(event: TextEditorChangeEvent) {
        if (this.note) {
            const content = event.innerText;
            const linebreak = content.indexOf('\n');
            this.note.value.title = content.substr(0, linebreak <= 0 ? 15 : linebreak);
            this.note.value.updated = new Date;

            this.controllerClient.note().patchNote(this.project$.id, this.note.id, {
                title: this.note.value.title,
                updated: this.note.value.updated,
            });

            this.controllerClient.note().applyDeltas(this.note.id, event.delta.ops);
        }
    }

    async loadNote(noteId: string) {
        if (this.noteObservableSub) this.noteObservableSub.unsubscribe();
        this.modelPath = 'note/' + noteId;

        if (this.note && !this.readOnly) {
            await this.controllerClient.note().updateCursor(this.note.id, undefined);
        }
        this.note = this.notes!.getEntitySubject(noteId);

        if (this.lastEntitySub) this.lastEntitySub.unsubscribe();
        if (this.lastEntityCursorsSub) this.lastEntityCursorsSub.unsubscribe();

        if (this.editor) {
            this.activeCursors = {};
            const cursors: any = this.editor.quill!.getModule('cursor');
            cursors.clearCursors();
        }

        //necessary to tell text-editor to reset content
        this.applyDelta = new Subject<any[]>();
        this.cd.detectChanges();

        let first = true;
        this.noteObservableSub = (await this.controllerClient.note().noteObservable(noteId)).subscribe((ops) => {
            this.applyDelta.next(ops);

            if (first) {
                first = false;
                setTimeout(() => {
                    if (this.note) {
                        this.lastEntitySub = this.note.subscribe(() => {
                            this.updateCursors();
                        });
                        this.lastEntityCursorsSub = interval(1000).subscribe(() => {
                            this.updateCursors();
                        });
                    }
                }, 100);
            }
        });
    }

    protected updateCursors() {
        if (!this.editor) return;
        if (!this.note) return;
        const cursors: any = this.editor.quill!.getModule('cursor');

        const keys = new Set(Object.keys(this.activeCursors));
        for (const [id, value] of Object.entries(this.note.value.cursor)) {
            if (id === this.controllerClient.sessionId) continue;

            // console.log('update cursor', Date.now() - value.time, value);
            if (Date.now() - value.time > 60000) {
                continue;
            }

            if (!this.activeCursors[id]) {
                this.activeCursors[id] = {
                    time: value.time,
                    cursor: cursors.createCursor(id, value.username, 'red')
                };
                cursors.moveCursor(id, {...value.range});
            } else {
                if (this.activeCursors[id].time !== value.time) {
                    //value.range will be changed directly to improve movement tracking for low latency
                    cursors.moveCursor(id, {...value.range});
                }
            }
            // cursors.toggleFlag(id, true);
            keys.delete(id);
        }

        // console.log('updateCursors', this.activeCursors, this.note.value.cursor);
        // all remaining keys are not valid anymore
        for (const id of keys) {
            cursors.removeCursor(id);
            delete this.activeCursors[id];
        }

        // cursors.update();
        // console.log('cursors', cursors.cursors());
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (changes.project$) {
            this.modelPath = '';
            //necessary to tell text-editor to reset content
            this.applyDelta = new Subject<any[]>();
            this.modelPath = '';
            this.note = undefined;
            if (this.lastEntitySub) this.lastEntitySub.unsubscribe();
            if (this.lastEntityCursorsSub) this.lastEntityCursorsSub.unsubscribe();
            if (this.noteObservableSub) this.noteObservableSub.unsubscribe();
            this.cd.detectChanges();

            this.notes = await this.controllerClient.note().getNotes(this.project$.id);
            detectChangesNextFrame(this.cd);
        }
    }

    public async addNote() {
        const note = new Note(this.project$.id);
        await this.controllerClient.note().addNote(note);
        this.cd.detectChanges();
    }
}
