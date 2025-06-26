const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

const extensionConfig = {
    mode: 'development',
    target: 'node',
    entry: './src/extension.ts',
    output: {
        filename: 'extension.js',
        path: path.resolve(__dirname, 'dist'),
        libraryTarget: 'commonjs2',
        devtoolModuleFilenameTemplate: '../[resource-path]'
    },
    externals: {
        vscode: 'commonjs vscode'
    },
    resolve: {
        extensions: ['.ts', '.js'],
        alias: {
            '@': path.resolve(__dirname, 'src')
        }
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    devtool: 'source-map'
};

const webviewConfig = {
    mode: 'development',
    target: 'web',
    entry: './src/views/webview/addEditView.ts',
    output: {
        filename: 'webview/addEditView.js',
        path: path.resolve(__dirname, 'dist')
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, 'src', 'views', 'webview'),
                    to: path.resolve(__dirname, 'dist', 'webview'),
                    // Exclude TypeScript files as they are handled by ts-loader
                    globOptions: { ignore: ['**/*.ts'] }
                }
            ]
        })
    ],
    resolve: {
        extensions: ['.ts', '.js'],
        alias: {
            '@': path.resolve(__dirname, 'src')
        }
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            configFile: 'tsconfig.webview.json'
                        }
                    }
                ],
                exclude: /node_modules/
            }
        ]
    },
    devtool: 'source-map'
};

module.exports = [extensionConfig, webviewConfig];