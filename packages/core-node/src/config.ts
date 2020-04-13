/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {JobConfig, JobTaskConfig} from "@deepkit/core";
import {parse} from 'yaml';
import * as path from 'path';
import {arrayRemoveItem, CustomError, isArray, isObject, isSet, isString} from "@marcj/estdlib";
import {plainToClass} from "@marcj/marshal";
import {existsSync} from "fs";
import {readFile} from "fs-extra";
import {getCWD} from "./home";

export interface ConfigReader {
    exist(filePath: string): Promise<boolean>;

    read(filePath: string): Promise<string>;

    fromImport(filePath: string): ConfigReader;
}

export class ConfigError extends CustomError {
}

export function isSubDir(parent: string, p: string) {
    const relative = path.relative(parent, p);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export class LocalPathReader implements ConfigReader {
    constructor(protected baseDir: string = getCWD()) {
        if (!baseDir) {
            this.baseDir = getCWD();
        }
    }

    async exist(filePath: string) {
        return existsSync(path.join(this.baseDir, filePath));
    }

    async read(filePath: string) {
        return await readFile(path.join(this.baseDir, filePath), 'utf8');
    }

    fromImport(filePath: string) {
        return new LocalPathReader(path.dirname(filePath));
    }
}

export async function configParser(
    rootDir: string,
    config: { [key: string]: any },
    filePath: string,
    reader: ConfigReader | null = null,
): Promise<void> {
    if (!reader) {
        reader = new LocalPathReader(rootDir);
    }

    if (!await reader.exist(filePath)) {
        throw new Error(`Config at ${filePath} in ${rootDir} not found`);
    }

    const content = await reader.read(filePath);
    if (!config['path']) {
        //the first loaded config is the the one we want to track
        config['path'] = filePath;
    }
    const parsed: { [key: string]: any } = parse(content);

    if (!config['paths']) config['paths'] = [];
    config['paths'].push(filePath);

    const relativePathFromRoot = path.relative(rootDir, path.join(rootDir, path.dirname(filePath)));

    if (!config['dirs']) config['dirs'] = [];
    if (-1 === config['dirs'].indexOf(relativePathFromRoot)) {
        config['dirs'].push(relativePathFromRoot);
    }

    const normalizeJobTaskConfig = (jobTaskConfig: { [name: string]: any }) => {
        //note: we need to make sure configValuesNoOverwrite is correctly set when comming from `command`.
        if (jobTaskConfig['command']) {
            if (isArray(jobTaskConfig['command'])) {
                jobTaskConfig['commands'] = jobTaskConfig['command'];
            } else if (isObject(jobTaskConfig['command'])) {
                jobTaskConfig['commands'] = jobTaskConfig['command'];
            } else {
                jobTaskConfig['commands'] = {'': jobTaskConfig['command']};
            }
            delete jobTaskConfig['command'];
        }

        if (isArray(jobTaskConfig['commands']) && jobTaskConfig['commands'].length) {
            for (const [i, v] of Object.entries(jobTaskConfig['commands'])) {
                if (isString(v)) {
                    (jobTaskConfig['commands'] as any)[i] = {name: i, command: v};
                }
            }
        } else if (isObject(jobTaskConfig['commands']) && Object.keys(jobTaskConfig['commands']).length) {
            const transformed: any[] = [];
            for (const [i, v] of Object.entries(jobTaskConfig['commands'] as { [name: string]: any })) {
                transformed.push({name: i, command: v});
            }
            jobTaskConfig['commands'] = transformed;
        }

        if (isString(jobTaskConfig['label'])) {
            jobTaskConfig['labels'] = jobTaskConfig['label'].split('\n');
        }

        if (isString(jobTaskConfig['import'])) {
            jobTaskConfig['import'] = jobTaskConfig['import'].split('\n');
        }

        if (isString(jobTaskConfig['build'])) {
            jobTaskConfig['build'] = jobTaskConfig['build'].split('\n');
        }

        if (isString(jobTaskConfig['output'])) {
            jobTaskConfig['output'] = jobTaskConfig['output'].split('\n');
        }

        if (isString(jobTaskConfig['ignore'])) {
            jobTaskConfig['ignore'] = jobTaskConfig['ignore'].split('\n');
        }

        if (isString(jobTaskConfig['files'])) {
            jobTaskConfig['files'] = jobTaskConfig['files'].split('\n');
        }

        if (relativePathFromRoot) {
            const convertPath = (v: string) => {
                if (!isString(v)) return '';
                if (v === '$inherit') return '$inherit';
                if (v.startsWith('!')) {
                    return '!' + path.join(relativePathFromRoot, v.substr(1));
                } else {
                    return path.join(relativePathFromRoot, v) || './';
                }
            };

            const convertPaths = (array: string[]) => {
                if (isArray(array)) {
                    return array.map(convertPath);
                }
                return array;
            };

            jobTaskConfig['ignore'] = convertPaths(jobTaskConfig['ignore']);

            jobTaskConfig['output'] = convertPaths(jobTaskConfig['output']);
            jobTaskConfig['files'] = convertPaths(jobTaskConfig['files']);
            jobTaskConfig['dockerfile'] = convertPaths(jobTaskConfig['dockerfile']);

            if (isArray(jobTaskConfig['build'])) {
                jobTaskConfig['build'] = jobTaskConfig['build'].map((line: string) => {
                    if (line.startsWith('ADD ')) {
                        const v = line.substring(line.indexOf(' ') + 1);
                        const [path, target] = v.split(':');
                        return 'ADD ' + convertPath(path) + (target ? (':' + target) : '');
                    }
                    if (line === '$inherit') return line;
                    return `cd ${relativePathFromRoot} && (${line})`;
                });
            }

            if (isArray(jobTaskConfig['commands'])) {
                for (const v of jobTaskConfig['commands'] as { name: string, command: string }[]) {
                    v.command = `cd ${relativePathFromRoot} && (${v.command})`;
                }
            }
        }
    };

    normalizeJobTaskConfig(parsed);

    for (const [k, v] of Object.entries(parsed)) {
        if (!isSet(config[k])) {
            config[k] = v;
        } else {
            if (isArray(v) && isArray(config[k])) {
                //this is necessary otherwise we end up in a endless loop when `v` contains and $inherit as well
                const temp = v.map((i: any) => i === '$inherit' ? '$_inherit' : i);
                // const relativeImport = parentConfigDir ? path.relative(parentConfigDir, path.dirname(filePath))

                for (let index = config[k].indexOf('$inherit'); index !== -1; index = config[k].indexOf('$inherit')) {
                    config[k].splice(index, 1, ...temp);
                }

                config[k] = config[k].map((i: any) => i === '$_inherit' ? '$inherit' : i);
            }

            if (k === 'config') {
                //object merge
                if (isObject(config[k]) && isObject(v)) {
                    Object.assign(config[k], v);
                }
            }
        }
    }

    if (isArray(parsed['import'])) {
        for (const v of parsed['import']) {
            await configParser(
                rootDir,
                config,
                path.join(relativePathFromRoot, v),
            );
        }
    }

    //remove all unhandled $inherit
    for (const [k, v] of Object.entries(config)) {
        if (isArray(config[k])) {
            arrayRemoveItem(config[k], '$inherit');
        }
    }

    if (isObject(parsed['tasks'])) {
        const tasks: { [name: string]: JobTaskConfig } = parsed['tasks'] as any;

        for (const [k, task] of Object.entries(tasks)) {
            task.name = k;
            task.configValuesNoOverwrite = {};

            for (const k of Object.keys(task)) {
                task.configValuesNoOverwrite[k] = true;
                if (k === 'command') {
                    task.configValuesNoOverwrite['commands'] = true;
                }
            }

            if (isArray(task.depends_on)) {
                for (const depends_on of task.depends_on) {
                    if (!tasks[depends_on]) {
                        throw new ConfigError(`Task '${k}' depends on missing '${depends_on}'`);
                    }

                    detectCircularDependency(tasks, depends_on, [depends_on]);
                }
            }

            normalizeJobTaskConfig(task);
        }
    }
}

function detectCircularDependency(
    tasks: { [name: string]: JobTaskConfig },
    origin_depends_on: string,
    last_depends_ons: string[]
) {
    const current_depends_on = last_depends_ons[last_depends_ons.length - 1];

    if (tasks[current_depends_on] && tasks[current_depends_on].depends_on) {

        for (const depends_on of tasks[current_depends_on].depends_on) {
            const newList = last_depends_ons.slice();
            newList.push(depends_on);

            if (depends_on === origin_depends_on) {
                throw new ConfigError(`Circular dependency in task dependencies: ` + newList.join(' -> '));
            } else {
                detectCircularDependency(tasks, origin_depends_on, newList);
            }
        }
    }
}

export async function getJobConfig(filePath: string, reader: ConfigReader | null = null, rootDir: string = ''): Promise<JobConfig> {
    const data = {};
    await configParser(rootDir, data, filePath, reader);

    return plainToClass(JobConfig, data);
}

// export function getJobConfigObject(config: { [key: string]: any }, filePath: string, reader: ConfigReader | null = null): JobConfig {
//     configParser(config, filePath, reader);
//
//     return plainToClass<JobConfig, object>(JobConfig, config);
// }
