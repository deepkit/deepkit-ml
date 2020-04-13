// this needs to be set outside of mocha cli. it's too late when this is loaded.
// process.env.NODE_PRESERVE_SYMLINKS = '1';

process.env.TS_NODE_IGNORE = 'false';

require('ts-node/register');
//     .register({
//     ignore: false,
// });
