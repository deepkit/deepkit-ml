import 'jest-extended';
import {Search} from "../src/search";

function expectIds(s: Search<any>, query: string, ids: any[]) {
    s.parse(query, true);
    const got = s.find().map(i => i.id);
    try {
        expect(got).toEqual(ids);
    } catch (error) {
        console.log('compare', query, '=>', s.compare.toString());
        s.debug = true;
        s.parse(query);
        s.debug = false;
        console.log('debug end');
        throw error;
    }
}

test('test search 1', () => {
    const search = new Search((item, path) => {
        if (!path) {
            return [item.id, item.bla, item.labels];
        }
        return item[path];
    });

    search.items = [
        {id: 1, bla: 1, labels: ['peter']},
        {id: 2, bla: 2, labels: ['mowla', 'gazzo']},
        {id: 3, bla: 3, set: true},
        {id: 4, bla: 4},
    ];

    expectIds(search, '1', [1]);
    expectIds(search, 'peter', [1]);
    expectIds(search, 'mowla', [2]);
    expectIds(search, 'set = true', [3]);
    expectIds(search, 'bla = 2 or bla=3', [2, 3]);

    expectIds(search, '1 2 3', [1, 2, 3]);

    expectIds(search, 'peter mowla', [1, 2]);

    expectIds(search, 'labels ~ zzo', [2]);

    expectIds(search, 'bla = 1 or (set = true && bla = 3)', [1, 3]);
});

test('test search', () => {

    const search = new Search;
    search.items = [
        {id: 1, bla: 1},
        {id: 2, bla: 2},
        {id: 3, bla: 3},
        {id: 4, bla: 4},
    ];

    search.parse('bla = 2 or bla=3');
    {
        const start = performance.now();
        function getter(a: any, path: string) {
            'use strict';
            return a[path];
        }
        search.items.filter((a: any) => {
            'use strict';
            return getter(a, 'bla') === 2 || getter(a, 'bla') === 3;
        });

        console.log('took', performance.now() - start, 'ms');
    }
    {
        const start = performance.now();
        function getter(a: any, path: string) {
            'use strict';
            return a[path];
        }
        search.items.filter((a: any) => {
            'use strict';
            return getter(a, 'bla') === 2 || getter(a, 'bla') === 3;
        });

        console.log('took', performance.now() - start, 'ms');
    }

    {
        const start = performance.now();
        search.find();
        console.log('took', performance.now() - start, 'ms');
    }

    {
        const start = performance.now();
        search.find();
        console.log('took', performance.now() - start, 'ms');
    }
});
