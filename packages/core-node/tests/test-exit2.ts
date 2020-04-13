import {sleep} from "@marcj/estdlib";
import {catchSilentSigint} from "../src/process";


async function doIt() {
    await catchSilentSigint(async () => {
        console.log('child started');
        await sleep(20);
    }, async () => {
        console.log('child stopping...');
        await sleep(2);
        console.log('child stopped');
    });
}

(async () => {
    {
        await catchSilentSigint(async () => {
            console.log('First. press CTRL+C now ');
            await doIt();
        }, async () => {
            console.log('root: shutting down ...');
            await sleep(2);
            console.log('root: done');
            process.exit(0);
        });
    }
})();
