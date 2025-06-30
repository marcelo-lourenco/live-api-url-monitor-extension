import * as vscode from 'vscode';
import { StorageService } from '../services/StorageService';
import { MonitorService } from '../services/MonitorService';
import { TreeViewItem, isUrlItem } from '../models/UrlItem';

export class ImportItemsCommand {
    constructor(
        private storageService: StorageService,
        private monitorService: MonitorService
    ) { }

    public async execute(): Promise<void> {
        try {
            const uri = await vscode.window.showOpenDialog({
                title: 'Import URL Monitor Items',
                filters: {
                    'JSON Files': ['json']
                },
                canSelectMany: false,
                openLabel: 'Import'
            });

            if (!uri || uri.length === 0) {
                vscode.window.showInformationMessage('Import cancelled.');
                return;
            }

            const fileContent = await vscode.workspace.fs.readFile(uri[0]);
            const jsonString = Buffer.from(fileContent).toString('utf8');
            const importedItems: TreeViewItem[] = JSON.parse(jsonString);

            if (!Array.isArray(importedItems)) {
                throw new Error('Invalid JSON format: Expected an array of items.');
            }

            let importedCount = 0;
            for (const item of importedItems) {
                if (!item || typeof item.name !== 'string') {
                    continue; // Skip invalid or malformed entries
                }

                // Create a copy, remove old ID to let StorageService generate a new one.
                const cleanItem: any = { ...item };
                delete cleanItem.id;

                // Handle old format (no type) vs new format, and ensure parentId is set.
                if (cleanItem.type === undefined) {
                    // This is an old format UrlItem
                    cleanItem.type = 'url';
                    cleanItem.parentId = null;
                } else {
                    // This is a new format item, ensure parentId exists and is not undefined.
                    cleanItem.parentId = cleanItem.parentId || null;
                }

                if (isUrlItem(cleanItem)) {
                    cleanItem.lastStatus = undefined;
                    cleanItem.lastChecked = undefined;
                }
                await this.storageService.addItem(cleanItem);
                importedCount++;
            }

            await this.monitorService.startMonitoring(); // Restart monitoring to include new items
            vscode.window.showInformationMessage(`Successfully imported ${importedCount} item(s) from ${uri[0].fsPath}`);
            // The ListView will refresh via the onStatusChange event from MonitorService
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to import items: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}