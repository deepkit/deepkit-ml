/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Command, flags} from '@oclif/command';
import 'reflect-metadata';
import {ClientController} from '../client-controller';
import {
    getAccount,
    getCWD,
    getFolderLinkOfDirectory,
    getFolderLinksOfDirectory,
    getHomeConfig,
    setHomeConfig,
    setHomeFolderLink,
    startAllAccessingSecurityScopedResource
} from "@deepkit/core-node";
import * as path from 'path';
import {basename} from 'path';
import chalk from "chalk";

export class LinkCommand extends Command {
    static description = 'Link current folder to a Deepkit project.';

    public static args = [
        {
            name: 'name',
            description: `Project name, either 'project-name', or 'user/project-name', or 'orga/project-name'. ` +
                `As default the folder name is used.`
        }
    ];

    public static flags = {
        account: flags.string({
            char: 'a',
            description: `Per default localhost. Use an account name shown by 'deepkit link --list' to switch it.`
        }),
        list: flags.boolean({
            char: 'l',
            description: `List all links for current folder.`
        }),
        overwrite: flags.boolean({
            char: 'o',
            description: 'Overwrites this link for given account and project name already exists.'
        }),
        dir: flags.string({
            description: 'Which folder should be link. Per default current working directory.'
        }),
        delete: flags.boolean({char: 'd', description: 'Deletes the current link with.'}),
    };

    public async run(): Promise<void> {
        const {args, flags} = this.parse(LinkCommand);

        const cwd = flags.dir ? path.resolve(flags.dir) : getCWD();

        const projectLink = await getFolderLinkOfDirectory(cwd, flags.account);
        const homeConfig = await getHomeConfig();

        if (flags.list) {
            console.log(`Linked projects:`);
            const links = await getFolderLinksOfDirectory(cwd);
            if (links.length) {
                for (const link of links) {
                    const account = homeConfig.getAccount(link.accountId);
                    console.log(`   Project ${chalk.green(link.name)} via account ${chalk.green(account.name)} in folder ${chalk.yellow(link.path)}`);
                }
            } else {
                console.log(`   No links for ${cwd}`);
            }
            this.exit(0);
        }

        if (flags.delete) {
            if (projectLink) {
                homeConfig.removeLink(projectLink.accountId, projectLink.projectId, projectLink.path);
                await setHomeConfig(homeConfig);
                this.log(`Successfully deleted link to project ${projectLink.name}.`);
                this.exit(0);
            } else {
                this.log(`Link not found. Use 'deepkit id' to see all links for this folder.`);
                this.exit(1);
            }
        }

        if (!flags.overwrite) {
            //when folder is already linked to that account, we're checking if project for that account still exists.
            if (projectLink) {
                const account = homeConfig.getAccount(projectLink.accountId);
                try {
                    const controller = await ClientController.forUser(account);
                    const projectName = await controller.app().getProjectName(projectLink.projectId);

                    if (projectName) {
                        console.log(`This folder is already linked to project ${chalk.yellow(projectName)} at account ${chalk.green(account.name)}.`);
                        if (projectLink.path !== cwd) {
                            console.log(chalk.gray(`Note: The actual project path is ${projectLink.path}.`));
                        }
                    } else {
                        console.warn(`This folder is linked to project ${chalk.red(projectLink.name)} which doesn't exist anymore.`);
                    }
                } catch (error) {
                    console.log(`This folder is already connected to project ${chalk.yellow(projectLink.name)} at account ${chalk.green(account.name)}.`);
                    console.log(`Account ${chalk.green(account.name)} is not reachable: ${error.message || error}.`);
                }
                console.log(`Use --overwrite to recreate or --delete to delete`);
                this.exit(1);
            }
        }

        const account = await getAccount(flags.account);
        const controller = await ClientController.forUser(account);

        let projectDir = cwd;
        let projectName = args.name;

        if (flags.overwrite && projectLink) {
            projectDir = projectLink.path;
            if (!projectName) projectName = projectLink.name;
        }

        if (!projectName) {
            projectName = basename(cwd);
        }

        const project = await controller.app().getProjectForPublicName(projectName);

        if (project) {
            await setHomeFolderLink(homeConfig, account.id, project.id, projectDir, projectName);
            await setHomeConfig(homeConfig);
            this.log(`Successfully linked ${chalk.yellow(projectDir)} to project ${chalk.yellow(projectName)} at account ${chalk.green(account.name)}`);
        } else {
            //create new project
            //check if we have access to given namespace.
            if (!await controller.app().isAllowedToCreateProjectByName(projectName)) {
                console.error(`Error: Either no access to namespace or project name ${chalk.red(projectName)} already exists. ` +
                    `Maybe you need to switch account? Account ${chalk.yellow(account.name)} was used. Use --account ${chalk.yellow('account-name')}.`);
                const home = await getHomeConfig();
                console.log('Possible accounts are: ' + home.accounts.map(v => chalk.yellow(v.name)).join(', '));
                process.exit(403);
                return;
            }

            const id = await controller.app().createProjectForName(projectName);
            await setHomeFolderLink(homeConfig, account.id, id, projectDir, projectName);

            await setHomeConfig(homeConfig);
            this.log(`Successfully created and linked ${chalk.yellow(projectDir)} to project ${chalk.yellow(projectName)} at account ${chalk.green(account.name)}`);
        }

        await controller.disconnect();
        process.exit(0);
    }
}
