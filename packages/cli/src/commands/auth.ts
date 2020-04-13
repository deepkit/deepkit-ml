/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Command, flags} from '@oclif/command';
import 'reflect-metadata';
import {getHomeConfig, setHomeConfig} from "@deepkit/core-node";
import chalk from "chalk";
import cli from "cli-ux";
import {AppControllerInterface, createAnonSocketClient, HomeAccountConfig} from "@deepkit/core";

export class AuthCommand extends Command {
    static description = 'Authenticates current user with a Deepkit server and creates a new account.';

    public static args = [
        {
            name: 'name',
            required: true,
            description: 'Account name',
        },
        {
            name: 'host',
            default: 'app.deepkit.ai',
            description: 'Host address (IP, DNS name)',
        }
    ];

    public static flags = {
        port: flags.integer({char: 'p', description: 'Port', default: 443}),
        ssl: flags.boolean({description: 'If SSL is enabled', default: true}),
        delete: flags.boolean({char: 'd', description: 'Deletes the account'}),
        token: flags.string({description: 'Manually assign a access token'}),
        overwrite: flags.boolean({description: 'Overwrite settings if account name is already used', default: false}),
    };

    public async run(): Promise<void> {
        const {args, flags} = this.parse(AuthCommand);

        const homeConfig = await getHomeConfig();
        const foundAccount = homeConfig.getAccountByName(args.name);

        if (flags.delete) {
            if (foundAccount) {
                if (args.name === 'localhost') {
                    console.log(`Not allowed to delete localhost.`);
                    this.exit(1);
                }

                homeConfig.deleteAccount(args.name);
                await setHomeConfig(homeConfig);
                console.log(`Account ${chalk.green(args.name)} deleted.`);
                this.exit(0);
            } else {
                console.log(`Account ${chalk.red(args.name)} does not exist.`);
                this.exit(1);
            }
        }

        if (foundAccount && !flags.overwrite) {
            console.log(`Account ${chalk.green(args.name)} already used. Use --overwrite to overwrite.`);
            this.exit(1);
        }


        const account = new HomeAccountConfig(args.name, args.host);
        account.port = flags.port;
        account.ssl = flags.ssl;

        if (account.host === 'localhost') {
            account.port = 8960;
            account.ssl = false;
        }

        const client = await createAnonSocketClient(account);
        try {
            await client.connect();
        } catch (error) {
            console.error(`Account ${chalk.red(account.name)} ${chalk.gray(account.host)} not reachable: ${chalk.yellow(error.message)}`);
            this.exit(1);
        }

        const app = client.controller<AppControllerInterface>('app');

        const username = await cli.prompt('username', {required: true});
        const password = await cli.prompt('password', {required: true, type: 'mask'});

        const token = await app.login(username, password);
        if (token) {
            account.token = token;
            homeConfig.add(account);
            await setHomeConfig(homeConfig);
            console.log('Successfully authenticated and account created.');
            this.exit(1);
        } else {
            console.log('Invalid credentials.');
            this.exit(1);
        }
        client.disconnect();
        process.exit(0);
    }
}
