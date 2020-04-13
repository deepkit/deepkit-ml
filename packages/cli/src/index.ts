/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {RunCommand} from "./commands/run";
import {ConnectCommand} from "./commands/connect";
import {IdCommand} from "./commands/id";
import {Command, Config, IPlugin, Manifest, PJSON, Topic} from '@oclif/config';
import {Main} from '@oclif/command';
import {StartCommand} from "./commands/start";
import {LinkCommand} from "./commands/link";
import {OSCommand} from "./commands/os";
import {InstallDockerCommand} from "./commands/install-docker";
import {InstallNvidiaCommand} from "./commands/install-nvidia";
import {AuthCommand} from "./commands/auth";
import {isElectronEnvironment} from "@deepkit/core";

(global as any).WebSocket = require('ws');


const commandsMap: { [name: string]: any } = {
    'auth': AuthCommand,
    'id': IdCommand,
    'link': LinkCommand,
    'connect': ConnectCommand,
    'run': RunCommand,
    'start': StartCommand,
    // 'test': TestCommand,
    'os': OSCommand,
    'install-docker': InstallDockerCommand,
    'install-nvidia': InstallNvidiaCommand,
};

class CustomPlugin implements IPlugin {
    _base = `deepkit@0.0.1`;

    readonly commandIDs: string[] = Object.keys(commandsMap);

    commands: Command.Plugin[] = [];
    hooks: { [p: string]: string[] } = {};
    name: string = 'bla';
    pjson: PJSON.Plugin | PJSON.CLI = {} as any;
    root: string = '';
    tag: string = 'TAAGG';
    readonly topics: Topic[] = [];
    type: string = 'user';
    valid: boolean = false;
    version: string = '0.0.1';

    findCommand(id: string, opts: { must: true }): Command.Class;
    findCommand(id: string, opts?: { must: boolean }): Command.Class | undefined;
    findCommand(id: string, opts?: { must: true } | { must: boolean }): Command.Class | undefined {
        const cmd: any = commandsMap[id];
        if (!cmd && opts && opts.must) {
            throw new Error(`Command ${id} not found.`);
        }
        cmd.id = id;
        cmd.plugin = this;
        return cmd;
    }

    public async manifest(): Promise<Manifest> {
        return {
            version: this.version,
            commands: this.commandIDs.map(id => {
                return [id, Command.toCached(this.findCommand(id, {must: true}))];
            })
                .filter((f): f is [string, Command] => !!f)
                .reduce((commands, [id, c]) => {
                    commands[id] = c;
                    return commands;
                }, {} as { [k: string]: Command })
        };
    }

    async load(): Promise<void> {
        const manifest = await this.manifest();
        this.commands = Object.entries(manifest.commands)
            .map(([id, c]) => ({...c, load: () => this.findCommand(id, {must: true})}));
    }
}

(async () => {
    const config = new Config({root: __dirname});
    // const config = await load({root: '', version: '0.0.1'});

    const plugin = new CustomPlugin();
    await plugin.load();
    config.plugins.push(plugin);

    await config.load();

    //argv is either [bin/node, cli.js, ...]
    //or [MacOS/Deepkit, '--cli']
    //so we remove first 2 items
    const argv = process.argv.slice(2);

    if (argv.length === 0 && await isElectronEnvironment()) {
        console.log('Use --app to start the application GUI.');
    }

    Main.run(argv, config).then(undefined, require('@oclif/errors/handle'));
})();
