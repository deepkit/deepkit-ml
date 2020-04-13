/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    ChangeDetectorRef,
    Component,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    SimpleChanges,
    ViewChild
} from "@angular/core";
import {EntitySubject} from "@marcj/glut-core";
import {Project} from "@deepkit/core";
import {ControllerClient} from "../../../providers/controller-client";
import {Subscription} from "rxjs";
import {CreateExperimentComponent} from "../../../dialogs/create-experiment.component";
import {ProjectSettingsComponent} from "../../../components/project-settings.component";
import {DuiDialog, ViewState} from "@marcj/angular-desktop-ui";
import {LocalStorage} from "ngx-store";
import {actionProjectTab, MainStore, ProjectViewTab} from "../../../store";

@Component({
    selector: 'dk-project-show',
    template: `
        <dui-window-toolbar *ngIf="viewState.attached">
            <dui-button-group padding="none">
                <dui-button textured [active]="store.value.projectView.tab === 'experiments'" (click)="selectTab('experiments')">Experiments
                </dui-button>

                <dui-button textured [active]="store.value.projectView.tab === 'issues'" (click)="selectTab('issues')">Issues</dui-button>

                <dui-button textured [active]="store.value.projectView.tab === 'notes'" (click)="selectTab('notes')">Notes</dui-button>

                <dui-button textured [active]="store.value.projectView.tab === 'source'" (click)="selectTab('source')">Source</dui-button>
            </dui-button-group>

            <dui-window-toolbar-container name="main"></dui-window-toolbar-container>

            <dui-window-toolbar-container name="main_right" style="margin-left: auto;"></dui-window-toolbar-container>

            <dui-button-group *ngIf="project$ && adminAccess" style="margin-left: 15px;">
                <dui-button textured (click)="showProjectSettings()" title="Project settings"
                            icon="settings"></dui-button>
            </dui-button-group>
        </dui-window-toolbar>

        <div class="main-container" style="overflow: hidden" *ngIf="project$">
            <dk-project-experiments *duiView="store.value.projectView.tab === 'experiments'" [readOnly]="readOnly" [project$]="project$"></dk-project-experiments>
            <dk-project-issues *duiView="store.value.projectView.tab === 'issues'" [readOnly]="readOnly" [project$]="project$"></dk-project-issues>
            <dk-project-notes *duiView="store.value.projectView.tab === 'notes'" [readOnly]="readOnly" [project$]="project$"></dk-project-notes>

            <ng-container *duiView="store.value.projectView.tab === 'source'">
                <dk-project-source *ngIf="controllerClient.isLocalUser()" [readOnly]="readOnly" [project$]="project$"></dk-project-source>
                <dk-project-git-source *ngIf="!controllerClient.isLocalUser()"  [readOnly]="readOnly"
                                       [project$]="project$"></dk-project-git-source>
            </ng-container>
        </div>
    `
})
export class ProjectShowComponent implements OnDestroy, OnInit, OnChanges {
    @Input()
    public project$?: EntitySubject<Project>;

    @Input() public readOnly: boolean = false;

    public adminAccess: boolean = false;

    private sub?: Subscription;

    @ViewChild(CreateExperimentComponent, {static: false}) createExperimentDialogComponent?: CreateExperimentComponent;

    readonly viewState = new ViewState;

    constructor(
        public controllerClient: ControllerClient,
        private cd: ChangeDetectorRef,
        private dialog: DuiDialog,
        public store: MainStore,
    ) {
    }

    public selectTab(tab: ProjectViewTab) {
        this.store.dispatch(actionProjectTab({tab}));
    }

    public showProjectSettings() {
        if (this.project$) {
            this.dialog.open(ProjectSettingsComponent, {project$: this.project$});
        }
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (this.project$) {
            (window as any)['project'] = this.project$.value;
            this.adminAccess = await this.controllerClient.permission().checkProjectAdminAccess(this.project$.id);
            this.cd.detectChanges();
        }
    }


    async ngOnInit() {
    }

    ngOnDestroy(): void {
        if (this.sub) {
            this.sub.unsubscribe();
        }
    }
}
