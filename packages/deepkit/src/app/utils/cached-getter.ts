/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {EntitySubject, IdInterface} from "@marcj/glut-core";
import {ClassType} from "@marcj/estdlib";
import {Observable} from "rxjs";

interface StoreItem<T> {
    observable?: Observable<T>;
    loading?: Promise<T>;
    item?: T;
    subscriptions: number;
}

export class CachedGetter<T, ARGS extends any[]> {
    store = new Map<string, StoreItem<T>>();

    constructor(
        public readonly classType: ClassType<T>,
        protected getter: (...args: ARGS) => Promise<T>
    ) {
    }

    public get(...args: ARGS): Observable<T> {
        const storeKey = JSON.stringify(args);
        const storeItem = this.store.get(storeKey);

        if (storeItem && storeItem.observable) {
            // storeItem.subscriptions++;
            return storeItem.observable;
        }

        const newStoreItem: StoreItem<T> = {
            subscriptions: 0,
        };
        this.store.set(storeKey, newStoreItem);

        newStoreItem.observable = new Observable<T>((observer) => {
            newStoreItem.subscriptions++;

            if (newStoreItem.item) {
                observer.next(newStoreItem.item);
                // observer.next(newStoreItem.subject);
            } else if (newStoreItem.loading) {
                newStoreItem.loading.then((item: T) => {
                    observer.next(item);
                });
            } else {
                newStoreItem.loading = this.getter(...args);
                newStoreItem.loading.then((item: T) => {
                    if (newStoreItem.subscriptions <= 0) {
                        //when meanwhile all subscribed unsubscribed
                    } else {
                        newStoreItem.item = item;
                        observer.next(item);
                    }
                    newStoreItem.loading = undefined;
                }, (error) => {
                    observer.error(error);
                });
            }

            return {
                unsubscribe: () => {
                    //we wait a bit until we completely unsubscribe
                    //so a dirty checking does not result in immediate reloading
                    setTimeout(() => {
                        newStoreItem.subscriptions--;
                        if (newStoreItem.subscriptions <= 0) {
                            this.store.delete(storeKey);
                        }
                    }, 1000);
                }
            };
        });

        return newStoreItem.observable;
    }
}

interface EntityStoreItem<T extends IdInterface> {
    observable?: Observable<T>;
    loading?: Promise<EntitySubject<T>>;
    subject?: EntitySubject<T>;
    subscriptions: number;
}
export class CachedEntityGetter<T extends IdInterface, ARGS extends any[]> {
    store = new Map<string, EntityStoreItem<T>>();

    constructor(
        public readonly classType: ClassType<T>,
        protected getter: (...args: ARGS) => Promise<EntitySubject<T>>
    ) {

    }

    public get(...args: ARGS): Observable<T> {
        const storeKey = JSON.stringify(args);
        const storeItem = this.store.get(storeKey);

        if (storeItem && storeItem.observable) {
            // storeItem.subscriptions++;
            return storeItem.observable;
        }

        const newStoreItem: EntityStoreItem<T> = {
            subscriptions: 0,
        };
        this.store.set(storeKey, newStoreItem);

        newStoreItem.observable = new Observable<T>((observer) => {
            newStoreItem.subscriptions++;

            if (newStoreItem.subject) {
                newStoreItem.subject.subscribe(observer);
                // observer.next(newStoreItem.subject);
            } else if (newStoreItem.loading) {
                newStoreItem.loading.then((item: EntitySubject<T>) => {
                    item.subscribe(observer);
                });
            } else {
                newStoreItem.loading = this.getter(...args);
                newStoreItem.loading.then((item: EntitySubject<T>) => {
                    if (newStoreItem.subscriptions <= 0) {
                        //when meanwhile all subscribed unsubscribed, we just unsubscribe the stuff
                        item.unsubscribe().catch(() => {
                        });
                    } else {
                        newStoreItem.subject = item;
                        newStoreItem.subject.subscribe(observer);
                    }
                    newStoreItem.loading = undefined;
                }, (error) => {
                    observer.error(error);
                });
            }

            return {
                unsubscribe: () => {
                    //we wait a bit until we completely unsubscribe
                    //so a dirty checking does not result in immediate reloading
                    setTimeout(() => {
                        newStoreItem.subscriptions--;
                        if (newStoreItem.subscriptions <= 0) {
                            this.store.delete(storeKey);
                            if (newStoreItem.subject) {
                                newStoreItem.subject.unsubscribe().catch(() => {
                                });
                            }
                        }
                    }, 1000);
                }
            };
        });

        return newStoreItem.observable;
    }
}
