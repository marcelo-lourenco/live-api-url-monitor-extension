import { UrlItem } from '../../models/UrlItem';

const vscode = acquireVsCodeApi();

// --- DOM Elements ---
const formTitle = document.getElementById('form-title') as HTMLHeadingElement;
const nameInput = document.getElementById('name') as HTMLInputElement;
const urlInput = document.getElementById('url') as HTMLInputElement;
const methodSelect = document.getElementById('method') as HTMLSelectElement;
const intervalValueInput = document.getElementById('intervalValue') as HTMLInputElement;
const statusCodeInput = document.getElementById('statusCode') as HTMLInputElement;
const headersContainer = document.getElementById('headers-container') as HTMLDivElement;
const addHeaderButton = document.getElementById('add-header') as HTMLButtonElement;
const queryParamsContainer = document.getElementById('query-params-container') as HTMLDivElement;
const addQueryParamButton = document.getElementById('add-query-param') as HTMLButtonElement;
const bodyTypeSelect = document.getElementById('bodyType') as HTMLSelectElement;
const rawBodyTextarea = document.getElementById('rawBody') as HTMLTextAreaElement;
const bodyRawContainer = document.getElementById('body-raw-container') as HTMLDivElement;
const divRawlanguage = document.getElementById('div-raw-language') as HTMLSelectElement;
const divBeautifyBtn = document.getElementById('div-beautify-btn') as HTMLSelectElement;
const intervalUnitSelect = document.getElementById('intervalUnit') as HTMLSelectElement;
const authTypeSelect = document.getElementById('authType') as HTMLSelectElement;
const logLevelSelect = document.getElementById('log-level') as HTMLSelectElement;

// --- Sidebar Elements ---
const sidebar = document.querySelector('.sidebar') as HTMLElement;
const sidebarToolbar = document.querySelector('.sidebar-toolbar') as HTMLElement;
const curlOutput = document.getElementById('curl-output') as HTMLElement;
const copyCurlButton = document.getElementById('copy-curl-button') as HTMLButtonElement;
const logsOutput = document.getElementById('logs-output') as HTMLDivElement;
const logSortButton = document.getElementById('log-sort-button') as HTMLButtonElement;
const logClearButton = document.getElementById('log-clear-button') as HTMLButtonElement;
const logRefreshButton = document.getElementById('log-refresh-button') as HTMLButtonElement;
const logFilterErrorsButton = document.getElementById('log-filter-errors-button') as HTMLButtonElement;

// --- State Variables ---
let isProgrammaticUpdate = false;
let activeSidebarPanel: string | null = null;
let currentItemId: string | null = null;
let currentLogs: any[] = [];
let logSortOrder: 'asc' | 'desc' = 'desc';
let showOnlyErrors = false;

const methodColorMap: Record<string, string> = {
    'GET': '#6bdd9a', 'POST': '#ffe47e', 'PUT': '#74aef6', 'DELETE': '#f79a8e',
    'PATCH': '#c0a8e1', 'OPTIONS': '#f15eb0', 'HEAD': '#6bdd9a'
};

function updateMethodSelectColor() {
    const selectedMethod = methodSelect.value;
    methodSelect.style.color = methodColorMap[selectedMethod] || 'var(--vscode-input-foreground)';
}

function updateUrlFromParams() {
    if (isProgrammaticUpdate) return;
    isProgrammaticUpdate = true;
    try {
        const baseUrl = (urlInput.value.split('?')[0] || '').trim();
        const params = new URLSearchParams();
        document.querySelectorAll('#query-params-container .key-value-row').forEach(row => {
            const keyInput = row.querySelector('.query-param-key') as HTMLInputElement;
            const valueInput = row.querySelector('.query-param-value') as HTMLInputElement;
            const key = keyInput?.value.trim();
            const value = valueInput?.value.trim();
            if (key) params.append(key, value);
        });
        const queryString = params.toString();
        urlInput.value = queryString ? `${baseUrl}?${queryString}` : baseUrl;
    } finally {
        isProgrammaticUpdate = false;
        updateCurlOnChange();
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
            return; // URL is not valid yet
        }

        queryParamsContainer.innerHTML = '';
        url.searchParams.forEach((value, key) => {
            queryParamsContainer.appendChild(createQueryParamRow(key, value));
        });
        urlInput.value = url.origin + url.pathname;
    } finally {
        isProgrammaticUpdate = false;
        updateCurlOnChange();
    }
}

function switchTab(tabId: string) {
    document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
    document.getElementById(`tab-${tabId}`)?.classList.add('active');
}

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

function switchBodyView(bodyType: string) {
    bodyRawContainer.style.display = (bodyType === 'raw') ? 'block' : 'none';
    divRawlanguage.style.display = (bodyType === 'raw') ? 'block' : 'none';
    divBeautifyBtn.style.display = (bodyType === 'raw') ? 'block' : 'none';
}

function switchAuthView(authType: string) {
    document.querySelectorAll('.auth-fields').forEach(el => (el as HTMLElement).style.display = 'none');
    const selectedAuthContainer = document.getElementById(`auth-${authType}`);
    if (selectedAuthContainer) {
        selectedAuthContainer.style.display = 'block';
    }
}

function initializeForm(item: UrlItem | Omit<UrlItem, 'id'>) {
    const isEditMode = 'id' in item;
    currentItemId = isEditMode ? item.id : null;
    currentLogs = [];
    logSortOrder = 'desc';
    showOnlyErrors = false;
    logFilterErrorsButton.classList.remove('active');
    updateLogSortButton();

    formTitle.textContent = isEditMode ? 'Edit URL Item' : 'Add URL Item';

    const itemToRender = item;
    const auth = itemToRender.auth || { type: 'noauth' };
    const queryParams = itemToRender.queryParams || [];
    const body = itemToRender.body || { type: 'none' };

    nameInput.value = itemToRender.name || '';
    logLevelSelect.value = itemToRender.logLevel || 'all';
    urlInput.value = itemToRender.url || '';
    methodSelect.value = itemToRender.method || 'GET';
    statusCodeInput.value = (itemToRender.expectedStatusCode || 200).toString();

    // Interval
    const currentIntervalInSeconds = itemToRender.interval || 60;
    if (currentIntervalInSeconds % 3600 === 0 && currentIntervalInSeconds >= 3600) {
        intervalValueInput.value = (currentIntervalInSeconds / 3600).toString();
        intervalUnitSelect.value = 'hours';
    } else if (currentIntervalInSeconds % 60 === 0 && currentIntervalInSeconds >= 60) {
        intervalValueInput.value = (currentIntervalInSeconds / 60).toString();
        intervalUnitSelect.value = 'minutes';
    } else {
        intervalValueInput.value = currentIntervalInSeconds.toString();
        intervalUnitSelect.value = 'seconds';
    }

    // Query Params
    queryParamsContainer.innerHTML = '';
    queryParams.forEach(param => {
        queryParamsContainer.appendChild(createQueryParamRow(param.key, param.value));
    });
    updateUrlFromParams();

    // Headers
    headersContainer.innerHTML = '';
    const initialHeaders = itemToRender.headers || {};
    for (const key in initialHeaders) {
        if (Object.prototype.hasOwnProperty.call(initialHeaders, key)) {
            headersContainer.appendChild(createHeaderRow(key, initialHeaders[key]));
        }
    }

    // Body
    bodyTypeSelect.value = body.type;
    if (body.type === 'raw') {
        rawBodyTextarea.value = body.content;
    }
    switchBodyView(body.type);

    // Auth
    authTypeSelect.value = auth.type;
    switch (auth.type) {
        case 'apikey':
            (document.getElementById('apiKeyKey') as HTMLInputElement).value = auth.key;
            (document.getElementById('apiKeyValue') as HTMLInputElement).value = auth.value;
            (document.getElementById('apiKeyAddTo') as HTMLSelectElement).value = auth.addTo;
            break;
        case 'basic':
            (document.getElementById('basicUsername') as HTMLInputElement).value = auth.username;
            (document.getElementById('basicPassword') as HTMLInputElement).value = auth.password || '';
            break;
        case 'bearer':
            (document.getElementById('bearerToken') as HTMLTextAreaElement).value = auth.token;
            break;
        case 'oauth2':
            (document.getElementById('oauth2Token') as HTMLTextAreaElement).value = auth.token;
            (document.getElementById('oauth2HeaderPrefix') as HTMLInputElement).value = auth.headerPrefix;
            break;
    }
    switchAuthView(auth.type);
    updateMethodSelectColor();
    updateCurlOnChange();
}

function gatherFormData(forCurl = false) {
    const name = nameInput.value;
    const url = urlInput.value;
    const trimmedUrl = url.trim();

    if (!forCurl) {
        if (!name.trim()) {
            vscode.postMessage({ command: 'showError', message: 'Item Name is required.' });
            nameInput.focus();
            return null;
        }
        if (!trimmedUrl) {
            vscode.postMessage({ command: 'showError', message: 'URL is required.' });
            urlInput.focus();
            return null;
        }
        try {
            new URL(trimmedUrl);
        } catch (e) {
            vscode.postMessage({ command: 'showError', message: 'Invalid URL. Please include the protocol (e.g. http:// or https://).' });
            urlInput.focus();
            return null;
        }

        const numInterval = parseInt(intervalValueInput.value);
        if (isNaN(numInterval) || numInterval < 1) {
            vscode.postMessage({ command: 'showError', message: 'Check Interval must be a positive number (at least 1).' });
            intervalValueInput.focus();
            return null;
        }
    }


    const headers: Record<string, string> = {};
    headersContainer.querySelectorAll('.key-value-row').forEach(row => {
        const key = (row.querySelector('.header-key') as HTMLInputElement).value.trim();
        const value = (row.querySelector('.header-value') as HTMLInputElement).value.trim();
        if (key) headers[key] = value;
    });

    const queryParams: { key: string, value: string }[] = [];
    document.querySelectorAll('#query-params-container .key-value-row').forEach(row => {
        const key = (row.querySelector('.query-param-key') as HTMLInputElement).value.trim();
        const value = (row.querySelector('.query-param-value') as HTMLInputElement).value.trim();
        if (key || value) queryParams.push({ key, value });
    });

    const bodyType = bodyTypeSelect.value;
    let bodyData: { type: string, content?: string } = { type: 'none' };
    if (bodyType === 'raw') {
        bodyData = { type: 'raw', content: rawBodyTextarea.value };
    }

    const authType = authTypeSelect.value;
    let authData: any = { type: 'noauth' };
    if (authType === 'basic') {
        authData = {
            type: 'basic',
            username: (document.getElementById('basicUsername') as HTMLInputElement).value.trim(),
            password: (document.getElementById('basicPassword') as HTMLInputElement).value
        };
    } else if (authType === 'apikey') {
        authData = {
            type: 'apikey',
            key: (document.getElementById('apiKeyKey') as HTMLInputElement).value.trim(),
            value: (document.getElementById('apiKeyValue') as HTMLInputElement).value.trim(),
            addTo: (document.getElementById('apiKeyAddTo') as HTMLSelectElement).value
        };
    } else if (authType === 'bearer') {
        authData = {
            type: 'bearer',
            token: (document.getElementById('bearerToken') as HTMLTextAreaElement).value.trim()
        };
    } else if (authType === 'oauth2') {
        authData = {
            type: 'oauth2',
            token: (document.getElementById('oauth2Token') as HTMLTextAreaElement).value.trim(),
            headerPrefix: (document.getElementById('oauth2HeaderPrefix') as HTMLInputElement).value.trim() || 'Bearer'
        };
    }

    const baseData = {
        name: name.trim(),
        url: trimmedUrl,
        method: methodSelect.value,
        expectedStatusCode: parseInt(statusCodeInput.value) || 200,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        queryParams: queryParams,
        auth: authData,
        body: bodyData,
        logLevel: logLevelSelect.value
    };

    if (forCurl) {
        return baseData;
    }

    return {
        ...baseData,
        intervalValue: parseInt(intervalValueInput.value).toString(),
        intervalUnit: intervalUnitSelect.value,
    };
}

// --- Sidebar Logic ---

function closeSidebar() {
    sidebar.classList.remove('expanded');
    activeSidebarPanel = null;
    document.querySelectorAll('.sidebar-tool-button.active').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.sidebar-panel.active').forEach(panel => {
        panel.classList.remove('active');
        (panel as HTMLElement).style.display = 'none';
    });
}

function openSidebarPanel(panelName: string) {
    // If clicking the same button, close it
    if (sidebar.classList.contains('expanded') && activeSidebarPanel === panelName) {
        closeSidebar();
        return;
    }

    // Deactivate current active elements
    document.querySelectorAll('.sidebar-tool-button.active').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.sidebar-panel.active').forEach(panel => {
        panel.classList.remove('active');
        (panel as HTMLElement).style.display = 'none';
    });

    // Activate new elements
    const toolButton = document.querySelector(`.sidebar-tool-button[data-panel="${panelName}"]`);
    const panel = document.getElementById(`sidebar-panel-${panelName}`);

    if (toolButton && panel) {
        toolButton.classList.add('active');
        panel.classList.add('active');
        panel.style.display = 'flex';
        activeSidebarPanel = panelName;
        sidebar.classList.add('expanded');

        // Generate content for the panel
        if (panelName === 'curl') {
            generateCurlCommand();
        } else if (panelName === 'logs') {
            requestItemLogs();
        }
    }
}

function generateCurlCommand() {
    const data = gatherFormData(true);
    if (!data || !data.url) {
        curlOutput.textContent = 'Enter a valid URL to generate the cURL command.';
        return;
    }

    let curlCommand = `curl --location --request ${data.method} `;

    // Start with the base URL, stripping any existing query string to avoid duplication.
    const baseUrl = data.url.split('?')[0];
    const params = new URLSearchParams();

    // Rebuild the query string from the "Parameters" tab. This is the single source of truth.
    if (data.queryParams && data.queryParams.length > 0) {
        data.queryParams.forEach(p => {
            if (p.key) {
                params.append(p.key, p.value);
            }
        });
    }

    // Handle API Key in query params
    if (data.auth.type === 'apikey' && data.auth.addTo === 'query' && data.auth.key) {
        params.append(data.auth.key, data.auth.value);
    }

    const queryString = params.toString();
    const finalUrl = queryString ? `${baseUrl}?${queryString}` : baseUrl;

    curlCommand += `'${finalUrl}'`;

    // Add headers
    const headers = { ...(data.headers || {}) };

    // Handle Auth headers
    if (data.auth) {
        switch (data.auth.type) {
            case 'basic':
                if (data.auth.username) {
                    const credentials = btoa(`${data.auth.username}:${data.auth.password || ''}`);
                    headers['Authorization'] = `Basic ${credentials}`;
                }
                break;
            case 'bearer':
                if (data.auth.token) {
                    headers['Authorization'] = `Bearer ${data.auth.token}`;
                }
                break;
            case 'oauth2':
                if (data.auth.token) {
                    headers['Authorization'] = `${data.auth.headerPrefix} ${data.auth.token}`;
                }
                break;
            case 'apikey':
                if (data.auth.key && data.auth.addTo === 'header') {
                    headers[data.auth.key] = data.auth.value;
                }
                break;
        }
    }

    for (const key in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, key)) {
            const headerValue = String(headers[key]).replace(/'/g, "'\\''");
            curlCommand += ` \\\n--header '${key}: ${headerValue}'`;
        }
    }

    // Add body
    if (data.body && data.body.type === 'raw' && data.body.content) {
        const bodyContent = data.body.content.replace(/'/g, "'\\''");
        curlCommand += ` \\\n--data-raw '${bodyContent}'`;
    }

    curlOutput.textContent = curlCommand;
}

function updateCurlOnChange() {
    if (activeSidebarPanel === 'curl') {
        generateCurlCommand();
    }
}

function requestItemLogs() {
    if (currentItemId) {
        logsOutput.innerHTML = '<p>Loading logs...</p>';
        vscode.postMessage({ command: 'getLogsForItem', itemId: currentItemId });
    } else {
        logsOutput.innerHTML = '<p>Logs are available for saved items only.</p>';
    }
}

function renderLogs() {
    const logsToRender = showOnlyErrors
        ? currentLogs.filter(log => log.status === 'down')
        : [...currentLogs];

    if (!logsToRender || logsToRender.length === 0) {
        if (showOnlyErrors && currentLogs.length > 0) {
            logsOutput.innerHTML = '<p>No error logs found for this item.</p>';
        } else {
            logsOutput.innerHTML = '<p>No recent logs found for this item.</p>';
        }
        return;
    }

    // Sort the logs based on the current order
    const sortedLogs = logsToRender.sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return logSortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    logsOutput.innerHTML = ''; // Clear previous content

    sortedLogs.forEach(log => {
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';

        const statusClass = log.status === 'up' ? 'up' : 'down';
        const timestamp = new Date(log.timestamp).toLocaleString();

        let errorHtml = '';
        if (log.status === 'down' && log.error) {
            errorHtml = `<div class="log-error">${escapeHtml(log.error)}</div>`;
        }

        logEntry.innerHTML = `
            <div class="log-header">
                <span class="log-status ${statusClass}">${log.status}</span>
                <span class="log-meta">${timestamp}</span>
            </div>
            <div class="log-meta">
                Status: ${log.statusCode || 'N/A'} | Duration: ${log.durationMs}ms
            </div>
            ${errorHtml}
        `;
        logsOutput.appendChild(logEntry);
    });
}

function updateLogSortButton() {
    const icon = logSortButton.querySelector('i');
    if (icon) {
        if (logSortOrder === 'desc') {
            icon.className = 'codicon codicon-arrow-down';
            logSortButton.title = 'Sort: Newest First';
        } else {
            icon.className = 'codicon codicon-arrow-up';
            logSortButton.title = 'Sort: Oldest First';
        }
    }
}

function escapeHtml(unsafe: string): string {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- Event Listeners ---
window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'loadData') {
        initializeForm(message.data);
    } else if (message.command === 'loadLogs') {
        currentLogs = message.logs || [];
        renderLogs();
    } else if (message.command === 'logsCleared') {
        currentLogs = [];
        renderLogs();
        vscode.postMessage({ command: 'showInfo', message: 'Logs for this item have been cleared.' });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Form interaction listeners
    document.querySelector('.form-container')?.addEventListener('input', updateCurlOnChange);
    methodSelect.addEventListener('change', () => {
        updateMethodSelectColor();
        updateCurlOnChange();
    });
    urlInput.addEventListener('blur', updateParamsFromUrl);
    queryParamsContainer.addEventListener('input', updateUrlFromParams);
    queryParamsContainer.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        if (target && target.classList.contains('remove-button')) {
            target.closest('.key-value-row')?.remove();
            updateUrlFromParams();
        }
    });

    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            switchTab((button as HTMLElement).dataset.tab || '');
        });
    });

    addQueryParamButton.addEventListener('click', () => {
        queryParamsContainer.appendChild(createQueryParamRow());
        updateUrlFromParams();
    });

    addHeaderButton.addEventListener('click', () => {
        headersContainer.appendChild(createHeaderRow());
    });

    headersContainer.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        if (target && target.classList.contains('remove-button')) {
            target.closest('.key-value-row')?.remove();
            updateCurlOnChange();
        }
    });

    bodyTypeSelect.addEventListener('change', (e) => {
        switchBodyView((e.target as HTMLSelectElement).value);
        updateCurlOnChange();
    });
    authTypeSelect.addEventListener('change', (e) => {
        switchAuthView((e.target as HTMLSelectElement).value);
        updateCurlOnChange();
    });

    (document.getElementById('beautify-btn') as HTMLButtonElement).addEventListener('click', () => {
        const language = (document.getElementById('rawBodyLanguage') as HTMLSelectElement).value;
        const currentBody = rawBodyTextarea.value;
        if (!currentBody.trim()) return;
        try {
            if (language === 'json') {
                rawBodyTextarea.value = JSON.stringify(JSON.parse(currentBody), null, 2);
                updateCurlOnChange();
            } else {
                vscode.postMessage({ command: 'showError', message: `Beautify for ${language.toUpperCase()} is not yet implemented.` });
            }
        } catch (e) {
            vscode.postMessage({ command: 'showError', message: 'Invalid JSON format. Cannot beautify.' });
        }
    });

    (document.getElementById('cancel') as HTMLButtonElement).addEventListener('click', () => {
        vscode.postMessage({ command: 'cancel' });
    });

    (document.getElementById('save') as HTMLButtonElement).addEventListener('click', () => {
        const data = gatherFormData();
        if (data) {
            vscode.postMessage({ command: 'save', data: data });
        }
    });

    // Sidebar listeners
    sidebarToolbar.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement).closest('.sidebar-tool-button');
        if (target) {
            const panelName = target.getAttribute('data-panel');
            if (panelName) {
                openSidebarPanel(panelName);
            }
        }
    });

    document.querySelector('.sidebar-content')?.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement).closest('.sidebar-close-button');
        if (target) {
            closeSidebar();
        }
    });

    copyCurlButton.addEventListener('click', () => {
        if (curlOutput.textContent) {
            navigator.clipboard.writeText(curlOutput.textContent);
            vscode.postMessage({ command: 'showInfo', message: 'cURL command copied to clipboard.' });
        }
    });

    logSortButton.addEventListener('click', () => {
        logSortOrder = logSortOrder === 'desc' ? 'asc' : 'desc';
        updateLogSortButton();
        renderLogs();
    });

    logRefreshButton.addEventListener('click', () => {
        requestItemLogs();
    });

    logFilterErrorsButton.addEventListener('click', () => {
        showOnlyErrors = !showOnlyErrors;
        logFilterErrorsButton.classList.toggle('active', showOnlyErrors);
        renderLogs();
    });

    logClearButton.addEventListener('click', () => {
        if (currentItemId) {
            vscode.postMessage({ command: 'clearLogsForItem', itemId: currentItemId });
        }
    });

    // Initial setup
    switchTab('params');
});
