/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import ndarray from "ndarray";
import {Float16Array} from "@petamoriken/float16";

const dataViewToAscii = (dv: DataView) => {
    let out = "";
    for (let i = 0; i < dv.byteLength; i++) {
        const val = dv.getUint8(i);
        if (val === 0) {
            break;
        }
        out += String.fromCharCode(val);
    }
    return out;
};

const numEls = (shape: number[]) => {
    if (shape.length === 0) {
        return 1;
    } else {
        return shape.reduce((a, b) => a * b);
    }
};


export type TypedArray = Float64Array
    | Float32Array
    | typeof Float16Array
    | BigInt64Array
    | Int32Array
    | Int16Array
    | Int8Array
    | BigUint64Array
    | Uint32Array
    | Uint16Array
    | Uint8Array;

export type Dtype = '<f8' | '<f4' | '<f2' | '<i8' | '<i4' | '<i2' | '<i1' | '|u8' | '|u4' | '|u2' | '|u1';

const dtypeTypedArrayMap = {
    '<f8': (s: any) => new Float64Array(s),
    '<f4': (s: any) => new Float32Array(s),
    '<f2': (s: any) => new Float16Array(s),
    '<i8': (s: any) => new BigInt64Array(s),
    '<i4': (s: any) => new Int32Array(s),
    '<i2': (s: any) => new Int16Array(s),
    '<i1': (s: any) => new Int8Array(s),
    '|u8': (s: any) => new BigUint64Array(s),
    '|u4': (s: any) => new Uint32Array(s),
    '|u2': (s: any) => new Uint16Array(s),
    '|u1': (s: any) => new Uint8Array(s),
};

const dtypeNameMap = {
    '<f8': 'float64',
    '<f4': 'float32',
    '<f2': 'float16',
    '<i8': 'bigInt64',
    '<i4': 'int32',
    '<i2': 'int16',
    '<i1': 'int8',
    '|u8': 'bigUint64',
    '|u4': 'uint32',
    '|u2': 'uint16',
    '|u1': 'uint8',
};

export class DataArray {
    public typedArray: TypedArray;
    public dtype: string;

    constructor(
        arrayBuffer: ArrayBuffer,
        dtype: Dtype,
        public readonly shape: number[]
    ) {
        this.typedArray = dtypeTypedArrayMap[dtype](arrayBuffer);
        this.dtype = dtypeNameMap[dtype];
    }

    toArray() {
        return ndarray(this.typedArray, this.shape);
    }
}

export function readNumpyFile(ab: ArrayBuffer): DataArray {
    const view = new DataView(ab);
    let pos = 0;

    // First parse the magic string.
    const byte0 = view.getUint8(pos++);
    const magicStr = dataViewToAscii(new DataView(ab, pos, 5));
    pos += 5;

    if (byte0 !== 0x93 || magicStr !== "NUMPY") {
        throw TypeError("Not a numpy file.");
    }

    // Parse the version
    const version = [view.getUint8(pos++), view.getUint8(pos++)].join(".");
    if (version !== "1.0") {
        throw Error("Unsupported version.");
    }

    // Parse the header length.
    const headerLen = view.getUint16(pos, true);
    pos += 2;

    // Parse the header.
    // header is almost json, so we just manipulated it until it is.
    //  {'descr': '<f8', 'fortran_order': False, 'shape': (1, 2), }
    const headerPy = dataViewToAscii(new DataView(ab, pos, headerLen));
    pos += headerLen;
    const bytesLeft = view.byteLength - pos;
    const headerJson = headerPy
        .replace("True", "true")
        .replace("False", "false")
        .replace(/'/g, `"`)
        .replace(/,\s*}/, " }")
        .replace(/,?\)/, "]")
        .replace("(", "[");

    const header = JSON.parse(headerJson);
    const {shape, fortran_order, descr} = header;
    const dtype = descr;

    if (fortran_order) {
        throw Error("NPY parse error. TODO: Implement the uncommon optional fortran_order.");
    }

    // Finally parse the actual data.
    if (bytesLeft !== numEls(shape) * parseInt(dtype[dtype.length - 1], 10)) {
        throw RangeError("Invalid bytes for numpy dtype");
    }

    if (!(dtype in dtypeTypedArrayMap)) {
        throw Error(`Unknown dtype "${dtype}". Either invalid or requires javascript implementation.`);
    }

    return new DataArray(ab.slice(pos, pos + bytesLeft), dtype, shape);
}
