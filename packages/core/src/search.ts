/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import * as moo from 'moo';

export class Search<T> {
    public items: T[] = [];

    public debug = false;

    public compare?: (a: any) => boolean;

    public getter = (a: any, path: string) => a[path];

    constructor(getter?: (a: any, path: string) => any) {
        if (getter) {
            this.getter = getter;
        }
    }

    public reset() {
        this.compare = undefined;
    }

    public query(query: string) {
        this.parse(query);
        return this.find();
    }

    public parse(query: string, throwOnError = false) {
        this.compare = undefined;

        const lexer = moo.compile({
            string2: {match: /'(?:\\['\\]|[^\n'\\])*'/, value: s => s.slice(1, -1)},
            string: {match: /"(?:\\["\\]|[^\n"\\])*"/, value: s => s.slice(1, -1)},
            and: ['and', 'or', '&&', '||', 'AND', 'OR'],
            lparen: '(',
            rparen: ')',
            operator: /[\!\=\>\<\~]+/,
            word: /[A-Za-zÀ-ž\u0370-\u03FF\u0400-\u04FF\-\_\.\,0-9]+/,
            WS: /[ \t]+/,
        });
        lexer.reset(query);

        let next: any;
        let prevType: string = '';
        const ops: { type: string, value: string }[] = [];

        do {
            next = lexer.next();
            if (next) {
                if (next.type === 'WS') continue;

                // if (prevType === 'word' && prevType === next.type) {
                //     ops[ops.length - 1].value += ' ' + next.value;
                //     continue;
                // }

                prevType = next.type;
                ops.push({type: next.type, value: next.value});
            }
        } while (next);

        if (ops.length) {
            try {
                this.compare = this.buildFunction(ops);
            } catch (error) {
                if (throwOnError) throw error;
            }
        }
    }

    public find(): T[] {
        if (!this.compare) {
            return this.items;
        }

        return this.items.filter(this.compare);
    }

    protected buildFunction(ops: { type: string, value: string }[]) {
        let func = '';
        let lvalue = '';
        // let rvalue = '';
        let operator = '';

        let components = 0;
        let lastRValue = '';
        const anyComparators: string[] = [];

        for (let i = 0; i < ops.length; i++) {
            const op = ops[i];
            let code = op.value;
            if (op.type === 'WS') continue;

            if (this.debug) {
                console.log(op);
            }

            if (op.type === 'operator') {
                code = code === '=' ? '==' : code;
                code = code === '!=' ? '!=' : code;
                operator = code;
            } else if (op.type === 'and') {
                code = code === 'and' ? '&&' : code;
                code = code === 'or' ? '||' : code;
                if (lvalue) {
                    // if (operator && rvalue) {
                    //     func += ' ' + lvalue + ' ' + operator + ' ' + rvalue;
                    // } else {
                    func += ' ' + lvalue;
                    // }
                }
                func += ' ' + code;
            } else if (op.type === 'string' || op.type === 'string2' || op.type === 'word') {
                if (lvalue && lastRValue) {
                    //we just got any anyComparator
                    anyComparators.push(`anyComparator(get(a, undefined), ${lastRValue})`);
                }

                if (isNaN(parseFloat(op.value))) {
                    if (op.value === 'true' || op.value === 'false') {
                        lastRValue = op.value;
                    } else if (op.type === 'string2') {
                        lastRValue = `'${op.value}'`;
                    } else if (op.type === 'string') {
                        lastRValue = `"${op.value}"`;
                    } else if (op.type === 'word') {
                        lastRValue = `"${op.value}"`;
                    }
                } else {
                    //all else is handled as, not as string
                    lastRValue = op.value;
                }

                if (lvalue && operator) {
                    components++;
                    if (operator === '~') {
                        func += ' valueComparator(' + lvalue + ', (a) => -1 !== String(a).indexOf(' + lastRValue + '))';
                    } else {
                        func += ' valueComparator(' + lvalue + ', (a) => a ' + operator + ' ' + lastRValue + ')';
                    }
                    operator = '';
                    lvalue = '';
                    lastRValue = '';
                } else {
                    if (op.type === 'string2') {
                        code = `get(a, '${op.value}')`;
                    } else {
                        code = `get(a, "${op.value}")`;
                    }
                    lvalue = code;
                }
            } else if (op.type === 'lparen' || op.type === 'rparen') {
                if (lvalue) {
                    func += ' ' + lvalue;
                }
                lvalue = '';
                operator = '';
                lastRValue = '';
            } else {
                throw new Error('Unexpected operator: ' + op.type);
            }
        }

        if (lvalue && lastRValue) {
            anyComparators.push(`anyComparator(get(a, undefined), ${lastRValue})`);
        }

        if (components === 0 && anyComparators.length > 0) {
            func = anyComparators.join(' || ');
        }

        func = `return function(a) { return ( ${func} ); };`;

        function valueComparator(lvalue: any, rvalue: (a: any) => boolean): boolean {
            if (lvalue && 'function' === typeof lvalue.sort) {
                return (lvalue as any[]).filter(v => valueComparator(v, rvalue)).length > 0;
            } else {
                return rvalue(lvalue);
            }
        }

        function anyComparator(lvalue: any, rvalue: any): boolean {
            if (lvalue && 'function' === typeof lvalue.sort) {
                return (lvalue as any[]).filter(v => anyComparator(v, rvalue)).length > 0;
            } else if (lvalue !== null && lvalue !== undefined) {
                return String(lvalue).indexOf(rvalue) === 0;
            } else {
                return false;
            }
        }

        // return Function('get', `return function(a) { return true; }`);
        try {
            const f = Function('anyComparator', 'valueComparator', 'get', func) as any;

            return f(anyComparator, valueComparator, this.getter);
        } catch (error) {
            console.error('Code', func);
            throw error;
        }
    }
}
