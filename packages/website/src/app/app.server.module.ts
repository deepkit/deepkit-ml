import {NgModule} from '@angular/core';
import {ServerModule} from '@angular/platform-server';

import {AppModule} from './app.module';
import {AppComponent} from './app.component';

@NgModule({
    imports: [
        AppModule,
        ServerModule,
    ],
    providers: [
        {provide: 'ORIGIN_URL', useValue: 'http://localhost:4000/'}
    ],
    bootstrap: [AppComponent],
})
export class AppServerModule {
}
