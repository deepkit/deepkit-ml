const path = require('path');
const webpack = require('webpack');
const nodeExternals = require('webpack-node-externals');

// plugins.push(new webpack.SourceMapDevToolPlugin({
//     filename: null,
//     exclude: [/node_modules\/(?!@deepkit)/],
//     test: /\.(ts|js|css)($|\?)/i
// }));

module.exports = {
    entry: {
        'speed-server': path.resolve(__dirname, 'src/control-commands/speed-server.ts'),
        'speed-client': path.resolve(__dirname, 'src/control-commands/speed-client.ts'),
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist/control-commands/')
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        symlinks: false,
    },
    target: 'node',
    // mode: 'development',
    mode: 'production',
    devtool: 'cheap-module-source-map',
    optimization: {
        // minimize: false,
        usedExports: true
    },
    externals: [
        nodeExternals({
            whitelist: [
                '@deepkit/core',
                '@deepkit/core-node',
                '@marcj/glut-core',
                '@marcj/glut-client',
                '@marcj/marshal',
            ]
        })
    ],
    node: {
        __dirname: false,
        __filename: false,
    },
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
