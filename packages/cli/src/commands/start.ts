/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import Command from "@oclif/command";
import {
    ClusterNodeJobStartConfig,
    HomeAccountConfig, JobConfig,
    JobStatus,
    JobTaskInstancePeerControllerInterface,
    JobTaskInstanceStatus,
    JobTaskStatus
} from "@deepkit/core";
import {catchSilentSigint, getJobHomeDir, getJobTaskInstanceCheckoutFiles} from "@deepkit/core-node";
import path from "path";
import {dirname} from "path";
import fs from "fs-extra";
import {ensureDir} from "fs-extra";
import {Starter} from "../starter";
import {ClientController} from "../client-controller";
import {getEnumLabel} from "@marcj/estdlib";
import {JobStorage} from "../job-storage";
import {Action} from '@marcj/glut-core';
import {plainToClass} from "@marcj/marshal";

class JobTaskInstancePeerController implements JobTaskInstancePeerControllerInterface {
    @Action()
    stop() {
        process.kill(process.pid, "SIGINT");
    }
}

/**
 * This command is used by node server and CLI.
 */
export class StartCommand extends Command {
    static description = 'server: Starts an already created job on this machine';

    public static args = [
        {name: 'server-host'},
        {name: 'server-port'},
        {name: 'job-id'},
        {name: 'job-access-token'},
        {name: 'task-name'},
        {name: 'instance'},
        {name: 'start-config-base64'},
    ];

    public async run(): Promise<void> {
        const {args} = this.parse(StartCommand);

        const account = new HomeAccountConfig('default', args['server-host']);
        account.port = args['server-port'];

        process.env['DEEPKIT_SSL'] = account.ssl ? '1' : '0';
        process.env['DEEPKIT_HOST'] = account.host;
        process.env['DEEPKIT_PORT'] = String(account.port);

        const jobId = args['job-id'];
        const taskName = args['task-name'];
        const taskInstance = parseInt(args['instance'] || 0, 10);

        console.log('args[\'start-config-base64\']', args['start-config-base64']);
        const startConfig = plainToClass(ClusterNodeJobStartConfig, JSON.parse(Buffer.from(args['start-config-base64'], 'base64').toString('utf8')));

        const client = ClientController.forJob(account, jobId, args['job-access-token']);
        const jobController = client.job();
        let jobStorage: JobStorage | undefined;

        client.client.reconnected.subscribe(async () => {
            const job = await jobController.getJob();
            if (!job || job.isEnded() || job.stopRequested) {
                //job is deleted or ended, we need to STOP
                console.log('job deleted, aborting.');
                process.kill(process.pid, "SIGINT");
            }
        });

        await catchSilentSigint(async () => {
            const job = await jobController.getJob();
            if (!job) {
                throw new Error(`Job not found for id '${jobId}'.`);
            }

            if (job.status === JobStatus.creating) {
                throw new Error('Could not start a job that is still in creation.');
            }

            //todo when this fails, the process exists silent with 0, wtf
            await client.client.registerController('job/' + jobId + '/task/' + taskName + '/instance/' + taskInstance, new JobTaskInstancePeerController);

            const projectName = await jobController.getProjectName();

            const task = job.getTask(taskName);

            if (task.isEnded()) {
                throw new Error('Could not start a job task that has already been ended. Status is ' + getEnumLabel(JobTaskStatus, task.status));
            }

            const instance = task.getInstance(taskInstance);
            if (instance.isEnded()) {
                throw new Error('Could not start a job task instance that has already been ended. Status is ' + getEnumLabel(JobTaskInstanceStatus, instance.status));
            }

            //todo, make sure outputs from the previous tasks are there as well.
            const jobFilesDirPath = getJobTaskInstanceCheckoutFiles(job.id, taskName, taskInstance);
            fs.ensureDirSync(jobFilesDirPath);
            console.log('jobFiles', jobFilesDirPath);

            const opsPath = getJobHomeDir(job.id, 'instance', taskName, String(taskInstance), 'ops.json');
            await ensureDir(dirname(opsPath));

            jobStorage = new JobStorage(client, projectName, job, jobFilesDirPath, opsPath);
            //job.accessToken is not set per default. We need to either load it explicitely
            //or use it from args.
            jobStorage.job.accessToken = args['job-access-token'];

            await jobController.taskInstanceStarted(taskName, taskInstance);

            console.log('Checkout files');
            jobStorage.patchInstance(taskName, taskInstance, {status: JobTaskInstanceStatus.checkout_files});

            const files = await jobController.getJobFiles();
            //todo download parallel and show indicator
            for (const file of files) {
                console.log('Checkout file', file.path);
                const base64 = await jobController.getJobFileContent(file.path);
                const localFilePath = path.join(jobFilesDirPath, file.path);

                fs.ensureDirSync(path.dirname(localFilePath));
                await fs.writeFile(localFilePath, base64, {encoding: 'base64'});
            }

            const starter = new Starter();
            await starter.startTask({
                debug: false,
            }, job, jobStorage, taskName, taskInstance, startConfig);
        }, async () => {
            console.log('received SIGINT');
        });

        if (jobStorage) {
            //sync last stuff
            await jobStorage.stop();
        }

        // tell server this task instance is done. it sets task status correctly and assigns next tasks in this job.
        // if necessary setting job's status to done and triggers all other events
        await jobController.taskInstanceEnded(taskName, taskInstance);

        await client.disconnect();
        process.exit(0);
    }
}
