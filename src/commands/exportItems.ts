import * as vscode from 'vscode';
import { StorageService } from '../services/StorageService';

export class ExportItemsCommand {
    constructor(private storageService: StorageService) { }

    public async execute(): Promise<void> {
        try {
            const items = await this.storageService.getItems();
            const jsonContent = JSON.stringify(items, null, 2);

            const uri = await vscode.window.showSaveDialog({
                title: 'Export URL Monitor Items',
                filters: {
                    'JSON Files': ['json']
                },
                defaultUri: vscode.Uri.file('url_monitor_items.json')
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(jsonContent));
                vscode.window.showInformationMessage(`Successfully exported ${items.length} item(s) to ${uri.fsPath}`);
            } else {
                vscode.window.showInformationMessage('Export cancelled.');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export items: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}