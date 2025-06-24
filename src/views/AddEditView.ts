import * as vscode from 'vscode';
import { UrlItem, createDefaultUrlItem } from '../models/UrlItem';

export class AddEditView {
  private panel: vscode.WebviewPanel | undefined;
  private resolvePromise: ((value: UrlItem | Omit<UrlItem, 'id' | 'lastStatus' | 'lastChecked'> | undefined) => void) | undefined;
  private currentItemForForm: UrlItem | Omit<UrlItem, 'id' | 'lastStatus' | 'lastChecked'> | undefined;

  constructor(private context: vscode.ExtensionContext) { }

  public async showAddForm(): Promise<Omit<UrlItem, 'id' | 'lastStatus' | 'lastChecked'> | undefined> {
    this.currentItemForForm = createDefaultUrlItem();
    // Default interval for a new item is 60 seconds.
    // The form will display this as 60 and 'seconds' selected.
    this.currentItemForForm.interval = 60;
    return this.showForm('Add URL Item', this.currentItemForForm);
  }

  public async showEditForm(item: UrlItem): Promise<UrlItem | undefined> {
    this.currentItemForForm = { ...item }; // Clonar para evitar mutação direta
    // The form will derive displayIntervalValue and displayIntervalUnit from item.interval
    return this.showForm('Edit URL Item', this.currentItemForForm);
  }

  private async showForm(title: string, itemData?: UrlItem | Omit<UrlItem, 'id' | 'lastStatus' | 'lastChecked'>): Promise<any> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      // Pass itemData to ensure the correct data is used for the form
      this.createOrShowPanel(title, itemData || this.currentItemForForm);
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
        'urlMonitor.addEdit',
        title,
        column || vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'resources')]
        }
      );

      this.panel.webview.html = this.getFormHtml(itemData);

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
    }
  }

  private handleMessage(message: any) {
    switch (message.command) {
      case 'save':
        if (this.resolvePromise) {
          const dataToSave = message.data;
          const rawIntervalInput = parseInt(dataToSave.intervalValue);

          // Basic validation (already done in webview, but good for robustness)
          if (isNaN(rawIntervalInput) || rawIntervalInput < 1) {
            // vscode.window.showErrorMessage('Interval must be a positive number (at least 1).');
            // Panel remains open due to webview validation.
            return;
          }

          let intervalInSeconds = rawIntervalInput;
          if (dataToSave.intervalUnit === 'minutes') {
            intervalInSeconds = rawIntervalInput * 60;
          }

          const MIN_INTERVAL_SECONDS = 5;
          if (intervalInSeconds < MIN_INTERVAL_SECONDS) {
            // vscode.window.showErrorMessage(`Check interval is too short. Minimum is ${MIN_INTERVAL_SECONDS} seconds. You tried to set ${rawIntervalInput} ${dataToSave.intervalUnit} (${intervalInSeconds}s).`);
            // Panel remains open due to webview validation.
            return;
          }

          const finalData: any = {
            name: dataToSave.name,
            url: dataToSave.url,
            method: dataToSave.method,
            interval: intervalInSeconds, // Final interval in seconds
            expectedStatusCode: dataToSave.expectedStatusCode,
            headers: dataToSave.headers,
            username: dataToSave.username,
            password: dataToSave.password,
          };

          if (this.currentItemForForm && 'id' in this.currentItemForForm) {
            finalData.id = (this.currentItemForForm as UrlItem).id;
          }

          this.resolvePromise(finalData as UrlItem | Omit<UrlItem, 'id' | 'lastStatus' | 'lastChecked'>);
          this.resolvePromise = undefined;
          this.panel?.dispose(); // Dispose panel on successful save
        }
        break;
      case 'cancel':
        if (this.resolvePromise) {
          this.resolvePromise(undefined);
          this.resolvePromise = undefined;
        }
        this.panel?.dispose();
        break;
      case 'showError': // This message comes from the webview for its own validation
        vscode.window.showErrorMessage(message.message);
        break;
      default:
        vscode.window.showWarningMessage(`Received unknown message from webview: ${JSON.stringify(message)}`);
        break;
    }
  }

  private getFormHtml(item?: UrlItem | Omit<UrlItem, 'id' | 'lastStatus' | 'lastChecked'>): string {
    const itemToRender = item || createDefaultUrlItem();
    const isEditMode = item && 'id' in item;
    const nonce = getNonce();

    let displayIntervalValue: number;
    let displayIntervalUnit: 'seconds' | 'minutes' | 'hours';

    const currentIntervalInSeconds = itemToRender.interval || 60; // Stored or default (60s for new)

    if (!isEditMode) { // Add mode
      // For a new item, default display is 60 seconds, but show 1 minute if possible
      if (currentIntervalInSeconds % 60 === 0 && currentIntervalInSeconds >= 60) {
        displayIntervalValue = currentIntervalInSeconds / 60;
        displayIntervalUnit = 'minutes';
      } else {
        displayIntervalValue = currentIntervalInSeconds;
        displayIntervalUnit = 'seconds';
      }
    } else { // Edit mode
      // Determine best unit for display (hours > minutes > seconds)
      displayIntervalUnit = 'seconds';
      // If interval is a clean multiple of 60, display in minutes
      if (currentIntervalInSeconds % 60 === 0 && currentIntervalInSeconds >= 60) {
        displayIntervalValue = currentIntervalInSeconds / 60;
        displayIntervalUnit = 'minutes';
      } else {
        displayIntervalValue = currentIntervalInSeconds;
        displayIntervalUnit = 'seconds';
      }
      if (currentIntervalInSeconds % 3600 === 0 && currentIntervalInSeconds >= 3600) {
        displayIntervalValue = currentIntervalInSeconds / 3600;
        displayIntervalUnit = 'hours';
      }
    }

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
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
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  gap: 6px;
              }
              .header-actions {
                  display: flex;
                  gap: 10px;
                  align-items: center;
              }
              .header h2 {
                  margin: 0;
                  color: var(--vscode-sideBarTitle-foreground, var(--vscode-tab-activeForeground));
              }
              .form-container {
                  padding: 15px;
                  overflow-y: auto;
                 /*  height: calc(100vh - 60px - 70px);  *//* Adjusted for header and buttons */
                  box-sizing: border-box;
              }
              .form-group { margin-bottom: 15px; }
              label { display: block; margin-bottom: 5px; font-weight: bold; }
              input[type="text"],
              input[type="url"],
              input[type="number"],
              input[type="password"],
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
                  padding: 15px;
                  border-top: 1px solid var(--vscode-editorGroup-border);
                  display: flex;
                  justify-content: flex-end;
                  gap: 10px;
                  position: sticky;
                  bottom: 0;
                  background-color: var(--vscode-editor-background);
                  z-index: 10;
                  height: 70px;
                  box-sizing: border-box;
                  align-items: center;
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
              button.secondary {
                  background: transparent;
                  color: var(--vscode-button-foreground);
                  border: 1px solid var(--vscode-button-border, var(--vscode-contrastBorder));
              }
              button.secondary:hover {
                  background: var(--vscode-button-hoverBackground);
                  color: var(--vscode-button-foreground);
              }
              .advanced { margin-top: 20px; border-top: 1px solid var(--vscode-editorGroup-border); padding-top: 20px; }
              .form-row { display: flex; gap: 15px; }
              .form-row .form-group { flex: 1; }
              textarea { min-height: 80px; resize: vertical; }
              .interval-group {
                  display: flex;
                  align-items: center;
                  gap: 5px;
              }
              .interval-group input[type="number"] {
                  flex-grow: 1;
                  width: auto;
              }
               .interval-group select {
                  width: auto;
                  flex-shrink: 0;
                  min-width: 80px;
               }
               .interval-group input[type="number"]::-webkit-outer-spin-button,
               .interval-group input[type="number"]::-webkit-inner-spin-button {
                   -webkit-appearance: none;
                   margin: 0;
              }
              /* Method-specific colors */
              #method { font-weight: bold; }
              option[data-method="GET"] { color: #6bdd9a; font-weight: bold; }
              option[data-method="POST"] { color: #ffe47e; font-weight: bold; }
              option[data-method="PUT"] { color: #74aef6; font-weight: bold; }
              option[data-method="DELETE"] { color: #f79a8e; font-weight: bold; }
              option[data-method="PATCH"] { color: #c0a8e1; font-weight: bold; }
              option[data-method="OPTIONS"] { color: #f15eb0; font-weight: bold; }
              option[data-method="HEAD"] { color: #6bdd9a; font-weight: bold; }
          </style>
      </head>
      <body>
         <div class="header">
          <h2>${isEditMode ? 'Edit' : 'Add'} URL Item</h2>
          <div class="header-actions">
          <button id="cancel" class="secondary">Cancel</button>
          <button id="save">Save</button>
          </div>
        </div>
        <div class="form-container">
          <div class="form-group">
            <label for="name">Item Name *</label>
            <input type="text" id="name" value="${itemToRender.name || ''}" required>
          </div>
          <div class="form-group">
              <label for="url">URL *</label>
              <input type="url" id="url" value="${itemToRender.url || ''}" required placeholder="https://example.com/api/status">
          </div>
          <div class="advanced">
            <h3>Advanced Options</h3>
            <div class="form-row">
              <div class="form-group">
                <label for="method">Request Method</label>
                <select id="method">
                  <option value="GET" data-method="GET" ${itemToRender.method === 'GET' ? 'selected' : ''}>GET</option>
                  <option value="POST" data-method="POST" ${itemToRender.method === 'POST' ? 'selected' : ''}>POST</option>
                  <option value="PUT" data-method="PUT" ${itemToRender.method === 'PUT' ? 'selected' : ''}>PUT</option>
                  <option value="DELETE" data-method="DELETE" ${itemToRender.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                  <option value="PATCH" data-method="PATCH" ${itemToRender.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
                  <option value="OPTIONS" data-method="OPTIONS" ${itemToRender.method === 'OPTIONS' ? 'selected' : ''}>OPTIONS</option>
                  <option value="HEAD" data-method="HEAD" ${itemToRender.method === 'HEAD' ? 'selected' : ''}>HEAD</option>
                </select>
              </div>
              <div class="form-group">
                <label for="statusCode">Expected Status Code</label>
                <input type="number" id="statusCode" value="${itemToRender.expectedStatusCode || 200}" min="100" max="599">
              </div>
              <div class="form-group">
                <label for="intervalValue">Check Interval</label>
                <div class="interval-group">
                  <input type="number" id="intervalValue" value="${displayIntervalValue}" min="1">
                  <select id="intervalUnit">
                    <option value="seconds" ${displayIntervalUnit === 'seconds' ? 'selected' : ''}>Seconds</option>
                    <option value="minutes" ${displayIntervalUnit === 'minutes' ? 'selected' : ''}>Minutes</option>
                    <option value="hours" ${displayIntervalUnit === 'hours' ? 'selected' : ''}>Hours</option>
                  </select>
                </div>
              </div>
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
        <script nonce="${nonce}">
            (function() {
                const vscode = acquireVsCodeApi();
                const nameInput = document.getElementById('name');
                const urlInput = document.getElementById('url');
                const methodSelect = document.getElementById('method');
                const intervalValueInput = document.getElementById('intervalValue');
                const statusCodeInput = document.getElementById('statusCode');
                const headersTextarea = document.getElementById('headers');
                const usernameInput = document.getElementById('username');
                const passwordInput = document.getElementById('password');
                const intervalUnitSelect = document.getElementById('intervalUnit');

                const methodColorMap = {
                    'GET': '#6bdd9a',
                    'POST': '#ffe47e',
                    'PUT': '#74aef6',
                    'DELETE': '#f79a8e',
                    'PATCH': '#c0a8e1',
                    'OPTIONS': '#f15eb0',
                    'HEAD': '#6bdd9a'
                };

                function updateMethodSelectColor() {
                    const selectedMethod = methodSelect.value;
                    // Use a fallback to the default text color if something goes wrong
                    methodSelect.style.color = methodColorMap[selectedMethod] || 'var(--vscode-input-foreground)';
                }

                methodSelect.addEventListener('change', updateMethodSelectColor);
                // Set initial color on load
                updateMethodSelectColor();
                
                document.getElementById('cancel').addEventListener('click', () => {
                    vscode.postMessage({ command: 'cancel' });
                });
                
                document.getElementById('save').addEventListener('click', () => {
                    const name = nameInput.value;
                    const url = urlInput.value;
                    const trimmedUrl = url.trim();
                    
                    if (!name.trim()) {
                        vscode.postMessage({ command: 'showError', message: 'Item Name is required.' });
                        nameInput.focus();
                        return;
                    }
                    if (!trimmedUrl) {
                        vscode.postMessage({ command: 'showError', message: 'URL is required.' });
                        urlInput.focus();
                        return;
                    }
                    try {
                        // The URL constructor is strict and requires a protocol (e.g. http://).
                        // This ensures that the URL is well-formed before saving.
                        new URL(trimmedUrl);
                    } catch (e) {
                        // Provide a more useful error message if the protocol is missing.
                        vscode.postMessage({ command: 'showError', message: 'Invalid URL. Please include the protocol (e.g. http:// or https://).' });
                        urlInput.focus();
                        return;
                    }
                    const intervalValueStr = intervalValueInput.value;
                    const selectedUnit = intervalUnitSelect.value;
                    const numInterval = parseInt(intervalValueStr);
                    if (isNaN(numInterval) || numInterval < 1) {
                      vscode.postMessage({ command: 'showError', message: 'Check Interval must be a positive number (at least 1).' });
                      intervalValueInput.focus();
                      return;
                    }
                    let intervalInSecondsClientCheck = numInterval;
                    if (selectedUnit === 'minutes') {
                      intervalInSecondsClientCheck = numInterval * 60;
                    } else if (selectedUnit === 'hours') {
                      intervalInSecondsClientCheck = numInterval * 3600;
                    }
                    const MIN_INTERVAL_SECONDS = 5; // This should match the backend constant
                    if (intervalInSecondsClientCheck < MIN_INTERVAL_SECONDS) {
                      vscode.postMessage({ 
                        command: 'showError', 
                        message: \`Check interval is too short. Minimum is \${MIN_INTERVAL_SECONDS} seconds. You entered \${numInterval} \${selectedUnit} (\${intervalInSecondsClientCheck}s).\`
                      });
                      intervalValueInput.focus();
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
                            vscode.postMessage({ command: 'showError', message: 'Invalid JSON format for Headers. ' + (e instanceof Error ? e.message : String(e)) });
                            headersTextarea.focus();
                            return;
                        }
                    }
                    
                    const data = {
                        name: name.trim(),
                        url: trimmedUrl,
                        method: methodSelect.value,
                        intervalValue: numInterval.toString(), 
                        intervalUnit: selectedUnit,
                        expectedStatusCode: parseInt(statusCodeInput.value) || 200,
                        headers: headers,
                        username: usernameInput.value.trim() || undefined,
                        password: passwordInput.value || undefined
                    };
                                            
                    vscode.postMessage({
                        command: 'save',
                        data: data
                    });
                });
            }());
        </script>
      </body>
      </html>
      `;
  }

  public restoreWebview(webviewPanel: vscode.WebviewPanel, state?: any) {
    this.panel = webviewPanel;
    this.currentItemForForm = state?.itemForForm || createDefaultUrlItem();
    // When restoring, ensure the correct item data is used to generate HTML
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
