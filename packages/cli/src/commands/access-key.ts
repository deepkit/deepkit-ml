/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Command, flags} from '@oclif/command';
import 'reflect-metadata';
import chalk from "chalk";
import cli from "cli-ux";
import {AppControllerInterface, createAnonSocketClient, HomeAccountConfig} from "@deepkit/core";

export class AccessKeyCommand extends Command {
    static description = 'Generates an access-key that can be used in notebooks or api calls';

    public static args = [
        {
            name: 'host',
            default: 'app.deepkit.ai',
            description: 'Host address (IP, DNS name)',
        }
    ];

    public static flags = {
        port: flags.integer({char: 'p', description: 'Port', default: 443}),
        ssl: flags.boolean({description: 'If SSL is enabled. Use --no-ssl to disable it', default: true, allowNo: true}),
    };

    public async run(): Promise<void> {
        const {args, flags} = this.parse(AccessKeyCommand);

        const account = new HomeAccountConfig("access-token-generation", args.host);
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

        console.log(`Connecting to ${account.host}`);

        const username = await cli.prompt('username', {required: true});
        const password = await cli.prompt('password', {required: true, type: 'hide'});

        const token = await app.login(username, password);
        client.disconnect();

        if (token) {
            console.log("Token successfully created:", token);
            console.log(chalk.red("Make sure to keep it private."));
            this.exit(0);
        } else {
            console.log('Invalid credentials.');
            this.exit(1);
        }
    }
}
