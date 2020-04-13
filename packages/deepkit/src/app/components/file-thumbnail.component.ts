/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ChangeDetectorRef, Component, Input, OnChanges, SimpleChanges, Output, EventEmitter} from "@angular/core";
import {DeepKitFile} from "@deepkit/core";
import {ControllerClient} from "../providers/controller-client";
import {Progress, StreamBehaviorSubject} from "@marcj/glut-core";
import FileSaver from "file-saver";
import {ClientProgress} from "@marcj/glut-client";

@Component({
    selector: 'dk-file-thumbnail',
    template: `
        <div class="box" [class.active]="dropdown.isOpen" [openDropdown]="dropdown" (click)="loadContent()">
            <ng-container *ngIf="file.isImage()">
                <img *ngIf="data|async as d" [src]="d|objectURL"/>
                <div *ngIf="progress|throttle:10|async as p" class="progress hide-with-animation"
                     [class.fadein]="!p.done">
                    <dui-indicator style="width: 100%" [step]="p.progress"></dui-indicator>
                </div>
            </ng-container>
        </div>
        <div class="title" [title]="file.getName()">
            {{file.getName()}}
        </div>
        <dui-dropdown #dropdown [width]="1200" [height]="400"
                      [scrollbars]="file.isImage()" (hidden)="cd.detectChanges()">
            <ng-container *ngIf="dropdown.isOpen">
                <div style="display: flex; flex-direction: column; height: 100%;">
                    <div style="flex: 0 0 50px;">
                        <div style="display: flex; padding: 3px 12px;">
                            <div class="title text-selection">
                                {{file.getName()}}
                            </div>
                            <dui-button-group style="margin-left: auto" padding="none">
                                <dui-button textured (click)="download()">Download</dui-button>
                                <dui-button *ngIf="remove.observers.length && !readOnly" textured (click)="remove.emit(file)">Delete</dui-button>
                            </dui-button-group>
                        </div>
                        <div style="display: flex; padding: 3px 12px;">
                            <div class="title text-selection">
                                {{file.size|fileSize}}, added {{file.created|date:'d. MMM yy, HH:mm'}}
                            </div>
                        </div>
                    </div>
                    <div style="flex: 1;">
                        <div *ngIf="file.isImage()" style="text-align: center">
                            <img style="max-width: 100%; max-height: 100%" *ngIf="data|async as d" [src]="d|objectURL"/>
                        </div>
                        <ng-container *ngIf="!file.isImage()">
                            <monaco-editor [fileName]="file.getName()" [ngModel]="dataUtf8|async"
                                           [options]="{readOnly: true}"></monaco-editor>
                        </ng-container>
                    </div>
                </div>
            </ng-container>
        </dui-dropdown>
    `,
    styleUrls: ['./file-thumbnail.component.scss']
})
export class FileThumbnailComponent implements OnChanges {
    @Input() file?: DeepKitFile;
    @Input() readOnly: boolean = false;

    @Output() remove = new EventEmitter<DeepKitFile>();

    // data?: Uint8Array;
    data?: StreamBehaviorSubject<Uint8Array | undefined>;
    dataUtf8?: StreamBehaviorSubject<string>;

    progress?: Progress;

    constructor(
        protected controllerClient: ControllerClient,
        public cd: ChangeDetectorRef,
    ) {
    }

    download() {
        if (!this.data || !this.data.value || !this.file) return;

        const blob = new Blob([this.data.value]);
        FileSaver.saveAs(blob, this.file.getName());
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (this.data) {
            this.data.unsubscribe();
            this.data = undefined;
        }
        if (this.dataUtf8) {
            this.dataUtf8.unsubscribe();
            this.dataUtf8 = undefined;
        }
        if (!this.file) return;

        if (this.file.isImage()) {
            this.loadContent();
        }
        this.cd.detectChanges();
    }

    async loadContent() {
        if (!this.file) return;

        if (this.file.issue && !this.data) {
            this.progress = ClientProgress.trackDownload();
            this.cd.detectChanges();
            this.data = await this.controllerClient.issue().subscribeFileContent(this.file.issue, this.file.path);
            if (!this.file.isImage()) {
                this.dataUtf8 = this.data.toUTF8();
            }
        }

        this.cd.detectChanges();
    }
}
