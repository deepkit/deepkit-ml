/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import "source-map-support/register";
import 'reflect-metadata';
import path, {join} from "path";
import os from "os";
import {findParentPath, getUserHome, onProcessExit} from "@deepkit/core-node";
import {ensureDirSync, removeSync} from "fs-extra";
import execa from "execa";
import {
    Cluster,
    ClusterNode,
    ClusterNodeCredentials,
    DeepKitFile,
    FrontendUser,
    hasRole,
    isElectronEnvironment,
    isMASBuild,
    Job,
    JobModelSnapshot,
    Note,
    OrganisationMember,
    Project,
    ProjectIssue,
    RoleType,
    UniversalComment,
    User
} from "@deepkit/core";
import {
    Application,
    ApplicationModule,
    ApplicationServer,
    ApplicationServerConfig,
    ClientConnection,
    Session,
} from "@marcj/glut-server";
import {ClassType, sleep} from "@marcj/estdlib";
import {FileType} from '@marcj/glut-core';
import {Connection, Database} from '@marcj/marshal-mongo';
import {setupHomeAccountIfNecessary} from "./home";
import {AppController} from "./controller/app.controller";
import {ServerAdminController} from "./controller/serverAdminController";
import {JobQueueItem, ResourcesManager} from "./node/resources";
import {NodeManager} from "./node/node.manager";
import {PermissionManager} from "./manager/permission";
import {Injector} from "injection-js";
import {JobSession, NodeSession, SessionHelper, UserSession} from "./session";
import {JobController} from "./job/job.controller";
import {ProjectManager} from "./manager/project-manager";
import {NodeController} from "./node/node.controller";
import {createServer as createHttpServer} from 'http';
import express from 'express';
import {getRole, isLocalUser} from "./utils";
import {SessionPermissionManager} from "./manager/session-permission";
import {hash} from "bcryptjs";
import Dockerode from 'dockerode';
import {ServerSettings} from "./model/server";
import {LocalController} from "./controller/local.controller";
import {PublicController} from "./controller/public.controller";
import {StateFixer} from "./manager/state-fixer";
import {AdminController} from "./controller/adminController";
import {MachineManager} from "./node/machine.manager";
import {getClassSchema} from "@marcj/marshal";
import {JobManager} from "./manager/job-manager";
import {NoteController} from "./controller/note.controller";
import {IssueController} from "./controller/issue.controller";
import {PublicJobController} from "./controller/public-job.controller";
import {ProjectController} from "./controller/project.controller";
import {PermissionController} from "./controller/permission.controller";
import {createServer} from "net";

// const Promise = require('bluebird');
// Promise.longStackTraces(); //needs to be disabled in production since it leaks memory
// global.Promise = Promise;

// @ts-ignore
global['WebSocket'] = require('ws');

// only necessary when no ts-node is used
// require('source-map-support').install({hookRequire: true});

process.on('unhandledRejection', error => {
    console.log('unhandledRejection', error);
    process.exit(1);
});

ensureDirSync(getUserHome() + '/.deepkit/');
let exchangeSocketPath: string | number = getUserHome() + '/.deepkit/exchange.sock';
removeSync(exchangeSocketPath);

(async () => {
    const serverMode = process.env.DEEPKIT_SERVER_MODE === '1';
    const packageJson = require('package.json');
    console.log('version', packageJson['version']);
    console.log('serverMode', serverMode);
    console.log('electron', await isElectronEnvironment());
    console.log('mas', await isMASBuild());
    console.log('pwd', process.cwd());

    const mongoHost = process.env.DEEPKIT_MONGO_HOST;
    if (os.platform() === 'win32') {
        // windows mongodb only supports real tcp, no unix sockets
        process.env.DEEPKIT_MONGO_UNIX_SOCKET = 'localhost';
        exchangeSocketPath = 8963;
    }

    const mongoConfig = {
        start: false,
        binary: '',
        host: process.env.DEEPKIT_MONGO_UNIX_SOCKET || (getUserHome() + '/.deepkit/mongo.sock'),
        port: 27017
    };

    let binaryAffix = os.platform() + '-' + os.arch();

    if (!mongoHost) {
        mongoConfig.start = true;
        if (os.platform() === 'win32') binaryAffix += '.exe';
        mongoConfig.binary = await findParentPath('libs/mongod-' + binaryAffix);

        console.log('mongo binary', mongoConfig.binary);
        mongoConfig.port = 8962;
    }

// only necessary for ts-node
// const PATH_TO_NODE = __dirname + '/../node_modules/.bin/ts-node';
// cluster.setupMaster({
//     execArgv: [PATH_TO_NODE, '--project', 'tsconfig.run.json', '--ignore', 'node_modules\/(?!(@deepkit|@marcj))'],
// } as cluster.ClusterSettings);

// const selfsigned: any = require('selfsigned');
// const attrs = [{name: 'commonName', value: 'localhost'}];
// const pems = selfsigned.generate(attrs, {days: 365});

    const app = express();
    const deepkitFrontend = path.resolve(process.env.DEEPKIT_FRONTEND_DIR || path.join(__dirname, './frontend'));
    app.disable('x-powered-by');
    app.disable('etag');
    app.use(express.static(deepkitFrontend));
    app.all('/*', function (req, res) {
        res.sendFile('index.html', {root: deepkitFrontend});
    });

    const http = createHttpServer(app);

    const port = process.env.DEEPKIT_HTTP_PORT ? parseInt(process.env.DEEPKIT_HTTP_PORT, 10) : 8960;
    http.listen(port, () => {
        console.log('http ready.', port);
    });

    const docker = new Dockerode();
    const serverSettings = new ServerSettings();
    serverSettings.serverMode = serverMode;

    const dbEntities: ClassType<any>[] = [
        JobQueueItem,
        Project,
        Job,
        Cluster,
        ClusterNode,
        ClusterNodeCredentials,
        User,
        OrganisationMember,
        DeepKitFile,
        Note,
        JobModelSnapshot,
    ];

    @ApplicationModule({
        controllers: [
            AppController,
            AdminController,
            ServerAdminController,
            JobController,
            NodeController,
            PublicController,
            PublicJobController,
            LocalController,
            NoteController,
            PermissionController,
            IssueController,
            ProjectController,
        ],
        connectionProviders: [
            SessionHelper,
            SessionPermissionManager,
        ],
        serverProviders: [
            {provide: FileType, deps: [], useFactory: () => FileType.forCustomType(DeepKitFile)},
            {provide: ServerSettings, useValue: serverSettings},
            {provide: Dockerode, useValue: docker},
            {provide: 'HTTP_PORT', useValue: port},
            ResourcesManager,
            NodeManager,
            ProjectManager,
            JobManager,
            PermissionManager,
            StateFixer,
            MachineManager,
        ],
        notifyEntities: [
            Project,
            Job,
            Cluster,
            ClusterNode,
            FrontendUser,
            OrganisationMember,
            DeepKitFile,
            Note,
            ProjectIssue,
            UniversalComment,
            JobModelSnapshot,
        ],
        config: {
            workers: 1,
            server: http,
            mongoHost: mongoConfig.host,
            mongoPort: mongoConfig.port,
            mongoDbName: 'deepkit',
            maxPayload: 500_000_000,
            exchangeUnixPath: exchangeSocketPath,
            fsPath: process.env.DEEPKIT_FS_DIR || '~/.deepkit/server-files',
        }
    })
    class MyApp extends Application {
        constructor(
            protected database: Database,
            protected stateFixer: StateFixer,
            protected permissionManager: PermissionManager,
            protected serverSettings: ServerSettings,
            protected machineManager: MachineManager,
            protected config: ApplicationServerConfig,
        ) {
            super();
        }

        async isAllowedToSendToPeerController<T>(injector: Injector, session: Session | undefined, controllerName: string): Promise<boolean> {
            //no client is allowed to send to a peer controller directly.
            return false;
        }

        async isAllowedToRegisterPeerController<T>(injector: Injector, session: Session | undefined, controllerName: string): Promise<boolean> {
            if (controllerName.startsWith('node/') && session instanceof NodeSession) {
                return true;
            }

            if (controllerName.startsWith('job/') && session instanceof JobSession) {
                return true;
            }

            return false;
        }

        async bootstrap(): Promise<any> {
            //todo, what happens if we have multiple workers? Then this is run multiple times, maybe even at the same time.
            // we should add mainBootstrap() which is only executed once
            console.log('mongo', mongoConfig);

            //same here
            await this.stateFixer.startFixStates();
            this.machineManager.start().catch(e => {
                console.error('machineManager.start failed', e);
            });

            //same here
            console.log('setup indices');
            for (const entity of dbEntities) {
                const collection = await this.database.connection.getCollection(entity);
                //collection not existing yet, so create lock
                const schema = getClassSchema(entity);
                for (const index of schema.indices) {
                    const fields: { [name: string]: 1 } = {};

                    for (const f of index.fields) {
                        fields[f] = 1;
                    }

                    const options: any = {
                        name: index.name
                    };
                    if (index.options.unique) options.unique = true;
                    if (index.options.sparse) options.sparse = true;

                    try {
                        await collection.createIndex(fields, options);
                    } catch (error) {
                        console.log('failed index', index.name, '. Recreate ...');
                        //failed, so drop and re-create
                        await collection.dropIndex(index.name);
                        await collection.createIndex(fields, options);
                    }
                }
            }
            console.log('indices done.');

            if (serverMode) {
                const admin = await this.database.query(User).filter({username: 'admin'}).findOneOrUndefined();
                if (!admin) {
                    const password = 'admin';
                    const user = new User('admin', 'admin@localhost', RoleType.serverAdmin, await hash(password, 10));
                    await this.database.add(user);
                    console.log('###### Added admin user');
                }
            } else {
                await setupHomeAccountIfNecessary(this.database);
            }

            console.log('Worker bootstrapped', this.serverSettings);
        }

        public async hasAccess<T>(injector: Injector, session: Session | undefined, controller: ClassType<T>, action: string): Promise<boolean> {
            const requiredControllerRole = getRole(controller, action);
            let currentRole = RoleType.anonymouse;

            if (session instanceof UserSession) {
                currentRole = session.role;
            }

            if (session instanceof JobSession) {
                currentRole = RoleType.job;
            }

            if (session instanceof NodeSession) {
                currentRole = RoleType.server;
            }

            // console.log('hasAccess', action, currentRole, requiredControllerRole, hasRole(currentRole, requiredControllerRole));
            return hasRole(currentRole, requiredControllerRole);
        }

        async authenticate(injector: Injector, token: { id: 'user' | 'job' | 'node' | 'local', token: any }): Promise<any> {
            if (token.id === 'node') {
                const nodeToken = token as {
                    id: 'node',
                    token: string,
                    nodeId: string,
                };

                const node = await this.permissionManager.getNodeForToken(nodeToken);

                if (!node) {
                    throw new Error('Invalid node access token.');
                }

                return new NodeSession(node.id, node.name);
            }

            if (token.id === 'local') {
                const connection: ClientConnection = injector.get(ClientConnection);
                if (isLocalUser(connection.remoteAddress)) {
                    const user = await this.permissionManager.getLocalUser();
                    user.role = RoleType.local;
                    return new UserSession(user.id, user.id, false, user.username, user.role, true);
                } else {
                    throw new Error('Access denied to local user.');
                }
            }

            if (token.id === 'user') {
                const userToken = token as {
                    id: 'user',
                    token: string,
                    organisation?: string,
                };

                const user = await this.permissionManager.getUserForToken(userToken.token);

                if (!user) {
                    throw new Error('Invalid user token.');
                }

                //check for accountId. Is used to interact as organisation
                if (userToken.organisation && userToken.organisation !== user.id) {
                    const member = await this.permissionManager.getOrganisationMember(user.id, userToken.organisation);

                    if (member) {
                        return new UserSession(
                            user.id,
                            userToken.organisation,
                            true,
                            user.username,
                            //serverAdmin is preferred
                            user.role === RoleType.serverAdmin ? RoleType.serverAdmin : member.getRoleType(),
                            user.localUser
                        );
                    }

                    throw new Error('Access denied to organisation.');
                }

                return new UserSession(user.id, user.id, false, user.username, user.role, user.localUser);
            }

            if (token.id === 'job') {
                const jobToken = token as {
                    id: 'job',
                    token: string,
                    job: string
                };

                const job = await this.database.query(Job).filter({
                    id: jobToken.job,
                    accessToken: jobToken.token,
                }).findOneOrUndefined();

                if (!job) {
                    console.error('Invalid job token', token);
                    throw new Error('Invalid job token.');
                }

                return new JobSession(job.id, job.project);
            }

            throw new Error('No valid token');
        }
    }

    const glutApp = ApplicationServer.createForModule(MyApp);

    let mongo: execa.ExecaChildProcess | undefined;

    function startMongo() {
        if (!mongoConfig.start) return;

        if (mongo) {
            return;
        }

        const mongoDir = process.env.DEEPKIT_MONGO_DIR || join(getUserHome(), '.deepkit', 'data', 'mongo2');
        ensureDirSync(mongoDir);

        const args = path.isAbsolute(mongoConfig.host) ? ['--bind_ip', mongoConfig.host] : [];

        args.push('--port', String(mongoConfig.port));
        args.push('--dbpath', mongoDir);
        args.push('--journal');

        console.log('start mongo', mongoConfig.binary, args);
        mongo = execa(mongoConfig.binary, args, {
            stdout: 'inherit',
            stderr: 'inherit',
            cleanup: true
        });

        mongo.on('error', (error) => {
            console.error('mongo error', error);
            mongo = undefined;
        });

        mongo.on('close', () => {
            console.error('mongo close');
            mongo = undefined;
        });

        mongo.on('exit', () => {
            console.error('mongo exit');
            mongo = undefined;
        });

        process.on('disconnect', function () {
            console.log('parent exited');
            try {
                console.log('KILL MONGO');
                if (mongo) mongo.kill();
            } catch (error) {
            }
            process.exit();
        });

        onProcessExit(() => {
            console.log('KILL MONGO');
            if (mongo) {
                try {
                    mongo.kill();
                } catch (error) {
                }
            }
            process.exit();
        });
    }

    while (true) {
        try {
            const mongoHost = mongoConfig.host.startsWith('/') ? encodeURIComponent(mongoConfig.host) : mongoConfig.host + ':' + mongoConfig.port;
            console.log('wait for mongo', mongoHost);
            const connection = new Connection(mongoHost, 'deepkit');
            await connection.connect();
            break;
        } catch (e) {
            console.log('connection failed', e.message);
            startMongo();
            // console.log('failed connectiong to mongo', e);
            await sleep(1);
        }
    }

    console.log('mongo is up.');

    const pingServer = createServer(function (socket) {
        socket.end('pong', 'utf8');
    });
    pingServer.listen(61720, '0.0.0.0');

    await glutApp.start();
})();
