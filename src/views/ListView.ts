import * as vscode from 'vscode';
import { StorageService } from '../services/StorageService';
import { AddEditView } from './AddEditView';
import { UrlItem } from '../models/UrlItem';
import { UrlTreeDataProvider } from './UrlTreeDataProvider';
import { MonitorService } from '../services/MonitorService';

export class ListView {
  private treeView: vscode.TreeView<UrlItem>;
  private treeDataProvider: UrlTreeDataProvider;

  constructor(
    private context: vscode.ExtensionContext,
    private storageService: StorageService,
    private addEditView: AddEditView,
    private monitorService: MonitorService,
  ) {
    this.treeDataProvider = new UrlTreeDataProvider(storageService);
    this.treeView = vscode.window.createTreeView('urlMonitor.list', {
      treeDataProvider: this.treeDataProvider,
      showCollapseAll: true
    });

    this.registerCommands();
  }

  private registerCommands() {
    this.context.subscriptions.push(
      // Comandos iniciados a partir da UI da lista (barra de título, menu de contexto)
      vscode.commands.registerCommand('urlMonitor.addItem', () => this.addItem()),
      vscode.commands.registerCommand('urlMonitor.editItem', (itemOrId: UrlItem | string) => {
        const itemId = typeof itemOrId === 'string' ? itemOrId : itemOrId.id;
        this.editItem(itemId);
      }),
      vscode.commands.registerCommand('urlMonitor.deleteItem', (item: UrlItem) => this.deleteItem(item)),
      vscode.commands.registerCommand('urlMonitor.refreshList', async () => {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Refreshing URL statuses...',
          cancellable: false
        }, async (progress) => {
          progress.report({ increment: 0, message: 'Fetching all URLs...' });
          await this.monitorService.forceCheckAllItems();
          this.refresh();
          progress.report({ increment: 100, message: 'Done.' });
          await new Promise(resolve => setTimeout(resolve, 1500));
        });
      })
      // NOTA: O comando 'urlMonitor.importCurl' é registrado em extension.ts para manter a lógica de comando
      // separada da lógica da view, evitando acoplamento excessivo.
    );
  }

  public async addItem() {
    try {
      const newItemData = await this.addEditView.showAddForm();
      if (newItemData) {
        const addedItem = await this.storageService.addItem(newItemData);
        await this.monitorService.checkItemImmediately(addedItem);
        await this.monitorService.startMonitoring();
        this.refresh();
        vscode.window.showInformationMessage(`"${addedItem.name}" added. Initial status checked.`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to add item: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async editItem(itemId: string) {
    try {
      const items = await this.storageService.getItems();
      const item = items.find(i => i.id === itemId);
      if (!item) {
        vscode.window.showErrorMessage('Item not found for editing.');
        return;
      }

      const updatedItemData = await this.addEditView.showEditForm(item);
      if (updatedItemData) {
        await this.storageService.updateItem(updatedItemData);
        await this.monitorService.checkItemImmediately(updatedItemData);
        await this.monitorService.startMonitoring();
        this.refresh();
        vscode.window.showInformationMessage(`"${updatedItemData.name}" updated. Status re-checked.`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update item: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async deleteItem(item: UrlItem) {
    const confirm = await vscode.window.showInformationMessage(
      `Delete "${item.name}"? This will remove it from monitoring.`,
      { modal: true },
      'Delete'
    );

    if (confirm === 'Delete') {
      try {
        await this.storageService.deleteItem(item.id);
        await this.monitorService.startMonitoring();
        this.refresh();
        vscode.window.showInformationMessage(`"${item.name}" deleted successfully.`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to delete item: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  public refresh() {
    this.treeDataProvider.refresh();
  }

  public updateBadge(errorCount: number) {
    this.treeView.badge = errorCount > 0
      ? { value: errorCount, tooltip: `${errorCount} URL(s) with errors` }
      : undefined;
  }
}
