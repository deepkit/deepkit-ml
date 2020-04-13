/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Entity, f} from "@marcj/marshal";
import {GlutFile} from "@marcj/glut-core";

export enum JobFileType {
    input = 0,
    output = 1,
    internal = 2,
}

@Entity('deepkitFile')
export class DeepKitFile extends GlutFile {
    @f.uuid().optional()
    project?: string;

    @f.uuid().optional().index()
    job?: string;

    @f.uuid().optional().index()
    issue?: string;

    @f.optional()
    task?: string;

    @f.optional()
    instance?: number;

    @f.uuid().optional().index()
    node?: string;

    @f.enum(JobFileType).index()
    jobType: JobFileType = JobFileType.input;

    @f.any().optional()
    meta: any;

    isImage(): boolean {
        return this.path.endsWith('.png') || this.path.endsWith('.jpg')
            || this.path.endsWith('.jpeg') || this.path.endsWith('.gif') || this.path.endsWith('.');
    }

    getExtension() {
        const name = this.getName();
        const lastDot = name.lastIndexOf('.');
        return lastDot === -1 ? '' : name.substr(lastDot + 1);
    }

    getNameWithoutExtension() {
        const name = this.getName();
        const lastDot = name.lastIndexOf('.');
        return lastDot === -1 ? name : name.substr(0, lastDot);
    }
}
