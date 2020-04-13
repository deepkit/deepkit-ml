import {RESPONSE} from '@nguniversal/express-engine/tokens';
import {Component, OnInit, Inject, Optional} from '@angular/core';
import {Response} from 'express';

@Component({
    template: `
        <div class="wrapper main text">
            <h1>Lost</h1>

            <p>404 - not found</p>
        </div>
    `,
})
export class NotFoundComponent implements OnInit {
    private response: Response;

    constructor(@Optional() @Inject(RESPONSE) response: any) {
        this.response = response;
    }

    ngOnInit() {
        if (this.response) {
            // response will only be if we have express
            // this.response.statusCode = 404;
            this.response.status(404);
        }
    }

}
