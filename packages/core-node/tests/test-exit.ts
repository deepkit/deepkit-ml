import {sleep} from "@marcj/estdlib";
import {catchSilentSigint} from "../src/process";

function failed(message?: string) {
    console.error('FAILED', message || '');
    process.exit(1);
}

(async () => {
    {
        console.log('started');
        await sleep(0.1);

        let ended = false;
        await catchSilentSigint(async () => {
            console.log('in catchSigInt');
            setTimeout(() => {
                console.log('send signal');
                process.kill(process.pid, 'SIGINT');
            }, 100);

            await sleep(1);
            ended = true;
        }, async () => {});

        if (!ended) {
            console.log('SUCCESS');
        } else {
            console.log('FAILED');
            process.exit(1);
        }
    }

    {
        console.log('started');
        await sleep(0.1);

        let ended2 = false;
        await catchSilentSigint(async () => {
            console.log('in catchSigInt');

            setTimeout(() => {
                console.log('send signal');
                process.kill(process.pid, 'SIGINT');
            }, 100);

            let waitedForSecondErrorHandler = false;
            let gotSecondError = false;

            try {
                await catchSilentSigint(async () => {
                    await sleep(1);
                    ended2 = true;
                }, async () => {
                    await sleep(0.1);
                    waitedForSecondErrorHandler = true;
                    throw new Error('second');
                });
            } catch (error) {
                if (error.message === 'second') {
                    gotSecondError = true;
                }
            }

            if (!waitedForSecondErrorHandler) {
                failed('waitedForSecondErrorHandler false');
            }

            if (!gotSecondError) {
                failed('gotSecondError false');
            }
        }, async () => {});

        if (ended2) {
            failed('Catch 2 ended completely');
        }

        console.log('SUCCESS');
    }
})();
