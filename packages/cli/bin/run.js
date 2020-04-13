require('ts-node').register({project: __dirname + '/../tsconfig.json', ignore: [__dirname + '/../node_modules/@deepkit/'], files: true});

require(__dirname + '/../src/index.ts');

// require(`../${dev ? 'src' : 'lib'}`).run()
//     .catch(require('@oclif/errors/handle'));
