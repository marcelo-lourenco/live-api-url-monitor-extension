import * as vscode from 'vscode';
import { StorageService } from '../services/StorageService';
import { AddEditView } from './AddEditView';
import { UrlItem } from '../models/UrlItem';
import { UrlTreeDataProvider } from './UrlTreeDataProvider';

export class ListView {
    private treeView: vscode.TreeView<UrlItem>;

    constructor(
        private context: vscode.ExtensionContext,
        private storageService: StorageService,
        private addEditView: AddEditView
    ) {
        this.treeView = vscode.window.createTreeView('urlMonitor.list', {
            treeDataProvider: new UrlTreeDataProvider(storageService),
            showCollapseAll: true
        });

        context.subscriptions.push(this.treeView);
    }

    public async addItem() {
        const newItem = await this.addEditView.showAddForm();
        if (newItem) {
            await this.storageService.addItem(newItem);
            this.refresh();
        }
    }

    public async editItem(item: UrlItem) {
        const updatedItem = await this.addEditView.showEditForm(item);
        if (updatedItem) {
            await this.storageService.updateItem(updatedItem);
            this.refresh();
        }
    }

    public async deleteItem(item: UrlItem) {
        const confirm = await vscode.window.showInformationMessage(
            `Delete "${item.name}"?`,
            { modal: true },
            'Delete'
        );
        
        if (confirm === 'Delete') {
            await this.storageService.deleteItem(item.id);
            this.refresh();
        }
    }

    public refresh() {
        vscode.commands.executeCommand('urlMonitor.list.refresh');
    }
}