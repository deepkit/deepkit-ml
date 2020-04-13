/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {eachKey, isUndefined} from "@marcj/estdlib";

/**
 * Checks only first level and issues always an replace op.
 */
export interface SimplePatches {
    [key: string]: any;
}

export function simplePatch(a: { [field: string]: any }, b: { [field: string]: any }): SimplePatches | null {
    const patches: SimplePatches = {};

    const checkedKeys: any = {};

    for (const k of eachKey(a)) {
        checkedKeys[k] = true;
        if (isUndefined(b[k])) {
            patches[k] = null;
        } else if (!equal(a[k], b[k])) {
            patches[k] = b[k];
        }
    }

    for (const k of eachKey(b)) {
        if (checkedKeys[k]) continue;

        //B has property, that doesn't exist at A
        patches[k] = b[k];
    }

    return Object.keys(patches).length > 0 ? patches : null;
}


//from https://github.com/epoberezkin/fast-deep-equal/blob/master/index.js
'use strict';
const isArray = Array.isArray;
const keyList = Object.keys;
const hasProp = Object.prototype.hasOwnProperty;

function equal(a: any, b: any) {
    if (a === b) return true;

    if (a && b && typeof a === 'object' && typeof b === 'object') {
        const arrA = isArray(a);
        const arrB = isArray(b);
        let i = 0;
        let length = 0;
        let key = '';

        if (arrA && arrB) {
            length = a.length;
            if (length !== b.length) return false;
            for (i = length; i-- !== 0;)
                if (!equal(a[i], b[i])) return false;
            return true;
        }

        if (arrA !== arrB) return false;

        const dateA = a instanceof Date
            , dateB = b instanceof Date;
        if (dateA !== dateB) return false;
        if (dateA && dateB) return a.getTime() === b.getTime();

        const regexpA = a instanceof RegExp
            , regexpB = b instanceof RegExp;
        if (regexpA !== regexpB) return false;
        if (regexpA && regexpB) return a.toString() === b.toString();

        const keys = keyList(a);
        length = keys.length;

        if (length !== keyList(b).length)
            return false;

        for (i = length; i-- !== 0;)
            if (!hasProp.call(b, keys[i])) return false;

        for (i = length; i-- !== 0;) {
            key = keys[i];
            if (!equal(a[key], b[key])) return false;
        }

        return true;
    }

    return a !== a && b !== b;
}


export function smooth(arr: number[], windowSize: number, start = 1) {
    if ('number' !== typeof arr[0]) return arr;
    if (windowSize <= 0) return arr;

    const result: number[] = new Array(arr.length);
    const length = arr.length;

    let count = 0;
    let sum = 0;
    let from = 0;
    let to = 0;

    for (let i = start; i < length; i++) {
        from = i - windowSize >= 0 ? i - windowSize : 0;
        to = i + windowSize + 1;

        count = 0;
        sum = 0;
        for (let j = from; j < to && j < length; j++) {
            sum += arr[j];
            count += 1;
        }

        result[i] = sum / count;
    }

    return result;
}

export function smoothEMA(arr: number[], mRange: number): number[] {
    if ('number' !== typeof arr[0]) return arr;

    const k = 2 / (mRange + 1);
    // first item is just the same as the first item in the input
    const result = new Array(arr.length);
    result[0] = [arr[0]];

    // for the rest of the items, they are computed with the previous one
    const len = arr.length;
    for (let i = 1; i < len; i++) {
        result[i] = (arr[i] * k + result[i - 1] * (1 - k));
    }
    return result;
}

export function smoothGaussianOriginal(list: number[], degree: number) {
    const win = degree * 2 - 1;
    // let weight = _.range(0, win).map(function (x) { return 1.0; });
    const weightGauss: number[] = [];
    // for (i in _.range(0, win)) {
    for (let i = 0; i < win; i++) {
        const frac = (i - degree + 1) / win;
        const gauss = 1 / Math.exp((4 * (frac)) * (4 * (frac)));
        weightGauss.push(gauss);
    }

    // const weight = _(weightGauss).zip(weight).map(function (x) {
    //     return x[0] * x[1];
    // });

    const weight: number[] = weightGauss.slice(0);

    // const smoothed = new Array(list.length).fill(0);
    const smoothed = list.slice(0, (list.length + 1) - win);
    // smoothed = _.range(0, (list.length + 1) - win).map(function (x) {
    //     return 0.0;
    // });

    for (let i = 0; i < smoothed.length; i++) {
        smoothed[i] = list.slice(i, i + win).map((v, i) => {
            return v * weight[i];
        }).reduce(function (memo: number, num: number) {
            return memo + num;
        }, 0) / weight.reduce(function (memo: number, num: number) {
            return memo + num;
        }, 0);
    }
    return smoothed;
}

export function smoothGaussian(list: number[], degree: number, offset = 0) {
    const win = degree;

    const weight: number[] = [];
    const b: number[] = [];
    const width = degree * 2 - 1;
    for (let i = 0; i < width; i++) {
        const frac = i / width;
        const gauss = 1 / Math.exp((4 * (frac)) * (4 * (frac)));
        if (i === 0) {
            b[i] = gauss;
        } else {
            b[i] = b[i - 1] + gauss;
        }
        weight.push(gauss);
    }

    const len = list.length;
    const smoothed = [];
    let windowPosition = 0;
    let a = 0;
    let n = 0;
    let c = 0;

    for (let i = offset; i < len; i++) {
        a = 0;
        n = 0;
        c = 0;

        for (let j = i; j >= 0 && j > i - win; j--) {
            windowPosition = i - j;
            c += list[j];
            a += list[j] * weight[windowPosition];
            n++;
        }

        if (n === 0 || c === list[i] * n) {
            smoothed.push(list[i]);
        } else {
            smoothed.push(a / b[n - 1]);
        }
    }
    return smoothed;
}
