/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {OnDestroy, Pipe, PipeTransform} from '@angular/core';
import {Observable, ReplaySubject} from "rxjs";
import {auditTime} from "rxjs/operators";
import {animationFrame} from "rxjs/internal/scheduler/animationFrame";
import {humanBytes} from "@marcj/estdlib";
import {humanizeTime, PublicUser} from "@deepkit/core";
import {ActivatedRoute, UrlSegment} from "@angular/router";
import {Buffer} from "buffer";
import {DomSanitizer, SafeUrl} from "@angular/platform-browser";
import {CachedEntity} from "./providers/cached-entity";
import { arrayBufferTo } from '@marcj/marshal';

@Pipe({name: 'humanize', pure: false})
export class HumanizePipe implements PipeTransform {
    transform(value: Date | number | null, untilTime?: Date): string {
        if (value instanceof Date) {
            value = value.getTime() / 1000;
        }

        if (untilTime) {
            return value === null ? '00:00:00' : humanizeTime(value - (untilTime.getTime() / 1000));
        }

        return value === null ? '00:00:00' : humanizeTime(value);
    }
}

@Pipe({name: 'humanize_until_now', pure: false})
export class HumanizeUntilNowPipe implements PipeTransform {
    transform(value: Date | number | null, def = '00:00:00'): string {
        if (value instanceof Date) {
            value = value.getTime() / 1000;
        }

        return value === null ? '00:00:00' : humanizeTime((new Date().getTime() / 1000) - value);
    }
}

@Pipe({name: 'throttle'})
export class ThrottlePipe implements PipeTransform {
    //10 means 10 updates per seconds
    transform<T>(observable: Observable<T> | undefined, cps: number = 10): Observable<T> | undefined {
        if (!observable) return;

        return observable.pipe(
            auditTime(1000 / cps, animationFrame)
        );
    }
}

@Pipe({name: 'objectURL'})
export class ObjectURLPipe implements PipeTransform, OnDestroy {
    protected lastUrl?: string;

    constructor(private sanitizer: DomSanitizer) {
    }

    ngOnDestroy(): void {
        if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
    }

    transform(buffer?: ArrayBuffer): SafeUrl | undefined {
        if (buffer) {
            if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
            this.lastUrl = URL.createObjectURL(new Blob([buffer]));
            return this.sanitizer.bypassSecurityTrustResourceUrl(this.lastUrl);
        }
    }
}

@Pipe({name: 'jsonBuffer'})
export class JSONBufferPipe implements PipeTransform {
    transform(buffer?: ArrayBuffer): SafeUrl | undefined {
        if (buffer) {
            try {
                return JSON.parse(arrayBufferTo(buffer, 'utf8'));
            } catch (error) {
                console.error('Error parsing buffer', arrayBufferTo(buffer, 'utf8'));
                return undefined;
            }
        }
    }
}

const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

@Pipe({name: 'dateTime'})
export class DateTimePipe implements PipeTransform {
    transform(value: Date | number | null, format: 'all' | 'day' | 'time' = 'all'): string {
        if (!value) return '';

        if (!(value instanceof Date)) {
            value = new Date(value * 1000);
        }

        let string = '';
        if (format === 'all' || format === 'day') {
            string = value.getDate() + '. '
                + monthNames[value.getMonth()]
                + ' ' + (value.getFullYear() % 2000);
        }

        if (format === 'all' || format === 'time') {
            if (format === 'all') {
                string += ' ';
            }
            string += (value.getHours() < 10 ? '0' : '') + value.getHours() + ':' + (value.getMinutes() < 10 ? '0' : '') + value.getMinutes();
        }

        return string;
    }
}

export function getAllRouteSegments(route: ActivatedRoute): UrlSegment[] {
    const segments = [];

    for (let i = route.parent; i; i = i.parent) {
        segments.unshift(...i.snapshot.url);
    }

    for (let i: ActivatedRoute | null = route; i; i = i.firstChild) {
        if (i.snapshot) {
            segments.push(...i.snapshot.url);
        }
    }

    return segments;
}

@Pipe({name: 'activeRoute', pure: false})
export class ActiveRoutePipe implements PipeTransform {
    transform(route: ActivatedRoute, position: number, path: string): boolean {
        const segments = getAllRouteSegments(route);
        if (segments[position] && segments[position].path === path) {
            return true;
        }

        return false;
    }
}

@Pipe({name: 'user'})
export class UserPipe implements PipeTransform, OnDestroy {
    protected lastEntity?: ReplaySubject<PublicUser | undefined>;
    protected lastEntityId?: string;

    constructor(protected cachedEntity: CachedEntity) {
    }

    ngOnDestroy(): void {
        if (this.lastEntity) this.lastEntity.complete();
    }

    transform(id: string): ReplaySubject<PublicUser | undefined> {
        if (this.lastEntityId === id && this.lastEntity) {
            return this.lastEntity;
        }
        if (this.lastEntity) {
            this.lastEntity.complete();
        }

        this.lastEntityId = id;
        if (id) {
            this.lastEntity = this.cachedEntity.subscribePublicUser(id);
        } else {
            this.lastEntity = new ReplaySubject<PublicUser | undefined>(1);
            this.lastEntity.next(undefined);
        }
        return this.lastEntity;
    }
}

@Pipe({name: 'routeSegmentEmpty', pure: false})
export class RouteSegmentEmptyPipe implements PipeTransform {
    transform(route: ActivatedRoute, position: number): boolean {
        const segments = getAllRouteSegments(route);
        if (!segments[position]) {
            return true;
        }

        return false;
    }
}

@Pipe({name: 'childrenRouteActive', pure: false})
export class ChildrenRouteActivePipe implements PipeTransform {
    transform(route: ActivatedRoute, depth: number = 1): boolean {
        for (let i = 0; i < depth; i++) {
            if (!route.firstChild) {
                return false;
            }
            route = route.firstChild;
        }

        return true;
    }
}

@Pipe({name: 'dataUri', pure: false})
export class DataUriPipe implements PipeTransform {
    constructor(private domSanitization: DomSanitizer) {
    }

    transform(buffer: Buffer | undefined, depth: number = 1): SafeUrl | undefined {
        if (buffer) {
            return this.domSanitization.bypassSecurityTrustUrl('data:;base64,' + buffer.toString('base64'));
        }
    }
}

@Pipe({name: 'observe'})
export class ObservePipe implements PipeTransform {
    transform<T>(item: T, observable: Observable<any>): Observable<T> {
        return new Observable<T>((observer) => {
            observer.next(item);

            const sub = observable.subscribe(() => {
                observer.next(item);
            }, (error) => {
                observer.error(error);
            }, () => {
                observer.complete();
            });

            return {
                unsubscribe(): void {
                    sub.unsubscribe();
                }
            };
        });
    }
}

@Pipe({name: 'keys', pure: false})
export class KeysPipe implements PipeTransform {
    transform<T>(value: object): string[] {
        return Object.keys(value);
    }
}

@Pipe({name: 'fileSize'})
export class HumanFileSizePipe implements PipeTransform {
    transform(bytes: number, si: boolean = false): string {
        return humanBytes(bytes, si);
    }
}

@Pipe({
    name: 'callback',
    pure: false
})
export class CallbackPipe implements PipeTransform {
    transform(items: any[], callback: (item: any) => boolean): any {
        if (!items || !callback) {
            return items;
        }
        return items.filter(item => callback(item));
    }
}

@Pipe({
    name: 'range'
})
export class RangePipe implements PipeTransform {
    private array: number[] = [];

    transform(items: number): number[] {
        if (this.array.length !== items) {
            this.array = [];
            for (let i = 0; i < items; i++) {
                this.array.push(i);
            }
        }
        return this.array;
    }
}
