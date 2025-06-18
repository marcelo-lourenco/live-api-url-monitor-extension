import * as vscode from 'vscode';
import { StorageService } from './services/StorageService';
import { MonitorService } from './services/MonitorService';
import { ListView } from './views/ListView';
import { AddEditView } from './views/AddEditView';

export function activate(context: vscode.ExtensionContext) {
    // Inicializa serviços
    const storageService = new StorageService(context.globalState);
    const monitorService = new MonitorService(storageService);
    const addEditView = new AddEditView(context);
    const listView = new ListView(context, storageService, addEditView);

    // Registra comandos
    context.subscriptions.push(
        vscode.commands.registerCommand('urlMonitor.addItem', () => listView.addItem()),
        vscode.commands.registerCommand('urlMonitor.editItem', (item) => listView.editItem(item)),
        vscode.commands.registerCommand('urlMonitor.refreshList', () => listView.refresh()),
        vscode.commands.registerCommand('urlMonitor.deleteItem', (item) => listView.deleteItem(item))
    );

    // Inicia o monitoramento
    monitorService.startMonitoring();
    listView.refresh();

    // Configura notificação de status
    monitorService.onStatusChange((hasErrors: boolean) => {
        vscode.commands.executeCommand('setContext', 'urlMonitor.hasErrors', hasErrors);
    });
}

export function deactivate() {}