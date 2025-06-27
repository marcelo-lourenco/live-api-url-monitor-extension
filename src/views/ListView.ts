import * as vscode from 'vscode';
import { StorageService } from '../services/StorageService';
import { AddEditView } from './AddEditView';
import { UrlItem, FolderItem, TreeViewItem, isUrlItem } from '../models/UrlItem';
import { UrlTreeDataProvider } from './UrlTreeDataProvider';
import { MonitorService } from '../services/MonitorService';

export class ListView {
    private treeView: vscode.TreeView<TreeViewItem>;
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
            dragAndDropController: this.treeDataProvider,
            showCollapseAll: true,
            canSelectMany: true
        });

        this.registerCommands();
    }

    private registerCommands() {
        this.context.subscriptions.push(
            // Item/Folder agnostic commands
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

            // Item specific commands
            vscode.commands.registerCommand('urlMonitor.expandAll', () => this.expandAll()),
            vscode.commands.registerCommand('urlMonitor.addItem', (context?: FolderItem) => this.addItem(context)),
            vscode.commands.registerCommand('urlMonitor.refreshItem', (item: UrlItem) => this.refreshItem(item)),
            vscode.commands.registerCommand('urlMonitor.duplicateItem', (item: UrlItem) => this.duplicate(item)),
            vscode.commands.registerCommand('urlMonitor.editItem', (item: UrlItem) => this.editItem(item)),
            vscode.commands.registerCommand('urlMonitor.deleteItem', (item: UrlItem) => this.deleteItem(item)),
            vscode.commands.registerCommand('urlMonitor.copyAsCurl', (item: UrlItem) => this.copyAsCurl(item)),

            // Folder specific commands
            vscode.commands.registerCommand('urlMonitor.addFolder', (context?: FolderItem) => this.addFolder(context)),
            vscode.commands.registerCommand('urlMonitor.duplicateFolder', (folder: FolderItem) => this.duplicate(folder)),
            vscode.commands.registerCommand('urlMonitor.refreshFolder', (item: FolderItem) => this.refreshFolder(item)),
            vscode.commands.registerCommand('urlMonitor.renameFolder', (item: FolderItem) => this.renameFolder(item)),
            vscode.commands.registerCommand('urlMonitor.deleteFolder', (item: FolderItem) => this.deleteFolder(item))
        );
    }

    public async addItem(context?: FolderItem) {
        try {
            const parentId = context ? context.id : null;
            const newItemData = await this.addEditView.showAddForm(parentId);
            if (newItemData) {
                const addedItem = await this.storageService.addItem(newItemData);
                await this.monitorService.checkItemImmediately(addedItem as UrlItem);
                await this.monitorService.startMonitoring();
                this.refresh();
                vscode.window.showInformationMessage(`"${addedItem.name}" added. Initial status checked.`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add item: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public async editItem(item: UrlItem) {
        try {
            const updatedItemData = await this.addEditView.showEditForm(item as UrlItem);
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

    public async deleteItem(item: UrlItem): Promise<void> {
        await this.confirmAndDelete(item);
    }

    public async deleteFolder(item: FolderItem): Promise<void> {
        await this.confirmAndDelete(item);
    }

    private async confirmAndDelete(item: TreeViewItem): Promise<void> {
        const itemType = isUrlItem(item) ? 'item' : 'folder';
        const message = itemType === 'folder'
            ? `Delete folder "${item.name}" and all its contents? This action cannot be undone.`
            : `Delete "${item.name}"? This will remove it from monitoring.`;

        const confirm = await vscode.window.showWarningMessage(
            message,
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

    private async duplicate(item: TreeViewItem): Promise<void> {
        try {
            await this.storageService.duplicateItemOrFolder(item.id);
            vscode.window.showInformationMessage(`Successfully duplicated "${item.name}".`);
            this.refresh();
            await this.monitorService.startMonitoring(); // Ensure new items are monitored
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to duplicate: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public async expandAll(): Promise<void> {
        const allItems = await this.storageService.getItems();
        const folderItems = allItems.filter(item => !isUrlItem(item));
        if (folderItems.length > 0) {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Window,
                title: 'Expanding all folders...',
            }, async () => {
                for (const folder of folderItems) {
                    // The reveal method will expand the tree to show the element.
                    await this.treeView.reveal(folder, { expand: true, focus: false, select: false });
                }
            });
        }
    }

    public async refreshItem(item: UrlItem): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window, // Subtle progress
            title: `Refreshing "${item.name}"...`,
        }, async () => {
            await this.monitorService.checkItemImmediately(item);
        });
        // The view will auto-refresh due to onStatusChange event
    }

    public async refreshFolder(folder: FolderItem): Promise<void> {
        const descendantItems = await this.storageService.getDescendantUrlItems(folder.id);

        if (descendantItems.length === 0) {
            vscode.window.showInformationMessage(`Folder "${folder.name}" contains no items to refresh.`);
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Refreshing folder "${folder.name}" (${descendantItems.length} items)...`,
            cancellable: false
        }, async () => {
            await this.monitorService.forceCheckItems(descendantItems);
        });
    }

    public async addFolder(context?: FolderItem) {
        const folderName = await vscode.window.showInputBox({
            prompt: 'Enter the name for the new folder',
            placeHolder: 'My API Tests',
            validateInput: value => {
                return value.trim().length > 0 ? null : 'Folder name cannot be empty.';
            }
        });

        if (folderName) {
            try {
                const parentId = context ? context.id : null;
                const newFolder: Omit<FolderItem, 'id'> = {
                    type: 'folder',
                    name: folderName.trim(),
                    parentId: parentId,
                    sortOrder: 0 // Placeholder, StorageService will assign the correct value
                };
                await this.storageService.addItem(newFolder);
                this.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create folder: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    public async renameFolder(item: FolderItem) {
        const newName = await vscode.window.showInputBox({
            prompt: 'Enter the new name for the folder',
            value: item.name
        });

        if (newName && newName.trim() !== item.name) {
            const updatedFolder: FolderItem = { ...item, name: newName.trim() };
            await this.storageService.updateItem(updatedFolder);
            this.refresh();
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
