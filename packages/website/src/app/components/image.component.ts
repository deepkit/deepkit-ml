import {Component, Input} from "@angular/core";

@Component({
    selector: 'dkw-image',
    template: `
        <div class="loupe"></div>
        <a [href]="src" target="_blank">
            <img [src]="src"/>
        </a>
    `,
    host: {
        '[class.shadow]': 'shadow !== false'
    },
    styles: [`
        :host {
            display: inline-block;
            max-width: 100%;
        }

        .loupe {
            display: none;
        }

        img {
            max-width: 100%;
            border: 5px solid #323232;
            border-radius: 5px;
        }

        :host.shadow img {
            box-shadow: -10px -10px 4px 0 rgba(0, 0, 0, 0.15);
        }
    `]
})
export class ImageComponent {
    @Input() src!: string;
    @Input() shadow: boolean | '' = false;
}
