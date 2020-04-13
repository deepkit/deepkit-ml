/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

function lazyInitialize(target: any, name: string = '__values'): any {
    if (!target[name]) {
        target[name] = {};

        Object.defineProperty(target, name, {
            enumerable: false,
            configurable: false,
            value: target[name]
        });
    }

    return target[name];
}

export function CoerceBoolean(handleEmptyStringAs?: boolean) {
    return (target: any, propertyKey: string) => {
        Object.defineProperty(target, propertyKey, {
            enumerable: true,
            configurable: false,
            get() {
                const store = lazyInitialize(this);
                return store[propertyKey];
            },

            set(value) {
                const store = lazyInitialize(this);
                if (value === '') {
                    store[propertyKey] = handleEmptyStringAs;
                } else {
                    store[propertyKey] = Boolean(value);
                }
            }
        });
    };
}

export function CoerceNumber(handleEmptryStringAs?: boolean) {
    return (target: any, propertyKey: string) => {
        Object.defineProperty(target, propertyKey, {
            enumerable: true,
            configurable: false,
            get() {
                const store = lazyInitialize(this);
                return store[propertyKey];
            },

            set(value) {
                const store = lazyInitialize(this);
                if (value === '') {
                    store[propertyKey] = handleEmptryStringAs;
                } else {
                    store[propertyKey] = Number(value);
                }
            }
        });
    };
}
