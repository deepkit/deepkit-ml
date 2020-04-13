const os = require('os');
const path = require('path');
const Visualizer = require('webpack-visualizer-plugin');

const binaryAffix = os.platform() + '-' + os.arch();

module.exports = {
    target: 'node',
    devtool: 'inline-source-map',
    entry: path.resolve(__dirname, 'src/main.ts'),
    output: {
        filename: 'main.js',
        path: path.resolve(__dirname, 'dist/')
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        symlinks: false
    },
    optimization: {
        usedExports: true
    },
    plugins: [new Visualizer({
        filename: './statistics.html'
    })],
    node: {
        __dirname: false,
        __filename: false,
    },
    externals: {
        'electron': 'require("electron")',
        'net': 'require("net")',
        'remote': 'require("remote")',
        'shell': 'require("shell")',
        'app': 'require("app")',
        'ipc': 'require("ipc")',
        'fs': 'require("fs")',
        'buffer': 'require("buffer")',
        'cli.js': 'require(__dirname + "/deepkit-cli/main.js")',
        'server.js': 'require(__dirname + "/deepkit-server/main.js")',
        'system': '{}',
        'file': '{}',
        'electron-config': 'require("electron-config")',
        'electron-reload': 'require("electron-reload")',
    },
    module: {
        rules: [
            {
                // We are piping through babel to get Webpack 4 Tree Shaking support with { 'sideEffects' : false }
                loader: 'babel-loader'
            },
            {
                test: /\.tsx?$/,
                loader: 'ts-loader',
                options: {
                    allowTsInNodeModules: true,
                    transpileOnly: true,
                    // Since we are piping trough babel we have to target es2016
                    compilerOptions: {
                        target: "es2016",
                        module: "es2015"
                    },
                },
                include: [
                    path.resolve(__dirname, 'src'),
                    path.resolve(__dirname, 'node_modules/@deepkit/core/'),
                ],
            }
        ]
    }
};
