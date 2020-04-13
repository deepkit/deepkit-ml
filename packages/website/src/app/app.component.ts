import {ChangeDetectorRef, Component, Inject, Injector, PLATFORM_ID} from '@angular/core';
import {ActivatedRoute, ActivationEnd, NavigationEnd, Router} from "@angular/router";
import {isPlatformBrowser} from "@angular/common";
import {Docu} from "./provider/docu";
import {TitleService} from "./provider/title";

@Component({
    selector: 'app-root',
    host: {
        '[class.dark]': 'dark'
    },
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent {
    dark = false;

    constructor(
        router: Router,
        route: ActivatedRoute,
        cd: ChangeDetectorRef,
        injector: Injector,
        docu: Docu,
        title: TitleService,
        @Inject(PLATFORM_ID) platformId
    ) {

        if (isPlatformBrowser(platformId)) {
            docu.loadPages();
        }

        router.events.subscribe((e) => {
            if (e instanceof NavigationEnd || e instanceof ActivationEnd) {
                const firstChild = route.firstChild;
                requestAnimationFrame(() => {
                    if (firstChild.snapshot.data['title']) {
                        title.setTitle(firstChild.snapshot.data['title']);
                    }
                    this.dark = firstChild.snapshot.data['header'] === 'startpage';
                    cd.detectChanges();
                });
            }
        });
    }
}
