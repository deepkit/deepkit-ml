const path = require('path');
const fs = require('fs');
const webpack = require('webpack');
const nodeExternals = require('webpack-node-externals');
const {DuplicatesPlugin} = require("inspectpack/plugin");
const TerserPlugin = require('terser-webpack-plugin');
const Visualizer = require('webpack-visualizer-plugin');
const ReplaceInFileWebpackPlugin = require('replace-in-file-webpack-plugin');


// plugins.push(new webpack.SourceMapDevToolPlugin({
//     filename: null,
//     exclude: [/node_modules\/(?!@deepkit)/],
//     test: /\.(ts|js|css)($|\?)/i
// }));

module.exports = {
    entry: {
        main: path.resolve(__dirname, 'src/index.ts'),
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist/')
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        symlinks: false,
    },
    plugins: [
        // new Visualizer({
        //     filename: './statistics.html'
        // }),
        new ReplaceInFileWebpackPlugin([{
            dir: 'node_modules/@oclif/command/lib',
            files: ['index.js'],
            rules: [{
                search: 'checkNodeVersion();',
                replace: '//checkNodeVersion();'
            }]
        }],
        ),
// new ReplacePlugin({
//     include: [
//         /node_modules\/@oclif/
//     ],
//     values: {
//         'checkNodeVersion();': '//checkNodeVersion();',
//     }
// }),
// new DuplicatesPlugin({
//     // Emit compilation warning or error? (Default: `false`)
//     emitErrors: false,
//     // Display full duplicates information? (Default: `false`)
//     verbose: false
// }),
    ],
    target: 'node',
    // mode: 'development',
    mode: 'production',
    devtool: 'cheap-module-source-map',
    // devtool: 'inline-cheap-source-map',
    optimization:
        {
            // since new marshal we can mangle: true, meas minimize: true
            // minimize: false,
            minimizer: [
                new TerserPlugin({
                    cache: true,
                    parallel: true,
                    sourceMap: true, // Must be set to true if using source-maps in production
                    // terserOptions: { //https://github.com/webpack-contrib/terser-webpack-plugin#terseroption
                    //     mangle: false,
                    // }
                }),
            ],
            // removeEmptyChunks:
            //     false,
            // usedExports: true,
        }
    ,
    node: {
        __dirname: false,
        __filename: false,
    },
    externals: [
        {
            //some dependency requires that, we force to not bundle it.
            'typescript': 'undefined',

            // fix 'Cannot find module 'strip-ansi''
            // this is fucking important!
            'cli-ux': 'commonjs cli-ux',

            // 'utf-8-validate': 'commonjs utf-8-validate',
            // 'bufferutil': 'commonjs bufferutil',
            // 'systeminformation': 'commonjs systeminformation',

            // //because of oclif's plugin stuff necessary
            '@oclif/command': 'commonjs @oclif/command',
            // '@oclif/config': 'commonjs @oclif/config',
            // '@oclif/errors': 'commonjs @oclif/errors',
            // '@oclif/linewrap': 'commonjs @oclif/linewrap',
            // '@oclif/parser': 'commonjs @oclif/parser',
            // '@oclif/plugin-help': 'commonjs @oclif/plugin-help',
            // '@oclif/screen': 'commonjs @oclif/screen',
            // '@oclif/test': 'commonjs @oclif/test',
            // '@oclif/tslint': 'commonjs @oclif/tslint',
        }
    ],
    // externals: [
    //     nodeExternals({
    //         whitelist: [
    //             '@deepkit/core',
    //             '@deepkit/core-node',
    //             '@marcj/glut-core',
    //             '@marcj/glut-client',
    //             '@marcj/marshal',
    //             '@marcj/estdlib',
    //             '@marcj/estdlib-rxjs',
    //         ]
    //     })
    // ],
    module:
        {
            rules: [
                {
                    test: /\.ts$/,
                    loader: 'awesome-typescript-loader',
                    options: {
                        allowTsInNodeModules: true,
                        // configFileName: 'tsconfig.run.json'
                    },
                    // include: [
                    //     path.resolve(__dirname),
                    //     path.resolve(__dirname + '/node_modules/@deepkit')
                    // ],
                },
                // {
                //     test: /\.node$/,
                //     loader: 'native-ext-loader',
                //     options: {
                //         basePath: ['modules']
                //     }
                // }
            ]
        }
}
;
