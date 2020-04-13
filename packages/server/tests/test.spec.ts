import 'jest';
import 'reflect-metadata';


test('camelcase', () => {

    function underscoreToCamelCase(name: string): string {
        return name.replace(/_([a-z])/g, c => c[1].toUpperCase());
    }

    function camelCaseToUnderscore(name: string): string {
        return name.replace(/([A-Z])/g, '_$1').toLowerCase();
    }

    function isObject(obj: any): obj is { [name: string]: any } {
        if (obj === null) return false;
        return ((typeof obj === 'function') || (typeof obj === 'object' && !Array.isArray(obj)));
    }

    function convertNames(item: any, nameStrategy: (v: string) => string): any {
        if (Array.isArray(item)) return item.map((v: any) => convertNames(v, nameStrategy));

        if (!isObject(item)) return item;

        const res: { [name: string]: any } = {};
        for (const i in item) {
            if (!item.hasOwnProperty(i)) continue;
            res[nameStrategy(i)] = convertNames(item[i], nameStrategy);
        }
        return res;
    }

    const plain = {
        id: 123,
        first_name: 'Peter',
        sub: {
            my_other_name: 'Guschdl'
        },
        items: [
            'string', 'another'
        ],
        childs: [
            {its_name: 'a'},
            {its_name: 'b'}
        ]
    };

    console.log(convertNames(plain, underscoreToCamelCase));
    console.log(convertNames(convertNames(plain, underscoreToCamelCase), camelCaseToUnderscore));
//
// plainToClass(MyClass, convertNames(plain, underscoreToCamelCase));
//
// const item = new MyClass;
//
// convertNames(classToPlain(MyClass, item), camelCaseToUnderscore);
});
