import * as vscode from 'vscode';
import { UrlItem, TreeViewItem, isUrlItem } from '../models/UrlItem';
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

    private getDescendantUrlItems(folderId: string, allItems: TreeViewItem[]): UrlItem[] {
        const descendants: UrlItem[] = [];
        const directChildren = allItems.filter(item => item.parentId === folderId);

        for (const child of directChildren) {
            if (isUrlItem(child)) {
                descendants.push(child);
            } else { // It's a folder
                // Recursively get descendants of the sub-folder
                descendants.push(...this.getDescendantUrlItems(child.id, allItems));
            }
        }
        return descendants;
    }

    /**
     * Determines the collective status of a folder based on its children.
     * - 'down': If at least one child has an error.
     * - 'up': If all children are 'up'.
     * - 'unknown': If the folder is empty or contains items with no status yet.
     */
    private getFolderStatus(folderId: string, allItems: TreeViewItem[]): 'up' | 'down' | 'unknown' {
        const descendants = this.getDescendantUrlItems(folderId, allItems);

        if (descendants.length === 0) {
            return 'unknown'; // Empty folder, default color
        }

        if (descendants.some(item => item.lastStatus === 'down')) {
            return 'down'; // If any item is down, folder is red
        }

        if (descendants.every(item => item.lastStatus === 'up')) {
            return 'up'; // If ALL items are up, folder is green
        }

        return 'unknown'; // Otherwise, some items are not yet checked
    }

    async getTreeItem(element: TreeViewItem): Promise<vscode.TreeItem> {
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
            const allItems = await this.storageService.getItems();
            const folderStatus = this.getFolderStatus(element.id, allItems);

            const treeItem = new vscode.TreeItem(element.name.toUpperCase(), vscode.TreeItemCollapsibleState.Collapsed);
            treeItem.id = element.id;
            treeItem.contextValue = 'folder';

            let iconId: string;
            let iconColorId: string | undefined;

            switch (folderStatus) {
                case 'up':
                    iconId = 'folder-active';
                    iconColorId = 'testing.iconPassed'; // Green
                    break;
                case 'down':
                    iconId = 'folder-active';
                    iconColorId = 'testing.iconFailed'; // Red
                    break;
                default: // 'unknown'
                    iconId = 'folder';
                    iconColorId = undefined; // Use default theme color
            }

            treeItem.iconPath = new vscode.ThemeIcon(iconId, iconColorId ? new vscode.ThemeColor(iconColorId) : undefined);
            return treeItem;
        }
    }

    async getChildren(element?: TreeViewItem): Promise<TreeViewItem[]> {
        const items = await this.storageService.getItems();
        const parentId = element ? element.id : null;
        return items
            .filter(item => item.parentId === parentId)
            .sort((a, b) => a.sortOrder - b.sortOrder);
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
        const draggedItem = draggedItems[0]; // We'll handle one-by-one for simplicity in reordering
        if (!draggedItem) return;

        // Determine the drop context
        const dropTargetParentId = target ? (isUrlItem(target) ? target.parentId : target.id) : null;
        const isMovingToNewFolder = draggedItem.parentId !== dropTargetParentId;

        if (isMovingToNewFolder) {
            // This is a simple move to a different parent, not a reorder.
            // The existing moveItem logic is sufficient.
            const promises = draggedItems.map(item => {
                if (item.id === dropTargetParentId) return Promise.resolve(); // Cannot drop folder on itself
                return this.storageService.moveItem(item.id, dropTargetParentId);
            });
            await Promise.all(promises);
        } else {
            // This is a reorder within the same parent.
            // We need to know the target item to place the dragged item *before* it.
            // If target is undefined, it means we are dropping at the end of the root list.
            // If target is a folder, we are dropping at the end of that folder's list.
            const targetId = target ? (isUrlItem(target) ? target.id : null) : null;
            const parentId = target ? target.parentId : null;

            // We only handle single-item reordering for simplicity
            if (draggedItems.length === 1) {
                await this.storageService.reorderItems(draggedItem.id, targetId, parentId);
            }
        }

        this.refresh();
    }
}
