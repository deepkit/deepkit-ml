import 'reflect-metadata';
import { enableProdMode } from '@angular/core';

enableProdMode();

export { AppServerModule } from './app/app.server.module';
export { renderModule, renderModuleFactory } from '@angular/platform-server';
