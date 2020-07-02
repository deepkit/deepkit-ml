import {ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, SimpleChanges} from "@angular/core";
import {MainStore} from "../store";
import {unsubscribe} from "../reactivate-change-detection";
import {detectChangesNextFrame} from "@marcj/angular-desktop-ui";
import {Subscriptions} from "@marcj/estdlib-rxjs";
import {Job} from "@deepkit/core";

@Component({
    selector: 'dk-active-jobs',
    template: `{{items > 0 ? items : ''}}`,
    styles: [`
        :host {
            display: inline-block;
        }
    `]
})
export class ActiveJobsComponent implements OnChanges, OnDestroy {
    @Input() projectId?: string;
    @Input() clusterId?: string;
    @Input() clusterNodeId?: string;

    items = 0;

    @unsubscribe()
    subs = new Subscriptions;

    constructor(
        private store: MainStore,
        private cd: ChangeDetectorRef
    ) {

    }

    ngOnDestroy(): void {
    }

    ngOnChanges(changes: SimpleChanges) {
        this.subs.unsubscribe();
        if (!this.store.value.activeJobs) return;

        const update = (jobs: Job[]) => {
            this.items = 0;
            if (this.projectId) {
                this.items = jobs.filter(job => job.project === this.projectId).length;
            }
            if (this.clusterId) {
                const clusterNodes = this.store.value.nodes!.all().filter(v => v.cluster === this.clusterId);
                this.items = jobs.filter(job => {
                    const nodeIds = job.getAssignedClusterNodes();
                    for (const clusterNode of clusterNodes) {
                        if (nodeIds.has(clusterNode.id)) return true;
                    }
                    return false;
                }).length;
            }

            if (this.clusterNodeId) {
                this.items = jobs.filter(job => job.getAssignedClusterNodes().has(this.clusterNodeId!)).length;
            }
            detectChangesNextFrame(this.cd);
        };

        this.subs.add = this.store.value.activeJobs.event.subscribe((jobs) => {
            if (this.store.value.activeJobs) update(this.store.value.activeJobs.all());
        });
        update(this.store.value.activeJobs.all());
    }
}
