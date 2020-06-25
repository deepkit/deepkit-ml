import {debug} from 'debug';

export class Logging {
    static globalLogger = new Logging();

    protected logDebug = debug('deepkit');

    static logger(): Logging {
        return Logging.globalLogger;
    }

    debug(format: string, ...args: any[]) {
        this.logDebug(format, ...args);
    }

    log(...args: any[]) {
        console.log(...args);
    }
}

export const logger = Logging.globalLogger;
