import {catchSilentSigint} from "./src/process";
import {sleep} from "@marcj/estdlib";

(async () => {

    interface MyLocalStorage {
        value: number;
    }

    async function child(name: string) {
        await catchSilentSigint(async (state) => {
            console.log(`child ${name} start`);
            await sleep(2);
            await state.check();
            console.log(`child ${name} end`);
        }, async () => {
            console.log(`child ${name} aborted`);
            await sleep(1);
            console.log(`child ${name} aborted done`);
        });
    }

    await catchSilentSigint(async (state) => {
        console.log('root start');
        await sleep(1);

        await Promise.all([child('1'), child('2')]);

        // await state.check() && await child('1');
        // await state.check() && await child('2');
        await state.check();

        console.log('root pre end');
        await sleep(1);
        console.log('root end');
    }, async () => {
        console.log('root aborted');
    });

    await catchSilentSigint(async (state) => {
        console.log('root 2 start');
        await sleep(1);
        await Promise.all([child('3'), child('4')]);
        await state.check();
        console.log('root 2 pre end');
        await sleep(1);
        console.log('root 2 end');
    }, async () => {
        console.log('root 2 aborted');
    });


})();
