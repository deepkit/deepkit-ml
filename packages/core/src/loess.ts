/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

function median(arr: number[]): number {
    arr.sort((a, b) => a - b);
    const i = arr.length / 2;
    return i % 1 === 0 ? (arr[i - 1] + arr[i]) / 2 : arr[Math.floor(i)];
}

export function sort(arr: number[], fn: (a: any) => number): number[] {
    return arr.sort((a, b) => fn(a) - fn(b));
}

const bandwidth = .3;
const robustnessIters = 2;
const accuracy = 1e-12;

export function loess(data: number[][]) {
    const n = data.length,
        // tslint:disable-next-line:no-bitwise
        bw = Math.max(2, ~~(bandwidth * n)), // # Nearest neighbors
        xval = [],
        yval = [],
        yhat = [],
        residuals = [],
        robustWeights = [];

    // Slice before sort to avoid modifying input
    // sort(data = data.slice(), x);
    data = data.slice().sort((a, b) => a[0] - b[0]);

    for (let i = 0, j = 0; i < n; ++i) {
        const d = data[i];
        // const xi = x(d, i, data)
        // const yi = y(d, i, data);
        const xi = d[0];
        const yi = d[1];

        // Filter out points with invalid x or y values
        if (xi != null && isFinite(xi) && yi != null && isFinite(yi)) {
            xval[j] = xi;
            yval[j] = yi;
            yhat[j] = 0;
            residuals[j] = 0;
            robustWeights[j] = 1;
            ++j;
        }
    }

    const m = xval.length; // # LOESS input points

    for (let iter = -1; ++iter <= robustnessIters;) {
        const interval = [0, bw - 1];

        for (let i = 0; i < m; ++i) {
            const dx = xval[i],
                i0 = interval[0],
                i1 = interval[1],
                edge = (dx - xval[i0]) > (xval[i1] - dx) ? i0 : i1;

            let sumWeights = 0, sumX = 0, sumXSquared = 0, sumY = 0, sumXY = 0;
            const denom = 1 / Math.abs(xval[edge] - dx || 1); // Avoid singularity!

            for (let k = i0; k <= i1; ++k) {
                const xk = xval[k],
                    yk = yval[k],
                    w = tricube(Math.abs(dx - xk) * denom) * robustWeights[k],
                    xkw = xk * w;

                sumWeights += w;
                sumX += xkw;
                sumXSquared += xk * xkw;
                sumY += yk * w;
                sumXY += yk * xkw;
            }

            // Linear regression fit
            const meanX = sumX / sumWeights,
                meanY = sumY / sumWeights,
                meanXY = sumXY / sumWeights,
                meanXSquared = sumXSquared / sumWeights,
                beta = (Math.sqrt(Math.abs(meanXSquared - meanX * meanX)) < accuracy) ? 0 : ((meanXY - meanX * meanY) / (meanXSquared - meanX * meanX)),
                alpha = meanY - beta * meanX;

            yhat[i] = beta * dx + alpha;
            residuals[i] = Math.abs(yval[i] - yhat[i]);

            updateInterval(xval, i + 1, interval);
        }

        if (iter === robustnessIters) {
            break;
        }

        const medianResidual = median(residuals);
        if (Math.abs(medianResidual) < accuracy) break;

        for (let i = 0, arg, w; i < m; ++i) {
            arg = residuals[i] / (6 * medianResidual);
            // Default to accuracy epsilon (rather than zero) for large deviations
            // keeping weights tiny but non-zero prevents singularites
            robustWeights[i] = (arg >= 1) ? accuracy : ((w = 1 - arg * arg) * w);
        }
    }

    return output(xval, yhat);
}

// Adapted from science.js by Jason Davies
// Source: https://github.com/jasondavies/science.js/blob/master/src/stats/loess.js
// License: https://github.com/jasondavies/science.js/blob/master/LICENSE
export function Loess() {
    // const x = (d: number[]) => d[0];
    // const y = (d: number[]) => d[1];
    const bandwidth = .3;
    const robustnessIters = 2;
    const accuracy = 1e-12;

    function loess(data: number[][]) {
        const n = data.length,
            // tslint:disable-next-line:no-bitwise
            bw = Math.max(2, ~~(bandwidth * n)), // # Nearest neighbors
            xval = [],
            yval = [],
            yhat = [],
            residuals = [],
            robustWeights = [];

        // Slice before sort to avoid modifying input
        // sort(data = data.slice(), x);
        data = data.slice().sort((a, b) => a[0] - b[0]);

        for (let i = 0, j = 0; i < n; ++i) {
            const d = data[i];
            // const xi = x(d, i, data)
            // const yi = y(d, i, data);
            const xi = d[0];
            const yi = d[1];

            // Filter out points with invalid x or y values
            if (xi != null && isFinite(xi) && yi != null && isFinite(yi)) {
                xval[j] = xi;
                yval[j] = yi;
                yhat[j] = 0;
                residuals[j] = 0;
                robustWeights[j] = 1;
                ++j;
            }
        }

        const m = xval.length; // # LOESS input points

        for (let iter = -1; ++iter <= robustnessIters;) {
            const interval = [0, bw - 1];

            for (let i = 0; i < m; ++i) {
                const dx = xval[i],
                    i0 = interval[0],
                    i1 = interval[1],
                    edge = (dx - xval[i0]) > (xval[i1] - dx) ? i0 : i1;

                let sumWeights = 0, sumX = 0, sumXSquared = 0, sumY = 0, sumXY = 0;
                const denom = 1 / Math.abs(xval[edge] - dx || 1); // Avoid singularity!

                for (let k = i0; k <= i1; ++k) {
                    const xk = xval[k],
                        yk = yval[k],
                        w = tricube(Math.abs(dx - xk) * denom) * robustWeights[k],
                        xkw = xk * w;

                    sumWeights += w;
                    sumX += xkw;
                    sumXSquared += xk * xkw;
                    sumY += yk * w;
                    sumXY += yk * xkw;
                }

                // Linear regression fit
                const meanX = sumX / sumWeights,
                    meanY = sumY / sumWeights,
                    meanXY = sumXY / sumWeights,
                    meanXSquared = sumXSquared / sumWeights,
                    beta = (Math.sqrt(Math.abs(meanXSquared - meanX * meanX)) < accuracy) ? 0 : ((meanXY - meanX * meanY) / (meanXSquared - meanX * meanX)),
                    alpha = meanY - beta * meanX;

                yhat[i] = beta * dx + alpha;
                residuals[i] = Math.abs(yval[i] - yhat[i]);

                updateInterval(xval, i + 1, interval);
            }

            if (iter === robustnessIters) {
                break;
            }

            const medianResidual = median(residuals);
            if (Math.abs(medianResidual) < accuracy) break;

            for (let i = 0, arg, w; i < m; ++i) {
                arg = residuals[i] / (6 * medianResidual);
                // Default to accuracy epsilon (rather than zero) for large deviations
                // keeping weights tiny but non-zero prevents singularites
                robustWeights[i] = (arg >= 1) ? accuracy : ((w = 1 - arg * arg) * w);
            }
        }

        return output(xval, yhat);
    }

    // loess.bandwidth = function (bw) {
    //     return arguments.length ? (bandwidth = bw, loess) : bandwidth;
    // };

    // loess.x = function (fn) {
    //     return arguments.length ? (x = fn, loess) : x;
    // };
    //
    // loess.y = function (fn) {
    //     return arguments.length ? (y = fn, loess) : y;
    // };

    return loess;
}

// Weighting kernel for local regression
function tricube(x: number) {
    return (x = 1 - x * x * x) * x * x;
}

// Advance sliding window interval of nearest neighbors
function updateInterval(xval: number[], i: number, interval: number[]) {
    const val = xval[i];
    let left = interval[0];
    let right = interval[1] + 1;

    if (right >= xval.length) return;

    // Step right if distance to new right edge is <= distance to old left edge.
    // Step when distance is equal to ensure movement over duplicate x values.
    while (i > left && (xval[right] - val) <= (val - xval[left])) {
        interval[0] = ++left;
        interval[1] = right;
        ++right;
    }
}

// Generate smoothed output points.
// Average points with repeated x values.
function output(xval: number[], yhat: number[]) {
    const n = xval.length,
        out = [];

    for (let i = 0, cnt = 0, prev: number[] = [], v; i < n; ++i) {
        v = xval[i];
        if (prev[0] === v) {
            // Average output values via online update
            prev[1] += (yhat[i] - prev[1]) / (++cnt);
        } else {
            // Add new output point
            cnt = 0;
            prev = [v, yhat[i]];
            out.push(prev);
        }
    }
    return out;
}
