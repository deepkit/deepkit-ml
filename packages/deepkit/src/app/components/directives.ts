/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Directive} from "@angular/core";
import {
    NgModel,
} from "@angular/forms";

@Directive({
    selector: '[change-and-set]'
})
export class ChangeAndSetDirective {
    // @Input('name') name?: string;
    // @Input('header') header?: string;

    constructor(
        ngModel: NgModel,

    ) {
        console.log('ChangeAndSetDirective', ngModel);

        ngModel.update.subscribe(() => {
            console.log('Changed lol');
        });
    }
}
