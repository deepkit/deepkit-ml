/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    ChangeDetectorRef,
    Component,
    Directive,
    ElementRef,
    HostListener,
    Input,
    TemplateRef,
    ViewChild,
    ViewContainerRef
} from "@angular/core";
import {Overlay, OverlayRef} from "@angular/cdk/overlay";
import {TemplatePortal} from "@angular/cdk/portal";

@Component({
    selector: 'dk-menu',
    exportAs: 'dkMenu',
    template: `
        <ng-template #dropDown>
            <div class="menu" (mouseup)="click()">
                <ng-content></ng-content>
            </div>
        </ng-template>
    `,
    styleUrls: ['./menu.component.scss']
})
export class MenuComponent {
    @Input() closedOnClick: boolean = true;

    private overlayRef?: OverlayRef;

    @ViewChild('dropDown', {static: true}) dropDown!: TemplateRef<any>;

    constructor(
        private overlay: Overlay,
        private viewContainerRef: ViewContainerRef,
        private cd: ChangeDetectorRef,
    ) {
    }

    click() {
        if (this.closedOnClick) {
            setTimeout(() => {
                this.close();
            });
        }
    }

    public show(relativeTo: ElementRef) {
        if (this.overlayRef) return;

        this.overlayRef = this.overlay.create({
            hasBackdrop: true,
            positionStrategy: this.overlay
                .position()
                .flexibleConnectedTo(relativeTo)
                .withPositions([{
                    originX: 'end',
                    originY: 'bottom',
                    overlayX: 'end',
                    overlayY: 'top',
                }])
        });

        this.overlayRef.backdropClick().subscribe(() => {
            this.close();
        });

        this.overlayRef.attach(new TemplatePortal(this.dropDown, this.viewContainerRef));
        this.overlayRef.updatePosition();
    }

    public toggle(relativeTo: ElementRef) {
        if (this.overlayRef) {
            this.close();
        } else {
            this.show(relativeTo);
        }
    }

    public close() {
        if (this.overlayRef) {
            this.overlayRef.dispose();
            this.overlayRef = undefined;
        }
    }
}

@Directive({
    selector: '[menuTriggerFor]'
})
export class MenuTriggerDirective {
    @Input() menuTriggerFor?: MenuComponent;

    constructor(
        private viewContainerRef: ViewContainerRef,
    ) {
    }

    @HostListener('click')
    public click() {
        if (this.menuTriggerFor) {
            this.menuTriggerFor.toggle(this.viewContainerRef.element);
        } else {
            console.error('menuTriggerFor does not exist');
        }
    }
}
