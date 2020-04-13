/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

export interface JobTaskInstancePeerControllerInterface {
    stop(): void;
}

export interface JobDebuggerPeerControllerInterface {
    updateWatchingLayer(): void;
}

export interface JobPeerControllerInterface {
    stop(): void;
}
