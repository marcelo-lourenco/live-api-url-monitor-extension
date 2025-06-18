import * as vscode from 'vscode';
import { StorageService } from './services/StorageService';
import { MonitorService } from './services/MonitorService';
import { ListView } from './views/ListView';
import { AddEditView } from './views/AddEditView';

export function activate(context: vscode.ExtensionContext) {
    // Initialize services
    const storageService = new StorageService(context.globalState);
    const monitorService = new MonitorService(storageService);
    const addEditView = new AddEditView(context);
    const listView = new ListView(context, storageService, addEditView);

    // Register webview panel serializer
    context.subscriptions.push(
        vscode.window.registerWebviewPanelSerializer('urlMonitor.addEdit', {
            async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel) {
                addEditView.restoreWebview(webviewPanel);
            }
        })
    );

    // Start monitoring
    monitorService.startMonitoring();
    listView.refresh();

    // Setup status change notification
    monitorService.onStatusChange((hasErrors: boolean) => {
        vscode.commands.executeCommand('setContext', 'urlMonitor.hasErrors', hasErrors);
    });
}

export function deactivate() {}