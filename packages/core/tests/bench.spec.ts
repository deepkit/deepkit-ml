import {smooth, smoothEMA, smoothGaussian, smoothGaussianOriginal} from "../src/data";


test('test smooth', () => {
    // tslint:disable-next-line:no-bitwise
    const items = [...Array(100000)].map(e => ~~(Math.random() * 40));

    {
        const start = performance.now();
        for (let i = 0; i < 10; i++) {
            smooth(items, 5);
        }
        console.log('smooth took', performance.now() - start);
    }
    {
        const start = performance.now();
        for (let i = 0; i < 10; i++) {
            smoothEMA(items, 5);
        }
        console.log('EMACalc took', performance.now() - start);
    }
});

test('test smoothGaussian', () => {
    // tslint:disable-next-line:no-bitwise
    const items = [...Array(100_000)].map(e => ~~(Math.random() * 40));

    {
        const start = performance.now();
        for (let i = 0; i < 100; i++) {
            smoothGaussianOriginal(items, 3);
        }
        console.log('smooth smoothGaussianOriginal', performance.now() - start);
    }
    {
        const start = performance.now();
        for (let i = 0; i < 100; i++) {
            smoothGaussian(items, 3);
        }
        console.log('smooth loess', performance.now() - start);
    }
});
