import {Component} from "@angular/core";

@Component({
    selector: 'dw-footer',
    template: `
        <div class="wrapper">
            <div class="left">
                <img src="../../assets/images/deepkit_dark.svg"/>
                <div class="copyright">
                    © {{year}} Deepkit®<br/>
                    All rights reserved
                </div>
            </div>
            <div class="navi">
                <a routerLink="/contact">Contact</a>
                <a routerLink="/data-protection">Data protection</a>
            </div>
        </div>
    `,
    styleUrls: ['./footer.component.scss']
})
export class FooterComponent {
    get year() {
        return new Date().getFullYear();
    }
}
