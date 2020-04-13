/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Component, EventEmitter, Input, Output} from "@angular/core";
import {Buffer} from "buffer";
import {ReactiveChangeDetectionModule} from "../reactivate-change-detection";

@Component({
    selector: 'dk-file',
    template: `
        <input type="file" (change)="handleFileInput($event)" />
    `
})
export class FileComponent {
    @Input() model: ArrayBuffer | undefined;

    @Output() modelChange = new EventEmitter<ArrayBuffer | undefined>();

    constructor() {
    }

    public handleFileInput(event: any) {
        const files = event.target.files;

        const readFont = (file: File) => {
            const reader = new FileReader();

            reader.onload = () => {
                if (reader.result) {
                    if (reader.result instanceof ArrayBuffer) {
                        this.modelChange.next(reader.result);
                        ReactiveChangeDetectionModule.tick();
                    }
                }

            };
            reader.onerror = (error) => {
                console.log('Error: ', error);
            };

            reader.readAsArrayBuffer(file);
        };

        for (let i = 0; i < files.length; i++) {
            const file = files.item(i);
            if (file) {
                readFont(file);
            }
        }
    }

}
