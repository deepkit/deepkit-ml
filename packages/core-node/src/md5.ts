/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import * as crypto from "crypto";
import {readFile} from "fs-extra";

export function getMd5(content: string | Buffer): string {
    const buffer: Buffer = 'string' === typeof content ? Buffer.from(content, 'utf8') : Buffer.from(content);
    const md5 = crypto.createHash('md5').update(buffer).digest('hex');

    if (!md5) {
        throw new Error(`md5 is empty`);
    }

    return md5;
}

export async function getMd5FromFile(path: string): Promise<string> {
    return getMd5(await readFile(path));
}
