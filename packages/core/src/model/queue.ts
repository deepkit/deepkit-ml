/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Entity, f} from "@marcj/marshal";


@Entity('queue-result')
export class QueueResult {
    constructor(
        @f.asName('name')
        public name: string,
        @f.asName('position')
        public position: number,
        @f.asName('result')
        public result: string) {
    }
}
