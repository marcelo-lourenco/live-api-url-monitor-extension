const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

// Determine the mode from NODE_ENV, which webpack-cli sets.
const isProduction = process.env.NODE_ENV === 'production';

/** @type {import('webpack').Configuration} */
const baseConfig = {
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? 'hidden-source-map' : 'source-map',
    resolve: {
        extensions: ['.ts', '.js'],
        alias: {
            '@': path.resolve(__dirname, 'src')
        }
    },
    performance: {
        hints: false // Disable performance hints for VS Code extension bundles
    }
};

/** @type {import('webpack').Configuration} */
const extensionConfig = {
    ...baseConfig,
    target: 'node',
    entry: './src/extension.ts',
    output: {
        filename: 'extension.cjs',
        path: path.resolve(__dirname, 'dist'),
        libraryTarget: 'commonjs2',
        devtoolModuleFilenameTemplate: '../[resource-path]'
    },
    externals: {
        vscode: 'commonjs vscode'
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    }
};

/** @type {import('webpack').Configuration} */
const webviewConfig = {
    ...baseConfig,
    target: 'web',
    entry: './src/views/webview/addEditView.ts',
    output: {
        filename: 'webview/addEditView.js',
        path: path.resolve(__dirname, 'dist')
    },
    externals: {}, // Reset externals from base config for web target
    plugins: [
        new CopyPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, 'src', 'views', 'webview'),
                    to: path.resolve(__dirname, 'dist', 'webview'),
                    globOptions: { ignore: ['**/*.ts'] }
                }
            ]
        })
    ],
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            configFile: 'tsconfig.webview.json'
                        }
                    }
                ]
            }
        ]
    }
};

module.exports = [extensionConfig, webviewConfig];