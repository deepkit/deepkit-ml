import 'reflect-metadata';
import 'jest-extended';
import {getPathValue, setPathValue} from '@marcj/estdlib';
import {BinaryParser, getPeerId, TypedArrayWriter} from "../src/core";
import {BehaviorSubject} from "rxjs";

test('test getPathValue', () => {

    expect(getPathValue({
        bla: 3
    }, 'bla')).toBe(3);

    expect(getPathValue({
        bla: 3
    }, 'bla2', null)).toBe(null);

    expect(getPathValue({}, 'bla', 'another')).toBe('another');

});

test('test getPathValue deep', () => {
    expect(getPathValue({
        bla: {
            mowla: 5
        }
    }, 'bla.mowla')).toBe(5);

    expect(getPathValue({
        'bla.mowla': 5
    }, 'bla.mowla')).toBe(5);

    expect(getPathValue({
        bla: {
            mowla: {
                evenDeeper: true
            }
        }
    }, 'bla.mowla.evenDeeper')).toBe(true);

    expect(getPathValue({
        bla: {
            mowla: {
                evenDeeper: true
            }
        }
    }, 'bla.mowla')['evenDeeper']).toBe(true);
});


test('test setPathValue ', () => {
    {
        const obj: any = {};
        setPathValue(obj, 'bla2', 5);
        expect(obj['bla2']).toBe(5);
    }

    {
        const obj: any = {};
        setPathValue(obj, 'bla.mowla', 6);
        expect(obj['bla']['mowla']).toBe(6);
    }
});


test('test getPeerId', () => {
    expect(getPeerId('aab', 'bdd')).toBe('aab-bdd');
    expect(getPeerId('bdd', 'aab')).toBe('aab-bdd');

    expect(getPeerId('bbd', 'bba')).toBe('bba-bbd');
    expect(getPeerId('bba', 'bbd')).toBe('bba-bbd');

    expect(getPeerId('98347fda-3bb9-448d-b944-90d56d77d565', 'server')).toBe('98347fda-3bb9-448d-b944-90d56d77d565-server');
    expect(getPeerId('server', '98347fda-3bb9-448d-b944-90d56d77d565')).toBe('98347fda-3bb9-448d-b944-90d56d77d565-server');
});

test('unsub', () => {

    let tearDownCalled = false;

    const subject = new BehaviorSubject(false);

    subject.subscribe(() => {

    }).add(() => {
        tearDownCalled = true;
    });

    subject.complete();
    expect(tearDownCalled).toBe(true);
});


test('TypedArrayWriter', () => {
    const writer = new TypedArrayWriter;
    writer.add(Uint8Array, Float64Array, Uint8Array);
    // const writer = typedArrayWriter(Uint8Array, Float64Array, Uint8Array);
    expect(writer.getArrayBuffer().byteLength).toBe(Uint8Array.BYTES_PER_ELEMENT + Float64Array.BYTES_PER_ELEMENT + Uint8Array.BYTES_PER_ELEMENT);
    writer.push(2);
    writer.push(1213334.44);
    writer.push(64);

    const view = new DataView(writer.getArrayBuffer());
    expect(view.getUint8(0)).toBe(2);
    expect(view.getFloat64(Uint8Array.BYTES_PER_ELEMENT)).toBe(1213334.44);
    expect(view.getUint8(Uint8Array.BYTES_PER_ELEMENT + Float64Array.BYTES_PER_ELEMENT)).toBe(64);

    writer.reset();
    writer.push(127);
    writer.push(4444.44);
    writer.push(0);

    expect(view.getUint8(0)).toBe(127);
    expect(view.getFloat64(Uint8Array.BYTES_PER_ELEMENT)).toBe(4444.44);
    expect(view.getUint8(Uint8Array.BYTES_PER_ELEMENT + Float64Array.BYTES_PER_ELEMENT)).toBe(0);
});

test('BinaryParser endian', () => {
    //list(struct.pack('<f', 125.005))
    //[143, 2, 250, 66]
    const i = new Uint8Array([143, 2, 250, 66]);
    const f32 = new Float32Array(i.buffer);
    expect(f32[0]).toBeCloseTo(125.005, 3);
    const parser = new BinaryParser();
    parser.set(i);
    expect(parser.eatFloat32()).toBeCloseTo(125.005, 3);
});

function parseMetric(i: Uint8Array) {
    const parser = new BinaryParser();
    parser.set(i);
    const rows: any[] = [];
    while (parser.has()) {
        const version = parser.eatInt8();
        if (version === 1) {
            const dataFields = parser.eatUint16();
            // const array: any[] = new Array(2 + dataFields);
            const array: any[] = [];
            array.push(parser.eatFloat32(), parser.eatFloat32());

            if (dataFields === 1) {
                array.push(parser.eatFloat32());
            } else if (dataFields === 2) {
                array.push(parser.eatFloat32(), parser.eatFloat32());
            } else {
                for (let i = 0; i < dataFields; i++) {
                    array.push(parser.eatFloat32());
                }
            }
            rows.push(array);
        } else {
            throw new Error(`Unsupported metric version ${version} for ${name} at position ${parser.byteOffset}`);
        }
    }
    return rows;
}

function oldJsonParsing(buffer: string) {
    // const end = buffer.lastIndexOf('\n');
    // let stringToParse = buffer.substr(0, end);

    buffer = '[[' + buffer.replace(/\n/g, '], [') + ']]';
        return JSON.parse(buffer);
    // try {
    // } catch (e) {
    //     console.error('Could not parse json csv', e, stringToParse);
    // }
}

test('BinaryParser', () => {
    //3 rows, metric v1, 2 dataFields
    const i = new Uint8Array([
        1, 2, 0, 0, 0, 128, 63, 17, 105, 188, 78, 88, 226, 81, 63, 164, 112, 93, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 64, 64, 17, 105, 188, 78, 209, 34, 95, 63, 255, 128, 0, 0]);

    parseMetric(i);
});

test('BinaryParser benchmark', () => {
    //3 rows, metric v1, 2 dataFields
    const binary = new Uint8Array([
        1, 2, 0, 0, 0, 128, 63, 17, 105, 188, 78, 88, 226, 81, 63, 164, 112, 93, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 0, 64, 17, 105, 188, 78, 234, 231, 93, 63, 195, 245, 104, 63,
        1, 2, 0, 0, 0, 64, 64, 17, 105, 188, 78, 209, 34, 95, 63, 255, 128, 0, 0]);

    const json = [
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
        [11, 1580412398.7140784, 0.9168199896812439, 0.9399999976158142],
    ];

    const jsonLines = json.map(v => {
        const j = JSON.stringify(v);
        return j.substring(1, j.length - 1);
    }).join('\n');

    const count = 100_000;
    {
        const start = performance.now();
        for (let i = 0; i < count; i++) {
            parseMetric(binary);
        }
        console.log('parseMetric took', performance.now() - start, 'for', count, 'iterations');
    }

    {
        const start = performance.now();
        for (let i = 0; i < count; i++) {
            oldJsonParsing(jsonLines);
        }
        console.log('parse json took', performance.now() - start, 'for', count, 'iterations');
    }
    {
        const start = performance.now();
        for (let i = 0; i < count; i++) {
            parseMetric(binary);
        }
        console.log('parseMetric took', performance.now() - start, 'for', count, 'iterations');
    }

});
