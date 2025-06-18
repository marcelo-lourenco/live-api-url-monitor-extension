import * as vscode from 'vscode';
import { UrlItem } from '../models/UrlItem';
import { StorageService } from '../services/StorageService';

export class UrlTreeDataProvider implements vscode.TreeDataProvider<UrlItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<UrlItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private storageService: StorageService) {}

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: UrlItem): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(element.name);
        treeItem.id = element.id;
        treeItem.description = element.url;
        treeItem.contextValue = 'urlItem';
        treeItem.iconPath = new vscode.ThemeIcon(
            element.lastStatus === 'up' ? 'pass' : 'error',
            new vscode.ThemeColor(element.lastStatus === 'up' ? 'testing.iconPassed' : 'testing.iconFailed')
        );
        treeItem.command = {
            command: 'urlMonitor.editItem',
            title: 'Edit URL',
            arguments: [element]
        };
        return treeItem;
    }

    async getChildren(): Promise<UrlItem[]> {
        return this.storageService.getItems();
    }
}