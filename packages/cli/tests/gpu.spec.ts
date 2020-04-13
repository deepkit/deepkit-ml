import 'jest';
import 'jest-extended';
import {GPUReader} from "../src/gpu";

test('test basic', async () => {
    const gpu = new GPUReader();
    // await gpu.readXmlFromFile(__dirname + '/nvidia-smi.k80.txt');
    await gpu.readXmlFromFile(__dirname + '/nvidia-smi.t4-2x.txt');

    console.log('all', await gpu.getNvidiaSmiData());
    console.log('gpu data', await gpu.getFullGpus());
    console.log('gpu data', await gpu.getGpus());
});
