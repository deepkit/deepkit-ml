/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {basename, resolve} from 'path';

export function getDistPath(): string {
    //__dirname = bude/deepkit/packages/cli/dist, for dist build
    //__dirname = budbude/deepkit/packages/cli/src, for ts-node

    return __dirname;

    if (basename(__dirname) === 'dist') {
        return __dirname;
    }

    return resolve(__dirname, '../dist');
}
