/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

export class ServerSettings {
    serverMode: boolean = false;

    swarmMasterAddress?: string;
    swarmJoinWorkerToken?: string;

    localIp?: string;
    publicIp?: string;
}
