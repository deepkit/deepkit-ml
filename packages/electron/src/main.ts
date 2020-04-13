/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import 'reflect-metadata';
import {app, BrowserWindow, Menu} from 'electron';
import * as path from 'path';
import * as os from "os";
import {pathExistsSync} from "fs-extra";

const {autoUpdater} = require("electron-updater");

process.noDeprecation = true;
(global as any).electron = require('electron');

const url = require('url');

let win: BrowserWindow | null;
const args = process.argv.slice(1);

//electron package as right beside its index.js the deepkit folder with the frontend files.
process.env.DEEPKIT_FRONTEND_DIR = __dirname + '/deepkit';

const isForcedApp = args.some(val => val === '--app');
let isCLI = !isForcedApp && args.some(val => val === '--cli');

if (!isForcedApp && process.stdout.isTTY) {
    if (!isCLI) {
        //its important to have --cli in the argv, because the cli removes 2 items.
        process.argv.splice(1, 0, '--cli');
    }
    isCLI = true;
}

if (isCLI) {
    //index.js in cli removes --cli already
    //linux snap adds that shizzel
    process.argv = process.argv.filter(v => v !== '--no-sandbox');

    require('cli.js');
} else if (args.some(val => val === '--server')) {
    process.argv = process.argv.slice(1);
    require('server.js');
} else {
    const dev = args.some(val => val === '--dev');

    const gotTheLock = app.requestSingleInstanceLock();

    if (!gotTheLock) {
        app.quit();
        process.exit(1);
    }

    // app.commandLine.appendSwitch('ignore-gpu-blacklist');

    process.stdout.write('Hi\n');
    console.log(process.execPath);

    if (app.dock) {
        app.dock.show();
    }

    autoUpdater.checkForUpdatesAndNotify().catch(console.error);

    async function createWindow() {
        if (win) {
            return;
        }

        // app.dock.show();

        // const electronScreen = screen;
        // const size = electronScreen.getPrimaryDisplay().workAreaSize;
        console.log('__dirname', __dirname);
        console.log('isTTY', process.stdout.isTTY);

        // if (dev) {
        //     //dev
        //     require('electron-reload')(path.resolve(path.join(__dirname, '../../deepkit/dist/deepkit')));
        // }

        const iconName = os.platform() === 'darwin' ? 'dock-icon.icns' : 'docker-icon.iconset/icon_1024x1024.png';
        const icon = path.join(__dirname, 'assets/icons/' + iconName);
        console.log('icon', icon);

        // Create the browser window.
        win = new BrowserWindow({
            center: true,
            width: 1200,
            // backgroundColor: 'white',
            frame: false,
            height: 800,
            vibrancy: 'window',
            transparent: true,
            backgroundColor: "#80FFFFFF",
            webPreferences: {
                scrollBounce: true,
                allowRunningInsecureContent: false,
                nodeIntegration: true, //important for electron remote and source file editing
                // preload: __dirname + '/../../node_modules/@marcj/angular-desktop-ui/preload.js',
                disableBlinkFeatures: 'BlockingFocusWithoutUserActivation',
                nativeWindowOpen: true,
            },
            titleBarStyle: 'hidden',
            icon: icon
        });

        win.webContents.on('context-menu', (e, props) => {
            const InputMenu = Menu.buildFromTemplate([{
                label: 'Undo',
                role: 'undo',
            }, {
                label: 'Redo',
                role: 'redo',
            }, {
                type: 'separator',
            }, {
                label: 'Cut',
                role: 'cut',
            }, {
                label: 'Copy',
                role: 'copy',
            }, {
                label: 'Paste',
                role: 'paste',
            }, {
                type: 'separator',
            }, {
                label: 'Select all',
                role: 'selectall',
            },
            ] as Electron.MenuItemConstructorOptions[]);
            const {inputFieldType} = props;
            if (inputFieldType === 'plainText') {
                InputMenu.popup({window: win});
            }
        });

        // if (serve) {
        //   require('electron-reload')(__dirname, {
        //    electron: require(`${__dirname}/node_modules/electron`)});
        //   win.loadURL('http://localhost:4200');
        // } else {
        // win.loadURL(url.format({
        //     pathname: path.join(__dirname, 'app/index.html'),
        //     protocol: 'file:',
        //     slashes: true
        // }));
        // }

        if (dev) {
            //dev
            const deepkitFrontend = path.resolve(path.join(__dirname, '../../deepkit/dist/deepkit'));

            // win.loadURL('http://localhost:8960');
            console.log('loadURL', path.join(deepkitFrontend, 'index.html'));

            win.loadURL(url.format({
                pathname: path.join(deepkitFrontend, 'index.html'),
                protocol: 'file:',
                slashes: true,
                // hash: '/contact'
            }));

        } else {
            //vs build
            const deepkitFrontend = path.resolve(path.join(__dirname, 'deepkit'));
            console.log('loadURL', path.join(deepkitFrontend, 'index.html'));
            win.loadURL(url.format({
                pathname: path.join(deepkitFrontend, 'index.html'),
                protocol: 'file:',
                slashes: true,
                // hash: '/contact'
            }));
        }

        win.webContents.on('did-finish-load', () => {
            if (dev) {
                win.webContents.openDevTools();
            }
        });

        console.log('lets go');
        win.on('closed', () => {
            // Dereference the window object, usually you would store window
            // in an array if your app supports multi windows, this is the time
            // when you should delete the corresponding element.
            win = null;
            // app.dock.hide();
        });
    }

// This will register the TypeScript compiler
// require('ts-node').register();

// let tray: Tray;

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
    app.on('ready', async () => {
        await createWindow();

        // tray = new Tray(path.join(assetsPath, 'tray/16x16.png'));
        //
        // const contextMenu = Menu.buildFromTemplate([
        //     {
        //         label: 'Open', type: 'normal', click: async () => {
        //             await createWindow();
        //         }
        //     },
        //     {type: 'separator'},
        //     {
        //         label: 'Close', type: 'normal', click: () => {
        //             app.quit();
        //         }
        //     },
        // ]);
        // tray.setToolTip('Deepkit');
        // tray.setContextMenu(contextMenu);
        //
        // tray.setTitle(`0`);
    });

// app.on('test', () => {
//   console.log('test', arguments);
// });

// Quit when all windows are closed.
    app.on('window-all-closed', () => {
        //todo, keep app alive and put tray icon
        app.quit();

        // On OS X it is common for applications and their menu bar
        // to stay active until the user quits explicitly with Cmd + Q
        // if (process.platform !== 'darwin') {
        // }
    });

    app.on('activate', () => {
        // On OS X it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (win === null) {
            createWindow();
        }
    });


    if (!dev) {
        //start deepkit-server
        require('server.js');
    }
}
