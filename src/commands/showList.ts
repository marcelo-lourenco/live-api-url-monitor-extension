import * as vscode from 'vscode';
import { StorageService } from '../services/StorageService';

export class ShowListCommand {
    constructor(private storageService: StorageService) {}

    async execute() {
        const items = await this.storageService.getItems();
        if (items.length === 0) {
            vscode.window.showInformationMessage('No URLs configured for monitoring');
            return;
        }

        const itemNames = items.map(item => item.name);
        const selected = await vscode.window.showQuickPick(itemNames, {
            placeHolder: 'Select an item to view details'
        });

        if (selected) {
            const item = items.find(i => i.name === selected);
            if (item) {
                vscode.window.showInformationMessage(
                    `URL: ${item.url}\n` +
                    `Status: ${item.lastStatus || 'unknown'}\n` +
                    `Last checked: ${item.lastChecked || 'never'}`
                );
            }
        }
    }
}