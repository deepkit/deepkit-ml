/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

/**
 * Makes sure that given `call` is not more frequently called than cps/seconds. cps=5 means 5 times per seconds max.
 *
 * @example const throttled = ThrottleTime(async () => { console.log('do it') }); throttled(); throttled(); ...
 *
 */
import {eachKey, isObject, ClassType} from "@marcj/estdlib";

export function ThrottleTime(call: Function, cps = 5): (...args: any[]) => void {
    let last = Date.now();
    let dirty = false;
    let lastArgs: any[][] = [];
    let execution = false;

    function tick() {
        const now = Date.now();

        if (!execution && now - last > 1000 / cps) {
            execution = true;
            call(...lastArgs);
            dirty = false;
            last = Date.now();
            execution = false;
        }

        if (dirty) {
            requestAnimationFrame(tick);
        }
    }

    return (...args) => {
        dirty = true;
        lastArgs = args;
        tick();
    };
}

/**
 * This functions returns a stack that is filled as long as the gate is not activated.
 * Once activated all recorded calls go to given callback and subsequent calls go directly to given callback.
 */
export function BufferedGate<T>(callback: (arg: T) => any) {
    const q: T[] = [];
    let activated = false;

    const throttled = ThrottleTime(async () => {
        if (q.length === 0) return;

        for (const t of q) {
            const result = callback(t);
            if (result instanceof Promise) {
                await result;
            }
        }
        //empty the queue
        q.splice(0, q.length);
    });

    return {
        activate: () => {
            activated = true;
            throttled();
        },
        call: (i: T) => {
            q.push(i);

            if (activated) {
                throttled();
            }
        }
    };
}


export function flatObject(object: any, prefix = ''): { [path: string]: any } {
    let result: { [path: string]: any } = {};

    for (const key of eachKey(object)) {
        if (isObject(object[key])) {
            result = {...result, ...flatObject(object[key], prefix + key + '.')};
        } else {
            result[prefix + key] = object[key];
        }
    }

    return result;
}

export function getPeerId(nodeId: string, nodeId2: string): string {
    return nodeId < nodeId2 ? nodeId + '-' + nodeId2 : nodeId2 + '-' + nodeId;
}


export interface TypedArrayClassType<T> {
    new(...args: any[]): T;

    readonly BYTES_PER_ELEMENT: number;
}

const methods = new Map();
methods.set(Int8Array, {set: 'setInt8', get: 'getInt8'});
methods.set(Uint8Array, {set: 'setUint8', get: 'getUint8'});
methods.set(Int16Array, {set: 'setInt16', get: 'getInt16'});
methods.set(Uint16Array, {set: 'setUint16', get: 'getUint16'});
methods.set(Int32Array, {set: 'setInt32', get: 'getInt32'});
methods.set(Uint32Array, {set: 'setUint32', get: 'getUint32'});
methods.set(Float32Array, {set: 'setFloat32', get: 'getFloat32'});
methods.set(Float64Array, {set: 'setFloat64', get: 'getFloat64'});

export class TypedArrayWriter {
    protected arrayBuffer?: ArrayBuffer;
    protected dataView?: DataView;
    protected offsetPosition = 0;
    protected position = 0;
    protected setter: Array<(val: number) => void> = [];
    protected getter: Array<() => number> = [];
    protected register: string[] = [];

    protected cursor = 0;

    getArrayBuffer() {
        if (!this.arrayBuffer) {
            this.arrayBuffer = new ArrayBuffer(this.offsetPosition);
            this.dataView = new DataView(this.arrayBuffer);
        }

        return this.arrayBuffer;
    }

    getDataView() {
        if (!this.arrayBuffer) {
            this.arrayBuffer = new ArrayBuffer(this.offsetPosition);
            this.dataView = new DataView(this.arrayBuffer);
        }

        return this.dataView;
    }

    add(...types: TypedArrayClassType<any>[]) {
        for (const t of types) {
            const offset = this.offsetPosition;
            this.offsetPosition += t.BYTES_PER_ELEMENT;

            const method = methods.get(t);
            this.setter[this.position] = (val) => {
                (this.getDataView() as any)[method.set](offset, val, true);
            };

            this.getter[this.position] = () => {
                return (this.getDataView() as any)[method.get](offset);
            };
            this.position++;
        }
    }

    reset() {
        this.cursor = 0;
    }

    push(...values: number[]) {
        for (const v of values) {
            if (this.setter[this.cursor]) {
                this.setter[this.cursor](v);
            }
            this.cursor++;
        }
    }
}

export class BinaryWriter {
    public buffer: ArrayBuffer;
    public dataView: DataView;
    protected byteOffset = 0;

    constructor(size: number) {
        this.buffer = new ArrayBuffer(size);
        this.dataView = new DataView(this.buffer);
    }

    putInt8(v: number) {
        this.byteOffset += 1;
        this.dataView.setInt8(this.byteOffset - 1, v);
    }

    putUint8(v: number) {
        this.byteOffset += 1;
        this.dataView.setUint8(this.byteOffset - 1, v);
    }

    putInt16(v: number) {
        this.byteOffset += 2;
        this.dataView.setInt16(this.byteOffset - 2, v, true);
    }

    putUint16(v: number) {
        this.byteOffset += 2;
        this.dataView.setUint16(this.byteOffset - 2, v, true);
    }

    putInt32(v: number) {
        this.byteOffset += 2;
        this.dataView.setInt32(this.byteOffset - 4, v, true);
    }

    putUint32(v: number) {
        this.byteOffset += 2;
        this.dataView.setUint32(this.byteOffset - 4, v, true);
    }

    putFloat32(v: number) {
        this.byteOffset += 4;
        this.dataView.setFloat32(this.byteOffset - 4, v, true);
    }

    putFloat64(v: number) {
        this.byteOffset += 8;
        this.dataView.setFloat64(this.byteOffset - 8, v, true);
    }
}


export class BinaryParser {
    protected length = 0;
    public byteOffset = 0;
    public dataView?: DataView;

    set(value: Uint8Array) {
        this.dataView = new DataView(value.buffer);
        this.length = value.byteLength;
        this.byteOffset = 0;
    }

    eatInt8(): number {
        this.byteOffset += 1;
        return this.dataView!.getInt8(this.byteOffset - 1);
    }

    eatUint8(): number {
        this.byteOffset += 1;
        return this.dataView!.getUint8(this.byteOffset - 1);
    }

    eatInt16(): number {
        this.byteOffset += 2;
        return this.dataView!.getInt16(this.byteOffset - 2, true);
    }

    eatUint16(): number {
        this.byteOffset += 2;
        return this.dataView!.getUint16(this.byteOffset - 2, true);
    }

    eatInt32(): number {
        this.byteOffset += 4;
        return this.dataView!.getInt32(this.byteOffset - 4, true);
    }

    eatUint32(): number {
        this.byteOffset += 4;
        return this.dataView!.getUint32(this.byteOffset - 4, true);
    }

    eatFloat32(): number {
        this.byteOffset += 4;
        return this.dataView!.getFloat32(this.byteOffset - 4, true);
    }

    eatFloat64(): number {
        this.byteOffset += 8;
        return this.dataView!.getFloat64(this.byteOffset - 8, true);
    }

    has() {
        return this.byteOffset < this.length;
    }
}

export function filterObject<T extends object>(item: T, fields: (keyof T)[]): Partial<T> {
    const res: Partial<T> = {};
    for (const field of fields) {
        if (item.hasOwnProperty(field)) {
            res[field] = item[field];
        }
    }
    return res;
}
