import {ChangeDetectorRef, Component, Inject, OnInit} from "@angular/core";
import {HttpClient} from "@angular/common/http";
import {f, plainToClass} from "@marcj/marshal";

class Release {
    @f version!: string;
    @f hide!: boolean;
    @f.type(Date) released!: Date;
    @f releasenotes!: string;
}

@Component({
    template: `
        <div class="wrapper main text">

            <h1>Download</h1>

            <div class="branch">
                <div [class.active]="!showNext" (click)="showNext = false">Current</div>
                <div *ngIf="isNextAvailable()" [class.active]="showNext" (click)="showNext = true">Next</div>
            </div>

            <div class="boxes">
                <div class="box desktop-app">
                    <h3>Deepkit Desktop App</h3>
                    <p class="sub">
                        incl. CLI tools
                    </p>

                    <p *ngIf="loaded">
                        Release {{getRelease().version}}
                    </p>

                    <div class="buttons">
                        <a class="button" target="_blank" href="/download/file/{{getOSXFilePath()}}">macOS</a>
                        <a class="button" target="_blank" href="/download/file/{{getLinuxFilePath()}}">Linux</a>
                    </div>

                    <div class="getting-started">
                        <a routerLink="/documentation/getting-started">Getting started</a> |
                        <a target="_blank" href="/download/file/{{getWindowsFilePath()}}">Windows (experimental)</a>
                    </div>
                </div>

                <div class="box">
                    <h3>Deepkit Team Server</h3>
                    <p class="sub">
                        incl. web user interface
                    </p>

                    <p *ngIf="loaded">
                        Release {{getRelease().version}}
                    </p>

                    <div class="buttons">
                        <a class="button" routerLink="/documentation/server/getting-started">Install Docker</a>
                    </div>
                    <div class="getting-started">
                        &nbsp;
                    </div>
                </div>
            </div>

            <div class="doc-content changelog">
                <h2>Changelog</h2>
                <ng-container *ngIf="next as release">
                    <h3>Next / Nightly</h3>
                    <markdown [data]="release.releasenotes"></markdown>
                </ng-container>

                <ng-container *ngFor="let release of releases|slice:0:max">
                    <h3>{{release.version}}</h3>
                    <div class="released">released {{release.released|date}}</div>
                    <markdown [data]="release.releasenotes"></markdown>
                </ng-container>

                <a class="button" *ngIf="releases.length > max" (click)="max =  max + 5">Show more</a>
            </div>
        </div>
    `,
    styleUrls: [`./download-page.component.scss`]
})
export class DownloadPageComponent implements OnInit {
    public releases: Release[] = [];
    public current?: Release;
    public next?: Release;
    max = 5;

    showNext = false;
    loaded = false;

    constructor(
        private http: HttpClient,
        private cd: ChangeDetectorRef,
        @Inject('ORIGIN_URL') public baseUrl: string,
    ) {
    }

    isNextAvailable() {
        return !!this.next;
    }

    getRelease() {
        if (this.showNext) {
            if (!this.next) {
                throw new Error('No next version');
            }
            return this.next;
        }

        if (!this.current) {
            throw new Error('No current version');
        }
        return this.current;
    }

    public getOSXFilePath() {
        if (!this.loaded) return '';

        const release = this.getRelease();
        return 'Deepkit-' + release.version + '.dmg';
    }

    public getLinuxFilePath() {
        if (!this.loaded) return '';

        const release = this.getRelease();
        return 'Deepkit-' + release.version + '.AppImage';
    }

    public getWindowsFilePath() {
        if (!this.loaded) return '';

        const release = this.getRelease();
        return 'Deepkit Setup ' + release.version + '.exe';
    }

    async ngOnInit() {
        const a = (await this.http.get(this.baseUrl + 'releases').toPromise()) as any;

        this.releases = a.releases.map(v => plainToClass(Release, v));
        this.releases = this.releases.filter(v => !v.hide);
        this.next = this.releases.find(v => v.version === 'next');

        this.releases.sort((a, b) => {
            if (a.version < b.version) return +1;
            if (a.version > b.version) return -1;
            return 0;
        });

        this.next = this.releases.find(v => v.version === 'next');
        this.releases = this.releases.filter(v => v.version !== 'next');
        this.current = this.releases[0];
        if (this.next && this.next.released < this.current.released) {
            this.next = undefined;
        }

        this.loaded = true;
        this.cd.detectChanges();
    }
}
