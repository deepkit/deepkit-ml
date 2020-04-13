/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

export class LocalStorageProperty<T> {
    protected _value: T;
    protected loaded = false;

    get value(): T {
        if (!this.loaded) this.load();
        return this._value;
    }

    set value(v) {
        this._value = v;
        this.save();
    }

    constructor(protected path: string, protected defaultValue?: any) {
        this._value = this.defaultValue;
    }

    load() {
        try {
            this._value = JSON.parse(localStorage.getItem(this.path)!);
            if (this._value === undefined || this._value === null) {
                this._value = this.defaultValue;
            }
        } catch (error) {
        }
        this.loaded = true;
    }

    save() {
        localStorage.setItem(this.path, JSON.stringify(this._value));
    }
}
