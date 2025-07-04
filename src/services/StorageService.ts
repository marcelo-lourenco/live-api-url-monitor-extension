import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { isUrlItem, type UrlItem, type FolderItem, type TreeViewItem } from '../models/UrlItem';

export class StorageService {
    private readonly storageKey = 'urlMonitorItems';

    constructor(private globalState: vscode.Memento) { }

    async getItems(): Promise<TreeViewItem[]> {
        // Migration for old data structure
        const items = this.globalState.get<any[]>(this.storageKey, []) || [];
        let needsUpdate = false;

        const migratedItems = items.map((item, index) => {
            if (!item || typeof item !== 'object') {
                return null; // Filter out invalid entries like null or undefined
            }

            const currentItem: any = { ...item };
            let itemChanged = false;

            // Migration 1: Old format items without a 'type'
            if (currentItem.type === undefined) {
                currentItem.type = 'url';
                itemChanged = true;
            }

            // Migration 2: Items missing a 'parentId' (ensures it's null, not undefined)
            if (currentItem.parentId === undefined) {
                currentItem.parentId = null;
                itemChanged = true;
            }

            // Migration 3: Items missing a 'sortOrder'
            if (currentItem.sortOrder === undefined) {
                currentItem.sortOrder = index; // Use array index for initial order
                itemChanged = true;
            }

            // Migration 4: UrlItems missing 'isPaused'
            if (isUrlItem(currentItem) && currentItem.isPaused === undefined) {
                currentItem.isPaused = false;
                itemChanged = true;
            }


            if (itemChanged) {
                needsUpdate = true;
            }

            return currentItem;
        }).filter(item => item !== null); // Remove any invalid entries that were mapped to null

        if (needsUpdate) {
            await this.globalState.update(this.storageKey, migratedItems);
            return migratedItems as TreeViewItem[];
        }
        return items as TreeViewItem[];
    }

    async addItem(item: Omit<UrlItem, 'id'> | Omit<FolderItem, 'id'>): Promise<TreeViewItem> {
        const items = await this.getItems();
        const siblings = items.filter(i => i.parentId === item.parentId);
        const maxSortOrder = siblings.reduce((max, i) => Math.max(max, i.sortOrder), -1);

        const newItem = { ...item, id: uuidv4(), sortOrder: maxSortOrder + 1 } as TreeViewItem;

        items.push(newItem);
        await this.globalState.update(this.storageKey, items);
        return newItem;
    }

    async updateItem(itemToUpdate: TreeViewItem): Promise<void> {
        const items = await this.getItems();
        const index = items.findIndex(i => i.id === itemToUpdate.id);
        if (index !== -1) {
            // Preserve properties that are not part of the update, like status
            items[index] = { ...items[index], ...itemToUpdate };
            await this.globalState.update(this.storageKey, items);
        }
    }

    async deleteItem(id: string): Promise<void> {
        const items = await this.getItems();
        const idsToDelete = new Set<string>();
        idsToDelete.add(id);

        // Find all children recursively to delete them as well
        const findChildren = (parentId: string) => {
            const children = items.filter(item => item.parentId === parentId);
            for (const child of children) {
                idsToDelete.add(child.id);
                if (child.type === 'folder') {
                    findChildren(child.id);
                }
            }
        };

        findChildren(id);

        const filteredItems = items.filter(item => !idsToDelete.has(item.id));
        await this.globalState.update(this.storageKey, filteredItems);
    }

    async clearAllItems(): Promise<void> {
        // Simplesmente atualiza a chave de armazenamento com um array vazio para deletar tudo.
        await this.globalState.update(this.storageKey, []);
    }

    async updateItemStatus(id: string, status: 'up' | 'down'): Promise<void> {
        const items = await this.getItems();
        const item = items.find(i => i.id === id) as UrlItem | undefined;
        if (item && isUrlItem(item)) {
            item.lastStatus = status;
            item.lastChecked = new Date().toISOString();
            await this.globalState.update(this.storageKey, items);
        }
    }

    async updateItemPausedState(id: string, isPaused: boolean): Promise<void> {
        const items = await this.getItems();
        const item = items.find(i => i.id === id);
        if (item && isUrlItem(item)) {
            item.isPaused = isPaused;
            await this.globalState.update(this.storageKey, items);
        }
    }

    async updateMultipleItemsPausedState(ids: string[], isPaused: boolean): Promise<void> {
        const items = await this.getItems();
        const idSet = new Set(ids);
        let changed = false;
        for (const item of items) {
            if (idSet.has(item.id) && isUrlItem(item)) {
                item.isPaused = isPaused;
                changed = true;
            }
        }
        if (changed) {
            await this.globalState.update(this.storageKey, items);
        }
    }

    async updateAllItemsPausedState(isPaused: boolean): Promise<void> {
        const items = await this.getItems();
        items.filter(isUrlItem).forEach(item => item.isPaused = isPaused);
        await this.globalState.update(this.storageKey, items);
    }

    async moveItem(itemId: string, newParentId: string | null): Promise<void> {
        const items = await this.getItems();
        const itemToMove = items.find(i => i.id === itemId);

        if (itemToMove) {
            // Prevent moving a folder into itself or its children
            if (itemToMove.type === 'folder') {
                let currentParentId = newParentId;
                while (currentParentId !== null) {
                    if (currentParentId === itemToMove.id) {
                        vscode.window.showErrorMessage('Cannot move a folder into itself or one of its subfolders.');
                        return;
                    }
                    const parent = items.find(i => i.id === currentParentId);
                    currentParentId = parent ? parent.parentId : null;
                }
            }

            itemToMove.parentId = newParentId;
            await this.globalState.update(this.storageKey, items);
        }
    }

    async reorderItems(draggedItemId: string, targetItemId: string | null, newParentId: string | null): Promise<void> {
        const items = await this.getItems();
        const draggedItem = items.find(i => i.id === draggedItemId);
        if (!draggedItem) return;

        // Update parent first
        draggedItem.parentId = newParentId;

        // Get all items in the new parent context (siblings)
        let siblings = items.filter(i => i.parentId === newParentId).sort((a, b) => a.sortOrder - b.sortOrder);

        // Remove the dragged item from its old position in the sibling list to re-insert it
        siblings = siblings.filter(i => i.id !== draggedItemId);

        if (targetItemId === null) { // Dropped at the end of the list (or into an empty folder)
            siblings.push(draggedItem);
        } else {
            const targetIndex = siblings.findIndex(i => i.id === targetItemId);
            if (targetIndex !== -1) {
                // Insert the dragged item before the target item
                siblings.splice(targetIndex, 0, draggedItem);
            } else {
                siblings.push(draggedItem); // Fallback: add to end
            }
        }

        // Re-assign sortOrder based on the new array order
        siblings.forEach((item, index) => item.sortOrder = index);
        await this.globalState.update(this.storageKey, items);
    }

    async getAllUrlItems(): Promise<UrlItem[]> {
        const allItems = await this.getItems();
        return allItems.filter(isUrlItem);
    }

    async duplicateItemOrFolder(sourceId: string): Promise<void> {
        const allItems = await this.getItems();
        const sourceItem = allItems.find(i => i.id === sourceId);

        if (!sourceItem) {
            throw new Error('Source item not found for duplication.');
        }

        const itemsToAdd: TreeViewItem[] = [];
        // This map tracks the mapping from old IDs to newly generated IDs.
        // It's crucial for correctly setting the `parentId` of nested items.
        const idMap = new Map<string, string>();

        const duplicateRecursively = (originalItem: TreeViewItem, newParentId: string | null) => {
            const newId = uuidv4();
            idMap.set(originalItem.id, newId);

            const newItem: TreeViewItem = {
                ...originalItem,
                id: newId,
                name: `Copy of ${originalItem.name}`,
                parentId: newParentId,
            };

            if (isUrlItem(newItem)) {
                newItem.lastStatus = undefined;
                newItem.lastChecked = undefined;
            }

            itemsToAdd.push(newItem);

            if (newItem.type === 'folder') {
                const children = allItems.filter(child => child.parentId === originalItem.id);
                children.forEach(child => duplicateRecursively(child, newId));
            }
        };

        duplicateRecursively(sourceItem, sourceItem.parentId);

        await this.globalState.update(this.storageKey, [...allItems, ...itemsToAdd]);
    }

    async getDescendantUrlItems(folderId: string): Promise<UrlItem[]> {
        const allItems = await this.getItems();
        const descendants: UrlItem[] = [];
        const findChildrenRecursively = (parentId: string) => {
            const children = allItems.filter(item => item.parentId === parentId);
            for (const child of children) {
                if (isUrlItem(child)) {
                    descendants.push(child);
                } else { // It's a folder
                    findChildrenRecursively(child.id);
                }
            }
        };
        findChildrenRecursively(folderId);
        return descendants;
    }
}