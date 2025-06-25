import * as vscode from 'vscode';
import { UrlItem } from '../models/UrlItem';
import { StorageService } from '../services/StorageService';
import { MonitorService } from '../services/MonitorService';

export class EditItemCommand {
  constructor(
    private storageService: StorageService,
    private monitorService: MonitorService
  ) { }

  async execute(item: UrlItem) {
    const updatedName = await vscode.window.showInputBox({
      value: item.name,
      prompt: 'Edit item name'
    });

    if (updatedName === undefined) return;

    const updatedUrl = await vscode.window.showInputBox({
      value: item.url,
      prompt: 'Edit URL',
      validateInput: (value) => {
        try {
          new URL(value);
          return undefined;
        } catch {
          return 'Invalid URL format';
        }
      }
    });

    if (updatedUrl === undefined) return;

    try {
      await this.storageService.updateItem({
        ...item,
        name: updatedName,
        url: updatedUrl
      });

      this.monitorService.startMonitoring();
      vscode.window.showInformationMessage(`Updated "${updatedName}"`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update item: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
