/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Component, ElementRef, Input, OnInit, SimpleChanges} from "@angular/core";
import {Config, Data, Layout, newPlot, PlotlyHTMLElement, Plots, purge, react} from 'plotly.js';
import {BehaviorSubject, interval, merge, Observable, Observer, Subject, Subscription} from "rxjs";
import {Subscriptions} from "@marcj/estdlib-rxjs";
import {eachPair, setPathValue} from "@marcj/estdlib";
import {unsubscribe} from "../reactivate-change-detection";
import {auditTime, bufferWhen, skip} from "rxjs/operators";
import {Job, smoothGaussian} from "@deepkit/core";
import {ChannelReader} from "../providers/channel-reader";

export interface ObservableTraceStream {
    x: (number | string | Date)[];
    y: (number | string | Date)[];
}

export interface ObservableTrace {
    name: string;
    data: BehaviorSubject<Data>;
    renderOnFirst?: boolean;
    stream: Subject<ObservableTraceStream>;
}

export interface ReactTrace {
    name: string;
    data: BehaviorSubject<Data>;
    react: Subject<void>;
}

export function createAndSendTrace(subscriber: Observer<ObservableTrace>, name: string, data: Partial<Data>, renderOnFirst = true)
    : {
    data: BehaviorSubject<Data>,
    stream: Subject<ObservableTraceStream>,
} {
    data = {
        name: name,
        mode: 'lines',
        line: {
            width: 1,
        },
        x: [],
        y: [],
        ...data
    };

    const dataSubject = new BehaviorSubject<Data>(data);

    const stream = new Subject<ObservableTraceStream>();

    subscriber.next({
        name: name,
        data: dataSubject,
        renderOnFirst: renderOnFirst,
        stream: stream
    });

    return {
        stream: stream,
        data: dataSubject,
    };
}

export function createAndReactTrace(subscriber: Observer<ReactTrace>, name: string, data: Partial<Data>): {
    data: BehaviorSubject<Data>,
    react: Subject<void>,
    x: any,
    y: any,
    setMap: (map: { [index: number]: number }) => void,
} {
    data = {
        name: name,
        mode: 'lines',
        line: {
            width: 1,
        },
        x: [],
        y: [],
        ...data
    };

    const dataSubject = new BehaviorSubject<Data>(data);

    const react = new Subject<void>();

    subscriber.next({
        name: name,
        data: dataSubject,
        react: react
    });

    return {
        react: react,
        data: dataSubject,
        x: data.x,
        y: data.y,
        setMap: (map: { [index: number]: number }) => {
            data.x = Object.keys(map);
            data.y = Object.values(map);
            react.next();
        }
    };
}

export function createTraceForJobChannel(
    channelReader: ChannelReader,
    job: Job,
    channelName: string,
): Observable<ObservableTrace> | undefined {
    const channel = job.channels[channelName];

    if (!channel) {
        return undefined;
    }

    return new Observable<ObservableTrace>((observer) => {
        let running = true;
        const path = ['.deepkit', 'channel', channelName, 'metrics'].join('/');
        const parser = channelReader.getCachedJobMetricParser(job.id, path);

        const traces: {
            [id: number]: {
                config: BehaviorSubject<Data>,
                stream: Subject<ObservableTraceStream>
            }
        } = {};

        for (const [traceId, trace] of eachPair(channel.traces)) {
            const config = new BehaviorSubject<Data>({
                name: traceId + ' ' + trace,
                mode: 'lines',
                line: {
                    width: 1,
                },
                x: [],
                y: [],
            });
            const stream = new Subject<ObservableTraceStream>();

            observer.next({
                name: traceId + ' ' + trace,
                data: config,
                renderOnFirst: true,
                stream: stream
            });

            traces[traceId] = {config: config, stream: stream};
        }

        parser.subscribe((rows) => {
            const traceData: { id: number, x: (string | number)[], y: (string | number)[] }[] = [];

            for (const [traceId, trace] of eachPair(channel.traces)) {
                traceData.push({
                    id: traceId,
                    x: [],
                    y: [],
                });
            }

            for (const [i, trace] of eachPair(traceData)) {
                for (const row of rows) {
                    if (row[i + 2] !== null) {
                        trace.x.push(row[0]);
                        trace.y.push(row[i + 2]);
                    }
                }
            }

            for (const trace of traceData) {
                traces[trace.id].stream.next({x: trace.x, y: trace.y});
            }
        });

        return {
            unsubscribe: () => {
                running = false;
                parser.complete();
            }
        };
    });
}

type RenderStruct = { type: 'add', trace: ObservableTrace, traceData: ObservableTraceStream }
    | { type: 'remove', data: Data } | { type: 'render' } | { type: 'smooth' };

@Component({
    selector: 'plotly',
    template: ``,
    styleUrls: ['./plotly.component.scss'],
})
export class PlotlyComponent implements OnInit {
    layoutPrepared: Partial<Layout> = {
        plot_bgcolor: 'transparent',
        height: 200,
        legend: {
            orientation: 'h',
        },
        margin: {
            l: 35,
            r: 15,
            b: 35,
            t: 15,
        },
        xaxis: {
            // gridcolor: '#d7ebf7',
            showgrid: false,

            zeroline: false,
            titlefont: {
                color: '#333333'
            }
        },
        yaxis: {
            showgrid: true,
            tickmode: 'auto',
            zeroline: false,
            // nticks: 10,
            // gridcolor: '#dcf0fc',
            // tickmode: 'linear',
            // tick0: 0,
            // dtick: 1,
            titlefont: {
                color: '#333333'
            }
        },
    };

    @Input() layout: BehaviorSubject<Partial<Layout>> = new BehaviorSubject<Partial<Layout>>({});
    @Input() config: BehaviorSubject<Partial<Config>> = new BehaviorSubject<Partial<Config>>({
        displaylogo: false,
    });

    @Input() trace: Observable<ObservableTrace> = new Observable<ObservableTrace>();
    @Input() react: Observable<ReactTrace> = new Observable<ReactTrace>();

    private resizeCallback: () => void;
    private container: HTMLElement;
    private plotly?: PlotlyHTMLElement;
    private destroyed = false;

    private data: Data[] = [];
    private originalY: any[] = []; //before transformation
    private dataMap: { [traceName: string]: Data } = {};

    @Input() public renderNowSubject = new Subject<void>();
    @Input() public loading = new BehaviorSubject<boolean>(false);

    @Input() public smoothing = new BehaviorSubject<number>(0);

    protected smoothingSub?: Subscription;

    protected renderStructSubject: Subject<RenderStruct>;

    @unsubscribe()
    private subs = new Subscriptions();

    private structSub?: Subscription;

    protected renderNextFrame: any;
    protected lastReactSchedule: any;

    constructor(
        private element: ElementRef
    ) {
        this.container = this.element.nativeElement;

        this.resizeCallback = (): void => {
            if (this.element.nativeElement.offsetParent === null) return;
            Plots.resize(this.container);
        };

        window.addEventListener('resize', this.resizeCallback);

        this.renderStructSubject = new Subject();
    }

    protected isVisible() {
        return this.element.nativeElement.offsetParent !== null;
    }

    ngOnInit() {
    }

    ngOnDestroy(): void {
        this.destroyed = true;
        this.renderStructSubject.complete();

        if (this.plotly && this.container) {
            purge(this.container);
            delete this.plotly;
        }
        if (this.structSub) this.structSub.unsubscribe();

        window.removeEventListener('resize', this.resizeCallback);
    }

    public renderNext() {
        if (this.renderNextFrame) {
            cancelAnimationFrame(this.renderNextFrame);
        }

        this.renderNextFrame = requestAnimationFrame(() => {
            this.renderNextFrame = undefined;
            this.renderNowSubject.next();
        });
    }

    async ngOnChanges(changes: SimpleChanges) {
        //remove everything and start from new
        if (this.smoothingSub) this.smoothingSub.unsubscribe();

        if (this.structSub) {
            //we need to reset all ongoing structs, since we don't care about old data anymore.
            this.structSub.unsubscribe();
        }

        //we have to put it here otherwise initial calls wont get handled
        this.structSub = this.renderStructSubject.pipe(bufferWhen(() => merge(interval(1400), this.renderNowSubject)))
            .subscribe((structs: RenderStruct[]) => {
                this.renderStruct(structs);
            });

        this.smoothingSub = this.smoothing.pipe(skip(1), auditTime(200)).subscribe((v) => {
            this.renderStructSubject.next({type: 'smooth'});
            this.renderNext();
        });

        if (this.plotly) {
            purge(this.container);
            delete this.plotly;
        }

        // console.log('plotly ngOnChanges', changes);
        this.subs.unsubscribe();
        this.setLayout(this.layout.getValue());
        this.subs.add = this.layout.subscribe((v) => {
            this.setLayout(v);
        });

        if (changes.trace && this.trace) {
            this.data = [];
            this.originalY = [];
            this.dataMap = {};

            this.subs.add = this.trace.subscribe((trace) => {
                this.subs.add = trace.data.subscribe(async (data) => {
                    if (this.dataMap[trace.name]) {
                        const index = this.data.indexOf(this.dataMap[trace.name]);
                        this.data[index] = data;
                        this.originalY[index] = (data.y as number[]).slice(0) || [];
                    } else {
                        this.data.push(data);
                        this.originalY.push((data.y as number[]).slice(0) || []);
                    }

                    this.dataMap[trace.name] = data;
                });

                let first = true;
                this.subs.add = trace.stream.subscribe((data) => {
                    this.renderStructSubject.next({type: 'add', trace: trace, traceData: data});
                    if (first) {
                        first = false;
                        if (trace.renderOnFirst) {
                            this.renderNext();
                        }
                    }
                }, () => {
                }, () => {
                    this.renderStructSubject.next({type: 'remove', data: this.dataMap[trace.name]});
                    delete this.dataMap[trace.name];
                });
            });
        }

        if (changes.react && this.react) {
            this.subs.add = this.react.subscribe((trace) => {
                this.subs.add = trace.data.subscribe(async (data) => {
                    if (this.dataMap[trace.name]) {
                        const index = this.data.indexOf(this.dataMap[trace.name]);
                        this.data[index] = data;
                        this.originalY[index] = data.y || [];
                    } else {
                        this.data.push(data);
                        this.originalY.push(data.y || []);
                    }

                    this.dataMap[trace.name] = data;
                    this.renderStructSubject.next({type: 'render'});
                });

                this.subs.add = trace.react.subscribe(async () => {
                    this.renderStructSubject.next({type: 'render'});
                    const index = this.data.indexOf(this.dataMap[trace.name]);
                    this.originalY[index] = this.data[index].y;
                    this.renderNext();
                }, () => {
                }, () => {
                    //remove trace
                    this.renderStructSubject.next({type: 'remove', data: this.dataMap[trace.name]});
                    delete this.dataMap[trace.name];
                });
            });
        }
    }

    protected applyTransformation(y: number[]): number[] {
        if (this.smoothing.value > 0) {
            return smoothGaussian(y, this.smoothing.value);
        }

        return y;
    }

    /**
     * original is the original array with raw values. newValues has already been added.
     * result is the container with the smoothed values. newValues has not yet been added. That's our job.
     */
    protected addTransformationToNewValues(original: number[], result: number[], newValues: number[]) {
        const offset = original.length - newValues.length;

        if (this.smoothing.value > 0) {
            newValues = smoothGaussian(original, this.smoothing.value, offset);
            for (const v of newValues) {
                result.push(v);
            }
        } else {
            for (const v of newValues) {
                result.push(v);
            }
        }
    }

    private async renderStruct(structs: RenderStruct[]) {
        if (!structs.length || this.destroyed) return;

        for (const struct of structs) {
            if (struct.type === 'remove') {
                const index = this.data.indexOf(struct.data);
                if (index !== -1) {
                    this.data.splice(index, 1);
                    this.originalY.splice(index, 1);
                }
            }

            if (struct.type === 'smooth') {
                for (let i = 0; i < this.data.length; i++) {
                    this.data[i].y = this.applyTransformation(this.originalY[i]);
                }
            }

            if (struct.type === 'add') {
                const index = this.data.indexOf(this.dataMap[struct.trace.name]);
                if (index === -1) continue;
                if (!this.data[index].x) {
                    this.data[index].x = [];
                    this.originalY[index] = [];
                }

                for (const x of struct.traceData.x) {
                    (this.data[index].x as any[]).push(x);
                }

                for (const y of struct.traceData.y) {
                    (this.originalY[index] as any[]).push(y);
                }

                this.addTransformationToNewValues(
                    this.originalY[index],
                    this.data[index].y as number[],
                    struct.traceData.y as number[]
                );
            }
        }

        // for (let i = 0; i < this.data.length; i++) {
        //     // this.data[i].y = this.applyTransformation(this.originalY[i]);
        //     this.data[i].y = this.originalY[i].slice(0);
        // }

        // console.log('newPlot', trace.name, this.data[index].x, this.data[index].y, this.layoutPrepared, this.config.getValue());
        if (this.plotly) {
            if (!(this.layoutPrepared as any).datarevision) {
                (this.layoutPrepared as any).datarevision = 0;
            }
            (this.layoutPrepared as any).datarevision++;

            clearTimeout(this.lastReactSchedule);
            if (this.isVisible()) {
            // console.log('ploty react');
                await react(this.container, this.data, this.layoutPrepared, this.config.getValue());
            } else {
                this.lateReact();
            }
        } else {
            this.plotly = await newPlot(this.container, this.data, this.layoutPrepared, this.config.getValue());
        }
    }

    protected lateReact() {
        clearTimeout(this.lastReactSchedule);
        this.lastReactSchedule = setTimeout(async () => {
            if (this.isVisible()) {
                await react(this.container, this.data, this.layoutPrepared, this.config.getValue());
            } else {
                this.lateReact();
            }
        }, 1000);
    }

    private setLayout(layout: Partial<Layout>) {
        for (const [k, v] of eachPair(layout)) {
            setPathValue(this.layoutPrepared, k as any, v);
        }
        if (this.layoutPrepared.height) {
            this.element.nativeElement.style.height = this.layoutPrepared.height + 'px';
        }
    }
}
