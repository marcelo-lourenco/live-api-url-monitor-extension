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

            const idMap = new Map<string, string>();
            const newItems: TreeViewItem[] = [];

            // 1. Primeira passagem: Gerar novos IDs e criar um mapa de IDs antigos para novos.
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

            // 2. Segunda passagem: Atualizar as referências de parentId para os novos IDs.
            for (const newItem of newItems) {
                if (newItem.parentId) {
                    const newParentId = idMap.get(newItem.parentId);
                    // Se o novo ID do pai for encontrado, use-o. Caso contrário, torna-se um item raiz (null).
                    newItem.parentId = newParentId || null;
                }

                if (isUrlItem(newItem)) {
                    newItem.lastStatus = undefined;
                    newItem.lastChecked = undefined;
                }
            }

            // 3. Adicionar todos os itens de uma vez (requer uma alteração no StorageService).
            await this.storageService.addMultipleItems(newItems);

            await this.monitorService.startMonitoring();
            vscode.window.showInformationMessage(`Successfully imported ${newItems.length} item(s) from ${uri[0].fsPath}`);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to import items: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
