import * as vscode from 'vscode';
import { UrlItem, FolderItem, TreeViewItem, isUrlItem } from '../models/UrlItem';
import { StorageService } from '../services/StorageService';

export class UrlTreeDataProvider implements vscode.TreeDataProvider<TreeViewItem>, vscode.TreeDragAndDropController<TreeViewItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeViewItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    public dropMimeTypes = ['application/vnd.code.tree.urlmonitorlist'];
    public dragMimeTypes = ['application/vnd.code.tree.urlmonitorlist'];

    constructor(private storageService: StorageService) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeViewItem): vscode.TreeItem {
        if (isUrlItem(element)) {
            const abbrevMap: { [key: string]: string } = {
                'POST': 'POS', 'DELETE': 'DEL', 'PUT': 'PUT', 'OPTIONS': 'OPT',
                'PATCH': 'PAT', 'HEAD': 'HED', 'GET': 'GET'
            };
            const method = element.method ? element.method.toUpperCase() : 'GET';
            const methodText = abbrevMap[method] || method.substring(0, 3);
            const name = element.name || 'No Name';
            const label = `[${methodText}] ${name}`;

            const treeItem = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
            treeItem.id = element.id;
            treeItem.description = element.url;
            treeItem.contextValue = 'urlItem';

            let iconId: string;
            let iconColorId: string;
            if (element.lastStatus === 'up') {
                iconId = 'pass';
                iconColorId = 'testing.iconPassed';
            } else if (element.lastStatus === 'down') {
                iconId = 'error';
                iconColorId = 'testing.iconFailed';
            } else {
                iconId = 'sync-ignored';
                iconColorId = 'disabledForeground';
            }
            treeItem.iconPath = new vscode.ThemeIcon(iconId, new vscode.ThemeColor(iconColorId));

            treeItem.command = {
                command: 'urlMonitor.editItem',
                title: 'Edit URL',
                arguments: [element]
            };

            const lastCheckedTime = element.lastChecked ? new Date(element.lastChecked).toLocaleString() : 'never';
            treeItem.tooltip = new vscode.MarkdownString();
            treeItem.tooltip.appendMarkdown(`**${name}**\n\n`);
            treeItem.tooltip.appendMarkdown(`- **URL**: \`${element.url}\`\n`);
            treeItem.tooltip.appendMarkdown(`- **Method**: ${method}\n`);
            treeItem.tooltip.appendMarkdown(`- **Status**: ${element.lastStatus || 'Unknown'}\n`);
            treeItem.tooltip.appendMarkdown(`- **Last Check**: ${lastCheckedTime}\n`);

            return treeItem;
        } else {
            // It's a FolderItem
            const treeItem = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.Collapsed);
            treeItem.id = element.id;
            treeItem.contextValue = 'folder';
            treeItem.iconPath = new vscode.ThemeIcon('folder');
            return treeItem;
        }
    }

    async getChildren(element?: TreeViewItem): Promise<TreeViewItem[]> {
        const items = await this.storageService.getItems();
        const parentId = element ? element.id : null;
        return items.filter(item => item.parentId === parentId);
    }

    async getParent(element: TreeViewItem): Promise<TreeViewItem | null> {
        if (!element.parentId) {
            return null;
        }
        const items = await this.storageService.getItems();
        return items.find(item => item.id === element.parentId) || null;
    }

    // --- Drag and Drop Controller ---

    public async handleDrag(source: readonly TreeViewItem[], treeDataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        if (token.isCancellationRequested) {
            return;
        }
        treeDataTransfer.set(this.dropMimeTypes[0], new vscode.DataTransferItem(source));
    }

    public async handleDrop(target: TreeViewItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        if (token.isCancellationRequested) {
            return;
        }

        const transferItem = dataTransfer.get(this.dropMimeTypes[0]);
        if (!transferItem) {
            return;
        }

        const draggedItems: TreeViewItem[] = transferItem.value;
        let newParentId: string | null = null;

        if (target) {
            // If dropping on a folder, it becomes the new parent.
            // If dropping on a url item, its parent becomes the new parent.
            newParentId = isUrlItem(target) ? target.parentId : target.id;
        }

        const promises = draggedItems.map(item => {
            // Do not move if it's dropped on itself or its current parent
            if (item.id === target?.id || item.parentId === newParentId) {
                return Promise.resolve();
            }
            return this.storageService.moveItem(item.id, newParentId);
        });

        await Promise.all(promises);
        this.refresh();
    }
}
