/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {join} from "path";
import {sync as fastGlobSync} from "fast-glob";
import fs from "fs-extra";
import relative from "relative";
import md5File from "md5-file/promise";

interface FindFilesResult {
    [path: string]: { relativePath: string; size: number; md5: string };
}

export async function findFiles(rootDir: string, patterns: string[], ignore: string[]): Promise<FindFilesResult> {
    //default ignores
    ignore.push('**/__pycache__/**');
    ignore.push('**/.git/**');
    ignore.push('**/*.pyc');

    patterns = patterns.map(v => join(rootDir, v));
    ignore = ignore.map(v => join(rootDir, v));

    const filePaths: string[] = await fastGlobSync<string>(patterns, {
        unique: true,
        onlyFiles: false,
        onlyDirectories: false,
        followSymlinkedDirectories: true,
        ignore: ignore,
        markDirectories: true
    });

    const files: FindFilesResult = {};

    for (const filePath of filePaths) {
        const stats = fs.statSync(filePath);
        if (stats) {
            if (stats.isDirectory()) {
                //read all files of it
                const filesInThisDirectory: string[] = await fastGlobSync<string>([join(filePath, '**/*')], {
                    ignore: ignore,
                    onlyFiles: true
                });
                for (const fileInThisDirectory of filesInThisDirectory) {
                    const stats = fs.statSync(fileInThisDirectory);
                    if (stats && !stats.isDirectory()) {
                        const relativePath = relative(rootDir, fileInThisDirectory);
                        files[fileInThisDirectory] = {
                            relativePath: relativePath,
                            size: stats.size,
                            md5: await md5File(fileInThisDirectory)
                        };
                    }
                }
            } else {
                const relativePath = relative(rootDir, filePath);
                files[filePath] = {relativePath: relativePath, size: stats.size, md5: await md5File(filePath)};
            }
        }
    }

    return files;
}
