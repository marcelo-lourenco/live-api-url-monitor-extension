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

let isProgrammaticUpdate = false;

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
    formTitle.textContent = isEditMode ? 'Edit URL Item' : 'Add URL Item';

    const itemToRender = item;
    const auth = itemToRender.auth || { type: 'noauth' };
    const queryParams = itemToRender.queryParams || [];
    const body = itemToRender.body || { type: 'none' };

    nameInput.value = itemToRender.name || '';
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
}

function gatherFormData() {
    const name = nameInput.value;
    const url = urlInput.value;
    const trimmedUrl = url.trim();

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

    return {
        name: name.trim(),
        url: trimmedUrl,
        method: methodSelect.value,
        intervalValue: numInterval.toString(),
        intervalUnit: intervalUnitSelect.value,
        expectedStatusCode: parseInt(statusCodeInput.value) || 200,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        queryParams: queryParams,
        auth: authData,
        body: bodyData
    };
}

// --- Event Listeners ---
window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'loadData') {
        initializeForm(message.data);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    methodSelect.addEventListener('change', updateMethodSelectColor);
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
        }
    });

    bodyTypeSelect.addEventListener('change', (e) => switchBodyView((e.target as HTMLSelectElement).value));
    authTypeSelect.addEventListener('change', (e) => switchAuthView((e.target as HTMLSelectElement).value));

    (document.getElementById('beautify-btn') as HTMLButtonElement).addEventListener('click', () => {
        const language = (document.getElementById('rawBodyLanguage') as HTMLSelectElement).value;
        const currentBody = rawBodyTextarea.value;
        if (!currentBody.trim()) return;
        try {
            if (language === 'json') {
                rawBodyTextarea.value = JSON.stringify(JSON.parse(currentBody), null, 2);
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

    // Initial setup
    switchTab('params');
});