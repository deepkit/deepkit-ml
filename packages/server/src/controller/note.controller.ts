/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Action, Collection, Controller} from "@marcj/glut-core";
import {DeepKitFile, Note, NoteControllerInterface, RoleType} from "@deepkit/core";
import {Role} from "../utils";
import {ServerSettings} from "../model/server";
import {SessionHelper} from "../session";
import {Database} from "@marcj/marshal-mongo";
import {EntityStorage, Exchange, ExchangeDatabase, FS} from "@marcj/glut-server";
import {ResourcesManager} from "../node/resources";
import {SessionPermissionManager} from "../manager/session-permission";
import {Observable, Subscription} from "rxjs";
import {f} from "@marcj/marshal";
import Delta from 'quill-delta';
import {SimplePatches} from "@deepkit/core";

@Controller('note')
export class NoteController implements NoteControllerInterface {
    protected usedNotes = new Set<string>();

    constructor(
        private serverSettings: ServerSettings,
        private sessionHelper: SessionHelper,
        private database: Database,
        private exchangeDatabase: ExchangeDatabase,
        private exchange: Exchange,
        private entityStorage: EntityStorage,
        private resources: ResourcesManager,
        private fs: FS<DeepKitFile>,
        private permission: SessionPermissionManager,
    ) {
    }

    public async destroy() {
        for (const noteId of this.usedNotes) {
            await this.exchangeDatabase.patch(Note, noteId, {
                ['cursor.' + this.sessionHelper.getUserSession().id]: undefined
            });
        }
    }

    @Action()
    @Role(RoleType.anonymouse)
    @f.type(Observable).template('any')
    async noteObservable(noteId: string): Promise<Observable<any>> {
        const projectId = await this.permission.checkNoteReadAccess(noteId);

        return new Observable<any>((observer) => {
            let running = true;
            let sub1: Subscription | undefined;

            (async () => {
                const lock = await this.exchange.lock('note/apply-delta/' + noteId);
                //lock first, so we don't get a read-file, apply-delta race-condition

                try {
                    if (!running) return;

                    const buffer = (await this.fs.read('note/' + noteId + '.json', {
                        project: projectId,
                    }));
                    const text = buffer ? buffer.toString('utf8') : '[]';
                    observer.next(JSON.parse(text));

                    sub1 = this.exchange.subscribe('note/deltas/' + noteId, (message: { sessionId: string, deltas: any[] }) => {
                        if (this.sessionHelper.hasSession() && message.sessionId === this.sessionHelper.getUserSession().id) return;
                        observer.next(message.deltas);
                    });
                } finally {
                    lock.unlock();
                }
            })();

            return {
                unsubscribe(): void {
                    running = false;
                    if (sub1) sub1.unsubscribe();
                }
            };
        });
    }

    @Action()
    @Role(RoleType.regular)
    async updateCursor(noteId: string, @f.any().optional() range: any) {
        await this.permission.checkNoteWriteAccess(noteId);

        if (range) {
            this.usedNotes.add(noteId);
            await this.exchangeDatabase.patch(Note, noteId, {
                ['cursor.' + this.sessionHelper.getUserSession().id]: {
                    time: Date.now(),
                    username: this.sessionHelper.getUserSession().username,
                    range: range
                }
            });
        } else {
            this.usedNotes.delete(noteId);
            await this.exchangeDatabase.patch(Note, noteId, {
                ['cursor.' + this.sessionHelper.getUserSession().id]: undefined
            });
        }
    }

    @Action()
    @Role(RoleType.regular)
    async applyDeltas(noteId: string, @f.array('any') deltaOps: any[]) {
        const projectId = await this.permission.checkNoteWriteAccess(noteId);

        const lock = await this.exchange.lock('note/apply-delta/' + noteId);

        try {
            const buffer = await this.fs.read('note/' + noteId + '.json', {
                project: projectId,
            });
            const currentDelta = (buffer ? JSON.parse(buffer.toString('utf8')) : []);
            const delta = new Delta(currentDelta);
            const other = new Delta(deltaOps);
            const newDelta = delta.compose(other);

            await this.fs.write('note/' + noteId + '.json', JSON.stringify(newDelta.ops), {
                project: projectId
            });

            await this.exchange.publish('note/deltas/' + noteId, {
                sessionId: this.sessionHelper.getUserSession().id,
                deltas: deltaOps
            });

        } finally {
            lock.unlock();
        }
    }

    private getUserId(): string {
        return this.sessionHelper.getUserSession().chosenOrganisationOrUserId;
    }

    @Action()
    @Role(RoleType.anonymouse)
    async getNotes(projectId: string): Promise<Collection<Note>> {
        await this.permission.checkProjectReadAccess(projectId);

        return this.entityStorage.collection(Note).filter({
            projectId: projectId,
        }).find();
    }
    @Action()
    @Role(RoleType.regular)
    async deleteNote(projectId: string, noteId: string): Promise<void> {
        await this.permission.checkProjectWriteAccess(projectId);

        const note = await this.database.query(Note).filter({id: noteId, projectId: projectId}).has();
        if (note) {
            await this.exchangeDatabase.remove(Note, noteId);
        }
    }

    @Action()
    @Role(RoleType.regular)
    async addNote(note: Note): Promise<void> {
        await this.permission.checkProjectWriteAccess(note.projectId);
        note.owner = this.getUserId();
        await this.exchangeDatabase.add(note);
    }

    @Action()
    @Role(RoleType.regular)
    async patchNote(projectId: string, noteId: string, @f.partial(Note) patches: SimplePatches): Promise<void> {
        await this.permission.checkProjectWriteAccess(projectId);
        delete patches['owner'];
        delete patches['projectId'];
        await this.exchangeDatabase.patch(Note, noteId, patches);
    }

    @Action()
    @Role(RoleType.anonymouse)
    @f.any()
    async readNote(projectId: string, noteId: string): Promise<any[]> {
        await this.permission.checkProjectReadAccess(projectId);
        const buffer = (await this.fs.read('note/' + noteId + '.json', {
            project: projectId,
        }));
        return buffer ? JSON.parse(buffer.toString('utf8')) : [];
    }

}
