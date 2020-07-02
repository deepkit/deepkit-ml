import {ChangeDetectorRef, Component, HostListener, Input} from "@angular/core";
import {Job, Project} from "@deepkit/core";
import {actionExperimentMode, actionLoadAndShowJobId, MainStore, selectEntity} from "../../store";

@Component({
    selector: 'dk-job-preview',
    template: `
        <ng-container *ngIf="getProject() as project">
            {{project.name}} #{{job.fullNumberCombat}}
        </ng-container>
    `,
    host: {
        '[class.selected]': 'isSelected()'
    },
    styles: [`
        :host {
            display: block;
            padding: 5px 8px;
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
