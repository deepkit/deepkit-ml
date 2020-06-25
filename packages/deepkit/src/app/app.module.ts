/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {BrowserModule} from '@angular/platform-browser';
import {NgModule} from '@angular/core';
import {AppComponent} from './app.component';
import {
    ActiveRoutePipe,
    CallbackPipe,
    ChildrenRouteActivePipe,
    DataUriPipe,
    DateTimePipe,
    HumanFileSizePipe,
    HumanizePipe,
    HumanizeUntilNowPipe,
    JSONBufferPipe,
    KeysPipe,
    ObjectURLPipe,
    ObservePipe,
    RangePipe,
    RouteSegmentEmptyPipe,
    ThrottlePipe,
    UserPipe
} from "./pipes";
import {ReactiveChangeDetectionModule} from "./reactivate-change-detection";
import {HeaderComponent} from "./components/header.component";
import {ProjectShowComponent} from "./pages/project/show/project-show.component";
import {BrowserAnimationsModule} from "@angular/platform-browser/animations";
import {BreadCrumbTextComponent, BreakCrumbComponent} from "./components/breakcrumb.component";
import {JobShowComponent} from "./pages/project/job/job-show.component";
import {JobStatusComponent} from "./components/job/job-status.component";
import {ProgressBarComponent} from "./components/progress-bar.component";
import {JobsListComponent} from "./components/jobs-list.component";
import {JobShowOverviewComponent} from "./pages/project/job/job-show-overview.component";
import {PlotlyComponent} from "./components/plotly.component";
import {FormsModule, ReactiveFormsModule} from "@angular/forms";
import {ChangeAndSetDirective} from "./components/directives";
import {IconComponent} from "./components/icon.component";
import {DropdownButtonComponent, DropdownButtonOptionComponent} from "./components/dropdown-button.component";
import {JobTaskStatusComponent} from "./components/job/job-task-status.component";
import {JobTaskInstanceStatusComponent} from "./components/job/job-task-instance-status.component";
import {JobTaskGraphComponent} from "./components/job/job-task-graph.component";
import {RedrawComponent} from "./components/redraw.component";
import {JobShowFilesComponent} from "./pages/project/job/job-show-files.component";
import {RootComponent} from "./pages/root.component";
import {
    DuiAppModule,
    DuiButtonModule,
    DuiCheckboxModule,
    DuiDialogModule,
    DuiFormComponent,
    DuiIconModule,
    DuiIndicatorModule,
    DuiInputModule,
    DuiListModule,
    DuiRadioboxModule,
    DuiSelectModule,
    DuiSliderModule,
    DuiSplitterModule,
    DuiTableModule,
    DuiWindowModule,
} from '@marcj/angular-desktop-ui';
import {UserListComponent} from "./pages/admin/user-list.component";
import {OrganisationListComponent} from "./pages/admin/organisation-list.component";
import {OrganisationComponent} from "./pages/admin/organisation.component";
import {ControllerClient} from "./providers/controller-client";
import {JobTaskHardwareGraphComponent} from "./components/job/job-task-hardware-graph.component";
import {GaugeComponent} from "./components/gauge.component";
import {UserComponent} from "./pages/admin/user.component";
import {MenuComponent, MenuTriggerDirective} from "./components/menu.component";
import {RedirectComponent} from "./pages/redirect.component";
import {Breadcrumbs} from "./providers/breadcrumbs";
import {CreateOrganisationDialogComponent} from "./dialogs/create-organisation-dialog.component";
import {UserSettingsComponent} from "./pages/admin/user-settings.component";
import {UserProjectsComponent} from "./pages/admin/user-projects.component";
import {FileComponent} from "./components/file.component";
import {UserInputComponent} from "./components/user-input.component";
import {FocusDirective} from "../util-directives";
import {JobShowChannelsComponent} from "./pages/project/job/job-show-channels.component";
import {NodeComponent} from "./pages/cluster/node.component";
import {JobCompareComponent} from "./pages/project/job/job-compare.component";
import {MonacoEditorComponent} from "./components/monaco-editor.component";
import {ProgressArcComponent} from "./components/progress-arc.component";
import {SectionHeaderComponent} from './components/section-header.component';
import {JobHardwareGraphsComponent} from "./components/job/job-hardware-graphs.component";
import {ProjectExperimentsComponent} from "./pages/project/show/project-experiments.component";
import {ProjectSourceComponent, SourceDirectoryItemComponent, SourceDirectoryListingComponent} from './pages/project/show/project-source.component';
import {JobsGraphComponent, JobsGraphsComponent} from './components/jobs-graphs.component';
import {ProjectNotesComponent} from "./pages/project/show/project-notes.component";
import {ClusterShowComponent} from "./pages/cluster/cluster-show.component";
import {CreateExperimentComponent} from "./dialogs/create-experiment.component";
import {ShellCommandComponent} from "./dialogs/shell-command.component";
import {TermComponent} from "./components/term.component";
import {ProjectSettingsComponent} from "./components/project-settings.component";
import {DragDropModule} from "@angular/cdk/drag-drop";
import {ParallelCoordinatesComponent} from "./components/parallel-coordinates.component";
import {AdminComponent} from "./pages/admin/admin.component";
import {ResourcesComponent} from "./components/resources.component";
import {ChannelReader} from "./providers/channel-reader";
import {AppSettingsComponent} from "./dialogs/app-settings.component";
import {JobGraphNodeDetailComponent, JobModelGraphSnapshot, SetXLinkHrefDirective} from "./components/job/job-model-graph.component";
import {JobDebuggerRecordDialogComponent, JobShowDebuggerComponent} from './pages/project/job/job-show-debugger.component';
import {TagComponent} from "./components/tag.component";
import {AccountsComponent, AccountsTokenFieldComponent} from "./dialogs/accounts.component";
import {Store, StoreModule} from '@ngrx/store';
import {MainStore, MainStoreInterface, mainStoreReducer} from "./store";
import {CreateProjectComponent} from "./dialogs/create-project.component";
import {UserSettingsDialogComponent} from "./dialogs/user-settings-dialog.component";
import {OrganisationMemberAssignComponent, OrganisationMemberListComponent} from "./pages/admin/organisation-member-list.component";
import {AdminCreateUserDialogComponent} from "./pages/admin/dialogs/create-user-dialog.component";
import {ProjectListComponent} from "./pages/admin/project-list.component";
import {RegisterAccountComponent} from './dialogs/register-account.component';
import {ProjectGitSourceComponent} from "./pages/project/show/project-git-source.component";
import {NodeSettingsDialogComponent} from './dialogs/node-settings-dialog.component';
import {ProjectIssuesComponent} from "./pages/project/show/project-issues.component";
import {TextEditorComponent} from "./components/text-editor.component";
import {IssueDialogComponent} from "./dialogs/issue-dialog.component";
import {CachedEntity} from './providers/cached-entity';
import {UserSmallComponent} from './components/user-small.component';
import {LabelComponent} from './components/label.component';
import {FileThumbnailComponent} from './components/file-thumbnail.component';
import {CommentComponent} from "./components/comment.component";
import {HistoryBarComponent} from './components/history-bar.component';
import {JobHistogramComponent} from "./components/job/job-histogram.component";
import {
    JobModelGraphSvgActivationComponent,
    JobModelGraphSvgBase,
    JobModelGraphSvgComponent,
    JobModelGraphSvgInputOutputComponent,
    JobModelGraphSvgLayerComponent,
    JobModelGraphSvgOPComponent,
    JobModelGraphSvgPrimitiveComponent,
    JobModelGraphSvgScopeComponent
} from "./components/job/job-model-graph-svg.component";
import {AppRoutingModule} from "./app-routing.module";
import {PublicJobComponent} from "./pages/project/job/public-job.component";
import {PublicProjectComponent} from "./pages/project/public-project.component";
import {JobShowInsightComponent, JobShowInsightEntryComponent, JobShowInsightsComponent, JobShwoInsightEntryNumpyComponent} from "./pages/project/job/job-show-insights.component";
import {InstallCliComponent} from "./dialogs/install-cli.component";
import {ClusterSettingsDialogComponent} from "./dialogs/cluster-settings-dialog.component";
import {JobQueueDialogComponent} from './dialogs/job-queue-dialog.component';

@NgModule({
    declarations: [
        AppComponent,
        //pipes
        HumanizePipe,
        HumanizeUntilNowPipe,
        ThrottlePipe,
        ObjectURLPipe,
        JSONBufferPipe,
        DateTimePipe,
        KeysPipe,
        ObservePipe,
        HumanFileSizePipe,
        CallbackPipe,
        ActiveRoutePipe,
        ChildrenRouteActivePipe,
        RouteSegmentEmptyPipe,
        RangePipe,
        DataUriPipe,
        UserPipe,

        HeaderComponent,
        ProjectShowComponent,
        JobStatusComponent,
        JobsListComponent,
        JobShowOverviewComponent,
        BreakCrumbComponent,
        JobShowComponent,
        ProgressBarComponent,
        PlotlyComponent,
        ChangeAndSetDirective,
        IconComponent,
        DropdownButtonComponent,
        DropdownButtonOptionComponent,
        AdminComponent,
        OrganisationListComponent,
        OrganisationComponent,
        AdminCreateUserDialogComponent,

        UserListComponent,

        JobTaskStatusComponent,
        RedrawComponent,
        JobShowFilesComponent,
        RootComponent,

        JobTaskGraphComponent,
        JobTaskInstanceStatusComponent,
        JobTaskHardwareGraphComponent,
        GaugeComponent,
        UserComponent,
        UserSmallComponent,
        LabelComponent,

        MenuComponent,
        MenuTriggerDirective,
        RedirectComponent,
        CreateOrganisationDialogComponent,
        BreadCrumbTextComponent,
        UserSettingsComponent,
        UserProjectsComponent,
        FileComponent,
        UserInputComponent,
        FocusDirective,
        JobShowChannelsComponent,
        NodeComponent,
        JobCompareComponent,
        MonacoEditorComponent,
        ProgressArcComponent,
        SectionHeaderComponent,
        JobHardwareGraphsComponent,
        ProjectExperimentsComponent,
        ProjectSourceComponent,
        JobsGraphsComponent,
        JobsGraphComponent,
        ProjectNotesComponent,
        ClusterShowComponent,
        CreateExperimentComponent,
        NodeSettingsDialogComponent,
        ClusterSettingsDialogComponent,
        ShellCommandComponent,
        TermComponent,
        ProjectSettingsComponent,
        ParallelCoordinatesComponent,
        SourceDirectoryListingComponent,
        SourceDirectoryItemComponent,
        ResourcesComponent,
        AppSettingsComponent,
        JobModelGraphSnapshot,
        JobModelGraphSvgComponent,
        JobModelGraphSvgBase,
        JobModelGraphSvgActivationComponent,
        JobModelGraphSvgInputOutputComponent,
        JobModelGraphSvgScopeComponent,
        JobModelGraphSvgOPComponent,
        JobModelGraphSvgPrimitiveComponent,
        JobModelGraphSvgLayerComponent,
        JobGraphNodeDetailComponent,
        SetXLinkHrefDirective,
        JobShowDebuggerComponent,
        JobShowInsightsComponent,
        JobShowInsightComponent,
        JobShowInsightEntryComponent,
        JobShwoInsightEntryNumpyComponent,
        JobDebuggerRecordDialogComponent,
        TagComponent,
        AccountsComponent,
        AccountsTokenFieldComponent,
        CreateProjectComponent,
        InstallCliComponent,
        UserSettingsDialogComponent,
        OrganisationMemberListComponent,
        OrganisationMemberAssignComponent,
        ProjectListComponent,
        RegisterAccountComponent,
        ProjectGitSourceComponent,
        ProjectIssuesComponent,
        TextEditorComponent,
        IssueDialogComponent,
        FileThumbnailComponent,
        CommentComponent,
        HistoryBarComponent,
        JobHistogramComponent,
        PublicJobComponent,
        PublicProjectComponent,
        JobQueueDialogComponent,
    ],
    entryComponents: [
        CreateOrganisationDialogComponent,
        BreadCrumbTextComponent,
        ProjectSettingsComponent,
        CreateExperimentComponent,
        AppSettingsComponent,
        AccountsComponent,
    ],
    imports: [
        BrowserModule,
        FormsModule,
        ReactiveFormsModule,
        BrowserAnimationsModule,
        ReactiveChangeDetectionModule,
        DragDropModule,
        AppRoutingModule,
        StoreModule.forRoot({main: mainStoreReducer}),

        //angular desktop ui
        DuiAppModule.forRoot(),
        DuiWindowModule.forRoot(),
        DuiCheckboxModule,
        DuiButtonModule,
        DuiInputModule,
        DuiFormComponent,
        DuiRadioboxModule,
        DuiSelectModule,
        DuiIconModule,
        DuiListModule,
        DuiTableModule,
        DuiSplitterModule,
        DuiDialogModule,
        DuiSliderModule,
        DuiIndicatorModule,
    ],
    providers: [
        ControllerClient,
        Breadcrumbs,
        ChannelReader,
        CachedEntity,
        {
            provide: MainStore, deps: [Store], useFactory: (store: Store<{ main: MainStoreInterface }>): MainStore => {
                return new MainStore(store, (observer) => {
                    store.select((s) => s.main).subscribe(observer);
                });
            }
        },
        // {provide: RouteReuseStrategy, useClass: ReuseStrategy},
    ],
    bootstrap: [AppComponent]
})
export class AppModule {

}
