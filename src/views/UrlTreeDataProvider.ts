import * as vscode from 'vscode';
import { UrlItem } from '../models/UrlItem';
import { StorageService } from '../services/StorageService';

export class UrlTreeDataProvider implements vscode.TreeDataProvider<UrlItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<UrlItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private storageService: StorageService) { }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: UrlItem): vscode.TreeItem {
    const abbrevMap: { [key: string]: string } = {
        'POST': 'POS', 'DELETE': 'DEL', 'PUT': 'PUT', 'OPTIONS': 'OPT',
        'PATCH': 'PAT', 'HEAD': 'HED', 'GET': 'GET'
    };
    const methodText = abbrevMap[element.method.toUpperCase()] || element.method.substring(0, 3);
    const label = `[${methodText}] ${element.name}`;

    const treeItem = new vscode.TreeItem(label);
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
      arguments: [element.id]
    };

    const lastCheckedTime = element.lastChecked ? new Date(element.lastChecked).toLocaleString() : 'never';
    treeItem.tooltip = new vscode.MarkdownString();
    treeItem.tooltip.appendMarkdown(`**${element.name}**\n\n`);
    treeItem.tooltip.appendMarkdown(`- **URL**: \`${element.url}\`\n`);
    treeItem.tooltip.appendMarkdown(`- **Method**: ${element.method}\n`);
    treeItem.tooltip.appendMarkdown(`- **Status**: ${element.lastStatus || 'Unknown'}\n`);
    treeItem.tooltip.appendMarkdown(`- **Last Check**: ${lastCheckedTime}\n`);

    return treeItem;
  }

  async getChildren(): Promise<UrlItem[]> {
    return this.storageService.getItems();
  }
}
