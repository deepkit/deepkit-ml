import 'reflect-metadata';
import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

import {registerLanguage} from 'highlight.js';
import typescript from 'highlight.js/lib/languages/typescript';
registerLanguage('typescript', typescript);

import javascript from 'highlight.js/lib/languages/javascript';
registerLanguage('javascript', javascript);

import python from 'highlight.js/lib/languages/python';
registerLanguage('python', python);

import xml from 'highlight.js/lib/languages/xml';
registerLanguage('xml', xml);

import sql from 'highlight.js/lib/languages/sql';
registerLanguage('sql', sql);

import r from 'highlight.js/lib/languages/r';
registerLanguage('r', r);

import yaml from 'highlight.js/lib/languages/yaml';
registerLanguage('yaml', yaml);

import json from 'highlight.js/lib/languages/json';
registerLanguage('json', json);

import bash from 'highlight.js/lib/languages/bash';
registerLanguage('bash', bash);

import shell from 'highlight.js/lib/languages/shell';
registerLanguage('shell', shell);

// if (environment.production) {
//     enableProdMode();
// }

enableProdMode();

platformBrowserDynamic().bootstrapModule(AppModule, {
  ngZone: 'noop',
})
  .catch(err => console.error(err));
