import * as vscode from 'vscode';
import { UrlItem, createDefaultUrlItem, AuthConfig, RequestBody, QueryParam } from '../models/UrlItem';

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
        this.resolvePromise?.(undefined);
        this.resolvePromise = undefined;
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
          if (isNaN(rawIntervalInput) || rawIntervalInput < 1) return;

          let intervalInSeconds = rawIntervalInput;
          if (dataToSave.intervalUnit === 'minutes') intervalInSeconds = rawIntervalInput * 60;

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

  private getWebviewScript(itemToRender: any, queryParams: any): string {
    // IMPORTANT: This entire string must be valid JavaScript. No TypeScript syntax (like 'as Type')
    // or unescaped template literals (backticks) that could conflict with the outer HTML template.
    return `
      // console.log('Webview script started!'); // Removed debug log
      (function() {
        const vscode = acquireVsCodeApi();
        const nameInput = document.getElementById('name');
        const urlInput = document.getElementById('url');
        const methodSelect = document.getElementById('method');
        const intervalValueInput = document.getElementById('intervalValue');
        const statusCodeInput = document.getElementById('statusCode');
        const headersContainer = document.getElementById('headers-container');
        const addHeaderButton = document.getElementById('add-header');
        const queryParamsContainer = document.getElementById('query-params-container');
        const addQueryParamButton = document.getElementById('add-query-param');
        const bodyTypeSelect = document.getElementById('bodyType');
        const rawBodyTextarea = document.getElementById('rawBody');
        const bodyRawContainer = document.getElementById('body-raw-container');
        const intervalUnitSelect = document.getElementById('intervalUnit');
        const authTypeSelect = document.getElementById('authType');
        let isProgrammaticUpdate = false;

        const methodColorMap = {
          'GET': '#6bdd9a', 'POST': '#ffe47e', 'PUT': '#74aef6', 'DELETE': '#f79a8e',
          'PATCH': '#c0a8e1', 'OPTIONS': '#f15eb0', 'HEAD': '#6bdd9a'
        };

        function updateMethodSelectColor() {
          const selectedMethod = methodSelect.value;
          methodSelect.style.color = methodColorMap[selectedMethod] || 'var(--vscode-input-foreground)';
        }

        methodSelect.addEventListener('change', updateMethodSelectColor);
        updateMethodSelectColor();

        function updateUrlFromParams() {
          if (isProgrammaticUpdate) return;
          isProgrammaticUpdate = true;
          try {
            let baseUrl = (urlInput.value.split('?')[0] || '').trim();
            const params = new URLSearchParams();
            document.querySelectorAll('#query-params-container .key-value-row').forEach(row => {
              const keyInput = row.querySelector('.query-param-key');
              const valueInput = row.querySelector('.query-param-value');
              const key = keyInput?.value.trim();
              const value = valueInput?.value.trim();
              if (key) params.append(key, value);
            });
            const queryString = params.toString();
            urlInput.value = queryString ? baseUrl + '?' + queryString : baseUrl;
          } finally {
            isProgrammaticUpdate = false;
          }
        }

        function updateParamsFromUrl() {
          if (isProgrammaticUpdate) return;
          isProgrammaticUpdate = true;
          try {
            const fullUrl = urlInput.value.trim();
            if (!fullUrl) {
              queryParamsContainer.innerHTML = '';
              return;
            }
            let url;
            try {
              url = new URL(fullUrl);
            } catch (e) {
              return; // URL is not valid yet (e.g., user is typing). Do not extract params.
            }

            queryParamsContainer.innerHTML = '';
            url.searchParams.forEach((value, key) => {
              queryParamsContainer.appendChild(createQueryParamRow(key, value));
            });
            urlInput.value = url.origin + url.pathname;
          } finally {
            isProgrammaticUpdate = false;
          }
        }

        urlInput.addEventListener('blur', updateParamsFromUrl);
        queryParamsContainer.addEventListener('input', updateUrlFromParams);
        queryParamsContainer.addEventListener('click', (event) => {
          if (event.target && event.target.classList.contains('remove-button')) {
            event.target.closest('.key-value-row')?.remove();
            updateUrlFromParams();
          }
        });

        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');

        function switchTab(tabId) {
          tabButtons.forEach(button => button.classList.remove('active'));
          tabContents.forEach(content => content.classList.remove('active'));

          document.querySelector('[data-tab="' + tabId + '"]')?.classList.add('active');
          document.getElementById('tab-' + tabId)?.classList.add('active');
        }

        tabButtons.forEach(button => {
          button.addEventListener('click', () => {
            switchTab(button.dataset.tab || '');
          });
        });

        switchTab('params');

        function createQueryParamRow(key = '', value = '') {
          const row = document.createElement('div');
          row.classList.add('key-value-row');

          const keyInput = document.createElement('input');
          keyInput.type = 'text';
          keyInput.className = 'query-param-key';
          keyInput.value = key;
          keyInput.placeholder = 'Key';
          row.appendChild(keyInput);

          const valueInput = document.createElement('input');
          valueInput.type = 'text';
          valueInput.className = 'query-param-value';
          valueInput.value = value;
          valueInput.placeholder = 'Value';
          row.appendChild(valueInput);

          const removeButton = document.createElement('button');
          removeButton.type = 'button';
          removeButton.className = 'remove-button secondary small-button';
          removeButton.textContent = 'X';
          row.appendChild(removeButton);
          
          return row;
        }

        addQueryParamButton.addEventListener('click', () => {
          queryParamsContainer.appendChild(createQueryParamRow());
          updateUrlFromParams();
        });

        // --- Headers Tab Logic ---
        function createHeaderRow(key = '', value = '') {
          const row = document.createElement('div');
          row.classList.add('key-value-row');

          const keyInput = document.createElement('input');
          keyInput.type = 'text';
          keyInput.className = 'header-key';
          keyInput.value = key;
          keyInput.placeholder = 'Key (common or custom)';
          keyInput.setAttribute('list', 'header-suggestions');
          row.appendChild(keyInput);

          const valueInput = document.createElement('input');
          valueInput.type = 'text';
          valueInput.className = 'header-value';
          valueInput.value = value;
          valueInput.placeholder = 'Value';
          row.appendChild(valueInput);

          const removeButton = document.createElement('button');
          removeButton.type = 'button';
          removeButton.className = 'remove-button secondary small-button';
          removeButton.textContent = 'X';
          row.appendChild(removeButton);
          
          return row;
        }

        addHeaderButton.addEventListener('click', () => {
          headersContainer.appendChild(createHeaderRow());
        });

        headersContainer.addEventListener('click', (event) => {
          if (event.target && event.target.classList.contains('remove-button')) {
            event.target.closest('.key-value-row')?.remove();
          }
        });

        // These values are injected from the outer TypeScript template, so they need to be stringified.
        const initialQueryParams = ${JSON.stringify(queryParams)};
        const initialUrl = ${JSON.stringify(itemToRender.url || '')};
        const initialHeaders = ${JSON.stringify(itemToRender.headers || {})};

        urlInput.value = initialUrl;
        initialQueryParams.forEach(param => {
          queryParamsContainer.appendChild(createQueryParamRow(param.key, param.value));
        });
        updateUrlFromParams();

        // Populate initial headers
        for (const key in initialHeaders) {
          if (Object.prototype.hasOwnProperty.call(initialHeaders, key)) {
            headersContainer.appendChild(createHeaderRow(key, initialHeaders[key]));
          }
        }

        function switchBodyView(bodyType) {
          bodyRawContainer.style.display = (bodyType === 'raw') ? 'block' : 'none';
        }

        bodyTypeSelect.addEventListener('change', (e) => {
          switchBodyView(e.target.value);
        });

        function switchAuthView(authType) {
          document.querySelectorAll('.auth-fields').forEach(el => el.style.display = 'none');
          const selectedAuthContainer = document.getElementById('auth-' + authType);
          if (selectedAuthContainer) {
            selectedAuthContainer.style.display = 'block';
          }
        }

        authTypeSelect.addEventListener('change', (e) => {
          switchAuthView(e.target.value);
        });

        switchAuthView(authTypeSelect.value);
        switchBodyView(bodyTypeSelect.value);
        
        // Beautify for Body
        const rawBodyLanguageSelect = document.getElementById('rawBodyLanguage');
        const beautifyBtn = document.getElementById('beautify-btn');

        if (beautifyBtn && rawBodyLanguageSelect && rawBodyTextarea) {
            beautifyBtn.addEventListener('click', () => {
                const language = rawBodyLanguageSelect.value;
                const currentBody = rawBodyTextarea.value;

                if (!currentBody.trim()) {
                    return; // Nothing to beautify
                }

                try {
                    if (language === 'json') {
                        const jsonObj = JSON.parse(currentBody);
                        rawBodyTextarea.value = JSON.stringify(jsonObj, null, 2);
                    } else {
                        vscode.postMessage({ command: 'showError', message: 'Beautify for ' + language.toUpperCase() + ' is not yet implemented.' });
                    }
                } catch (e) {
                    vscode.postMessage({ command: 'showError', message: 'Invalid JSON format. Cannot beautify.' });
                }
            });
        }
        
        document.getElementById('cancel')?.addEventListener('click', () => {
          vscode.postMessage({ command: 'cancel' });
        });
        
        document.getElementById('save')?.addEventListener('click', () => {
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
            new URL(trimmedUrl);
          } catch (e) {
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
          const MIN_INTERVAL_SECONDS = 5;
          if (intervalInSecondsClientCheck < MIN_INTERVAL_SECONDS) {
            vscode.postMessage({ 
              command: 'showError', 
              message: 'Check interval is too short. Minimum is ' + MIN_INTERVAL_SECONDS + ' seconds. You entered ' + numInterval + ' ' + selectedUnit + ' (' + intervalInSecondsClientCheck + 's).'
            });
            intervalValueInput.focus();
            return;
          }
          
          const headers = {};
          headersContainer.querySelectorAll('.key-value-row').forEach(row => {
            const keyInput = row.querySelector('.header-key');
            const valueInput = row.querySelector('.header-value');
            if (keyInput && valueInput) {
              const key = keyInput.value.trim();
              const value = valueInput.value.trim();
              if (key) {
                headers[key] = value;
              }
            }
          });

          const queryParams = [];
          document.querySelectorAll('#query-params-container .key-value-row').forEach(row => {
              const keyInput = row.querySelector('.query-param-key');
              const valueInput = row.querySelector('.query-param-value');
              if (keyInput && valueInput) {
                  const key = keyInput.value.trim();
                  const value = valueInput.value.trim();
                  if (key || value) {
                      queryParams.push({ key, value });
                  }
              }
          });

          const bodyType = bodyTypeSelect.value;
          let bodyData = { type: 'none' };
          if (bodyType === 'raw') {
              bodyData = { type: 'raw', content: rawBodyTextarea.value };
          }
          const authType = authTypeSelect.value;
          let authData = { type: 'noauth' };
          if (authType === 'basic') {
              authData = {
                  type: 'basic',
                  username: document.getElementById('basicUsername').value.trim(),
                  password: document.getElementById('basicPassword').value
              };
          } else if (authType === 'apikey') {
              authData = {
                  type: 'apikey',
                  key: document.getElementById('apiKeyKey').value.trim(),
                  value: document.getElementById('apiKeyValue').value.trim(),
                  addTo: document.getElementById('apiKeyAddTo').value
              };
          } else if (authType === 'bearer') {
              authData = {
                  type: 'bearer',
                  token: document.getElementById('bearerToken').value.trim()
              };
          } else if (authType === 'oauth2') {
              authData = {
                  type: 'oauth2',
                  token: document.getElementById('oauth2Token').value.trim(),
                  headerPrefix: document.getElementById('oauth2HeaderPrefix').value.trim() || 'Bearer'
              };
          }
          
          const data = {
              name: name.trim(),
              url: trimmedUrl,
              method: methodSelect.value,
              intervalValue: numInterval.toString(),
              intervalUnit: selectedUnit,
              expectedStatusCode: parseInt(statusCodeInput.value) || 200,
              headers: Object.keys(headers).length > 0 ? headers : undefined,
              queryParams: queryParams,
              auth: authData,
              body: bodyData
          };
                                  
          // console.log('Webview: Data being sent to extension:', data); // Removed debug log
          vscode.postMessage({
              command: 'save',
              data: data
          });
        });
      }());
    `;
  }

  private getFormHtml(item?: UrlItem | Omit<UrlItem, 'id' | 'lastStatus' | 'lastChecked'>): string {
    const itemToRender = item || createDefaultUrlItem();
    const auth = itemToRender.auth || { type: 'noauth' };
    const isEditMode = item && 'id' in item;
    const queryParams = itemToRender.queryParams || [];
    const body = itemToRender.body || { type: 'none' };
    const nonce = getNonce();

    let displayIntervalValue: number;
    let displayIntervalUnit: 'seconds' | 'minutes' | 'hours';

    const currentIntervalInSeconds = itemToRender.interval || 60;

    if (!isEditMode) {
      if (currentIntervalInSeconds % 60 === 0 && currentIntervalInSeconds >= 60) {
        displayIntervalValue = currentIntervalInSeconds / 60;
        displayIntervalUnit = 'minutes';
      } else {
        displayIntervalValue = currentIntervalInSeconds;
        displayIntervalUnit = 'seconds';
      }
    } else {
      displayIntervalUnit = 'seconds';
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

    // Get the pure JavaScript content
    const webviewScriptContent = this.getWebviewScript(itemToRender, queryParams);

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
              textarea{
                  width: 100%;
                  padding: 6px;
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
              .advanced { margin-top: 10px; border-top: 1px solid var(--vscode-editorGroup-border); padding-top: 10px; }
              .form-row { display: flex; gap: 15px; }
              .form-row .form-group { flex: 1; }
              .form-row .col-1 { flex: 1; }
              .form-row .col-2 { flex: 2; }
              .form-row .col-3 { flex: 3; }
              .form-row .col-4 { flex: 4; }
              .form-row .col-5 { flex: 5; }
              .form-row .col-6 { flex: 6; }
              .form-row .col-7 { flex: 7; }
              .form-row .col-8 { flex: 8; }
              .form-row .col-9 { flex: 9; }
              .form-row .col-10 { flex: 10; }
              .form-row .col-11 { flex: 11; }
              .form-row .col-12 { flex: 12; }
              textarea { min-height: 80px; resize: vertical; }
              .interval-group {
                  display: flex;
                  align-items: center;
                  gap: 5px;
              }
              .interval-group input[type="number"] {
                  flex-grow: 1;
                  /* width: auto; */
                  min-width: 50px;
              }
               .interval-group select {
                  width: auto;
                  flex-shrink: 0;
               }
               .interval-group input[type="number"]::-webkit-outer-spin-button,
               .interval-group input[type="number"]::-webkit-inner-spin-button {
                   -webkit-appearance: none;
                   margin: 0;
              }
              /* Tabs styling */
              .tabs {
                  margin-top: 20px;
                  border: 1px solid var(--vscode-editorGroup-border);
                  border-radius: var(--input-border-radius, 3px);
              }
              .tab-buttons {
                  display: flex;
                  border-bottom: 1px solid var(--vscode-editorGroup-border);
              }
              .tab-button {
                  flex: 1;
                  padding: 10px 15px;
                  background: var(--vscode-tab-inactiveBackground);
                  color: var(--vscode-tab-inactiveForeground);
                  border: none;
                  border-right: 1px solid var(--vscode-editorGroup-border);
                  cursor: pointer;
                  font-weight: bold;
                  text-align: center;
                  border-radius: 0; /* Override default button radius */
              }
              .tab-button:last-child {
                  border-right: none;
              }
              .tab-button.active {
                  background: var(--vscode-tab-activeBackground);
                  color: var(--vscode-tab-activeForeground);
                  border-bottom: 2px solid var(--vscode-tab-activeBorder);
                  margin-bottom: -1px; /* Overlap border */
              }
              .tab-button:hover:not(.active) {
                  background: var(--vscode-tab-hoverBackground);
              }
              .auth-fields {
                  border-left: 2px solid var(--vscode-input-border, var(--vscode-contrastBorder));
                  padding-left: 15px;
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
              /* Tab content */
              .tab-content {
                  padding: 15px;
                  display: none;
              }
              .tab-content.active {
                  display: block;
              }
              .small-button {
                  padding: 5px 10px;
                  font-size: 0.9em;
              }
              .key-value-row {
                  display: flex;
                  gap: 10px;
                  margin-bottom: 10px;
                  align-items: center;
              }
          </style>
      </head>
      <body>
         <div class="header">
          <h2>${isEditMode ? 'Edit' : 'Add'} URL Item</h2>
          <div class="header-actions">
          <button id="cancel" class="secondary">Cancel</button>
          <button id="save" class="primary">Save</button>
          </div>
        </div>
        <div class="form-container">
          <div class="form-row">
            <div class="form-group col-8">
              <label for="name">Item Name *</label>
              <input type="text" id="name" value="${itemToRender.name || ''}" required>
            </div>
            <div class="form-group col-2">
              <label for="statusCode" style="min-width: 150px;">Expected Status Code</label>
              <input type="number" id="statusCode" value="${itemToRender.expectedStatusCode || 200}" min="100" max="599">
            </div>
            <div class="form-group col-2">
              <label for="intervalValue">Check Interval</label>
              <div class="interval-group ">
              <div class="form-group col-1">
                <input type="number" id="intervalValue" value="${displayIntervalValue}" min="1">
              </div>
              <div class="form-group col-1">
                <select id="intervalUnit">
                  <option value="seconds" ${displayIntervalUnit === 'seconds' ? 'selected' : ''}>Seconds</option>
                  <option value="minutes" ${displayIntervalUnit === 'minutes' ? 'selected' : ''}>Minutes</option>
                  <option value="hours" ${displayIntervalUnit === 'hours' ? 'selected' : ''}>Hours</option>
                </select>
                </div>
              </div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-1">
                <label for="method">Method</label>
                <select id="method" style="min-width: 70px;">
                  <option value="GET" data-method="GET" ${itemToRender.method === 'GET' ? 'selected' : ''}>GET</option>
                  <option value="POST" data-method="POST" ${itemToRender.method === 'POST' ? 'selected' : ''}>POST</option>
                  <option value="PUT" data-method="PUT" ${itemToRender.method === 'PUT' ? 'selected' : ''}>PUT</option>
                  <option value="DELETE" data-method="DELETE" ${itemToRender.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                  <option value="PATCH" data-method="PATCH" ${itemToRender.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
                  <option value="OPTIONS" data-method="OPTIONS" ${itemToRender.method === 'OPTIONS' ? 'selected' : ''}>OPTIONS</option>
                  <option value="HEAD" data-method="HEAD" ${itemToRender.method === 'HEAD' ? 'selected' : ''}>HEAD</option>
                </select>
              </div>
            <div class="form-group col-8">
              <label for="url">URL *</label>
              <input type="url" id="url" value="${itemToRender.url || ''}" required placeholder="https://example.com/api/status">
            </div>
          </div>

          <div class="advanced">
            <h2>Advanced Options</h2>

            <div class="tabs">
                <div class="tab-buttons">
                    <button class="tab-button active" data-tab="params">Parameters</button>
                    <button class="tab-button" data-tab="auth">Authorization</button>
                    <button class="tab-button" data-tab="headers">Headers</button>
                    <button class="tab-button" data-tab="body">Body</button>
                </div>

                <div id="tab-params" class="tab-content active">
                    <h4>Query Parameters</h4>
                    <div id="query-params-container">
                        <!-- Dynamic rows for key-value pairs -->
                    </div>
                    <button id="add-query-param" class="secondary small-button">Add Query Parameter</button>
                </div>

                <div id="tab-auth" class="tab-content">
                    <div class="form-group">
                        <h4>Authorization</h4>
                        <div class="form-group">
                            <label for="authType">Type</label>
                            <select id="authType">
                                <option value="noauth" ${auth.type === 'noauth' ? 'selected' : ''}>No Auth</option>
                                <option value="apikey" ${auth.type === 'apikey' ? 'selected' : ''}>API Key</option>
                                <option value="basic" ${auth.type === 'basic' ? 'selected' : ''}>Basic Auth</option>
                                <option value="bearer" ${auth.type === 'bearer' ? 'selected' : ''}>Bearer Token</option>
                                <option value="oauth2" ${auth.type === 'oauth2' ? 'selected' : ''}>OAuth 2.0</option>
                                <option value="awsv4" ${auth.type === 'awsv4' ? 'selected' : ''}>AWS Signature</option>
                                <option value="oauth1" ${auth.type === 'oauth1' ? 'selected' : ''}>OAuth 1.0</option>
                            </select>
                        </div>
                    </div>

                    <div id="auth-fields-container">
                        <!-- API Key -->
                        <div id="auth-apikey" class="auth-fields" style="display: none;">
                            <div class="form-row">
                                <div class="form-group"><label for="apiKeyKey">Key</label><input type="text" id="apiKeyKey" value="${auth.type === 'apikey' ? auth.key : ''}" placeholder="e.g. api_key"></div>
                                <div class="form-group"><label for="apiKeyValue">Value</label><input type="text" id="apiKeyValue" value="${auth.type === 'apikey' ? auth.value : ''}"></div>
                            </div>
                            <div class="form-group">
                                <label for="apiKeyAddTo">Add to</label>
                                <select id="apiKeyAddTo">
                                    <option value="header" ${auth.type === 'apikey' && auth.addTo === 'header' ? 'selected' : ''}>Header</option>
                                    <option value="query" ${auth.type === 'apikey' && auth.addTo === 'query' ? 'selected' : ''}>Query Params</option>
                                </select>
                            </div>
                        </div>
                        <!-- Basic Auth -->
                        <div id="auth-basic" class="auth-fields" style="display: none;">
                            <div class="form-row">
                                <div class="form-group"><label for="basicUsername">Username</label><input type="text" id="basicUsername" value="${auth.type === 'basic' ? auth.username : ''}"></div>
                                <div class="form-group"><label for="basicPassword">Password</label><input type="password" id="basicPassword" value="${auth.type === 'basic' ? auth.password : ''}"></div>
                            </div>
                        </div>
                        <!-- Bearer Token -->
                        <div id="auth-bearer" class="auth-fields" style="display: none;">
                            <div class="form-group"><label for="bearerToken">Token</label><textarea id="bearerToken" rows="3">${auth.type === 'bearer' ? auth.token : ''}</textarea></div>
                        </div>
                        <!-- OAuth 2.0 -->
                        <div id="auth-oauth2" class="auth-fields" style="display: none;">
                            <div class="form-group"><label for="oauth2Token">Access Token</label><textarea id="oauth2Token" rows="3">${auth.type === 'oauth2' ? auth.token : ''}</textarea></div>
                            <div class="form-group"><label for="oauth2HeaderPrefix">Header Prefix</label><input type="text" id="oauth2HeaderPrefix" value="${auth.type === 'oauth2' ? auth.headerPrefix : 'Bearer'}"></div>
                            <p>Note: The full OAuth 2.0 flow is not supported. Please provide a pre-existing token.</p>
                        </div>
                        <!-- AWS Signature -->
                        <div id="auth-awsv4" class="auth-fields" style="display: none;"><p>AWS Signature is not yet fully implemented for execution but settings will be saved.</p></div>
                        <!-- OAuth 1.0 -->
                        <div id="auth-oauth1" class="auth-fields" style="display: none;"><p>OAuth 1.0 is not yet fully implemented for execution but settings will be saved.</p></div>
                    </div>
                </div>

                <div id="tab-headers" class="tab-content">
                    <h4>Headers</h4>
                    <div id="headers-container">
                        <!-- Dynamic rows for key-value pairs -->
                    </div>
                    <button type="button" id="add-header" class="secondary small-button">Add Header</button>
                </div>

                <div id="tab-body" class="tab-content">
                    <h4>Request Body</h4>
                    <div class="form-group">
                        <label for="bodyType">Type</label>
                        <select id="bodyType">
                            <option value="none" ${body.type === 'none' ? 'selected' : ''}>none</option>
                            <option value="raw" ${body.type === 'raw' ? 'selected' : ''}>raw</option>
                            <!-- Add other types later if needed: form-data, x-www-form-urlencoded, binary, GraphQL -->
                        </select>
                    </div>
                    <div id="body-raw-container" style="display: none;">
                        <div class="form-group">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                <label for="rawBody" style="margin-bottom: 0;">Raw Body</label>
                                <div>
                                    <select id="rawBodyLanguage" style="width: auto; margin-right: 10px;">
                                        <option value="json">JSON</option>
                                        <option value="html">HTML</option>
                                        <option value="xml">XML</option>
                                        <option value="text" selected>Text</option>
                                    </select>
                                    <button type="button" id="beautify-btn" class="secondary small-button">Beautify</button>
                                </div>
                            </div>
                            <textarea id="rawBody" rows="10" placeholder="Enter raw request body (e.g., JSON, XML, text)">${body.type === 'raw' ? body.content : ''}</textarea>
                        </div>
                    </div>
                </div>
            </div>
          </div>
        </div>
        <script nonce="${nonce}">
            ${webviewScriptContent}
        </script>
        <datalist id="header-suggestions">
            <option value="A-IM"></option>
            <option value="Accept"></option>
            <option value="Accept-Charset"></option>
            <option value="Accept-Encoding"></option>
            <option value="Accept-Language"></option>
            <option value="Access-Control-Request-Method"></option>
            <option value="Access-Control-Request-Headers"></option>
            <option value="Authorization"></option>
            <option value="Cache-Control"></option>
            <option value="Connection"></option>
            <option value="Content-Length"></option>
            <option value="Content-Type"></option>
            <option value="Cookie"></option>
            <option value="Date"></option>
            <option value="DNT"></option>
            <option value="Expect"></option>
            <option value="Forwarded"></option>
            <option value="From"></option>
            <option value="Host"></option>
            <option value="If-Match"></option>
            <option value="If-Modified-Since"></option>
            <option value="If-None-Match"></option>
            <option value="If-Unmodified-Since"></option>
            <option value="Origin"></option>
            <option value="Pragma"></option>
            <option value="Referer"></option>
            <option value="User-Agent"></option>
            <option value="Upgrade-Insecure-Requests"></option>
            <option value="X-Requested-With"></option>
            <option value="X-Forwarded-For"></option>
            <option value="X-Forwarded-Proto"></option>
        </datalist>
      </body>
      </html>
      `;
  }

  public restoreWebview(webviewPanel: vscode.WebviewPanel, state?: any) {
    this.panel = webviewPanel;
    this.currentItemForForm = state?.itemForForm || createDefaultUrlItem();
    this.panel.webview.html = this.getFormHtml(this.currentItemForForm);

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
