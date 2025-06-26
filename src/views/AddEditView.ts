import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { UrlItem, createDefaultUrlItem } from '../models/UrlItem';

export class AddEditView {
    private panel: vscode.WebviewPanel | undefined;
    private resolvePromise: ((value: UrlItem | Omit<UrlItem, 'id' | 'lastStatus' | 'lastChecked'> | undefined) => void) | undefined;
    private currentItemForForm: UrlItem | Omit<UrlItem, 'id' | 'lastStatus' | 'lastChecked'> | undefined;

    constructor(private context: vscode.ExtensionContext) { }

    public async showAddForm(): Promise<Omit<UrlItem, 'id' | 'lastStatus' | 'lastChecked'> | undefined> {
        this.currentItemForForm = createDefaultUrlItem();
        this.currentItemForForm.interval = 60;
        return this.showForm('Add URL Item', this.currentItemForForm);
    }

    public async showEditForm(item: UrlItem): Promise<UrlItem | undefined> {
        const itemToEdit = { ...item };

        if ((itemToEdit as any).username) {
            itemToEdit.auth = {
                type: 'basic',
                username: (itemToEdit as any).username,
                password: (itemToEdit as any).password || ''
            };
            delete (itemToEdit as any).username;
            delete (itemToEdit as any).password;
        } else if (!itemToEdit.auth) {
            itemToEdit.auth = { type: 'noauth' };
        }

        this.currentItemForForm = itemToEdit;
        return this.showForm('Edit URL Item', this.currentItemForForm);
    }

    private async showForm(title: string, itemData?: UrlItem | Omit<UrlItem, 'id' | 'lastStatus' | 'lastChecked'>): Promise<any> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.createOrShowPanel(title, itemData || this.currentItemForForm);
        });
    }

    private createOrShowPanel(title: string, itemData?: UrlItem | Omit<UrlItem, 'id' | 'lastStatus' | 'lastChecked'>) {
        const column = vscode.window.activeTextEditor?.viewColumn;

        if (this.panel) {
            this.panel.title = title;
            this.panel.webview.html = this._getHtmlForWebview(); // Regenerate HTML to ensure URIs are fresh
            this.panel.reveal(column);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'urlMonitor.addEdit',
                title,
                column || vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(this.context.extensionUri, 'resources'),
                        vscode.Uri.joinPath(this.context.extensionUri, 'dist')
                    ]
                }
            );

            this.panel.webview.html = this._getHtmlForWebview(); // Generate HTML *after* the panel is created

            this.panel.onDidDispose(() => {
                this.panel = undefined;
                this.currentItemForForm = undefined;
                this.resolvePromise?.(undefined);
                this.resolvePromise = undefined;
            }, null, this.context.subscriptions);

            this.panel.webview.onDidReceiveMessage(
                message => this.handleMessage(message),
                undefined,
                this.context.subscriptions
            );
        }

        this.panel.webview.postMessage({
            command: 'loadData',
            data: itemData
        });
    }

    private handleMessage(message: any) {
        switch (message.command) {
            case 'save':
                if (this.resolvePromise) {
                    const dataToSave = message.data;

                    const rawIntervalInput = parseInt(dataToSave.intervalValue);
                    if (isNaN(rawIntervalInput) || rawIntervalInput < 1) return;

                    let intervalInSeconds = rawIntervalInput;
                    if (dataToSave.intervalUnit === 'minutes') {
                        intervalInSeconds = rawIntervalInput * 60;
                    } else if (dataToSave.intervalUnit === 'hours') {
                        intervalInSeconds = rawIntervalInput * 3600;
                    }

                    const MIN_INTERVAL_SECONDS = 5;
                    if (intervalInSeconds < MIN_INTERVAL_SECONDS) return;

                    const finalData: any = {
                        name: dataToSave.name,
                        url: (() => {
                            try {
                                const urlObject = new URL(dataToSave.url);
                                return urlObject.origin + urlObject.pathname;
                            } catch {
                                return dataToSave.url.split('?')[0];
                            }
                        })(),
                        method: dataToSave.method,
                        interval: intervalInSeconds,
                        expectedStatusCode: dataToSave.expectedStatusCode,
                        headers: dataToSave.headers,
                        queryParams: dataToSave.queryParams,
                        auth: dataToSave.auth,
                        body: dataToSave.body,
                    };

                    if (this.currentItemForForm && 'id' in this.currentItemForForm) {
                        finalData.id = (this.currentItemForForm as UrlItem).id;
                    }

                    this.resolvePromise(finalData as UrlItem | Omit<UrlItem, 'id' | 'lastStatus' | 'lastChecked'>);
                    this.resolvePromise = undefined;
                    this.panel?.dispose();
                }
                break;
            case 'cancel':
                this.resolvePromise?.(undefined);
                this.resolvePromise = undefined;
                this.panel?.dispose();
                break;
            case 'showError':
                vscode.window.showErrorMessage(message.message);
                break;
            default:
                // vscode.window.showWarningMessage(`Extension: Received unknown message from webview: ${JSON.stringify(message)}`); // Removed debug message
                break;
        }
    }

    private _getHtmlForWebview(): string {
        // This method should only be called when this.panel is defined.
        const panel = this.panel as vscode.WebviewPanel;

        const htmlPath = path.join(this.context.extensionPath, 'dist', 'webview', 'addEditView.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

        const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'addEditView.js'));
        const cssUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'addEditView.css'));
        const nonce = getNonce();

        htmlContent = htmlContent.replace(/{{cspSource}}/g, panel.webview.cspSource);
        htmlContent = htmlContent.replace(/{{nonce}}/g, nonce);
        htmlContent = htmlContent.replace('{{cssUri}}', cssUri.toString());
        htmlContent = htmlContent.replace('{{jsUri}}', scriptUri.toString());

        return htmlContent;
    }

    public restoreWebview(webviewPanel: vscode.WebviewPanel, state?: any) {
        this.panel = webviewPanel;
        this.currentItemForForm = state?.itemForForm || createDefaultUrlItem();
        this.panel.webview.html = this._getHtmlForWebview();

        this.panel.onDidDispose(() => {
            this.panel = undefined;
            this.currentItemForForm = undefined;
            this.resolvePromise?.(undefined);
            this.resolvePromise = undefined;
        }, null, this.context.subscriptions);

        this.panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message),
            undefined,
            this.context.subscriptions
        );

        this.panel.webview.postMessage({
            command: 'loadData',
            data: this.currentItemForForm
        });
    }

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
