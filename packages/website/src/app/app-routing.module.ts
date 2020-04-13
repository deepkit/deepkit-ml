import {NgModule} from '@angular/core';
import {Routes, RouterModule} from '@angular/router';
import {IndexPageComponent} from "./pages/index-page.component";
import {ContactPageComponent} from "./pages/contact-page.component";
import {DataProtectionPageComponent} from "./pages/data-protection-page.component";
import {DownloadPageComponent} from "./pages/download-page.component";
import {DocumentationPageComponent} from "./pages/documentation-page.component";
import {NotFoundComponent} from "./pages/not-found.component";
import {PricingPageComponent} from "./pages/pricing-page.component";
import {SupportPageComponent} from "./pages/support-page.component";


const routes: Routes = [
    {path: '', pathMatch: 'full', component: IndexPageComponent, data: {header: 'startpage', title: 'Welcome'}},
    {path: 'contact', pathMatch: 'full', component: ContactPageComponent, data: {title: 'Contact'}},
    {path: 'data-protection', pathMatch: 'full', component: DataProtectionPageComponent, data: {title: 'Data protection'}},
    {path: 'download', pathMatch: 'full', component: DownloadPageComponent, data: {header: 'startpage', title: 'Download'}},
    {path: 'support', pathMatch: 'full', component: SupportPageComponent, data: {header: 'startpage', title: 'Support'}},
    {path: 'documentation', component: DocumentationPageComponent, children: [
        {path: '', pathMatch: 'full', redirectTo: 'home'},
        {path: '**', component: DocumentationPageComponent}
    ]},
    // {path: 'pricing', component: PricingPageComponent, data: {header: 'startpage', title: 'Pricing'}},
    {path: '**', component: NotFoundComponent}
];

@NgModule({
    imports: [RouterModule.forRoot(routes, {
        initialNavigation: 'enabled',
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'enabled',
    })],
    exports: [RouterModule]
})
export class AppRoutingModule {
}
