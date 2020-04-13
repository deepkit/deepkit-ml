import {Inject, Injectable} from "@angular/core";
import {HttpClient} from "@angular/common/http";
import {stack} from "@marcj/estdlib";

interface Page {
    title: string;
    url: string;
    section: string;
    order: number;
    markdown: string;
}

@Injectable()
export class Docu {
    pages?: {
        sections: { title: string, order: number, url: string }[], pages: Page[]
    };

    pageMap?: { [url: string]: Page };

    constructor(
        @Inject('ORIGIN_URL') public baseUrl: string,
        private http: HttpClient,
    ) {
    }

    @stack()
    async loadPages() {
        if (this.pages) return;

        this.pages = (await this.http.get(this.baseUrl + 'docu-pages').toPromise()) as any;
        this.pageMap = {};
        for (const page of this.pages.pages) {
            this.pageMap[(page.section ? page.section + '/' : '') + page.url] = page;
        }
    }

    getUrl(page: Page) {
        return (page.section ? page.section + '/' : '') + page.url;
    }

    getSections() {
        return this.pages.sections.sort((a, b) => {
            if (a.order < b.order) return -1;
            if (a.order > b.order) return 1;
            return 0;
        });
    }

    getPages(section: string) {
        if (!this.pages) return [];

        return this.pages.pages.filter(p => p.section === section).sort((a, b) => {
            if (a.order < b.order) return -1;
            if (a.order > b.order) return 1;
            if (a.title < b.title) return -1;
            if (a.title > b.title) return 1;
            return 0;
        });
    }
}
