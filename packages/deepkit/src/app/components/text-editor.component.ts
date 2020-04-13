/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter, Injector,
    Input,
    OnChanges,
    OnInit,
    Output,
    SimpleChanges, SkipSelf,
    ViewChild
} from "@angular/core";
import quill from 'quill';
import {highlightAuto} from 'highlight.js';
import {ImageDrop} from '../../libs/quill-image-drop-module';
import ImageResize from 'quill-image-resize';
import {Subject, Subscription} from "rxjs";
import QuillCursors from 'quill-cursors';
import Delta from 'quill-delta';
import {ValueAccessorBase} from "@marcj/angular-desktop-ui";
import {ngValueAccessor} from "@marcj/angular-desktop-ui";

quill.register('modules/imageDrop', ImageDrop);
quill.register('modules/imageResize', ImageResize);
quill.register('modules/cursor', QuillCursors);

export interface TextEditorChangeEvent {
    ops: any[];
    delta: { ops: any[] };
    html: string;
    innerText: string;
}

@Component({
    selector: 'dk-text-editor',
    template: `
        <dui-button-groups align="center" *ngIf="!viewOnly"
                           style="padding: 3px;">
            <dui-button-group padding="none" *ngIf="isVisible('size')">
                <dui-select small [ngModel]="fontSize" [disabled]="!hasFocus" (ngModelChange)="format('size', $event)"
                            textured style="width: 45px;">
                    <dui-option value="8px">8</dui-option>
                    <dui-option value="9px">9</dui-option>
                    <dui-option value="10px">10</dui-option>
                    <dui-option value="11px">11</dui-option>
                    <dui-option value="12px">12</dui-option>
                    <dui-option value="13px">13</dui-option>
                    <dui-option value="14px">14</dui-option>
                    <dui-option value="16px">16</dui-option>
                    <dui-option value="18px">18</dui-option>
                    <dui-option value="24px">24</dui-option>
                    <dui-option value="32px">32</dui-option>
                    <dui-option value="48px">48</dui-option>
                </dui-select>
            </dui-button-group>

            <dui-button-group padding="none" *ngIf="isVisible('basics')">
                <dui-button textured small [active]="currentFormat['bold'] == true" [disabled]="!hasFocus"
                            (click)="format('bold')" icon="15_text-format-bold"></dui-button>
                <dui-button textured small [active]="currentFormat['italic'] == true" [disabled]="!hasFocus"
                            (click)="format('italic')" icon="15_text-format-italic"></dui-button>
                <dui-button textured small [active]="currentFormat['underline'] == true" [disabled]="!hasFocus"
                            (click)="format('underline')" icon="15_text-format-underline"></dui-button>
                <dui-button textured small [active]="currentFormat['strike'] == true" [disabled]="!hasFocus"
                            (click)="format('strike')" icon="15_text-format-strikethrough"></dui-button>
            </dui-button-group>

            <dui-button-group padding="none" *ngIf="isVisible('align')">
                <dui-button textured small [active]="!currentFormat['align']" [disabled]="!hasFocus"
                            (click)="format('align', false)" icon="15_text-format-align-left"></dui-button>
                <dui-button textured small [active]="currentFormat['align'] == 'center'" [disabled]="!hasFocus"
                            (click)="format('align', 'center')" icon="15_text-format-align-center"></dui-button>
                <dui-button textured small [active]="currentFormat['align'] == 'right'" [disabled]="!hasFocus"
                            (click)="format('align', 'right')" icon="15_text-format-align-right"></dui-button>
            </dui-button-group>

            <dui-button-group padding="none" *ngIf="isVisible('list')">
                <dui-button textured small [openDropdown]="bullets" [disabled]="!hasFocus"
                            icon="15_text-format-bullets"></dui-button>
            </dui-button-group>
            <dui-dropdown #bullets>
                <dui-dropdown-item [selected]="currentFormat['list'] == 'bullet'" (click)="format('list', 'bullet')">
                    Bullet list
                </dui-dropdown-item>
                <dui-dropdown-item [selected]="currentFormat['list'] == 'ordered'" (click)="format('list', 'ordered')">
                    Numbered list
                </dui-dropdown-item>
            </dui-dropdown>

            <dui-button-group padding="none" *ngIf="isVisible('indent')">
                <dui-button textured small [disabled]="!hasFocus" (click)="indent(1)"
                            icon="15_text-format-indent"></dui-button>
                <dui-button textured small [disabled]="!hasFocus" (click)="indent(-1)"
                            icon="15_text-format-unindent"></dui-button>
            </dui-button-group>
            <dui-button-group padding="none" *ngIf="isVisible('code-and-reset')">
                <dui-button textured small [disabled]="!hasFocus" [active]="currentFormat['code-block'] == true"
                            (click)="format('code-block')" icon="15_text-format-code"></dui-button>
                <dui-button textured small [disabled]="!hasFocus"
                            (click)="removeFormat()" [iconSize]="15" icon="garbage"></dui-button>
            </dui-button-group>
        </dui-button-groups>

        <div #editor></div>
    `,
    styleUrls: [`./text-editor.component.scss`],
    host: {
        '[class.transparent]': 'transparent !== false || viewOnly',
        '[class.view-only]': 'viewOnly',
    },
    providers: [ngValueAccessor(TextEditorComponent)]
})
export class TextEditorComponent extends ValueAccessorBase<any> implements OnInit, OnChanges {
    @ViewChild('editor', {static: true}) editor?: ElementRef;
    public quill?: any;

    @Input() viewOnly: boolean = false;

    @Input() toolbar: 'full' | 'small' = 'full';

    toolbarMapping: {[mode: string]: string[]} = {
        full: ['size', 'basics', 'align', 'list', 'indent', 'code-and-reset'],
        small: ['basics', 'list', 'code-and-reset'],
    };

    @Input() historyId: string = '';

    @Input() transparent: boolean | '' = false;

    @Input() applyDelta: Subject<any[]> = new Subject<any[]>();

    historyStacks: { [historyId: string]: any } = {};

    hasFocus: boolean = false;
    currentFormat: any = {};
    fontSize = '13px';

    @Output() fullChange = new EventEmitter<TextEditorChangeEvent>();
    @Output() allChange = new EventEmitter<TextEditorChangeEvent>();

    @Output() delta = new EventEmitter<any>();

    @Output() selection = new EventEmitter<any>();

    protected applyDeltaSub?: Subscription;

    constructor(
        protected injector: Injector,
        public readonly cd: ChangeDetectorRef,
        @SkipSelf() public readonly cdParent: ChangeDetectorRef,
    ) {
        super(injector, cd, cdParent);
    }

    isVisible(item: string) {
        return this.toolbarMapping[this.toolbar].includes(item);
    }

    async writeValue(value?: any) {
        //set dummy, so our actual historyStack is not changed
        this.quill!.history.stack = {undo: [], redo: []};
        super.writeValue(value);
        this.quill!.setContents(new Delta(this.innerValue || []), 'api');
        this.restoreHistory();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (!this.quill) return;
        this.quill!.enable(!this.viewOnly);

        if (changes.applyDelta) {
            this.innerValue = [];
            this.setModelValue();
            if (this.applyDeltaSub) this.applyDeltaSub.unsubscribe();
            let first = true;
            this.applyDeltaSub = this.applyDelta.subscribe((next) => {
                if (first) {
                    //set dummy, so our actual historyStack is not changed
                    this.quill!.history.stack = {undo: [], redo: []};
                }

                this.quill!.updateContents(new Delta(next), 'api');

                if (first) {
                    this.restoreHistory();
                }

                first = false;
            });
        } else {
            this.setModelValue();
        }
    }

    protected setModelValue() {
        const hadFocus = this.quill.hasFocus();

        //reset stack, so changes wont get added
        this.quill!.history.stack = {undo: [], redo: []};

        this.quill!.setContents(this.innerValue || [], 'api');
        if (!hadFocus) this.quill!.blur();
    }

    protected restoreHistory() {
        //now set stack back
        if (this.historyStacks[this.historyId]) {
            this.quill!.history.stack = this.historyStacks[this.historyId];
        } else {
            this.historyStacks[this.historyId] = {undo: [], redo: []};
            this.quill!.history.stack = this.historyStacks[this.historyId];
        }
    }

    public removeFormat() {
        const selection = this.quill.getSelection();
        this.quill.removeFormat(selection.index, selection.length, 'user');
    }

    public indent(value: number) {
        const formats = this.quill.getFormat();
        const indent = parseInt(formats.indent || 0, 10);
        if (value === 1 || value === -1) {
            if (formats.direction === 'rtl') value *= -1;
            this.quill.format('indent', indent + value, 'user');
        }
    }

    public format(name: string, value?: any) {
        const current = this.quill.getFormat()[name];
        if (value !== undefined && value === current) {
            value = undefined;
        } else if (value === undefined) {
            //toggle
            value = !current;
        }
        this.quill!.format(name, value, 'user');
        this.updateStylesToolbar();
    }

    ngOnInit(): void {
        const fontSizeStyle = quill.import('attributors/style/size');
        fontSizeStyle.whitelist = ['8px', '9px', '10px', '11px', '12px', '13px', '14px', '16px', '18px', '24px', '32px', '48px'];
        quill.register(fontSizeStyle, true);

        this.quill = new (quill as any)(this.editor!.nativeElement, {
            theme: 'snow',
            modules: {
                imageDrop: true,
                cursor: {
                    // selectionChangeSource: null,
                    transformOnTextChange: true,
                },
                imageResize: {
                    modules: ['Resize'],
                    displayStyles: {
                        backgroundColor: 'var(--line-color)',
                        border: 'none',
                    }
                },
                clipboard: {
                    matchVisual: false // https://quilljs.com/docs/modules/clipboard/#matchvisual
                },
                syntax: {
                    highlight: (code: any) => {
                        return highlightAuto(code).value;
                    },
                    interval: 10,
                    languages: ['typescript', 'javascript', 'python', 'xml', 'sql', 'r', 'json', 'bash', 'shell']
                },
                toolbar: false
            }
        });
        this.quill.clipboard.addMatcher(Node.ELEMENT_NODE, (node: any, delta: any) => {
            for (const op of delta.ops) {
                if (op.attributes) {
                    delete op.attributes.background;
                    delete op.attributes.color;
                    delete op.attributes.size;
                }
            }
            return delta;
        });

        this.quill!.enable(!this.viewOnly);
        this.quill!.on('text-change', (delta: any, oldDelta: any, source: any) => {
            if (source === 'user') {
                this.innerValue = this.quill!.getContents().ops.slice(0);
                this.touch();
                this.delta.next(delta);
                this.fullChange.next({
                    ops: this.quill!.getContents().ops,
                    delta: delta,
                    html: this.quill!.root.innerHTML,
                    innerText: this.quill!.root.innerText.trim()
                });
                this.selection.next(this.quill!.getSelection());
                this.updateStylesToolbar();
            }
            this.allChange.next(delta);
        });

        this.quill!.on('blur', () => {
            this.updateStylesToolbar();
        });

        this.quill!.on('selection-change', (range: any, oldRange: any, source: string) => {
            this.selection.next(range);
            this.updateStylesToolbar();
        });

        this.setModelValue();
        this.updateStylesToolbar();
    }

    protected updateStylesToolbar() {
        this.hasFocus = this.quill!.hasFocus();
        if (this.hasFocus) {
            this.currentFormat = this.quill!.getFormat();
            this.fontSize = this.currentFormat['size'] || '13px';
        }
        this.cd.detectChanges();
    }
}
