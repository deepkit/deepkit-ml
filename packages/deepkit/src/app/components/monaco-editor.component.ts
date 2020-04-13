/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    ChangeDetectorRef,
    Component,
    ElementRef, HostListener,
    Injector,
    Input, OnChanges,
    OnDestroy,
    OnInit, SimpleChanges,
    SkipSelf,
    ViewChild
} from "@angular/core";
import {ngValueAccessor, ValueAccessorBase} from "../../ui/form";
import {editor, Uri} from "monaco-editor";
import {fromEvent, Subscription} from "rxjs";
import set = Reflect.set;

@Component({
    selector: 'monaco-editor',
    template: '<div class="editor-container" #editorContainer></div>',
    styleUrls: ['./monaco-editor.component.scss'],
    providers: [ngValueAccessor(MonacoEditorComponent)],
})
export class MonacoEditorComponent extends ValueAccessorBase<string> implements OnInit, OnDestroy, OnChanges {
    @Input() textModel?: editor.ITextModel;
    @Input() options?: editor.IEditorConstructionOptions;

    /**
     * to autodetect language.
     */
    @Input() fileName?: string;

    /**
     * If set it is used to create a createDiffEditor
     */
    @Input() modified?: string;

    protected baseOptions: editor.IEditorConstructionOptions = {
        roundedSelection: false,
        renderLineHighlight: 'all',
        theme: document.body.classList.contains('dark') ? 'vs-dark' : 'vs',
        minimap: {
            enabled: false,
        }
    };

    protected windowResizeSubscription?: Subscription;
    protected editor?: editor.IStandaloneCodeEditor;
    protected diffEditor?: editor.IStandaloneDiffEditor;

    @ViewChild('editorContainer', {static: true}) editorContainer?: ElementRef;

    constructor(
        protected injector: Injector,
        protected cd: ChangeDetectorRef,
        @SkipSelf() protected cdParent: ChangeDetectorRef,
    ) {
        super(injector, cd, cdParent);
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        if (this.windowResizeSubscription) {
            this.windowResizeSubscription.unsubscribe();
        }

        if (this.editor) {
            this.editor.dispose();
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        this.setModel();
    }

    ngOnInit(): void {
        if (this.modified !== undefined) {
            this.diffEditor = editor.createDiffEditor(this.editorContainer!.nativeElement, Object.assign({
                enableSplitViewResizing: false,
                renderSideBySide: false
            }, this.baseOptions, this.options));
        } else {
            this.editor = editor.create(this.editorContainer!.nativeElement, Object.assign(this.baseOptions, this.options));
            this.editor.onDidChangeModelContent(() => {
                this.innerValue = this.editor!.getValue();
            });
            this.editor.setModel(this.textModel || null);
        }

        this.windowResizeSubscription = fromEvent(window, 'resize').subscribe(() => {
            this.editor && this.editor.layout();
        });
    }

    @HostListener('window:theme-changed')
    changeColors() {
        const theme = document.body.classList.contains('dark') ? 'vs-dark' : 'vs';
        editor.setTheme(theme);
    }

    protected async onInnerValueChange() {
        if (this.textModel) return;

        this.setModel();
    }

    protected setModel() {
        if (this.textModel && this.editor) {
            this.editor.setModel(this.textModel);
            return;
        }

        const uri = Uri.file(this.fileName || '');
        let model = editor.getModel(uri);
        if (!model) {
            model = editor.createModel(this.innerValue || '', undefined, uri);
        }

        model.setValue(this.innerValue || '');

        if (this.editor) {
            this.editor.setModel(model);
        }

        if (this.diffEditor && this.modified !== undefined) {
            this.diffEditor.setModel({
                original: model,
                modified: editor.createModel(this.modified, "text/plain"),
            });
        }
    }
}
