/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Command, flags} from '@oclif/command';
import 'reflect-metadata';
import {Starter} from "../starter";
import {ensureAndActivateFileAccessTo, getCWD, getFolderLinkAccountForDirectory} from "@deepkit/core-node";
import {ClientController} from '../client-controller';
import {plainToClass} from "@marcj/marshal";
import {JobConfig} from "@deepkit/core";
import {AuthenticationError, OfflineError} from "@marcj/glut-client";

export class RunCommand extends Command {
    static description = 'Executes an experiment';

    public static args = [];

    public static flags = {
        account: flags.string({
            char: 'a',
            description: 'Specifies which account should be used if multiple projects are linked. Default is account of first link. See deepkit id.'
        }),
        project: flags.string({
            char: 'p',
            description: 'Specifies which account should be used if multiple projects are linked. Default is account of first link. See deepkit link -l.'
        }),
        file: flags.string({char: 'f', description: 'Defines which experiment configuration file should be used'}),
        dir: flags.string({description: 'Default current working directory'}),
        config: flags.string({
            char: 'c',
            description: 'Changes one or multiple config value from the configuration file',
            multiple: true,
        }),

        cluster: flags.boolean({description: 'Activates cluster execution'}),
        priority: flags.integer({description: 'Increases (> 0) or decrease (<0) the priority when --cluster is used.'}),

        cpu: flags.integer({description: 'Defines exactly how many CPU cores are required when --cluster is used'}),
        minCpu: flags.integer({description: 'Defines how many CPU cores are required minimum when --cluster is used'}),
        maxCpu: flags.integer({description: 'Defines how many CPU cores are required maximum when --cluster is used'}),

        memory: flags.integer({description: 'Defines exactly how many memory in gigabytes are required when --cluster is used'}),
        minMemory: flags.integer({description: 'Defines how many memory in gigabytes are required minimum when --cluster is used'}),
        maxMemory: flags.integer({description: 'Defines how many memory in gigabytes are required maximum when --cluster is used'}),

        gpu: flags.integer({description: 'Defines exactly how many GPU cards are required when --cluster is used'}),
        minGpu: flags.integer({description: 'Defines how many GPU cards are required minimum when --cluster is used'}),
        maxGpu: flags.integer({description: 'Defines how many GPU cards are required maximum when --cluster is used'}),
        gpuMemory: flags.integer({description: 'Defines how many GPU memory is required when --cluster is used'}),

        node: flags.string({
            multiple: true,
            description: 'Limits the selection process when --cluster is used.'
        }),

        debug: flags.boolean(),

        configBase64: flags.string({hidden: true}),
    };

    public async run(): Promise<void> {
        const {args, flags} = this.parse(RunCommand);

        const {folderLink, account} = await getFolderLinkAccountForDirectory(flags.dir || getCWD(), flags.account, flags.project);

        const controller = await ClientController.forUser(account);
        try {
            await controller.client.connect();
        } catch (error) {
            if (error instanceof AuthenticationError) {
                this.error('Authentication error. Make sure you configured the Deepkit accounts correctly. ' + error.message);
                process.exit(403);
            }
            if (error instanceof OfflineError) {
                this.error('Connection error. Make sure you configured the Deepkit accounts correctly. ' + error.message);
                process.exit(10);
            }

            throw error;
        }

        const project = await controller.app().getProjectForId(folderLink.projectId);

        if (!project) {
            throw new Error(`Project not found for '${folderLink.name}'. Use deepkit link.`);
        }

        await controller.disconnect();

        process.env['DEEPKIT_SSL'] = account.ssl ? '1' : '0';
        process.env['DEEPKIT_HOST'] = account.host;
        process.env['DEEPKIT_PORT'] = String(account.port);

        const projectDirPermission = await ensureAndActivateFileAccessTo(folderLink.path,
            'Project source access', 'Please confirm the project folder', 'Confirm project source', true);

        // const dockerSocketPermission = await ensureAndActivateFileAccessTo('/var/run/',
        //     'Docker access', 'Please confirm the Docker socket file', 'Confirm Docker access', true);
        try {
            const starter = new Starter();
            const config = flags.configBase64 ? plainToClass(JobConfig, JSON.parse(Buffer.from(flags.configBase64 || '', 'base64').toString('utf8'))) : undefined;
            const exitCode = await starter.create(account, controller, flags, project, folderLink.path, config);

            process.exit(exitCode);
        } finally {
            projectDirPermission.unsubscribe();
            // dockerSocketPermission.unsubscribe();
        }
    }
}
