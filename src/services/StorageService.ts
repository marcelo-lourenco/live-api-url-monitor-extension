import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { UrlItem, FolderItem, TreeViewItem, isUrlItem } from '../models/UrlItem';

export class StorageService {
    private readonly storageKey = 'urlMonitorItems';

    constructor(private globalState: vscode.Memento) { }

    async getItems(): Promise<TreeViewItem[]> {
        // Migration for old data structure
        const items = this.globalState.get<any[]>(this.storageKey, []) || [];
        let needsUpdate = false;

        const migratedItems = items.map(item => {
            if (!item || typeof item !== 'object') {
                return null; // Filter out invalid entries like null or undefined
            }

            let currentItem = { ...item };
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
        const newItem = { ...item, id: uuidv4() } as TreeViewItem;
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
        let items = await this.getItems();
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

    async updateItemStatus(id: string, status: 'up' | 'down'): Promise<void> {
        const items = await this.getItems();
        const item = items.find(i => i.id === id) as UrlItem | undefined;
        if (item && isUrlItem(item)) {
            item.lastStatus = status;
            item.lastChecked = new Date().toISOString();
            await this.globalState.update(this.storageKey, items);
        }
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

    async getAllUrlItems(): Promise<UrlItem[]> {
        const allItems = await this.getItems();
        return allItems.filter(isUrlItem);
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