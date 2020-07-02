import {ChangeDetectorRef, Component, HostListener, Input} from "@angular/core";
import {Job, Project} from "@deepkit/core";
import {actionExperimentMode, actionLoadAndShowJobId, MainStore, selectEntity} from "../../store";

@Component({
    selector: 'dk-job-preview',
    template: `
        <ng-container *ngIf="getProject() as project">
            <div style="display: flex; width: 100%;">
                <div style="flex: 1; text-overflow: ellipsis; overflow: hidden; white-space: nowrap">
                    {{project.name}} #{{job.fullNumberCombat}}
                </div>
                <div style="flex: 0;">
                    <job-status [job]="job"></job-status>
                </div>
            </div>
            <div style="display: flex; width: 100%;" class="text-light">
                <div>
                    {{job.iteration}}/{{job.iterations}}
                </div>
                <dk-redraw style="margin-left: 5px;">
                    <div class="lining">
                        {{job.ended ? ((Number(job.ended) - Number(job.started)) / 1000 | humanize) : (job.started | humanize_until_now)}}
                    </div>
                </dk-redraw>
                <dk-redraw style="margin-left: auto" class="lining">
                    {{job.eta | humanize}}
                </dk-redraw>
            </div>
        </ng-container>
    `,
    host: {
        '[class.selected]': 'isSelected()'
    },
    styles: [`
        :host {
            display: block;
            padding: 4px 20px;
            font-size: 11px;
            line-height: 16px;
            font-weight: 500;
        }

        :host:hover {
            background-color: var(--line-color-light);
        }

        :host.selected {
            background-color: var(--dui-selection-unfocused);
        }
    `]
})
export class JobPreviewComponent {
    Number = Number;
    @Input() job!: Job;

    constructor(
        private store: MainStore,
        private cd: ChangeDetectorRef
    ) {

    }

    isSelected() {
        return this.store.value.isProjectSelected(this.job.project) && this.store.value.experimentView.lastSelectedJobId === this.job.id;
    }

    @HostListener('click')
    dblClick() {
        const project = this.store.value.projects!.getEntitySubject(this.job.project);

        if (!project) return;

        this.store.dispatch(selectEntity({entity: project}));
        this.store.dispatch(actionLoadAndShowJobId({jobId: this.job.id}));
    }

    getProject(): Project | undefined {
        return this.store.value.projects!.get(this.job.project);
    }
}
