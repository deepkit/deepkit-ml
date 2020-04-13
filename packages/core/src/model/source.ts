/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Entity, f} from "@marcj/marshal";

@Entity('source_file')
export class SourceFile {
    @f
    version: number = 0;

    public customName = '';

    constructor(
        @f.asName('id') public id: string,
        @f.asName('dir') public dir: boolean,
        @f.asName('size') public size: number,
        @f.asName('created') public created: Date,
        @f.asName('updated') public updated: Date,
    ) {
    }

    get path() {
        return this.id;
    }

    public getFullPath(): string {
        return '/' + this.path;
    }

    public rename(newName: string): string {
        return this.path.substr(0, this.path.length - this.getName().length) + newName;
    }

    public getName(): string {
        if (this.customName) return this.customName;

        const fullPath = '/' + this.path;

        return fullPath.substr(fullPath.lastIndexOf('/') + 1);
    }

    /**
     * Returns always leading slash and trailing slash.
     */
    public getDirectory(): string {
        const fullPath = '/' + this.path;

        return fullPath.substr(0, fullPath.lastIndexOf('/') + 1);
    }

    /**
     * Name without slashes.
     */
    public getDirectoryName(): string {
        const fullPath = '/' + this.path;
        const dirPath = fullPath.substr(0, fullPath.lastIndexOf('/'));

        return dirPath.substr(dirPath.lastIndexOf('/') + 1);
    }

    /**
     * Checks whether this file is in given directory.
     *
     * @param dir with leading slash and trailing slash. Same as getDirectory().
     */
    public inDirectory(dir: string = '/'): boolean {
        return this.getDirectory() === dir;
    }
}
