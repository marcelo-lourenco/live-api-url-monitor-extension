import * as vscode from 'vscode';
import { StorageService } from './services/StorageService';
import { MonitorService } from './services/MonitorService';
import { ListView } from './views/ListView';
import { AddEditView } from './views/AddEditView';

export function activate(context: vscode.ExtensionContext) {
    const storageService = new StorageService(context.globalState);
    const monitorService = new MonitorService(storageService);
    const addEditView = new AddEditView(context);
    const listView = new ListView(context, storageService, addEditView);

    // Configura o handler de mensagens da webview
    context.subscriptions.push(
        vscode.window.registerWebviewPanelSerializer('urlMonitor.addEdit', {
            async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel) {
                // Recria a webview se o VS Code for reiniciado
                addEditView.restoreWebview(webviewPanel);
            }
        })
    );

    monitorService.startMonitoring();
    listView.refresh();
}

export function deactivate() {}