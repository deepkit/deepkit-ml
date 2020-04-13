/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {arrayRemoveItem, CustomError, sleep} from "@marcj/estdlib";
import {ContinuationLocalStorage} from "asyncctx";
import {Subscription} from "rxjs";
import {pathExists, readFile, writeFile} from "fs-extra";

export function isRunning(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return e.code === 'EPERM';
    }
}

/**
 * Returns undefined when lock doesnt exist or pid is not active anymore.
 */
export async function getRunningLockPid(path: string): Promise<number | undefined> {
    if (await pathExists(path)) {
        const pid = parseInt((await readFile(path)).toString('utf8'), 10);
        if (isRunning(pid)) {
            return pid;
        }
    }
}

export async function pidLocker(path = '/tmp/run-deepkit.run', killIfAvailable = false): Promise<void> {
    const activePid = await getRunningLockPid(path);

    if (activePid) {
        if (killIfAvailable) {
            process.kill(activePid, 'SIGINT');
            await sleep(1);
        } else {
            throw new Error('PID file with active process.');
        }
    }

    await writeFile(path, process.pid);
}

export class OnProcessExitEvent {
    public isRecovered = false;

    constructor(public sig: string) {

    }

    public recovered() {
        this.isRecovered = true;
    }
}

type onProcessExitCallback = (event: OnProcessExitEvent) => Promise<void> | void;
type onProcessExitCallbackEmpty = () => Promise<void> | void;

let onProcessExitListeners: onProcessExitCallback[] = [];
let onProcessExitHooked = false;

export function onProcessExit(callback: onProcessExitCallback | onProcessExitCallbackEmpty): Subscription {
    onProcessExitListeners.unshift(callback);

    if (!onProcessExitHooked) {
        onProcessExitHooked = true;

        const oldListener = process.listeners('SIGINT');
        process.removeAllListeners('SIGINT');

        process.once('SIGINT', async (sig) => {
            const event = new OnProcessExitEvent(sig);

            //important to clone the array, since it can get modified by a callback
            const listeners = onProcessExitListeners.slice();
            for (const callback of listeners) {
                await callback(event);
            }

            onProcessExitListeners = [];

            if (!event.isRecovered) {
                for (const l of oldListener) {
                    l(sig);
                }
                return;
            }

            //we're still alive, so register old event listeners
            //and remove ours
            process.removeAllListeners('SIGINT');
            for (const old of oldListener) {
                process.addListener('SIGINT', old);
            }

            onProcessExitHooked = false;
        });
    }

    return new Subscription(() => {
        //register this callback
        onProcessExitListeners.splice(onProcessExitListeners.indexOf(callback), 1);
    });
}

export class ExitError extends CustomError {
}


/**
 * @throws the error from onExit if exists
 */
let counter = 0;

export class CatchSilentState {
    protected exited = false;
    protected childCatches = [];

    constructor(protected error: ExitError) {
    }

    /**
     * Calls this method on every iteration or whenever you want to check if a SIGINT has been issued.
     *
     * It throws internally the ExitError, which exits your callback and calls onExit callback.
     *
     * @throws ExitError when exited
     */
    async check(): Promise<boolean> {
        await sleep(0.00001);

        if (this.exited) {
            throw this.error;
        }

        return !this.exited;
    }

    /**
     * Important to handle loops, so its time to handle the actual SIGINT.
     */
    async isRunning() {
        await sleep(0.00001);

        return !this.exited;
    }

    /**
     * Only suitable for one time checks. Do not use in loops, otherwise it will block forever.
     */
    get running(): boolean {
        return !this.exited;
    }

    _activateExit() {
        this.exited = true;
    }
}

interface CatchSignalContext {
    children: Promise<any>[];
}

let catchSignalStorage: ContinuationLocalStorage<CatchSignalContext> | undefined;
let catchSilentSigintOldListeners: Function[] = [];

export async function catchSilentSigint<T>(callback: (state: CatchSilentState) => Promise<T>, onExit: () => Promise<T>): Promise<T> {
    counter++;

    if (!catchSignalStorage) {
        catchSignalStorage = new ContinuationLocalStorage<CatchSignalContext>();
        catchSignalStorage.setRootContext({children: []});

        //on root call, we remove the original sigint handler.
        catchSilentSigintOldListeners = process.listeners('SIGINT');
        process.removeAllListeners('SIGINT');
    }

    const error = new ExitError('Received SIGINT #' + (++counter));
    const state = new CatchSilentState(error);

    const rootContext = catchSignalStorage!.getRootContext();

    const parentCatchSignalContext = catchSignalStorage.getContext()!;
    if (!parentCatchSignalContext) {
        throw new Error('parent has no context');
    }

    const promise = new Promise<T>((resolve, reject) => {
        process.nextTick(async () => {
            const context: CatchSignalContext = {children: []};
            catchSignalStorage!.setContext(context);

            const listener = async () => {
                state._activateExit();

                //wait for all children handlers
                for (const child of context.children) {
                    await child;
                }

                onExit().then((result) => {
                    resolve(result);
                }, (error) => {
                    reject(error);
                });
            };

            process.prependOnceListener('SIGINT', listener);

            callback(state).then((result) => {
                if (state.running) {
                    resolve(result);
                }

                //if the callback() is executed successfully, there's no need to keep that listener alive
                process.removeListener('SIGINT', listener);
            }, (error) => {
                if (state.running) {
                    reject(error);
                }
            });
        });
    });

    function done() {
        arrayRemoveItem(parentCatchSignalContext.children, promise);

        if (catchSignalStorage && parentCatchSignalContext === rootContext) {
            catchSignalStorage!.dispose();
            catchSignalStorage = undefined;

            //add old listener back
            for (const listener of catchSilentSigintOldListeners) {
                process.addListener('SIGINT', listener as any);
            }
        }
    }

    promise.then(() => {
        done();
    }, () => {
        done();
    });

    parentCatchSignalContext.children.push(promise);

    return promise;
}
