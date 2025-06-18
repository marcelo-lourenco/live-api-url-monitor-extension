import * as vscode from 'vscode';
import { StorageService } from '../services/StorageService';
import { AddEditView } from './AddEditView';
import { UrlItem } from '../models/UrlItem';
import { UrlTreeDataProvider } from './UrlTreeDataProvider';

export class ListView {
    private treeView: vscode.TreeView<UrlItem>;
    private treeDataProvider: UrlTreeDataProvider;

    constructor(
        private context: vscode.ExtensionContext,
        private storageService: StorageService,
        private addEditView: AddEditView
    ) {
        this.treeDataProvider = new UrlTreeDataProvider(storageService);
        this.treeView = vscode.window.createTreeView('urlMonitor.list', {
            treeDataProvider: this.treeDataProvider,
            showCollapseAll: true
        });

        context.subscriptions.push(
            this.treeView,
            vscode.commands.registerCommand('urlMonitor.addItem', () => this.addItem()),
            vscode.commands.registerCommand('urlMonitor.editItem', (item) => this.editItem(item)),
            vscode.commands.registerCommand('urlMonitor.deleteItem', (item) => this.deleteItem(item)),
            vscode.commands.registerCommand('urlMonitor.refreshList', () => this.refresh())
        );
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
        this.treeDataProvider.refresh();
    }
}