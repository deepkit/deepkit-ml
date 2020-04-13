import {Component, ElementRef, Inject, OnInit, PLATFORM_ID, ViewChild} from "@angular/core";
import {isPlatformBrowser} from "@angular/common";

@Component({
    templateUrl: './index-page.component.html',
    styleUrls: ['./index-page.component.scss']
})
export class IndexPageComponent implements OnInit {
    @ViewChild('video', {read: ElementRef}) video?: ElementRef;

    constructor(
        @Inject(PLATFORM_ID) protected platformId
    ) {
    }

    ngOnInit() {
        setTimeout(() => {
            if (this.video && isPlatformBrowser(this.platformId)) {
                (this.video.nativeElement as HTMLVideoElement).play();
            }
        }, 500);
    }
}
