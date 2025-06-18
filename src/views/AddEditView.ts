import * as vscode from 'vscode';
import { UrlItem } from '../models/UrlItem';

export class AddEditView {
    private panel: vscode.WebviewPanel | undefined;

    constructor(private context: vscode.ExtensionContext) {}

    public async showAddForm(): Promise<Omit<UrlItem, 'id'> | undefined> {
        return this.showForm('Add URL Item');
    }

    public async showEditForm(item: UrlItem): Promise<UrlItem | undefined> {
        return this.showForm('Edit URL Item', item);
    }

    private async showForm(title: string, item?: UrlItem): Promise<UrlItem | undefined> {
        this.panel = vscode.window.createWebviewPanel(
            'urlMonitor.addEdit',
            title,
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        this.panel.webview.html = this.getFormHtml(item);

        return new Promise((resolve) => {
            this.panel?.webview.onDidReceiveMessage((message) => {
                if (message.command === 'save') {
                    resolve(message.data);
                    this.panel?.dispose();
                } else if (message.command === 'cancel') {
                    resolve(undefined);
                    this.panel?.dispose();
                }
            });

            this.panel?.onDidDispose(() => {
                resolve(undefined);
                this.panel = undefined;
            });
        });
    }

    private getFormHtml(item?: UrlItem): string {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${item ? 'Edit' : 'Add'} URL Item</title>
            <style>
                body { padding: 20px; font-family: Arial, sans-serif; }
                .form-group { margin-bottom: 15px; }
                label { display: block; margin-bottom: 5px; font-weight: bold; }
                input, select { width: 100%; padding: 8px; box-sizing: border-box; }
                .buttons { margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px; }
                button { padding: 8px 15px; cursor: pointer; }
                .advanced { margin-top: 20px; border-top: 1px solid #ddd; padding-top: 20px; }
            </style>
        </head>
        <body>
            <h1>${item ? 'Edit' : 'Add'} URL Item</h1>
            
            <div class="form-group">
                <label for="name">Item Name*</label>
                <input type="text" id="name" value="${item?.name || ''}" required>
            </div>
            
            <div class="form-group">
                <label for="url">URL*</label>
                <input type="url" id="url" value="${item?.url || ''}" required>
            </div>
            
            <div class="advanced">
                <h3>Advanced Options</h3>
                
                <div class="form-group">
                    <label for="method">Request Method</label>
                    <select id="method">
                        <option value="GET" ${item?.method === 'GET' ? 'selected' : ''}>GET</option>
                        <option value="POST" ${item?.method === 'POST' ? 'selected' : ''}>POST</option>
                        <option value="PUT" ${item?.method === 'PUT' ? 'selected' : ''}>PUT</option>
                        <option value="DELETE" ${item?.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="interval">Check Interval (seconds)</label>
                    <input type="number" id="interval" value="${item?.interval || 60}" min="10">
                </div>
                
                <div class="form-group">
                    <label for="statusCode">Expected Status Code</label>
                    <input type="number" id="statusCode" value="${item?.expectedStatusCode || 200}" min="100" max="599">
                </div>
            </div>
            
            <div class="buttons">
                <button id="cancel">Cancel</button>
                <button id="save">Save</button>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                document.getElementById('cancel').addEventListener('click', () => {
                    vscode.postMessage({ command: 'cancel' });
                });
                
                document.getElementById('save').addEventListener('click', () => {
                    const name = document.getElementById('name').value;
                    const url = document.getElementById('url').value;
                    
                    if (!name || !url) {
                        alert('Name and URL are required');
                        return;
                    }
                    
                    const data = {
                        name,
                        url,
                        method: document.getElementById('method').value,
                        interval: parseInt(document.getElementById('interval').value),
                        expectedStatusCode: parseInt(document.getElementById('statusCode').value)
                    };
                    
                    vscode.postMessage({
                        command: 'save',
                        data: data
                    });
                });
            </script>
        </body>
        </html>
        `;
    }
}