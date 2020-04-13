import {ChangeDetectorRef, Component, HostListener, Inject, OnInit, Optional} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import {RESPONSE} from "@nguniversal/express-engine/tokens";
import {Docu} from "../provider/docu";
import {AnchorService} from "../provider/anchor";
import {TitleService} from "../provider/title";

@Component({
    template: `
        <div class="wrapper main">
            <div class="sidebar">
                <a *ngFor="let page of docu.getPages('')" routerLink="/documentation/{{page.url}}"
                   [class.active]="docu.getUrl(page) === selectedUrl"
                >{{page.title}}</a>

                <ng-container *ngIf="docu.pages">
                    <div class="section" *ngFor="let section of docu.getSections()">
                        <div class="section-title">{{section.title}}</div>
                        <a *ngFor="let page of docu.getPages(section.url)"
                           [class.active]="docu.getUrl(page) === selectedUrl"
                           routerLink="/documentation/{{docu.getUrl(page)}}">{{page.title}}</a>
                    </div>
                </ng-container>
            </div>

            <div class="content doc-content">
                <ng-container *ngIf="docu.pageMap && docu.pageMap[selectedUrl]">
                    <markdown [data]="docu.pageMap[selectedUrl].markdown"></markdown>
                </ng-container>
            </div>

        </div>
    `,
    styleUrls: ['./documentation-page.component.scss']
})
export class DocumentationPageComponent implements OnInit {
    selectedUrl = 'home';

    constructor(
        protected anchorService: AnchorService,
        protected route: ActivatedRoute,
        protected title: TitleService,
        protected cd: ChangeDetectorRef,
        public docu: Docu,
        @Optional() @Inject(RESPONSE) protected response: any,
    ) {
        route.firstChild.url.subscribe(async v => {
            this.selectedUrl = v.map(u => u.path).join('/');
            this.setTitle();
        });
    }

    protected setTitle() {
        if (this.docu.pageMap && this.docu.pageMap[this.selectedUrl]) {
            this.title.setTitle(this.docu.pageMap[this.selectedUrl].title + ' Documentation');
        }
    }

    async ngOnInit() {
        await this.docu.loadPages();
        this.setTitle();
        this.cd.detectChanges();
        this.anchorService.scrollToAnchor();
    }

    @HostListener('click', ['$event'])
    public onClick($event: MouseEvent) {
        this.anchorService.interceptClick($event);
    }
}
