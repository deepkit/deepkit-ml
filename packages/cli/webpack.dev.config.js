const path = require('path');
const fs = require('fs');
const webpack = require('webpack');
const nodeExternals = require('webpack-node-externals');

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
    target: 'node',
    mode: 'development',
    devtool: 'cheap-module-source-map',
    optimization: {
        minimize: false,
        usedExports: true
    },
    node: {
        __dirname: false,
        __filename: false,
    },
    externals: [
        // nodeExternals({
        //     whitelist: [
        //         '@deepkit/core',
        //         '@deepkit/core-node',
        //         '@marcj/glut-core',
        //         '@marcj/glut-client',
        //         '@marcj/marshal',
        //     ]
        // }),
        // {
        //     winston: 'winston',
        // }
    ],
    module: {
        rules: [{
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
        }]
    }
};
