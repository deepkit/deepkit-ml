process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import {RESPONSE} from "@nguniversal/express-engine/tokens";
import 'zone.js/dist/zone-node';
import {ngExpressEngine} from '@nguniversal/express-engine';
import * as express from 'express';
import {join} from 'path';
import {AppServerModule} from './src/main.server';
import {readFileSync} from "fs";
import {APP_BASE_HREF} from '@angular/common';

const ua = require('universal-analytics');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const visitor = ua('UA-118269992-1');
const contentful = require("contentful");

const domino = require('domino');
(global as any).window = global;
Object.assign(global, domino.impl);
global['requestAnimationFrame'] = function(callback, element) {
    let lastTime = 0;
    const currTime = new Date().getTime();
    const timeToCall = Math.max(0, 16 - (currTime - lastTime));
    const id = setTimeout(function() { callback(currTime + timeToCall); },
        timeToCall);
    lastTime = currTime + timeToCall;
    return id;
};

global['cancelAnimationFrame'] = function(id) {
    clearTimeout(id);
};

// The Express app is exported so that it can be used by serverless Functions.
export function app() {
    const server = express();
    server.disable('x-powered-by');
    server.disable('etag');

    const distFolder = join(__dirname, '../browser');

    // Our Universal express-engine (found @ https://github.com/angular/universal/tree/master/modules/express-engine)
    server.engine('html', ngExpressEngine({
        bootstrap: AppServerModule,
    }));

    server.disable('view cache');
    server.set('etag', false);
    server.use((req, res, next) => {
    //     res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Cache-Control', 'public, max-age=3600'); // one hour
        next();
    });

    server.set('view engine', 'html');
    server.set('views', distFolder);

    server.get('/download/file/:url(*)', async (req, res) => {
        const file = req.params.url.replace(/\.\.+/g, '.');
        // const releasesPath = process.env['RELEASES'] || __dirname + '/../../../../releases';
        // const path = join(releasesPath, file);

        visitor.event("Downloads", "file", file).send();
        // if (existsSync(path)) {
        //     //increase download count
        //     visitor.event("Downloads", "file", file).send();
        //
        //     return res.sendFile(path);
        // }

        res.redirect('https://f000.backblazeb2.com/file/deepkit-releases/releases/' + file);
    });


    const contentfulClient = contentful.createClient({
        // This is the space ID. A space is like a project folder in Contentful terms
        space: "69rl08wqd79m",
        // This is the access token for this space. Normally you get both ID and the token in the Contentful web app
        accessToken: process.env['CONTENTFUL_ACCESS_TOKEN']
    });

    let docuPages: any;
    let releasesCached: any;

    setInterval(() => {
        docuPages = undefined;
        releasesCached = undefined;
    }, 10000);

    async function getReleases() {
        if (releasesCached) {
            return releasesCached;
        }

        const releases = await contentfulClient.getEntries({
            content_type: 'release',
        });

        return releasesCached = {
            releases: releases.items.map(v => {
                return v.fields;
            }),
        };
    }

    server.get('/releases', async (req, res) => {
        return res.json(await getReleases());
    });

    async function getDocuPages() {
        if (docuPages) return docuPages;

        try {
            const sections = await contentfulClient.getEntries({
                content_type: 'docu-section',
                select: 'fields.title,fields.order,fields.url',
                // select: 'title, url, order, section, markdown',
            });

            const pages = await contentfulClient.getEntries({
                content_type: 'page',
                select: 'fields.title,fields.url,fields.section,fields.order,fields.markdown',
            });

            return docuPages = {
                sections: sections.items.map(v => {
                    return v.fields;
                }),
                pages: pages.items.map(v => {
                    return {
                        ...v.fields,
                        section: v.fields.section ? v.fields.section.fields.url : '',
                    };
                })
            };
        } catch (error) {
            console.error('failed contentful', error);
        }
    }

    server.get('/docu-pages', async (req, res) => {
        return res.json(await getDocuPages());
    });

    // Example Express Rest API endpoints
    // app.get('/api/**', (req, res) => { });
    // Serve static files from /browser
    server.get('*.*', express.static(distFolder, {
        maxAge: '8h'
    }));

    // All regular routes use the Universal engine
    server.get('*', (req, res) => {
        res.render('index', {
            req, providers: [
                {provide: RESPONSE, useValue: res},
                {provide: APP_BASE_HREF, useValue: req.baseUrl},
            ]
        }, (error, html) => {
            if (error) {
                console.log(`Error generating html for req ${req.url}`, error);
                return res.status(500).send(error.message);
            }
            res.send(html);
        });
    });

    return server;
}

function run() {
    const port = parseInt(process.env.PORT, 10) || 4000;

    // Start up the Node server
    const server = app();
    server.listen(port, '0.0.0.0', () => {
        console.log(`Node Express server listening on http://0.0.0.0:${port}`);
    });
}

// Webpack will replace 'require' with '__webpack_require__'
// '__non_webpack_require__' is a proxy to Node 'require'
// The below code is to ensure that the server is run only when not requiring the bundle.
declare const __non_webpack_require__: NodeRequire;
const mainModule = __non_webpack_require__.main;
if (mainModule && mainModule.filename === __filename) {
    run();
}

export * from './src/main.server';
