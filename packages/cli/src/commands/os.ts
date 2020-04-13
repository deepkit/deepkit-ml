/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Command, flags} from '@oclif/command';
import 'reflect-metadata';
import getos from 'getos';

export class OSCommand extends Command {
    static description = 'server: Prints OS information';

    public static args = [
        {name: 'name'},
    ];

    public static flags = {
        account: flags.string({char: 'a'}),
    };

    public async run(): Promise<void> {
        const {args, flags} = this.parse(OSCommand);

        getos((e: any, os: any) => {
            console.log(JSON.stringify(os));
            process.exit(0);
        });
    }
}
