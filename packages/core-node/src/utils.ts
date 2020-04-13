/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import * as fs from "fs-extra";
import {join, resolve} from "path";

export async function findParentPath(path: string, origin: string = __dirname): Promise<string> {
    let current = origin;

    while (!await fs.pathExistsSync(join(current, path))) {
        const nextFolder = resolve(current, '..');

        if (nextFolder === current) {
            throw new Error(`Path '${path}' not found in parents of ${origin}`);
        }

        current = nextFolder;
    }

    return join(current, path);
}
