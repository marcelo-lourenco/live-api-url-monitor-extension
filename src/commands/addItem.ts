import * as vscode from 'vscode';
import { StorageService } from '../services/StorageService';
import { MonitorService } from '../services/MonitorService';

export class AddItemCommand {
  constructor(
    private storageService: StorageService,
    private monitorService: MonitorService
  ) { }

  async execute() {
    const name = await vscode.window.showInputBox({
      prompt: 'Enter the item name',
      placeHolder: 'My API Endpoint'
    });

    if (!name) return;

    const url = await vscode.window.showInputBox({
      prompt: 'Enter the URL to monitor',
      placeHolder: 'https://api.example.com/endpoint',
      validateInput: this.validateUrl
    });

    if (!url) return;

    try {
      const item = await this.storageService.addItem({
        name,
        url,
        method: 'GET',
        interval: 60,
        expectedStatusCode: 200
      });

      this.monitorService.startMonitoring();
      vscode.window.showInformationMessage(`Added "${name}" to monitoring list`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to add item: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private validateUrl(value: string): string | undefined {
    try {
      new URL(value);
      return undefined;
    } catch {
      return 'Invalid URL format';
    }
  }
}
