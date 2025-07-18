import * as vscode from 'vscode';
import { StorageService } from './services/StorageService';
import { MonitorService } from './services/MonitorService';
import { LogService } from './services/LogService';
import { ListView } from './views/ListView';
import { LogViewProvider } from './views/LogViewProvider';
import { ExportItemsCommand } from './commands/exportItems';
import { ImportItemsCommand } from './commands/importItems';
import { AddEditView } from './views/AddEditView';
import { SaveLogCommand } from './commands/saveLog';
import { ImportCurlCommand } from './commands/importCurl';
import type { TreeViewItem } from './models/UrlItem';

let monitorService: MonitorService;
let logService: LogService;

export async function activate(context: vscode.ExtensionContext) {
    // Initialize services
    const storageService = new StorageService(context.globalState);
    logService = new LogService(context);
    monitorService = new MonitorService(storageService, logService);
    const addEditView = new AddEditView(context, logService, monitorService);
    const logViewProvider = new LogViewProvider(logService);
    const exportItemsCommand = new ExportItemsCommand(storageService);
    const importItemsCommand = new ImportItemsCommand(storageService, monitorService);
    const importCurlCommand = new ImportCurlCommand(storageService, monitorService);
    const saveLogCommand = new SaveLogCommand(logService, storageService);
    const listView = new ListView(context, storageService, addEditView, monitorService, logViewProvider);

    // Register webview panel serializer
    context.subscriptions.push(
        vscode.window.registerWebviewPanelSerializer('urlMonitor.addEdit', {
            async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, _state: any) {
                // The 'state' can be used if you save the webview state.
                // Here, we are just restoring the view.
                addEditView.restoreWebview(webviewPanel);
            }
        })
    );

    // Register log view provider
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(LogViewProvider.scheme, logViewProvider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('urlMonitor.exportItems', () => exportItemsCommand.execute())
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('urlMonitor.importItems', () => importItemsCommand.execute())
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('urlMonitor.importCurl', async () => {
            const success = await importCurlCommand.execute();
            if (success) {
                listView.refresh();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('urlMonitor.saveAllLogs', () => saveLogCommand.execute())
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('urlMonitor.saveFolderLogs', (item: TreeViewItem) =>
            saveLogCommand.execute(item)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('urlMonitor.saveItemLog', (item: TreeViewItem) => saveLogCommand.execute(item))
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('urlMonitor.clearAllLogs', () => logService.clearAllLogs())
    );

    // Register status change listener before starting monitoring.
    monitorService.onStatusChange((errorCount: number) => {
        listView.updateBadge(errorCount);
        // Refresh the list to reflect status changes in item icons.
        // This is important if a status changes due to background monitoring.
        listView.refresh();
    });

    // Initialize the error counter with 0 on activation.
    listView.updateBadge(0);

    // Start monitoring and then refresh list, showing progress
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'URL Monitor',
        cancellable: false
    }, async (progress) => {
        progress.report({ increment: 0, message: 'Checking initial URL statuses...' });
        try {
            await monitorService.startMonitoring(); // Wait for the first check cycle
            progress.report({ increment: 90, message: 'Loading URL list...' });
            // The list is updated by onStatusChange, but a refresh here ensures it.
            listView.refresh();
            progress.report({ increment: 100, message: 'URL Monitor is ready.' });
        } catch (error) {
            progress.report({ increment: 100, message: 'Initialization failed.' });
            vscode.window.showErrorMessage(`URL Monitor initialization failed: ${error instanceof Error ? error.message : String(error)}`);
            console.error('URL Monitor initialization error:', error);
        }
        // Small delay for the progress notification to disappear.
        await new Promise(resolve => setTimeout(resolve, 2000));
    });

}

export function deactivate() {
    if (monitorService) {
        monitorService.stopMonitoring();
    }
}
