/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Command} from '@oclif/command';
import 'reflect-metadata';
import {getCWD, getFolderLinksOfDirectory, getHomeConfig} from "@deepkit/core-node";
import {AppControllerInterface, createUserSocketClient} from "@deepkit/core";
import chalk from "chalk";

export class IdCommand extends Command {
    static description = 'Shows information about configured accounts, authentication, and linked projects.';

    public static flags = {};

    public async run(): Promise<void> {
        const {args, flags} = this.parse(IdCommand);

        const home = await getHomeConfig();
        for (const account of home.accounts) {

            const client = await createUserSocketClient(account);
            const app = client.controller<AppControllerInterface>('app');

            try {
                const user = await app.getAuthenticatedUser();
                console.log(`Account ${chalk.green(account.name)} ${chalk.gray(account.host)}: authenticated as ${chalk.yellow(user.value.username)} <${user.value.email}>`);
                const orgas = await app.getMyOrganisations();
                for (const org of orgas.all()) {
                    console.log(`   Member of organisation ${chalk.yellow(org.username)}.`);
                }
            } catch (error) {
                console.error(`Account ${chalk.red(account.name)} ${chalk.gray(account.host)} not reachable: ${chalk.yellow(error.message)}`);
            } finally {
                client.disconnect();
            }
        }

        console.log(`Linked projects:`);
        const links = await getFolderLinksOfDirectory(getCWD());
        if (links.length) {
            for (const link of links) {
                const account = home.getAccount(link.accountId);
                console.log(`   Project ${chalk.green(link.name)} via account ${chalk.green(account.name)} in folder ${chalk.yellow(link.path)}`);
            }
        } else {
            console.log(`   No links for ${getCWD()}`);
        }

        process.exit(0);
    }
}
