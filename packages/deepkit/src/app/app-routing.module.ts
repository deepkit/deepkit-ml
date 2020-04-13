/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {PublicJobComponent} from "./pages/project/job/public-job.component";
import {RootComponent} from "./pages/root.component";
import {PublicProjectComponent} from "./pages/project/public-project.component";

const routes: Routes = [
    {path: '', pathMatch: 'full', component: RootComponent},
    {path: 'public/job/:jobId/:token', component: PublicJobComponent},
    {path: 'public/:username/:projectName', component: PublicProjectComponent},
];

@NgModule({
    //useHash is activate in electron, so refresh works
    imports: [RouterModule.forRoot(routes, {useHash: location.href.includes('index.html')})],
    exports: [RouterModule]
})
export class AppRoutingModule {
}
