import * as vscode from 'vscode';
import { UrlItem, createDefaultUrlItem } from '../models/UrlItem'; // Importado createDefaultUrlItem

export class AddEditView {
    private panel: vscode.WebviewPanel | undefined;
    private resolvePromise: ((value: UrlItem | Omit<UrlItem, 'id' | 'lastStatus' | 'lastChecked'> | undefined) => void) | undefined;
    private currentItemForForm: UrlItem | Omit<UrlItem, 'id' | 'lastStatus' | 'lastChecked'> | undefined;


    constructor(private context: vscode.ExtensionContext) { }

    public async showAddForm(): Promise<Omit<UrlItem, 'id' | 'lastStatus' | 'lastChecked'> | undefined> {
        this.currentItemForForm = createDefaultUrlItem();
        return this.showForm('Add URL Item', this.currentItemForForm);
    }

    public async showEditForm(item: UrlItem): Promise<UrlItem | undefined> {
        this.currentItemForForm = { ...item }; // Clonar para evitar mutação direta
        return this.showForm('Edit URL Item', this.currentItemForForm);
    }

    private async showForm(title: string, itemData?: UrlItem | Omit<UrlItem, 'id' | 'lastStatus' | 'lastChecked'>): Promise<any> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.createOrShowPanel(title, itemData);
        });
    }

    private createOrShowPanel(title: string, itemData?: UrlItem | Omit<UrlItem, 'id' | 'lastStatus' | 'lastChecked'>) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (this.panel) {
            this.panel.title = title;
            this.panel.webview.html = this.getFormHtml(itemData);
            this.panel.reveal(column);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'urlMonitor.addEdit', // Identificador do tipo de webview
                title, // Título exibido na aba
                column || vscode.ViewColumn.One, // Coluna para exibir
                {
                    enableScripts: true, // Habilita JavaScript no webview
                    retainContextWhenHidden: true, // Mantém o estado do webview quando não visível
                    localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'resources')]
                }
            );

            this.panel.webview.html = this.getFormHtml(itemData);

            this.panel.onDidDispose(() => {
                this.panel = undefined;
                this.currentItemForForm = undefined;
                if (this.resolvePromise) {
                    this.resolvePromise(undefined); // Resolve com undefined se o painel for fechado
                    this.resolvePromise = undefined;
                }
            }, null, this.context.subscriptions);

            this.panel.webview.onDidReceiveMessage(
                message => this.handleMessage(message),
                undefined,
                this.context.subscriptions
            );
        }
    }

    private handleMessage(message: any) {
        switch (message.command) {
            case 'save':
                if (this.resolvePromise) {
                    const dataToSave = message.data;
                    if (this.currentItemForForm && 'id' in this.currentItemForForm) {
                        dataToSave.id = (this.currentItemForForm as UrlItem).id; // Garante que o ID seja mantido na edição
                    }
                    this.resolvePromise(dataToSave);
                    this.resolvePromise = undefined;
                }
                this.panel?.dispose();
                break;
            case 'cancel':
                if (this.resolvePromise) {
                    this.resolvePromise(undefined);
                    this.resolvePromise = undefined;
                }
                this.panel?.dispose();
                break;
            // Os cases 'addItem' e 'refreshList' foram removidos daqui
        }
    }

    private getFormHtml(item?: UrlItem | Omit<UrlItem, 'id' | 'lastStatus' | 'lastChecked'>): string {
        const itemToRender = item || createDefaultUrlItem();
        const isEditMode = item && 'id' in item;

        // Adicionar nonces para Content Security Policy
        const nonce = getNonce();

        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <!-- Content Security Policy -->
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel?.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${isEditMode ? 'Edit' : 'Add'} URL Item</title>
            <style>
                body {
                    padding: 0;
                    margin: 0;
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-editor-foreground);
                    background-color: var(--vscode-editor-background);
                }
                .header {
                    padding: 10px 15px;
                    background: var(--vscode-sideBar-background, var(--vscode-editorGroupHeader-tabsBackground));
                    border-bottom: 1px solid var(--vscode-editorGroup-border);
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }
                .header h2 {
                    margin: 0;
                    color: var(--vscode-sideBarTitle-foreground, var(--vscode-tab-activeForeground));
                }
                .form-container {
                    padding: 15px;
                    overflow-y: auto;
                    height: calc(100vh - 60px); /* Ajustar altura considerando o header */
                }
                .form-group { margin-bottom: 15px; }
                label { display: block; margin-bottom: 5px; font-weight: bold; }
                input[type="text"],
                input[type="url"],
                input[type="number"],
                select,
                textarea {
                    width: 100%;
                    padding: 8px;
                    box-sizing: border-box;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border, var(--vscode-contrastBorder));
                    border-radius: var(--input-border-radius, 3px);
                }
                input:focus, select:focus, textarea:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                    border-color: var(--vscode-focusBorder);
                }
                .buttons {
                    margin-top: 20px;
                    padding-top: 15px;
                    border-top: 1px solid var(--vscode-editorGroup-border);
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    position: sticky;
                    bottom: 0;
                    background-color: var(--vscode-editor-background);
                    padding-bottom: 15px;
                    padding-right: 15px;
                }
                button {
                    padding: 8px 15px;
                    cursor: pointer;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: 1px solid var(--vscode-button-border, transparent);
                    border-radius: var(--input-border-radius, 3px);
                }
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                button#save {
                    background: var(--vscode-button-primaryBackground, var(--vscode-button-background));
                    color: var(--vscode-button-primaryForeground, var(--vscode-button-foreground));
                }
                button#save:hover {
                    background: var(--vscode-button-primaryHoverBackground, var(--vscode-button-hoverBackground));
                }
                .advanced { margin-top: 20px; border-top: 1px solid var(--vscode-editorGroup-border); padding-top: 20px; }
                .form-row { display: flex; gap: 15px; }
                .form-row .form-group { flex: 1; }
                textarea { min-height: 80px; resize: vertical; }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>${isEditMode ? 'Edit' : 'Add'} URL Item</h2>
            </div>

            <div class="form-container">
                <div class="form-group">
                    <label for="name">Item Name*</label>
                    <input type="text" id="name" value="${itemToRender.name || ''}" required>
                </div>

                <div class="form-group">
                    <label for="url">URL*</label>
                    <input type="url" id="url" value="${itemToRender.url || ''}" required placeholder="https://example.com/api/status">
                </div>

                <div class="advanced">
                    <h3>Advanced Options</h3>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="method">Request Method</label>
                            <select id="method">
                                <option value="GET" ${itemToRender.method === 'GET' ? 'selected' : ''}>GET</option>
                                <option value="POST" ${itemToRender.method === 'POST' ? 'selected' : ''}>POST</option>
                                <option value="PUT" ${itemToRender.method === 'PUT' ? 'selected' : ''}>PUT</option>
                                <option value="DELETE" ${itemToRender.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="interval">Check Interval (seconds)</label>
                            <input type="number" id="interval" value="${itemToRender.interval || 60}" min="5">
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="statusCode">Expected Status Code</label>
                        <input type="number" id="statusCode" value="${itemToRender.expectedStatusCode || 200}" min="100" max="599">
                    </div>

                    <div class="form-group">
                        <label for="headers">Headers (JSON format)</label>
                        <textarea id="headers" placeholder='${'{\n  "Content-Type": "application/json",\n  "Authorization": "Bearer YOUR_TOKEN"\n}'}'>${itemToRender.headers ? JSON.stringify(itemToRender.headers, null, 2) : ''}</textarea>
                    </div>

                    <h4>Basic Authentication (Optional)</h4>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="username">Username</label>
                            <input type="text" id="username" value="${itemToRender.username || ''}" placeholder="Optional">
                        </div>
                        <div class="form-group">
                            <label for="password">Password</label>
                            <input type="password" id="password" value="${itemToRender.password || ''}" placeholder="Optional">
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="buttons">
                <button id="cancel">Cancel</button>
                <button id="save">${isEditMode ? 'Save Changes' : 'Add Item'}</button>
            </div>
            
            <script nonce="${nonce}">
                (function() {
                    const vscode = acquireVsCodeApi();
                    const nameInput = document.getElementById('name');
                    const urlInput = document.getElementById('url');
                    const methodSelect = document.getElementById('method');
                    const intervalInput = document.getElementById('interval');
                    const statusCodeInput = document.getElementById('statusCode');
                    const headersTextarea = document.getElementById('headers');
                    const usernameInput = document.getElementById('username');
                    const passwordInput = document.getElementById('password');

                    document.getElementById('cancel').addEventListener('click', () => {
                        vscode.postMessage({ command: 'cancel' });
                    });
                    
                    document.getElementById('save').addEventListener('click', () => {
                        const name = nameInput.value;
                        const url = urlInput.value;
                        
                        if (!name.trim()) {
                            vscode.postMessage({ command: 'showError', message: 'Item Name is required.' });
                            nameInput.focus();
                            return;
                        }
                        if (!url.trim()) {
                            vscode.postMessage({ command: 'showError', message: 'URL is required.' });
                            urlInput.focus();
                            return;
                        }
                        try {
                            new URL(url);
                        } catch (e) {
                            vscode.postMessage({ command: 'showError', message: 'Invalid URL format.' });
                            urlInput.focus();
                            return;
                        }

                        let headers = undefined;
                        const headersString = headersTextarea.value.trim();
                        if (headersString) {
                            try {
                                headers = JSON.parse(headersString);
                                if (typeof headers !== 'object' || headers === null || Array.isArray(headers)) {
                                    throw new Error('Headers must be a JSON object.');
                                }
                            } catch (e) {
                                vscode.postMessage({ command: 'showError', message: 'Invalid JSON format for Headers. ' + (e instanceof Error ? e.message : '') });
                                headersTextarea.focus();
                                return;
                            }
                        }
                        
                        const data = {
                            name: name.trim(),
                            url: url.trim(),
                            method: methodSelect.value,
                            interval: parseInt(intervalInput.value) || 60,
                            expectedStatusCode: parseInt(statusCodeInput.value) || 200,
                            headers: headers,
                            username: usernameInput.value.trim() || undefined,
                            password: passwordInput.value || undefined // Senha pode ser string vazia se intencional
                        };
                        
                        // O ID é adicionado no handleMessage se for edição
                        
                        vscode.postMessage({
                            command: 'save',
                            data: data
                        });
                    });

                    // Lógica para 'addItem' e 'refreshList' foi removida do script do webview
                }());
            </script>
        </body>
        </html>
        `;
    }

    public restoreWebview(webviewPanel: vscode.WebviewPanel, state?: any) {
        this.panel = webviewPanel;
        // Se houver um estado, tentamos restaurar o item que estava sendo editado/adicionado
        this.currentItemForForm = state?.itemForForm || createDefaultUrlItem();
        this.panel.webview.html = this.getFormHtml(this.currentItemForForm);

        this.panel.onDidDispose(() => {
            this.panel = undefined;
            this.currentItemForForm = undefined;
            if (this.resolvePromise) {
                this.resolvePromise(undefined);
                this.resolvePromise = undefined;
            }
        }, null, this.context.subscriptions);

        this.panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message),
            undefined,
            this.context.subscriptions
        );

        // Se houver um 'resolvePromise' pendente, significa que o painel foi recriado
        // durante uma operação de 'showForm'. Precisamos re-atribuir o resolvePromise.
        // Isso é um pouco complexo e depende de como o VS Code lida com a serialização.
        // Para simplificar, vamos assumir que se o painel é restaurado e há um resolvePromise,
        // é provável que o usuário tenha fechado e reaberto o VS Code, e a promessa original se perdeu.
        // O mais seguro é limpar o resolvePromise aqui se não estivermos explicitamente
        // restaurando um estado que requer a resolução da promessa.
        // No entanto, a lógica atual de onDidDispose já lida com a limpeza.
    }

    // Adicionar método para persistir estado se necessário para restauração completa
    public persistState(): any {
        if (this.panel) {
            return { itemForForm: this.currentItemForForm };
        }
        return undefined;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
