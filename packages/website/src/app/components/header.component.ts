import {ChangeDetectorRef, Component, Input, SkipSelf} from "@angular/core";
import {ActivatedRoute, ActivationEnd, NavigationEnd, Router} from "@angular/router";

@Component({
    selector: 'dw-header',
    template: `
        <div class="wrapper">
            <a routerLink="/"><img src="/assets/images/deepkit_white.svg"/></a>
            <nav>
                <a routerLinkActive="active" routerLink="/download">Download</a>
<!--                <a routerLinkActive="active" routerLink="/pricing">Pricing</a>-->
                <a routerLinkActive="active" routerLink="/documentation">Documentation</a>
                <a routerLinkActive="active" routerLink="/support">Support</a>
                <a id="github-logo" href="https://github.com/deepkit/deepkit" target="_blank">
                    <img width="24" height="24" src="/assets/images/github.svg"/>
                </a>
            </nav>
        </div>
    `,
    host: {
        '[class.startpage]': `startpage !== false`
    },
    styleUrls: ['./header.component.scss']
})
export class HeaderComponent {
    startpage = false;

    constructor(
        router: Router,
        route: ActivatedRoute,
        @SkipSelf() cd: ChangeDetectorRef,
    ) {
        router.events.subscribe((e) => {
            if (e instanceof NavigationEnd || e instanceof ActivationEnd) {
                const firstChild = route.firstChild;
                requestAnimationFrame(() => {
                    this.startpage = firstChild.snapshot.data['header'] === 'startpage';
                    cd.detectChanges();
                });
            }
        });
    }
}
