import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { isUrlItem, type UrlItem, type FolderItem, type TreeViewItem } from '../models/UrlItem';

export class StorageService {
    private readonly storageKey = 'urlMonitorItems';

    constructor(private globalState: vscode.Memento) { }

    // Centralizes fetching and mapping items for internal use
    private async _getItemsAndMap(): Promise<{ items: TreeViewItem[], itemMap: Map<string, TreeViewItem> }> {
        const items = await this.getItems();
        const itemMap = new Map<string, TreeViewItem>(items.map(item => [item.id, item]));
        return { items, itemMap };
    }

    async getItems(): Promise<TreeViewItem[]> {
        // Handles migration for old data structures
        const items = this.globalState.get<any[]>(this.storageKey, []) || [];
        let needsUpdate = false;

        const migratedItems = items.map((item, index) => {
            if (!item || typeof item !== 'object') {
                return null;
            }

            const currentItem: any = { ...item };
            let itemChanged = false;

            // Migration 1: Old format items without 'type'
            if (currentItem.type === undefined) {
                currentItem.type = 'url';
                itemChanged = true;
            }

            // Migration 2: Items without 'parentId'
            if (currentItem.parentId === undefined) {
                currentItem.parentId = null;
                itemChanged = true;
            }

            // Migration 3: Items without 'sortOrder'
            if (currentItem.sortOrder === undefined) {
                currentItem.sortOrder = index;
                itemChanged = true;
            }

            // Migration 4: UrlItems without 'isPaused'
            if (isUrlItem(currentItem) && currentItem.isPaused === undefined) {
                currentItem.isPaused = false;
                itemChanged = true;
            }

            if (itemChanged) {
                needsUpdate = true;
            }

            return currentItem;
        }).filter(item => item !== null);

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

    async addMultipleItems(newItems: TreeViewItem[]): Promise<void> {
        const existingItems = await this.getItems();
        const updatedItems = [...existingItems, ...newItems];
        await this.globalState.update(this.storageKey, updatedItems);
    }

    async updateItem(itemToUpdate: TreeViewItem): Promise<void> {
        const { items, itemMap } = await this._getItemsAndMap();
        const existingItem = itemMap.get(itemToUpdate.id);

        if (existingItem) {
            // Merge the changes into the existing item object
            Object.assign(existingItem, itemToUpdate);
            await this.globalState.update(this.storageKey, items);
        }
    }

    async deleteItem(id: string): Promise<void> {
        const { items, itemMap } = await this._getItemsAndMap();
        if (!itemMap.has(id)) {
            return;
        }

        // Efficient recursive deletion using parent grouping
        const itemsByParent = new Map<string | null, TreeViewItem[]>();
        for (const item of items) {
            if (!itemsByParent.has(item.parentId)) {
                itemsByParent.set(item.parentId, []);
            }
            itemsByParent.get(item.parentId)!.push(item);
        }

        const idsToDelete = new Set<string>();
        const collectChildrenRecursively = (parentId: string) => {
            const children = itemsByParent.get(parentId) || [];
            for (const child of children) {
                idsToDelete.add(child.id);
                if (child.type === 'folder') {
                    collectChildrenRecursively(child.id);
                }
            }
        };

        idsToDelete.add(id);
        collectChildrenRecursively(id);

        const filteredItems = items.filter(item => !idsToDelete.has(item.id));
        await this.globalState.update(this.storageKey, filteredItems);
    }

    async clearAllItems(): Promise<void> {
        await this.globalState.update(this.storageKey, []);
    }

    async updateItemStatus(id: string, status: 'up' | 'down'): Promise<void> {
        const { items, itemMap } = await this._getItemsAndMap();
        const item = itemMap.get(id);

        if (item && isUrlItem(item)) {
            item.lastStatus = status;
            item.lastChecked = new Date().toISOString();
            await this.globalState.update(this.storageKey, items);
        }
    }

    async updateItemPausedState(id: string, isPaused: boolean): Promise<void> {
        const { items, itemMap } = await this._getItemsAndMap();
        const item = itemMap.get(id);

        if (item && isUrlItem(item)) {
            item.isPaused = isPaused;
            await this.globalState.update(this.storageKey, items);
        }
    }

    async updateMultipleItemsPausedState(ids: string[], isPaused: boolean): Promise<void> {
        const { items, itemMap } = await this._getItemsAndMap();
        const idSet = new Set(ids);
        let changed = false;

        for (const id of idSet) {
            const item = itemMap.get(id);
            if (item && isUrlItem(item)) {
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
        const { items, itemMap } = await this._getItemsAndMap();
        const itemToMove = itemMap.get(itemId);

        if (itemToMove) {
            // Prevents a folder from being moved into itself or one of its children
            if (itemToMove.type === 'folder') {
                let currentParentId = newParentId;
                while (currentParentId !== null) {
                    if (currentParentId === itemToMove.id) {
                        vscode.window.showErrorMessage('Cannot move a folder into itself or one of its subfolders.');
                        return;
                    }
                    const parent = itemMap.get(currentParentId);
                    currentParentId = parent ? parent.parentId : null;
                }
            }

            itemToMove.parentId = newParentId;
            await this.globalState.update(this.storageKey, items);
        }
    }

    async reorderItems(draggedItemId: string, targetItemId: string | null, newParentId: string | null): Promise<void> {
        const { items, itemMap } = await this._getItemsAndMap();
        const draggedItem = itemMap.get(draggedItemId);
        if (!draggedItem) return;

        // Update the parent first
        draggedItem.parentId = newParentId;

        // Get all items in the new parent context (siblings)
        let siblings = items.filter(i => i.parentId === newParentId).sort((a, b) => a.sortOrder - b.sortOrder);

        // Remove the dragged item from its old position in the siblings list to re-insert it
        siblings = siblings.filter(i => i.id !== draggedItemId);

        if (targetItemId === null) {
            siblings.push(draggedItem);
        } else {
            const targetIndex = siblings.findIndex(i => i.id === targetItemId);
            if (targetIndex !== -1) {
                siblings.splice(targetIndex, 0, draggedItem);
            } else {
                siblings.push(draggedItem);
            }
        }

        // Reassign sortOrder based on the new array order
        siblings.forEach((item, index) => item.sortOrder = index);
        await this.globalState.update(this.storageKey, items);
    }

    async getAllUrlItems(): Promise<UrlItem[]> {
        const allItems = await this.getItems();
        return allItems.filter(isUrlItem);
    }

    async duplicateItemOrFolder(sourceId: string): Promise<void> {
        const { items, itemMap } = await this._getItemsAndMap();
        const sourceItem = itemMap.get(sourceId);

        if (!sourceItem) {
            throw new Error('Source item not found for duplication.');
        }

        const itemsToAdd: TreeViewItem[] = [];
        // Map of old IDs to new IDs for correct parentId assignment
        const newIdMap = new Map<string, string>();

        const duplicateRecursively = (originalItem: TreeViewItem, newParentId: string | null) => {
            const newId = uuidv4();
            newIdMap.set(originalItem.id, newId);

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
                const children = items.filter(child => child.parentId === originalItem.id);
                children.forEach(child => duplicateRecursively(child, newId));
            }
        };

        duplicateRecursively(sourceItem, sourceItem.parentId);

        await this.globalState.update(this.storageKey, [...items, ...itemsToAdd]);
    }

    async getDescendantUrlItems(folderId: string): Promise<UrlItem[]> {
        const { items, itemMap } = await this._getItemsAndMap();
        if (!itemMap.has(folderId)) {
            return [];
        }

        const descendants: UrlItem[] = [];
        const itemsByParent = new Map<string | null, TreeViewItem[]>();
        for (const item of items) {
            if (!itemsByParent.has(item.parentId)) {
                itemsByParent.set(item.parentId, []);
            }
            itemsByParent.get(item.parentId)!.push(item);
        }

        const findChildrenRecursively = (parentId: string) => {
            const children = itemsByParent.get(parentId) || [];
            for (const child of children) {
                if (isUrlItem(child)) {
                    descendants.push(child);
                } else {
                    findChildrenRecursively(child.id);
                }
            }
        };
        findChildrenRecursively(folderId);
        return descendants;
    }
}
