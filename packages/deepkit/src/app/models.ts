/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {BinaryParser} from "@deepkit/core";
import {BehaviorSubject, ReplaySubject, Subject} from "rxjs";
import {ObservableTraceStream} from "./components/plotly.component";
import {Progress} from "@marcj/glut-core";

export type MetricParserConstructor<T extends MetricParser> = new (name: string, bufferSize?: number) => T;

export class AbstractMetricParser extends ReplaySubject<any[][]> {
    public readonly empty = new BehaviorSubject(false);
    public readonly downloadProgress = new Progress;

    constructor(public readonly name: string, bufferSize: number = Number.POSITIVE_INFINITY) {
        super(bufferSize);
    }

    public redirectToTrace(
        stream: Subject<ObservableTraceStream>,
        xGetter: (row: any[]) => any,
        yGetter: (row: any[]) => any,
    ) {
        this.subscribe((rows) => {
            const x: number[] = [];
            const y: number[] = [];

            for (const row of rows) {
                x.push(xGetter(row));
                y.push(yGetter(row));
            }

            stream.next({x, y});
        });
    }
}

export interface MetricParser extends AbstractMetricParser {
    readonly empty: BehaviorSubject<boolean>;

    redirectToTrace(
        stream: Subject<ObservableTraceStream>,
        xGetter: (row: any[]) => any,
        yGetter: (row: any[]) => any,
    ): void;

    feed(value?: Uint8Array): void;
}

export class SpeedParser extends AbstractMetricParser implements MetricParser {
    protected binaryParser = new BinaryParser;

    /**
     * Speed metrics
     *
     * <version><x><time><data>
     *
     * <version> = uint8 = 1byte
     * <x> = float64 = 4bytes
     * <time> = float64 = 8bytes
     * <data> = float32 = 4bytes
     */
    public feed(value?: Uint8Array) {
        if (!value || !value.length) return;

        this.binaryParser.set(value);
        const rows: any[] = [];

        while (this.binaryParser.has()) {
            const version = this.binaryParser.eatUint8();
            if (version === 1) {
                const array: any[] = [];

                array.push(
                    this.binaryParser.eatFloat64(), this.binaryParser.eatFloat64(), this.binaryParser.eatFloat64()
                );

                rows.push(array);
            } else {
                console.debug(`Unsupported speed metric version ${version} for ${this.name} at position ${this.binaryParser.byteOffset}`);
                this.next(rows);
                return;
            }
        }

        this.next(rows);
    }
}

export class HistogramParser extends AbstractMetricParser implements MetricParser {
    protected binaryParser = new BinaryParser;

    /**
     * <version><x><size><…x><…y>
     * <version> = uint8 = 1byte
     * <x> = Uint32 = 4, max 214,748,3647 entries
     * <bins> = Uint16 = 2, max 65,535 values
     * <…x> = Float32
     * <…y> = Uint32 = 4, max 214,748,3647
     */
    public feed(value?: Uint8Array) {
        if (!value || !value.length) return;

        this.binaryParser.set(value);
        const rows: any[] = [];

        while (this.binaryParser.has()) {
            const version = this.binaryParser.eatUint8();
            if (version === 1) {
                const array: any[] = [];
                const x = this.binaryParser.eatUint32();
                const bins = this.binaryParser.eatUint16();

                array.push(x, bins, [], []);

                //read x values. x are the bins, which are `bins` + 1 (0..1 is bin a, 1..2 is bin b, etc)
                for (let i = 0; i < bins + 1; i++) {
                    array[2].push(this.binaryParser.eatFloat32());
                }

                //read y values
                for (let i = 0; i < bins; i++) {
                    array[3].push(this.binaryParser.eatUint32());
                }

                rows.push(array);
            } else {
                console.debug(`Unsupported histogram version ${version} for ${this.name} at position ${this.binaryParser.byteOffset}`);
                break;
            }
        }

        this.next(rows);
    }
}

export class HardwareParser extends AbstractMetricParser implements MetricParser {
    protected binaryParser = new BinaryParser;

    /**
     * Hardware metrics
     *
     * <version><gpu_count><time><cpu><memory><network_rx><network_tx><block_write><block_read>...(<gpu_utilization><gpu_memory><gpu_temperature><gpu_powerDraw>)
     *
     * <version> = uint8 = 1 byte
     * <gpu_count> = uint16 = 2bytes
     *
     * <time> = float64 = 4bytes
     * <cpu>  = uint16 = 2bytes 0000 - 65535 (so we get 54.44% for example)
     * <memory>  = uint16 = 2bytes 0000 - 65535 (so we get 54.44% for example)
     *
     * <network_rx> = float32 = 4bytes
     * <network_tx> = float32 = 4bytes
     * <block_write> = float32 = 4bytes
     * <block_read> = float32 = 4bytes
     *
     * <gpu_utilization> = uint16 = 2bytes
     * <gpu_memory> = uint16 = 2bytes
     * <gpu_temperature> = uint16 = 2bytes
     * <gpu_powerDraw> = uint16 = 2bytes
     */
    public feed(value?: Uint8Array) {
        if (!value || !value.length) return;

        this.binaryParser.set(value);
        const rows: any[] = [];

        while (this.binaryParser.has()) {
            const version = this.binaryParser.eatUint8();
            if (version === 1) {
                const gpuCount = this.binaryParser.eatUint16();
                const array: any[] = [];

                array.push(
                    this.binaryParser.eatFloat64(), this.binaryParser.eatUint16(), this.binaryParser.eatUint16(),
                    this.binaryParser.eatFloat32(), this.binaryParser.eatFloat32(), this.binaryParser.eatFloat32(), this.binaryParser.eatFloat32(),
                );

                //cpu & mem crunch into 0..1
                array[1] /= 65535;
                array[2] /= 65535;

                for (let i = 0; i < gpuCount; i++) {
                    array.push(this.binaryParser.eatUint16() / 65535, this.binaryParser.eatUint16() / 65535,
                        this.binaryParser.eatUint16(), this.binaryParser.eatUint16());
                }
                rows.push(array);
            } else {
                console.debug(`Unsupported hardware metric version ${version} for ${this.name} at position ${this.binaryParser.byteOffset}`);
                this.next(rows);
                return;
            }
        }

        this.next(rows);
    }
}

export class NumericMetricParser extends AbstractMetricParser implements MetricParser {
    protected parser = new BinaryParser;

    /**
     * General numeric metrics
     *
     * <version><dataFields><x><time><…data>
     *
     * <version> = uint8 = 1byte
     * <dataFields> = uint16 = 2bytes, max 32767 fields
     * <x> = float64 = 8bytes
     * <time> = float64 = 8bytes
     * <data> = float64 = 8bytes
     *
     * total of 3 + 24 = 27 bytes
     */
    public feed(value?: Uint8Array) {
        if (!value || !value.length) return;

        this.parser.set(value);
        const rows: any[] = [];
        let lastX = 0;

        while (this.parser.has()) {
            const version = this.parser.eatUint8();
            if (version === 1) {
                const dataFields = this.parser.eatUint16();
                const array: any[] = [];
                lastX = this.parser.eatFloat64();
                array.push(lastX, this.parser.eatFloat64());

                if (dataFields === 1) {
                    array.push(this.parser.eatFloat64());
                } else if (dataFields === 2) {
                    array.push(this.parser.eatFloat64(), this.parser.eatFloat64());
                } else {
                    for (let i = 0; i < dataFields; i++) {
                        array.push(this.parser.eatFloat64());
                    }
                }
                // console.log(array);
                rows.push(array);
            } else {
                console.log('dataView', this.parser.dataView);
                throw new Error(`Unsupported metric version ${version} for ${this.name} at position ${this.parser.byteOffset - 1}. lastX=${lastX}`);
            }
        }

        this.next(rows);
    }
}
