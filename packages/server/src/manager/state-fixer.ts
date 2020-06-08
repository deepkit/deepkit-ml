/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ClusterNode, ClusterNodeStatus, Job} from "@deepkit/core";
import {Database} from "@marcj/marshal-mongo";
import {Injectable} from "injection-js";
import {Exchange} from "@marcj/glut-server";

@Injectable()
export class StateFixer {
    constructor(
        protected database: Database,
        protected exchange: Exchange,
    ) {
    }

    public async startFixStates() {
        await this.database.query(ClusterNode).filter({connected: true}).patchMany({connected: false, status: ClusterNodeStatus.offline});
        await this.database.query(Job).filter({connections: {$gt: 0}}).patchMany({connections: 0});
    }
}
