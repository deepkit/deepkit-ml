import {Entity, f, MultiIndex, uuid} from "@marcj/marshal";

@Entity('JobQueueItem', 'jobQueue')
@MultiIndex(['job', 'task'], {})
export class JobQueueItem {
    @f.uuid().primary()
    id: string = uuid();

    version: number = 1;

    /**
     * Name of task
     */
    @f
    task: string = 'main';

    @f
    priority: number = 0;

    @f
    added: Date = new Date();

    constructor(
        @f.uuid().asName('userId') public userId: string,
        @f.uuid().asName('job') public job: string,
    ) {
    }
}
