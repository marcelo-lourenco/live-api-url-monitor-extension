import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { UrlItem } from '../models/UrlItem';

export class StorageService {
  private readonly storageKey = 'urlMonitorItems';

  constructor(private globalState: vscode.Memento) { }

  async getItems(): Promise<UrlItem[]> {
    return this.globalState.get<UrlItem[]>(this.storageKey, []);
  }

  async addItem(item: Omit<UrlItem, 'id'>): Promise<UrlItem> {
    const items = await this.getItems();
    const newItem = { ...item, id: uuidv4() };
    items.push(newItem);
    await this.globalState.update(this.storageKey, items);
    return newItem;
  }

  async updateItem(item: UrlItem): Promise<void> {
    const items = await this.getItems();
    const index = items.findIndex(i => i.id === item.id);
    if (index !== -1) {
      items[index] = item;
      await this.globalState.update(this.storageKey, items);
    }
  }

  async deleteItem(id: string): Promise<void> {
    const items = await this.getItems();
    const filteredItems = items.filter(item => item.id !== id);
    await this.globalState.update(this.storageKey, filteredItems);
  }

  async updateItemStatus(id: string, status: 'up' | 'down'): Promise<void> {
    const items = await this.getItems();
    const item = items.find(i => i.id === id);
    if (item) {
      item.lastStatus = status;
      item.lastChecked = new Date().toISOString();
      await this.globalState.update(this.storageKey, items);
    }
  }
}