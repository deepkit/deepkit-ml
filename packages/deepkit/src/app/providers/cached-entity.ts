/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {ClassType} from "@marcj/estdlib";
import {PublicUser} from "@deepkit/core";
import {Injectable} from "@angular/core";
import {ControllerClient} from "./controller-client";
import {ReplaySubject} from "rxjs";

@Injectable()
export class CachedEntity {
    protected store = new Map<ClassType<any>, Map<string, any>>();

    constructor(protected controllerClient: ControllerClient) {
    }


    getStore(classType: ClassType<any>): Map<string, { rootEntity: ReplaySubject<any>, users: number }> {
        if (this.store.has(classType)) {
            return this.store.get(classType)!;
        }

        const store = new Map();
        this.store.set(classType, store);
        return store;
    }

    public subscribePublicUser(id: string): ReplaySubject<PublicUser | undefined> {
        const store = this.getStore(PublicUser);

        if (!store.has(id)) {
            const item = {
                rootEntity: new ReplaySubject(1),
                users: 0,
            };
            store.set(id, item);

            this.controllerClient.public().subscribeUser(id).then((user) => {
                if (user) {
                    user.subscribe(item.rootEntity);
                } else {
                    item.rootEntity.next(undefined);
                }
            });
        }
        const item = store.get(id)!;
        item.users++;

        const subject = new ReplaySubject<PublicUser | undefined>(1);
        const sub = item.rootEntity.subscribe(subject);

        subject.subscribe().add(() => {
            sub.unsubscribe();
            item.users--;
            if (item.users <= 0) {
                item.rootEntity.unsubscribe();
                store.delete(id);
            }
        });

        return subject;
    }
}
