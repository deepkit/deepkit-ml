import 'jest';
import {SpeedClient, SpeedServer} from "../src/speed";
import {performance} from "perf_hooks";
import {sleep} from "@marcj/estdlib";

test('test performance now', async () => {
    {
        const start = performance.now();
        await sleep(1);
        console.log('sleep 1second took', ((performance.now() - start) / 1000));
    }

    {
        const start = performance.now();
        await sleep(1);
        console.log('sleep 1second took', ((performance.now() - start) / 1000));
    }
});

test('test upload', async () => {
    const server = new SpeedServer();
    server.start();

    const client = new SpeedClient();

    const uploadSpeed = await client.testBandwidth();
    console.log('uploadSpeed', uploadSpeed);

    server.close();
});
