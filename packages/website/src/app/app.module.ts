import {BrowserModule, Title} from '@angular/platform-browser';
import {NgModule, SecurityContext} from '@angular/core';

import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {IndexPageComponent} from "./pages/index-page.component";
import {FooterComponent} from "./components/footer.component";
import {HeaderComponent} from "./components/header.component";
import {ContactPageComponent} from "./pages/contact-page.component";
import {DataProtectionPageComponent} from "./pages/data-protection-page.component";
import {DownloadPageComponent} from "./pages/download-page.component";
import {DocumentationPageComponent} from "./pages/documentation-page.component";
import {TransferHttpCacheModule} from '@nguniversal/common';
import {MarkdownModule} from "ngx-markdown";
import {HttpClientModule} from "@angular/common/http";
import {CommonModule} from "@angular/common";
import {HumanFileSizePipe} from "./pipes";
import {NotFoundComponent} from "./pages/not-found.component";
import {ImageComponent} from "./components/image.component";
import {PricingPageComponent} from "./pages/pricing-page.component";
import {Docu} from "./provider/docu";
import {AnchorService} from "./provider/anchor";
import {TitleService} from "./provider/title";
import {SupportPageComponent} from "./pages/support-page.component";

@NgModule({
    declarations: [
        AppComponent,
        IndexPageComponent,
        ContactPageComponent,
        HeaderComponent,
        FooterComponent,
        ImageComponent,
        DataProtectionPageComponent,
        DownloadPageComponent,
        SupportPageComponent,
        DocumentationPageComponent,
        PricingPageComponent,
        HumanFileSizePipe,
        NotFoundComponent,
    ],
    imports: [
        CommonModule,
        BrowserModule.withServerTransition({ appId: 'serverApp' }),
        MarkdownModule.forRoot({
            sanitize: SecurityContext.NONE
        }),
        AppRoutingModule,
        HttpClientModule,
        TransferHttpCacheModule,
    ],
    providers: [
        Docu,
        Title,
        TitleService,
        AnchorService,
        {provide: 'ORIGIN_URL', useValue: ''}
    ],
    bootstrap: [AppComponent]
})
export class AppModule {
}
