import 'jest-extended';
import {catchSilentSigint} from "../src/process";
import {sleep} from '@marcj/estdlib';

test('test catchSigint', async () => {

    let status = 'start';
    setTimeout(() => {
        expect(status).toBe('done');
    }, 300);

    await sleep(0.1);
    await catchSilentSigint(async () => {
        await sleep(0.1);
    }, async () => {});

    status = 'done';
});

test('test catchSigint throw', async () => {

    let status = 'start';
    setTimeout(() => {
        expect(status).toBe('done');
    }, 300);

    await sleep(0.1);

    let errorCatched = false;
    try {
        await catchSilentSigint(async () => {
            await sleep(0.1);
            throw new Error('test');
        }, async () => {});
    } catch (error) {
        if (error.message === 'test') {
            errorCatched = true;
        }
    }

    expect(errorCatched).toBe(true);

    status = 'done';
});
