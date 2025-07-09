import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { StorageService } from '../services/StorageService';
import { MonitorService } from '../services/MonitorService';
import { isUrlItem, type TreeViewItem } from '../models/UrlItem';

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

            // First pass: Generate new IDs and create a map of old to new IDs
            const idMap = new Map<string, string>();
            const newItems: TreeViewItem[] = [];
            for (const item of importedItems) {
                if (!item || typeof item.name !== 'string' || !item.id) {
                    console.warn('Skipping invalid item during import:', item);
                    continue;
                }
                const newId = uuidv4();
                idMap.set(item.id, newId);

                const newItem: TreeViewItem = { ...item, id: newId };
                newItems.push(newItem);
            }

            // Second pass: Update parentId references to new IDs
            for (const newItem of newItems) {
                if (newItem.parentId) {
                    const newParentId = idMap.get(newItem.parentId);
                    // If the original parent (newItem.parentId) was not found in the map,
                    // it means it's an orphan item (or the parentId is invalid).
                    // In this case, set parentId to null so it appears at the root.
                    newItem.parentId = newParentId ?? null;
                }

                if (isUrlItem(newItem)) {
                    newItem.lastStatus = undefined;
                    newItem.lastChecked = undefined;
                }
            }

            // Add all items at once (requires a change in StorageService)
            await this.storageService.addMultipleItems(newItems);

            await this.monitorService.startMonitoring();
            vscode.window.showInformationMessage(`Successfully imported ${newItems.length} item(s) from ${uri[0].fsPath}`);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to import items: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
