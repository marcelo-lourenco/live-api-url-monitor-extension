import * as vscode from 'vscode';
import axios, { AxiosRequestConfig, AxiosError } from 'axios';
import { UrlItem } from '../models/UrlItem';
import { StorageService } from './StorageService';
import { LogService } from './LogService';

interface CheckResult {
    status: 'up' | 'down';
    statusCode?: number;
    durationMs: number;
    error?: string;
}

export class MonitorService {
    private timers: Map<string, NodeJS.Timeout | null> = new Map();

    private _onStatusChange = new vscode.EventEmitter<number>();
    public readonly onStatusChange = this._onStatusChange.event;

    constructor(
        private storageService: StorageService,
        private logService: LogService
    ) { }

    private async performCheckLogic(item: UrlItem): Promise<CheckResult> {
        const startTime = Date.now();
        try {
            const headers = item.headers || {};
            const config: AxiosRequestConfig = {
                method: item.method,
                url: item.url,
                headers: headers,
                timeout: 10000
            };

            if (!config.url) {
                return {
                    status: 'down',
                    error: 'URL is not defined.',
                    durationMs: Date.now() - startTime
                };
            }

            if (item.queryParams && item.queryParams.length > 0) {
                const url = new URL(config.url);
                item.queryParams.forEach(param => {
                    if (param.key) {
                        url.searchParams.append(param.key, param.value);
                    }
                });
                config.url = url.toString();
            }

            if (item.body) {
                if (item.body.type === 'raw' && item.body.content) {
                    config.data = item.body.content;
                    if (!headers['Content-Type']) {
                        try {
                            JSON.parse(item.body.content);
                            headers['Content-Type'] = 'application/json';
                        } catch {
                            headers['Content-Type'] = 'text/plain';
                        }
                    }
                }
            }
            const auth = item.auth || { type: 'noauth' };

            switch (auth.type) {
                case 'basic':
                    if (auth.username) {
                        config.auth = {
                            username: auth.username,
                            password: auth.password || ''
                        };
                    }
                    break;
                case 'bearer':
                    if (auth.token) {
                        headers['Authorization'] = `Bearer ${auth.token}`;
                    }
                    break;
                case 'apikey':
                    if (auth.key && auth.value) {
                        if (auth.addTo === 'header') { // This line was not flagged, but also uses '!'
                            headers[auth.key] = auth.value;
                        } else {
                            const url = new URL(config.url);
                            url.searchParams.append(auth.key, auth.value);
                            config.url = url.toString();
                        }
                    }
                    break;
            }

            const response = await axios(config);
            const durationMs = Date.now() - startTime;
            const isSuccess = response.status === item.expectedStatusCode;

            return {
                status: isSuccess ? 'up' : 'down',
                statusCode: response.status,
                durationMs: durationMs,
                error: isSuccess ? undefined : `Expected status ${item.expectedStatusCode}, but received ${response.status}.`
            };
        } catch (error: any) {
            const durationMs = Date.now() - startTime;
            const axiosError = error as AxiosError;
            return {
                status: 'down',
                statusCode: axiosError.response?.status,
                durationMs: durationMs,
                error: axiosError.message
            };
        }
    }

    private async processStatusUpdate(item: UrlItem, result: CheckResult): Promise<void> {
        // If status changed to 'down', show an immediate error message.
        if (result.status === 'down' && item.lastStatus !== 'down') {
            vscode.window.showErrorMessage(`Monitor Alert: "${item.name}" is down. URL: ${item.url}`);
        }
        await this.storageService.updateItemStatus(item.id, result.status);
        await this.logService.addLog({
            itemId: item.id,
            itemName: item.name,
            status: result.status,
            statusCode: result.statusCode,
            durationMs: result.durationMs,
            error: result.error
        });
    }

    public async forceCheckItems(items: UrlItem[]): Promise<void> {
        if (items.length === 0) {
            return;
        }
        // Perform all checks in parallel
        const checkPromises = items.map(async (item) => {
            const result = await this.performCheckLogic(item);
            await this.processStatusUpdate(item, result);
        });
    
        await Promise.all(checkPromises);
    
        // After all are done, trigger a single notification/UI refresh
        this.updateErrorStatus();
    }

    public async checkItemImmediately(item: UrlItem): Promise<void> {
        await this.forceCheckItems([item]);
    }

    async startMonitoring(): Promise<void> {
        const items = await this.storageService.getAllUrlItems();
        const oldTimers = new Map(this.timers);
        this.timers.clear();

        const initialCheckPromises: Promise<void>[] = [];

        for (const item of items) {
            if (oldTimers.has(item.id)) {
                const oldTimer = oldTimers.get(item.id);
                if (oldTimer) {
                    clearTimeout(oldTimer);
                }
                oldTimers.delete(item.id);
            }
            this.scheduleCheck(item, initialCheckPromises);
        }

        oldTimers.forEach((timer) => {
            if (timer) {
                clearTimeout(timer);
            }
        });

        await Promise.all(initialCheckPromises);
    }

    private scheduleCheck(item: UrlItem, initialCheckPromises?: Promise<void>[]) {
        const checkAndReschedule = async () => {
            const currentItems = await this.storageService.getAllUrlItems();
            const currentItem = currentItems.find(i => i.id === item.id);

            if (!currentItem) {
                if (this.timers.has(item.id)) {
                    const timer = this.timers.get(item.id);
                    if (timer) clearTimeout(timer);
                    this.timers.delete(item.id);
                }
                return;
            }

            const result = await this.performCheckLogic(currentItem);
            await this.processStatusUpdate(currentItem, result);
            this.updateErrorStatus();

            if (this.timers.has(currentItem.id)) {
                const newTimeout = setTimeout(checkAndReschedule, currentItem.interval * 1000);
                this.timers.set(currentItem.id, newTimeout);
            }
        };

        this.timers.set(item.id, null);

        const firstCheckPromise = checkAndReschedule();
        if (initialCheckPromises) {
            initialCheckPromises.push(firstCheckPromise);
        }
    }

    private clearTimers() {
        this.timers.forEach(timer => {
            if (timer) {
                clearTimeout(timer);
            }
        });
        this.timers.clear();
    }

    private async updateErrorStatus() {
        const items = await this.storageService.getAllUrlItems();
        const errorCount = items.filter(item => item.lastStatus === 'down').length;
        this.notifyStatusChange(errorCount);
    }

    private notifyStatusChange(errorCount: number) {
        this._onStatusChange.fire(errorCount);
    }

    stopMonitoring() {
        this.clearTimers();
    }

    public async forceCheckAllItems(): Promise<void> {
        const items = await this.storageService.getAllUrlItems();
        await this.forceCheckItems(items);
    }
}
