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
    private monitorService: MonitorService // Added MonitorService
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
      vscode.commands.registerCommand('urlMonitor.addItem', () => this.addItem()),
      vscode.commands.registerCommand('urlMonitor.editItem', (item: UrlItem) => this.editItem(item)),
      vscode.commands.registerCommand('urlMonitor.deleteItem', (item: UrlItem) => this.deleteItem(item)),
      vscode.commands.registerCommand('urlMonitor.refreshList', async () => {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Refreshing URL statuses...',
          cancellable: false
        }, async (progress) => {
          progress.report({ increment: 0, message: 'Fetching all URLs...' });
          await this.monitorService.forceCheckAllItems();
          this.refresh(); // Refresh the TreeView after all checks
          progress.report({ increment: 100, message: 'Done.' });
          // Short delay for notification to disappear, if desired
          await new Promise(resolve => setTimeout(resolve, 1500));
        });
      })
    );
  }

  public async addItem() {
    try {
      const newItemData = await this.addEditView.showAddForm();
      if (newItemData) {
        const addedItem = await this.storageService.addItem(newItemData);
        // Check status immediately
        await this.monitorService.checkItemImmediately(addedItem);
        // Restart/adjust the monitoring cycle to include the new item
        await this.monitorService.startMonitoring();
        this.refresh();
        vscode.window.showInformationMessage(`"${addedItem.name}" added. Initial status checked.`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to add item: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async editItem(item: UrlItem) {
    try {
      const updatedItemData = await this.addEditView.showEditForm(item);
      if (updatedItemData) {
        await this.storageService.updateItem(updatedItemData);
        // Check status immediately after editing
        await this.monitorService.checkItemImmediately(updatedItemData);
        // Reset/adjust the monitoring cycle for the edited item
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
        // Reinicia o monitoramento para remover o item do ciclo
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
}
