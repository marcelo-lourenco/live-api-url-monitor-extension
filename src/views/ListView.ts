import * as vscode from 'vscode';
import { StorageService } from '../services/StorageService';
import { AddEditView } from './AddEditView';
import { UrlItem } from '../models/UrlItem';
import { UrlTreeDataProvider } from './UrlTreeDataProvider';
import { MonitorService } from '../services/MonitorService';

export class ListView {
    private treeView: vscode.TreeView<UrlItem>;
    private treeDataProvider: UrlTreeDataProvider;

    constructor(
        private context: vscode.ExtensionContext,
        private storageService: StorageService,
        private addEditView: AddEditView,
        private monitorService: MonitorService,
    ) {
        this.treeDataProvider = new UrlTreeDataProvider(storageService);
        this.treeView = vscode.window.createTreeView('urlMonitor.list', {
            treeDataProvider: this.treeDataProvider,
            showCollapseAll: true
        });

        this.registerCommands();
    }

    private registerCommands() {
        this.context.subscriptions.push(
            // Comandos iniciados a partir da UI da lista (barra de título, menu de contexto)
            vscode.commands.registerCommand('urlMonitor.addItem', () => this.addItem()),
            vscode.commands.registerCommand('urlMonitor.editItem', (itemOrId: UrlItem | string) => {
                const itemId = typeof itemOrId === 'string' ? itemOrId : itemOrId.id;
                this.editItem(itemId);
            }),
            vscode.commands.registerCommand('urlMonitor.deleteItem', (item: UrlItem) => this.deleteItem(item)),
            vscode.commands.registerCommand('urlMonitor.refreshList', async () => {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Refreshing URL statuses...',
                    cancellable: false
                }, async (progress) => {
                    progress.report({ increment: 0, message: 'Fetching all URLs...' });
                    await this.monitorService.forceCheckAllItems();
                    this.refresh();
                    progress.report({ increment: 100, message: 'Done.' });
                    await new Promise(resolve => setTimeout(resolve, 1500));
                });
            }),
            vscode.commands.registerCommand('urlMonitor.copyAsCurl', (item: UrlItem) => this.copyAsCurl(item))
            // NOTA: O comando 'urlMonitor.importCurl' é registrado em extension.ts para manter a lógica de comando
            // separada da lógica da view, evitando acoplamento excessivo.
        );
    }

    public async addItem() {
        try {
            const newItemData = await this.addEditView.showAddForm();
            if (newItemData) {
                const addedItem = await this.storageService.addItem(newItemData);
                await this.monitorService.checkItemImmediately(addedItem);
                await this.monitorService.startMonitoring();
                this.refresh();
                vscode.window.showInformationMessage(`"${addedItem.name}" added. Initial status checked.`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add item: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public async editItem(itemId: string) {
        try {
            const items = await this.storageService.getItems();
            const item = items.find(i => i.id === itemId);
            if (!item) {
                vscode.window.showErrorMessage('Item not found for editing.');
                return;
            }

            const updatedItemData = await this.addEditView.showEditForm(item);
            if (updatedItemData) {
                await this.storageService.updateItem(updatedItemData);
                await this.monitorService.checkItemImmediately(updatedItemData);
                await this.monitorService.startMonitoring();
                this.refresh();
                vscode.window.showInformationMessage(`"${updatedItemData.name}" updated. Status re-checked.`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to update item: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public async deleteItem(item: UrlItem) {
        const confirm = await vscode.window.showInformationMessage(
            `Delete "${item.name}"? This will remove it from monitoring.`,
            { modal: true },
            'Delete'
        );

        if (confirm === 'Delete') {
            try {
                await this.storageService.deleteItem(item.id);
                await this.monitorService.startMonitoring();
                this.refresh();
                vscode.window.showInformationMessage(`"${item.name}" deleted successfully.`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to delete item: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    public async copyAsCurl(item: UrlItem) {
        try {
            let curlCommand = `curl -X ${item.method} `;
            let url = item.url;

            // Add query parameters
            if (item.queryParams && item.queryParams.length > 0) {
                const query = item.queryParams
                    .filter(p => p.key)
                    .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
                    .join('&');
                if (query) {
                    url += `${url.includes('?') ? '&' : '?'}${query}`;
                }
            }

            // Quote the URL
            curlCommand += `'${url}'`;

            // Add headers
            if (item.headers) {
                for (const key in item.headers) {
                    if (Object.prototype.hasOwnProperty.call(item.headers, key)) {
                        // Escape single quotes in header values
                        const headerValue = String(item.headers[key]).replace(/'/g, "'\\''");
                        curlCommand += ` -H '${key}: ${headerValue}'`;
                    }
                }
            }

            // Add authentication
            if (item.auth) {
                switch (item.auth.type) {
                    case 'basic':
                        if (item.auth.username) {
                            const credentials = `${item.auth.username}:${item.auth.password || ''}`;
                            curlCommand += ` -u '${credentials}'`;
                        }
                        break;
                    case 'bearer':
                        if (item.auth.token) {
                            curlCommand += ` -H 'Authorization: Bearer ${item.auth.token}'`;
                        }
                        break;
                    case 'apikey':
                        if (item.auth.key && item.auth.value) {
                            if (item.auth.addTo === 'header') {
                                curlCommand += ` -H '${item.auth.key}: ${item.auth.value}'`;
                            } else { // query - already handled by URL construction
                                // If API key is added to query, it's already part of the `url` variable.
                                // No need to add it again here.
                            }
                        }
                        break;
                    // Add other auth types if needed
                }
            }

            // Add body
            if (item.body && item.body.type === 'raw' && item.body.content) {
                // Use $'...' for ANSI C quoting to handle special characters and newlines
                const bodyContent = item.body.content.replace(/'/g, "'\\''"); // Escape single quotes
                curlCommand += ` --data-raw $'${bodyContent}'`;
            }

            await vscode.env.clipboard.writeText(curlCommand);
            vscode.window.showInformationMessage(`cURL command copied to clipboard: "${item.name}"`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to copy cURL command: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public refresh() {
        this.treeDataProvider.refresh();
    }

    public updateBadge(errorCount: number) {
        this.treeView.badge = errorCount > 0
            ? { value: errorCount, tooltip: `${errorCount} URL(s) with errors` }
            : undefined;
    }
}
