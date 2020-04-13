import 'jest-extended';
import {simplePatch} from "../src/data";

test('test simplePatch', () => {
    expect(simplePatch({a: true}, {a: false})).toEqual(
        {a: false}
    );

    expect(simplePatch({a: true}, {a: true})).toEqual(null);

    expect(simplePatch({a: true}, {})).toEqual(
        {a: null}
    );

    expect(simplePatch({}, {b: 'hi'})).toEqual(
        {b: 'hi'}
    );

    expect(simplePatch({a: true}, {a: null})).toEqual(
        {a: null}
    );

    expect(simplePatch({a: true}, {b: 2})).toEqual({
        a: null,
        b: 2
    });

    expect(simplePatch({a: {i: 4}}, {a: {i: 4}})).toEqual(null);

    expect(simplePatch({a: {i: 4}}, {a: {i: 5}})).toEqual(
        {a: {i: 5}}
    );
});
