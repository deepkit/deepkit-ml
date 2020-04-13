/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {StreamBehaviorSubject} from "@marcj/glut-core";
import {ControllerClient} from "./controller-client";
import {HardwareParser, MetricParser, MetricParserConstructor, NumericMetricParser} from "../models";
import {Injectable} from "@angular/core";
import {skip} from "rxjs/operators";
import {Buffer} from 'buffer';
import {ClientProgress} from "@marcj/glut-client";
import {Progress} from "@marcj/glut-core";
import {Subscriptions} from "@marcj/estdlib-rxjs";

@Injectable()
export class ChannelReader {
    protected streamSubject: {
        [idAndPath: string]: {
            subject: StreamBehaviorSubject<Uint8Array | undefined>,
            users: number,
            subs: Subscriptions
            parser: MetricParser,
            progress: Progress,
        }
    } = {};

    constructor(protected controllerClient: ControllerClient) {
    }

    /**
     * Returns a cache parser for numeric channel metrics. Don't forget to call complete() to unsubscribe automatically from
     * the file content feed.
     */
    getCachedJobMetricParser(jobId: string, path: string): NumericMetricParser {
        return this.getCachedParser(jobId, path, NumericMetricParser);
    }

    /**
     * Returns the hardware stats parser. Don't forget to call complete() to unsubscribe automatically from
     * the file content feed.
     */
    getCachedJobHardwareParser(jobId: string, path: string): HardwareParser {
        return this.getCachedParser(jobId, path, HardwareParser);
    }

    getCachedParser<T extends MetricParser>(jobId: string, path: string, parserClass: MetricParserConstructor<T>): T {
        const idAndPath = jobId + ':' + path;

        if (!this.streamSubject[idAndPath]) {
            const subject = new StreamBehaviorSubject<Uint8Array | undefined>(undefined);
            const progress = ClientProgress.trackDownload();
            const subs = new Subscriptions;

            this.controllerClient.publicJob().subscribeJobFileContent(jobId, path).then((fileContent: StreamBehaviorSubject<Uint8Array | undefined>) => {
                if (subject.isUnsubscribed()) {
                    fileContent.unsubscribe();
                } else {
                    fileContent.subscribe(subject);
                    fileContent.appendSubject.subscribe(subject.appendSubject);
                }

                subject.addTearDown(() => {
                    fileContent.unsubscribe();
                    subs.unsubscribe();
                });
            }, () => {
            });
            const parser = new parserClass(jobId + ' job/' + path);
            this.streamSubject[idAndPath] = {subject: subject, users: 0, parser: parser, progress, subs};

            //we skip(1) because it would return undefined, since BehaviorSubject
            subs.add = this.streamSubject[idAndPath].subject.pipe(skip(1)).subscribe((value) => {
                // console.log('got value', idAndPath, typeof value, value ? value.length : 0);
                if (value) {
                    parser.feed(value);
                    if (parser.empty.value) {
                        parser.empty.next(false);
                    }
                } else {
                    parser.empty.next(true);
                }
            });

            subs.add = this.streamSubject[idAndPath].subject.appendSubject.subscribe((append: any) => {
                //this is a candidate for further improvements, maybe use FileLoader to convert
                parser.feed(Buffer.from(append, 'base64'));

                if (parser.empty.value) {
                    parser.empty.next(false);
                }
            });
        }

        // console.log('new parser', jobId, path, this.streamSubject[idAndPath].users);
        this.streamSubject[idAndPath].users++;

        const parser = new parserClass('job/' + path);
        const sub1 = this.streamSubject[idAndPath].progress.subscribe(parser.downloadProgress);
        const sub2 = this.streamSubject[idAndPath].parser.subscribe(parser);
        const sub3 = this.streamSubject[idAndPath].parser.empty.subscribe(parser.empty);

        parser.subscribe(() => {
        }).add(() => {
            this.streamSubject[idAndPath].users--;
            parser.downloadProgress.complete();
            sub1.unsubscribe();
            sub2.unsubscribe();
            sub3.unsubscribe();
            // console.log('UNSUB parser', jobId, path, this.streamSubject[idAndPath].users);

            if (this.streamSubject[idAndPath].users <= 0) {
                this.streamSubject[idAndPath].subject.unsubscribe();
                delete this.streamSubject[idAndPath];
            }
        });

        return parser;
    }
}
