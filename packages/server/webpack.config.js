const path = require('path');
const fs = require('fs');
const webpack = require('webpack');
const WebpackShellPlugin = require('webpack-shell-plugin');
const nodeExternals = require('webpack-node-externals');
const Visualizer = require('webpack-visualizer-plugin');
const TerserPlugin = require('terser-webpack-plugin');

const isProd = -1 !== process.argv.indexOf('--prod');
const ifProd = x => isProd && x;
const removeEmpty = arr => arr.filter(Boolean);

const plugins = [
    new Visualizer({
        filename: './statistics.html'
    })
];

const startServerPlugin = new WebpackShellPlugin({
    onBuildEnd: [
        './run.sh'
    ]
});

if (-1 !== process.argv.indexOf('--start')) {
    plugins.push(startServerPlugin);
}


// plugins.push(new webpack.SourceMapDevToolPlugin({
//     filename: null,
//     exclude: [/node_modules\/(?!@deepkit)/],
//     test: /\.(ts|js|css)($|\?)/i
// }));
const CopyPlugin = require('copy-webpack-plugin');

plugins.push(
    new CopyPlugin([
        {
            from: 'package.json',
            to: 'package.json'
        }
    ])
);


// plugins.push(
//     {
//         from: 'node_modules/fsevents/fsevents.node',
//         to: 'fsevents.node'
//     },
//     {
//         from: 'node_modules/bson-ext/build/Release/bson.node',
//         to: 'build/Release/bson.node'
//     },
//         from: 'node_modules/bson-ext/build/Release/bson.node',
//         to: 'build/Release/bson.node'
//     },
// );

module.exports = {
    entry: {
        main: path.resolve(__dirname, 'src/main.ts'),
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist/')
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js', '.json'],
        symlinks: false,
    },
    optimization: {
        noEmitOnErrors: true,
        usedExports: true,
        minimizer: removeEmpty([
            ifProd(new TerserPlugin({
                parallel: true,
                terserOptions: {
                    sourceMap: true,
                    mangle: true,
                    ecma: 6,
                },
            })),
        ]),
    },
    target: 'node',
    mode: isProd ? 'production' : 'development',
    devtool: isProd ? false : 'cheap-module-source-map',
    node: {
        __dirname: false,
        __filename: false,
    },
    plugins: plugins,
    externals: {
        'package.json': 'require(__dirname + "/package.json")',
        'fsevents': 'commonjs fsevents',
        'nodegit': 'commonjs nodegit',
    },
    // externals: [
    //     nodeExternals({
    //         whitelist: [
    //             '@deepkit/core',
    //             '@deepkit/core-node',
    //         ]
    //     }),
    //     {
    //         winston: 'winston',
    //     }
    // ],
    module: {
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
            }
        ]
    }
};
