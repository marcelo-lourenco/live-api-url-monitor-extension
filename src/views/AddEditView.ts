import * as vscode from 'vscode';
import { UrlItem } from '../models/UrlItem';

export class AddEditView {
    private panel: vscode.WebviewPanel | undefined;

    constructor(private context: vscode.ExtensionContext) { }

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
            body { padding: 0; margin: 0; font-family: Arial, sans-serif; }
            .header { 
                display: flex; 
                justify-content: space-between;
                align-items: center;
                padding: 10px 15px;
                background: #f3f3f3;
                border-bottom: 1px solid #ddd;
            }
            .form-container { padding: 15px; }
            .form-group { margin-bottom: 15px; }
            label { display: block; margin-bottom: 5px; font-weight: bold; }
            input, select { width: 100%; padding: 8px; box-sizing: border-box; }
            .buttons { margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px; }
            button { padding: 8px 15px; cursor: pointer; }
            .advanced { margin-top: 20px; border-top: 1px solid #ddd; padding-top: 20px; }
            .toolbar-button { 
                background: none;
                border: none;
                cursor: pointer;
                padding: 5px;
                margin-left: 10px;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h2>${item ? 'Edit' : 'Add'} URL Item</h2>
            <div>
                <button class="toolbar-button" id="addItem" title="Add Item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                    </svg>
                </button>
                <button class="toolbar-button" id="refreshList" title="Refresh List">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                </button>
            </div>
        </div>
        
        <div class="form-container">
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
                
                if (${item ? `'id': '${item.id}'` : ''}) {
                    data.id = '${item?.id}';
                }
                
                vscode.postMessage({
                    command: 'save',
                    data: data
                });
            });
            
            document.getElementById('addItem').addEventListener('click', () => {
                vscode.postMessage({ command: 'addItem' });
            });
            
            document.getElementById('refreshList').addEventListener('click', () => {
                vscode.postMessage({ command: 'refreshList' });
            });
        </script>
    </body>
    </html>
    `;
    }


    public restoreWebview(webviewPanel: vscode.WebviewPanel) {
        this.panel = webviewPanel;
        this.panel.webview.html = this.getFormHtml();

        this.panel.webview.onDidReceiveMessage((message) => {
            if (message.command === 'save') {
                vscode.commands.executeCommand('urlMonitor.refreshList');
                this.panel?.dispose();
            }
        });
    }
}