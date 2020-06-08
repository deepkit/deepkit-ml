/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Job, Project, QueueResult, JobQueueItem} from "@deepkit/core";
import {ResourcesManager} from "../node/resources";
import {Injectable} from "injection-js";
import {Database} from "@marcj/marshal-mongo";
import {Exchange, ExchangeDatabase} from "@marcj/glut-server";
import {ProjectManager} from "./project-manager";

@Injectable()
export class JobManager {

    constructor(
        protected database: Database,
        protected exchange: Exchange,
        protected exchangeDatabase: ExchangeDatabase,
        protected resourcesManager: ResourcesManager,
        protected projectManager: ProjectManager,
    ) {
    }

    /**
     * The job is not yet in the database. We assign some values, like list, labels, etc from the config.
     */
    public async handleNewJob(job: Job): Promise<void> {
        if (job.config.list) {
            job.list = await this.projectManager.addOrReturnExperimentList(job.project, job.config.list);
        }

        const labels = [];
        for (const label of job.config.labels) {
            labels.push(await this.projectManager.addOrReturnExperimentLabel(job.project, label));
        }
        job.labelIds = labels;
    }

    public async addLabel(id: string, labelId: string): Promise<void> {
        const lock = await this.exchange.lock('job/label/' + id);

        try {
            const labelIds: string[] = await this.database.query(Job).filter({id: id}).findOneField('labelIds');
            if (!labelIds.includes(labelId)) {
                labelIds.push(labelId);
                await this.exchangeDatabase.patch(Job, id, {labelIds});
            }
        } finally {
            lock.unlock();
        }
    }

    public async removeLabel(id: string, labelId: string): Promise<void> {
        const lock = await this.exchange.lock('job/label/' + id);

        try {
            const labelIds: string[] = await this.database.query(Job).filter({id: id}).findOneField('labelIds');
            const index = labelIds.indexOf(labelId);
            if (index !== -1) {
                labelIds.splice(index, 1);
                await this.exchangeDatabase.patch(Job, id, {labelIds});
            }
        } finally {
            lock.unlock();
        }
    }

    public async queueJob(project: Project, job: Job, priority: number = 0): Promise<QueueResult[]> {
        const openTasks = job.getNextTasksToStart();

        for (const task of openTasks) {
            const item = new JobQueueItem(project.owner, job.id);
            item.task = task.name;
            item.priority = priority;
            await this.exchangeDatabase.add(item);
        }

        await this.resourcesManager.assignJobs();

        const jobAfterAssignment = await this.database.query(Job).filter({id: job.id}).findOneOrUndefined();
        if (!jobAfterAssignment) {
            throw new Error('Job not found anymore');
        }

        const result: QueueResult[] = [];

        for (const task of openTasks) {
            result.push(new QueueResult(
                jobAfterAssignment.getTask(task.name).name,
                jobAfterAssignment.getTask(task.name).queue.position,
                jobAfterAssignment.getTask(task.name).queue.result
            ));
        }

        return result;
    }
}
