/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {LookupOptions} from "dns";
import {hostname} from "os";

const {lookup} = require('dns').promises;

export async function getMyIPAddress(options: LookupOptions = {}): Promise<string> {
    return (await lookup(hostname(), options)).address;
}
