/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {SocketClient} from "@marcj/glut-client";
import {HomeAccountConfig} from "./model/home";
import {registerModels} from "./register-models";

//necessary to work around stuff like "Fatal: Entity FrontendUser not known."
registerModels();

export function createJobSocketClient(
    config: HomeAccountConfig,
    job: string,
    jobAccessToken: string,
): SocketClient {
    return new SocketClient({
        host: config.host,
        port: config.port,
        ssl: config.ssl,
        token: {
            id: 'job',
            token: jobAccessToken,
            job: job
        }
    });
}

export function createNodeSocketClient(config: HomeAccountConfig, id: string, token: string): SocketClient {
    return new SocketClient({
        host: config.host,
        port: config.port,
        ssl: config.ssl,
        token: {
            id: 'node',
            nodeId: id,
            token: token
        }
    });
}

export function createUserSocketClient(config: HomeAccountConfig, organisation: string = ''): SocketClient {
    return new SocketClient({
        host: config.host,
        port: config.port,
        ssl: config.ssl,
        token: {
            id: 'user',
            token: config.token,
            organisation: organisation
        }
    });
}

export function createAnonSocketClient(config: HomeAccountConfig): SocketClient {
    return new SocketClient({
        host: config.host,
        port: config.port,
        ssl: config.ssl,
    });
}
