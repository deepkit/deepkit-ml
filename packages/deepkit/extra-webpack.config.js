/*
 * Copyright (c) by Marc J. Schmidt <marc@marcjschmidt.de> - all rights reserved.
 */

const path = require('path');
const fs = require('fs');
const Visualizer = require('webpack-visualizer-plugin');

class FixIndex {
    constructor(path) {
        this.path = path;
    }

    done() {
        const path = __dirname + '/dist/' + this.path;
        if (!fs.existsSync(path)) {
            console.log('path not found', path);
            return;
        }
        let file = fs.readFileSync(path, 'utf8');
        file = file.replace(/type="module"/g, '');

        fs.writeFileSync(path, file);
    }

    apply(compiler) {
        compiler.hooks.done.tap(
            'FixIndex',
            () => {
                setTimeout(() => {
                    this.done();
                }, 1);
            }
        );
    }
}

// const UglifyJSPlugin = require('uglifyjs-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');
const ReplaceInFileWebpackPlugin = require('replace-in-file-webpack-plugin');

module.exports = {
    plugins: [
        new Visualizer({
            filename: './statistics.html'
        }),
        // new MonacoWebpackPlugin({
        //     languages: ['python', 'yaml', 'java', 'csp', 'javascript', 'typescript', 'json', 'markdown', 'r', 'rust', 'shell', 'dockerfile', 'cpp', 'xml', 'html']
        // }),
        new FixIndex('deepkit/index.html'),
    ],
    optimization: {
        minimizer: [new TerserPlugin({
            parallel: true,
            cache: true,
            terserOptions: {
                ecma: 7,
                warnings: false,
                parse: {},
                // compress: {
                // this breaks router in production with [routerLinks]="['/bla']"
                //     warnings: false,
                //     pure_getters: true,
                //     unsafe: true,
                //     unsafe_comps: true
                // },
                mangle: false,
                module: false,
                output: null,
                toplevel: false,
                nameCache: null,
                ie8: false,
                keep_classnames: true,
                keep_fnames: true,
                safari10: false
            }
        })]
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                // include: [
                //     path.resolve(__dirname, "node_modules/plotly.js")
                // ],
                loader: 'ify-loader'
            }
        ]
    },
};
