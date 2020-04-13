/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

/**
 * Error message for case when percentile is less than 0
 */
function lessThanZeroError(p: number): string {
    return 'Percentile expect number >= 0 but given "' + p + '" and its type is "' + (typeof p) + '".';
}

/**
 * Error message for case when percentile is grater than 100
 */
function graterThanHundredError(p: number): string {
    return 'Percentile expect number <= 100 but given "' + p + '" and its type is "' + (typeof p) + '".';
}

/**
 * Error message for case when percentile is NaN
 */
function nanError(p: number): string {
    return 'Percentile expect number but given "' + p + '" and its type is "' + (typeof p) + '".';
}

/**
 * Calculate percentile for given array of values.
 *
 */
export function percentile(p: number, list: number[], fn?: Function): number {
    if (isNaN(Number(p))) {
        throw new Error(nanError(p));
    }

    p = Number(p);

    if (p < 0) {
        throw new Error(lessThanZeroError(p));
    }

    if (p > 100) {
        throw new Error(graterThanHundredError(p));
    }

    list = list.sort(function (a, b) {
        if (fn) {
            a = fn(a);
            b = fn(b);
        }

        a = Number.isNaN(a) ? Number.NEGATIVE_INFINITY : a;
        b = Number.isNaN(b) ? Number.NEGATIVE_INFINITY : b;

        if (a > b) return 1;
        if (a < b) return -1;

        return 0;
    });

    if (p === 0) return list[0];

    const kIndex = Math.ceil(list.length * (p / 100)) - 1;

    return list[kIndex];
}
