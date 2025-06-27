import * as vscode from 'vscode';
import { StorageService } from '../services/StorageService';
import { MonitorService } from '../services/MonitorService';
import { UrlItem, AuthConfig, RequestBody, QueryParam } from '../models/UrlItem';

// A type guard to check if a method is a valid UrlItem method
function isValidMethod(method: string): method is UrlItem['method'] {
    const validMethods: Array<UrlItem['method']> = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
    return validMethods.includes(method as UrlItem['method']);
}

export class ImportCurlCommand {
    constructor(
        private storageService: StorageService,
        private monitorService: MonitorService
    ) { }

    public async execute(): Promise<boolean> {
        const curlCommand = await vscode.window.showInputBox({
            prompt: 'Paste cURL command to import',
            placeHolder: 'curl \'https://api.example.com/users\' -H \'Authorization: Bearer ...\'',
            ignoreFocusOut: true,
        });

        if (!curlCommand) {
            return false; // User cancelled
        }

        try {
            const parsedData = this.parseCurl(curlCommand);

            const name = await vscode.window.showInputBox({
                prompt: 'Enter a name for the imported item',
                value: parsedData.name,
            });

            if (!name) {
                return false; // User cancelled
            }

            const newItem: Omit<UrlItem, 'id'> = {
                ...parsedData,
                name: name,
                interval: 60, // Default interval
                expectedStatusCode: 200, // Default status code
            };

            const addedItem = await this.storageService.addItem(newItem);
            await this.monitorService.checkItemImmediately(addedItem as UrlItem);
            await this.monitorService.startMonitoring(); // Restart monitoring to include the new item

            vscode.window.showInformationMessage(`Successfully imported from cURL: "${addedItem.name}"`);
            return true;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to parse cURL command: ${errorMessage}`);
            console.error('cURL Parse Error:', error);
            return false;
        }
    }

    private parseCurl(curl: string): Omit<UrlItem, 'id' | 'interval' | 'expectedStatusCode' | 'lastStatus' | 'lastChecked'> {
        const result: {
            name: string;
            url: string;
            method: string;
            headers: Record<string, string>;
            queryParams: QueryParam[];
            auth: AuthConfig;
            body: RequestBody;
        } = {
            name: 'Imported Item',
            url: '',
            method: 'GET',
            headers: {},
            queryParams: [],
            auth: { type: 'noauth' },
            body: { type: 'none' },
        };

        const cleanCurl = curl.replace(/\\\n/g, ' ').replace(/\s\s+/g, ' ').trim();

        const urlMatch = cleanCurl.match(/'(https?:\/\/[^']*)'|"(https?:\/\/[^"]*)"|\b(https?:\/\/\S+)\b/);
        if (!urlMatch) {
            throw new Error('Could not parse a valid URL.');
        }
        const fullUrl = urlMatch[1] || urlMatch[2] || urlMatch[3];
        const urlObject = new URL(fullUrl);
        result.url = urlObject.origin + urlObject.pathname;
        result.name = `Imported from ${urlObject.hostname}`;
        urlObject.searchParams.forEach((value, key) => {
            result.queryParams.push({ key, value });
        });

        const methodMatch = cleanCurl.match(/-X\s+([A-Z]+)|--request\s+([A-Z]+)/i);
        if (methodMatch) {
            const method = (methodMatch[1] || methodMatch[2]).toUpperCase();
            if (isValidMethod(method)) {
                result.method = method;
            }
        }

        // This regex handles both -H and --header, and single or double quotes.
        const headerRegex = /(?:-H|--header)\s+('([^']*)'|"([^"]*)")/g;
        let match;
        while ((match = headerRegex.exec(cleanCurl)) !== null) {
            const headerLine = match[2] || match[3]; // Group 2 for single quotes, group 3 for double quotes
            if (!headerLine) { continue; }

            const separatorIndex = headerLine.indexOf(':');
            if (separatorIndex > 0) {
                const key = headerLine.substring(0, separatorIndex).trim();
                const value = headerLine.substring(separatorIndex + 1).trim();
                result.headers[key] = value;
            }
        }

        const dataMatch = cleanCurl.match(/--data(?:-raw)?\s+'([^']*)'|--data(?:-raw)?\s+"([^"]*)"/);
        if (dataMatch) {
            const content = dataMatch[1] || dataMatch[2];
            if (content) {
                result.body = { type: 'raw', content: content };
                if (result.method === 'GET') {
                    result.method = 'POST';
                }
            }
        }

        if (result.headers['Authorization']?.toLowerCase().startsWith('bearer ')) {
            result.auth = {
                type: 'bearer',
                token: result.headers['Authorization'].substring(7).trim()
            };
        }

        return result as Omit<UrlItem, 'id' | 'interval' | 'expectedStatusCode' | 'lastStatus' | 'lastChecked'>;
    }
}
