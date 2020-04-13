/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Component, EventEmitter, Input, Output} from "@angular/core";
import {UniversalComment} from "@deepkit/core";
import {ControllerClient} from "../providers/controller-client";

@Component({
    selector: 'dk-comment',
    template: `
        <div class="title ">
            <div class="name text-light">
                <dk-user-small [userId]="comment.userId"></dk-user-small> - {{comment.created|date:'d. MMM yy, HH:mm'}}
            </div>

            <div class="actions">
                <dui-icon name="edit" clickable (click)="startEditing()" title="Edit"></dui-icon>
                <dui-icon name="garbage" clickable (click)="removed.emit(comment)" title="Delete"></dui-icon>
            </div>
        </div>
        <div class="content">
            <dk-text-editor [viewOnly]="!edit" [(ngModel)]="comment.content"></dk-text-editor>
            <div *ngIf="edit" style="margin-top: 3px;">
                <dui-button textured (click)="cancelEditing()">Cancel</dui-button>
                <dui-button textured (click)="edited.emit(comment); edit = false;">Save</dui-button>
            </div>
        </div>
    `, styles: [`
        :host {
            display: block;
            margin: 12px 0;
        }

        .actions {
            opacity: 0;
            margin-left: auto;
        }

        :host:hover .actions {
            opacity: 1;
        }

        .title {
            margin-left: 8px;
            margin-bottom: 4px;
            font-weight: 500;
            display: flex;
        }

        .content {
            background: var(--panel-background);
            margin-top: 1px;
            border-radius: 4px;
            padding: 10px 8px;
        }

    `]
})
export class CommentComponent {
    @Input() comment!: UniversalComment;
    @Input() editable?: boolean;
    @Input() removable?: boolean;

    oldContent = [];

    @Output() removed = new EventEmitter<UniversalComment>();

    @Output() edited = new EventEmitter<UniversalComment>();

    edit = false;

    constructor(public controllerClient: ControllerClient) {
    }

    isEditable(): boolean {
        if (!this.comment) return false;
        if (undefined !== this.editable) return this.editable;

        return this.comment.userId === this.controllerClient.getAuthenticatedUser().id || this.controllerClient.isAdmin();
    }

    isRemovable(): boolean {
        if (!this.comment) return false;
        if (undefined !== this.removable) return this.removable;

        return this.comment.userId === this.controllerClient.getAuthenticatedUser().id || this.controllerClient.isAdmin();
    }

    startEditing() {
        this.oldContent = JSON.parse(JSON.stringify(this.comment.content));
        this.edit = true;
    }

    cancelEditing() {
        this.comment.content = this.oldContent;
        this.edit = false;
    }
}
