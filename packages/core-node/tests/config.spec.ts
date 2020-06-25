import 'jest';
import 'jest-extended';
import 'reflect-metadata';
import {ConfigError, ConfigReader, getJobConfig} from "../src/config";
import {isUndefined} from "@marcj/estdlib";
import {JobConfig, JobTaskConfig} from "@deepkit/core";
import {normalizeRelativePathToBeIncluded} from "..";
import {getClassSchema} from "@marcj/marshal";

class MockedFileReader implements ConfigReader {
    constructor(
        private map: { [fileName: string]: { [k: string]: any } },
        protected baseDir = '/',
    ) {
    }

    async exist(filePath: string) {
        return !isUndefined(this.map[filePath]);
    }

    fromImport(filePath: string): MockedFileReader {
        return new MockedFileReader(this.map);
    }

    async read(filePath: string) {
        return JSON.stringify(this.map[filePath]);
    }
}

test('test basic', async () => {
    const schema = getClassSchema(JobConfig);
    if (Array.from(schema.getClassProperties().keys()).length === 0) {
        throw new Error('Wrong JobConfig loaded. It has no @f defined.');
    }

    const config = await getJobConfig('deepkit.yml', new MockedFileReader({
        'deepkit.yml': {
            command: 'Hello'
        }
    }));

    console.log('config.commands', config.commands);
    expect(config.path).toBe('deepkit.yml');
    expect(config.commands[0].command).toBe('Hello');
});

test('test basic commands', async () => {
    const config = await getJobConfig('deepkit.yml', new MockedFileReader({
        'deepkit.yml': {
            commands: ['Hello']
        }
    }));

    expect(config.commands[0].command).toBe('Hello');
    expect(config.getTasks().main.commands[0].command).toBe('Hello');
});

test('test basic commands 2', async () => {
    const config = await getJobConfig('deepkit.yml', new MockedFileReader({
        'deepkit.yml': {
            commands: {myHallo: 'Hello'}
        }
    }));

    expect(config.commands[0].name).toBe('myHallo');
    expect(config.commands[0].command).toBe('Hello');
});


test('test import', async () => {
    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                import: 'deepkit/another.yaml',
            },
            'deepkit/another.yaml': {
                command: 'Imported command',
                ignore: ['datasets/*', '../zips/*']
            }
        }));

        expect(config.commands[0].command).toBe('cd deepkit && (Imported command)');

        //paths are rewritten
        expect(config.ignore).toEqual(['deepkit/datasets/*', 'zips/*']);
    }

    {
        const config = await getJobConfig('deepkit/another.yaml', new MockedFileReader({
            'deepkit.yml': {
                ignore: ['zips/*']
            },
            'deepkit/another.yaml': {
                import: '../deepkit.yml',
                command: 'My command',
                ignore: ['$inherit', 'datasets/*']
            }
        }));

        expect(config.commands[0].command).toBe('cd deepkit && (My command)');

        //paths are rewritten
        expect(config.ignore).toEqual(['zips/*', 'deepkit/datasets/*']);
    }

    {
        const config = await getJobConfig('deepkit/another.yaml', new MockedFileReader({
            'deepkit.yml': {
                ignore: ['zips/*']
            },
            'deepkit/another.yaml': {
                import: '../deepkit.yml',
                command: 'My command',
                ignore: ['../*', '!.', '$inherit']
            }
        }));

        expect(config.path).toBe('deepkit/another.yaml');
        expect(config.paths).toEqual(['deepkit/another.yaml', 'deepkit.yml']);
        expect(config.dirs).toEqual(['deepkit', '']);
        expect(config.commands[0].command).toBe('cd deepkit && (My command)');

        //paths are rewritten
        expect(config.ignore).toEqual(['*', '!deepkit', 'zips/*']);
    }

    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                command: 'Hello',
                import: 'another.yaml'
            },
            'another.yaml': {
                command: 'Imported command'
            }
        }));

        expect(config.path).toBe('deepkit.yml');
        expect(config.paths).toEqual(['deepkit.yml', 'another.yaml']);
        expect(config.dirs).toEqual(['']);
        expect(config.commands[0].command).toBe('Hello');
    }
});

test('test command directory', async () => {
    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                command: 'Hello',
            }
        }));

        expect(config.commands[0].command).toBe('Hello');
    }
    {
        const config = await getJobConfig('experiments/deepkit.yml', new MockedFileReader({
            'experiments/deepkit.yml': {
                command: 'Hello',
            }
        }));

        expect(config.commands[0].command).toBe('cd experiments && (Hello)');
    }

    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                import: 'deepkit/another.yaml',
                command: 'Hello',
            },
            'deepkit/another.yaml': {
                command: 'Imported command'
            }
        }));

        expect(config.commands[0].command).toBe('Hello');
    }

    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                import: 'deepkit/another.yaml',
            },
            'deepkit/another.yaml': {
                command: 'Imported command'
            }
        }));

        expect(config.commands[0].command).toBe('cd deepkit && (Imported command)');
    }
});

test('test build directory', async () => {
    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                import: 'deepkit/another.yaml',
                command: 'Hello',
            },
            'deepkit/another.yaml': {
                build: 'pip install dummy'
            }
        }));

        expect(config.commands[0].command).toBe('Hello');
        expect(config.build).toEqual(['cd deepkit && (pip install dummy)']);
    }

    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                import: 'deepkit/another.yaml',
            },
            'deepkit/another.yaml': {
                import: '../very/deep/configs/main.yaml',
                command: 'Imported command',
            },
            'very/deep/configs/main.yaml': {
                build: 'apt-get install mysql'
            }
        }));

        expect(config.commands[0].command).toBe('cd deepkit && (Imported command)');
        expect(config.build).toEqual(['cd very/deep/configs && (apt-get install mysql)']);
    }
});

test('test build directory tasks', async () => {
    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                import: 'deepkit/another.yaml',
                tasks: {
                    peter: {
                        command: 'echo hi',
                    }
                }
            },
            'deepkit/another.yaml': {
                build: 'pip install tensorflow',
            }
        }));

        expect(config.commands.length).toBe(0);
        expect(config.getTasks().peter.commands[0].command).toBe('echo hi');
        expect(config.getTasks().peter.build).toEqual(['cd deepkit && (pip install tensorflow)']);
    }

    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                import: 'deepkit/another.yaml',
                tasks: {
                    peter: {
                        command: 'echo hi',
                        build: 'another build step',
                    }
                }
            },
            'deepkit/another.yaml': {
                build: 'pip install tensorflow',
            }
        }));

        expect(config.commands.length).toBe(0);
        expect(config.getTasks().peter.commands[0].command).toBe('echo hi');
        expect(config.getTasks().peter.build).toEqual(['another build step']);
    }

    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                import: 'deepkit/another.yaml',
                build: 'pip install tensorflow',
            },
            'deepkit/another.yaml': {
                tasks: {
                    peter: {
                        command: 'echo hi',
                        build: 'another build step',
                    }
                }
            }
        }));

        expect(config.commands.length).toBe(0);
        expect(config.getTasks().peter.commands[0].command).toBe('cd deepkit && (echo hi)');
        expect(config.getTasks().peter.build).toEqual(['cd deepkit && (another build step)']);
    }

    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                import: 'deepkit/another.yaml',
                build: 'pip install tensorflow',
            },
            'deepkit/another.yaml': {
                tasks: {
                    peter: {
                        command: 'echo hi',
                    }
                }
            }
        }));

        expect(config.commands.length).toBe(0);
        expect(config.getTasks().peter.commands[0].command).toBe('cd deepkit && (echo hi)');
        expect(config.getTasks().peter.build).toEqual(['pip install tensorflow']);
    }

    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                import: ['build/deepkit.yml', 'deepkit/tasks.yaml'],
                build: ['pip install tensorflow', '$inherit'],
            },
            'build/deepkit.yml': {
                build: 'make dataset\nADD dataset.txt',
            },
            'deepkit/tasks.yaml': {
                tasks: {
                    peter: {
                        command: 'echo hi',
                    }
                }
            }
        }));

        expect(config.commands.length).toBe(0);
        expect(config.getTasks().peter.commands[0].command).toBe('cd deepkit && (echo hi)');
        expect(config.getTasks().peter.build).toEqual([
            'pip install tensorflow', 'cd build && (make dataset)',
            'ADD build/dataset.txt'
        ]);
        expect(config.getTasks().peter.getBuildFiles()).toEqual(['build/dataset.txt']);
    }
});

test('test overwriting & inherit', async () => {
    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                import: 'build/deepkit.yml',
                build: 'pip install tensorflow',
            },
            'build/deepkit.yml': {
                build: 'make dataset',
            },
        }));
        expect(config.build).toEqual(['pip install tensorflow']);
    }

    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                build: ['$inherit', 'pip install tensorflow'],
                import: 'build/deepkit.yml',
            },
            'build/deepkit.yml': {
                build: ['$inherit', 'make dataset'],
                import: '../nested/deep/deepkit.yml',
            },
            'nested/deep/deepkit.yml': {
                build: 'make another',
            },
        }));
        expect(config.build).toEqual(['cd nested/deep && (make another)', 'cd build && (make dataset)', 'pip install tensorflow']);
    }

    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                import: 'build/deepkit.yml',
                build: ['pip install tensorflow', '$inherit', 'echo done'],
            },
            'build/deepkit.yml': {
                build: 'make dataset',
            },
        }));
        expect(config.build).toEqual(['pip install tensorflow', 'cd build && (make dataset)', 'echo done']);
    }

    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                import: 'build/deepkit.yml',
                build: ['pip install tensorflow', '$inherit', 'echo done'],
            },
            'build/deepkit.yml': {
            },
        }));
        expect(config.build).toEqual(['pip install tensorflow', 'echo done']);
    }

    {
        const config = await getJobConfig('experiments/deepkit.yml', new MockedFileReader({
            'build/deepkit.yml': {
                build: ['pip install tensorflow', 'echo done'],
            },
            'experiments/deepkit.yml': {
                import: '../build/deepkit.yml',
                command: 'echo hi',
                build: ['$inherit', 'yet another install after base'],
            },
        }));
        expect(config.build).toEqual(['cd build && (pip install tensorflow)', 'cd build && (echo done)', 'cd experiments && (yet another install after base)']);
    }
});

test('test import complex', async () => {
    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                import: 'deepkit/another.yaml',
                config: {optimizer: 'adam', lr: 0.5}
            },
            'deepkit/another.yaml': {
                command: 'Imported command',
                dockerfile: 'Dockerfile',
                ignore: ['datasets/*', '../zips/*'],
                config: {lr: 1}
            }
        }));

        //paths are rewritten
        expect(config.commands[0].command).toBe('cd deepkit && (Imported command)');
        expect(config.dockerfile).toBe('Dockerfile');
        expect(config.config).toEqual({optimizer: 'adam', lr: 1});
        expect(config.ignore).toEqual(['deepkit/datasets/*', 'zips/*']);
    }
});

test('test tasks', async () => {
    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                image: 'ubuntu',
                tasks: {
                    stage1: {
                        command: 'Stage 1',
                    },
                    stage2: {
                        command: 'Stage 2',
                        depends_on: ['stage1'],
                    },
                    stage3: {
                        command: 'Stage 3',
                        image: 'debian',
                        depends_on: ['stage2'],
                    }
                }
            }
        }));

        expect(config.image).toBe('ubuntu');

        expect(config).toBeInstanceOf(JobConfig);
        expect(config.getTasks().stage1).toBeInstanceOf(JobTaskConfig);
        expect(config.getTasks().stage2).toBeInstanceOf(JobTaskConfig);
        expect(config.getTasks().stage3).toBeInstanceOf(JobTaskConfig);

        expect(config.getTasks().stage1.commands[0].command).toBe('Stage 1');
        expect(config.getTasks().stage1.image).toBe('ubuntu');

        expect(config.getTasks().stage2.commands[0].command).toBe('Stage 2');
        expect(config.getTasks().stage2.image).toBe('ubuntu');

        expect(config.getTasks().stage3.commands[0].command).toBe('Stage 3');
        expect(config.getTasks().stage3.image).toBe('debian');

        expect(config.getTasks().stage1.depends_on).toEqual([]);
        expect(config.getTasks().stage2.depends_on).toEqual(['stage1']);
        expect(config.getTasks().stage3.depends_on).toEqual(['stage2']);
    }
});

test('test asd', async () => {
    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                image: 'ubuntu',
                build: ['ADD requirements.txt', 'pip install --upgrade pip'],
            }
        }), '/my/long/root/dir');

        expect(config.image).toBe('ubuntu');
        expect(config.getBuildFiles()).toEqual(['requirements.txt']);
    }
});

test('test relative build_files', async () => {
    {
        const config = await getJobConfig('examples/one/deepkit.yml', new MockedFileReader({
            'examples/one/deepkit.yml': {
                image: 'ubuntu',
                build: ['ADD requirements.txt', 'pip install --upgrade pip'],
            }
        }), '/my/long/root/dir');

        expect(config.image).toBe('ubuntu');
        expect(config.build).toEqual([
            'ADD examples/one/requirements.txt',
            'cd examples/one && (pip install --upgrade pip)'
        ]);
        expect(config.getBuildFiles()).toEqual(['examples/one/requirements.txt']);
    }

    {
        const config = await getJobConfig('examples/one/deepkit.yml', new MockedFileReader({
            'examples/one/deepkit.yml': {
                image: 'ubuntu',
                build: ['ADD ../../requirements.txt', 'pip install --upgrade pip'],
            }
        }), '/my/long/root/dir');

        expect(config.image).toBe('ubuntu');
        expect(config.build).toEqual([
            'ADD requirements.txt',
            'cd examples/one && (pip install --upgrade pip)'
        ]);
        expect(config.getBuildFiles()).toEqual(['requirements.txt']);
    }

    {
        const config = await getJobConfig('examples/one/deepkit.yml', new MockedFileReader({
            'examples/one/deepkit.yml': {
                image: 'ubuntu',
                build: ['ADD ../../requirements.txt:requirements.txt', 'pip install --upgrade pip'],
            }
        }), '/my/long/root/dir');

        expect(config.image).toBe('ubuntu');
        //for the moment the second argument after : is always relative to rootDir.
        expect(config.getBuildFiles()).toEqual(['requirements.txt:requirements.txt']);
        expect(config.build).toEqual([
            'ADD requirements.txt',
            'cd examples/one && (pip install --upgrade pip)'
        ]);
    }
});

test('test files', async () => {
    {
        const config = await getJobConfig('examples/one/deepkit.yml', new MockedFileReader({
            'examples/one/deepkit.yml': {
                image: 'ubuntu',
                files: '**/*.py',
            }
        }), '/my/long/root/dir');

        expect(config.image).toBe('ubuntu');
        expect(config.files).toEqual(['examples/one/**/*.py']);
    }

});

test('test deepkit folder', async () => {
    {
        const config = await getJobConfig('deepkit.yml', new MockedFileReader({
            'deepkit.yml': {
                image: 'ubuntu',
                config: {
                    test: 12
                },
                files: '**/*.py',
            }
        }), '/my/long/root/with/deepkit');

        expect(config.image).toBe('ubuntu');
        expect(config.files).toEqual(['**/*.py']);
        expect(config.config.test).toEqual(12);
    }

    {
        const config = await getJobConfig('deepkit/deepkit.yml', new MockedFileReader({
            'deepkit/deepkit.yml': {
                image: 'ubuntu',
                config: {
                    test: 12
                },
                files: '**/*.py',
            }
        }), '/my/long/root/with/deepkit');

        expect(config.image).toBe('ubuntu');
        expect(config.files).toEqual(['deepkit/**/*.py']);
        expect(config.config.test).toEqual(12);
    }

});

test('test tasks circular dependency', async () => {
    await expect(getJobConfig('deepkit.yml', new MockedFileReader({
        'deepkit.yml': {
            image: 'ubuntu',
            tasks: {
                stage1: {
                    command: 'Stage 1',
                    depends_on: [],
                },
                stage2: {
                    command: 'Stage 2',
                    depends_on: ['stage3'],
                },
                stage3: {
                    command: 'Stage 3',
                    image: 'debian',
                    depends_on: ['stage2'],
                }
            }
        }
    }))).rejects.toThrow(ConfigError);
});

test('test tasks wrong dependency', async () => {
    await expect(getJobConfig('deepkit.yml', new MockedFileReader({
        'deepkit.yml': {
            image: 'ubuntu',
            tasks: {
                stage1: {
                    command: 'Stage 1',
                    depends_on: ['stage0'],
                },
                stage2: {
                    command: 'Stage 2',
                    depends_on: ['stage3'],
                },
                stage3: {
                    command: 'Stage 3',
                    image: 'debian',
                    depends_on: ['stage2'],
                }
            }
        }
    }))).rejects.toThrow(ConfigError);
});

test('relative path resolution', () => {
    expect(normalizeRelativePathToBeIncluded('./peter/mowla')).toBe('./peter/mowla');
    expect(normalizeRelativePathToBeIncluded('../peter/mowla')).toBe('.parent-file/__/peter/mowla');

    expect(normalizeRelativePathToBeIncluded('../../file')).toBe('.parent-file/__/__/file');
    expect(normalizeRelativePathToBeIncluded('../../file/')).toBe('.parent-file/__/__/file/');
    expect(normalizeRelativePathToBeIncluded('../.../file/')).toBe('.parent-file/__/__./file/');
});

test('env', async () => {
    {
        const config = await getJobConfig('deepkit.yaml', new MockedFileReader({
            'deepkit.yaml': {
                image: 'ubuntu',
                env: ['PETER=BLA']
            }
        }));

        expect(config.image).toBe('ubuntu');
        expect(config.env).toEqual(['PETER=BLA']);
        expect(config.getTasks().main.env).toEqual(['PETER=BLA']);
    }
});
