/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Component, ElementRef, HostListener, Input, OnChanges, OnDestroy, OnInit, SimpleChanges} from "@angular/core";
import * as xterm from 'xterm';
import {Observable} from "rxjs";
import {StreamBehaviorSubject} from "@marcj/glut-core";
import {Subscriptions} from "@marcj/estdlib-rxjs";
import {unsubscribe} from "../reactivate-change-detection";
import {Buffer} from "buffer";
import {FitAddon} from 'xterm-addon-fit';
import {SearchAddon} from 'xterm-addon-search';
import {arrayBufferTo} from "@marcj/marshal";

function getThemeColors() {
    if (document.body.classList.contains('dark')) {
        return {
            background: '#323232',
            foreground: '#ffffff',
            cursor: '#929292',
            selection: '#7b93cd3d',
        };
    }

    return {
        background: '#ececec',
        foreground: '#171B1E',
        cursor: '#929292',
        selection: '#7b93cd80',
    };
}

@Component({
    selector: 'dk-term',
    template: '',
    styles: [`
        :host {
            display: block;
            height: 100%;
            position: relative;
        }
    `]
})
export class TermComponent implements OnInit, OnChanges, OnDestroy {
    @Input() data?: Observable<string | Buffer> | StreamBehaviorSubject<string | Buffer>;
    @Input() scrollback = 1000;
    @Input() searchQuery: string = '';

    protected term = new xterm.Terminal({
        convertEol: true,
        rendererType: "canvas",
        fontSize: 12,
        scrollback: this.scrollback,
        theme: getThemeColors(),
    });

    protected searchAddon = new SearchAddon()
    protected fitAddon = new FitAddon();

    protected inited = false;

    @unsubscribe()
    protected subs = new Subscriptions;

    constructor(protected element: ElementRef) {
        this.term.loadAddon(this.fitAddon);
        this.term.loadAddon(this.searchAddon);
    }

    @HostListener('window:theme-changed')
    changeColors() {
        this.term.setOption('theme', getThemeColors());
    }

    @HostListener('window:resize')
    resized() {
        try {
            this.fitAddon.fit();
        } catch {
        }
    }

    public searchNext() {
        this.searchAddon.findNext(this.searchQuery, {});
    }

    public searchPrevious() {
        this.searchAddon.findPrevious(this.searchQuery, {});
    }

    ngOnChanges(changes: SimpleChanges): void {
        this.subs.unsubscribe();

        if (changes.scrollback) {
            this.term.setOption('scrollback', this.scrollback);
        }

        if (changes.searchQuery) {
            this.searchAddon.findNext(this.searchQuery, {
                incremental: true
            });
        }

        if (changes.data && this.data) {
            if (!this.inited) {
                this.term.open(this.element.nativeElement);
                this.inited = true;
            }

            setTimeout(() => {
                this.term.clear();

                if (this.data instanceof StreamBehaviorSubject) {
                    this.data.subscribe((v: any) => {
                        this.term.clear();
                        this.term.write(v instanceof Buffer ? v.toString('utf8') : (v || ''));
                    });

                    this.subs.add = this.data.appendSubject.subscribe((next) => {
                        this.term.write(next instanceof ArrayBuffer ? arrayBufferTo(next, 'utf8') : (next || ''));
                    });
                } else {
                    this.subs.add = this.data!.subscribe((v) => {
                        this.term.write(v instanceof Buffer ? v.toString('utf8') : (v || ''));
                    });
                }
                try {
                    this.fitAddon.fit();
                } catch (error) {
                }
                this.term.scrollToBottom();
            });
        }
    }

    ngOnDestroy() {
        this.term.dispose();
    }

    ngOnInit() {
        setTimeout(() => {
            try {
                this.fitAddon.fit();
            } catch (e) {
            }
        });
    }
}
