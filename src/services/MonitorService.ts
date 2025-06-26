import * as vscode from 'vscode';
import axios, { AxiosRequestConfig } from 'axios';
import { UrlItem } from '../models/UrlItem';
import { StorageService } from './StorageService';

export class MonitorService {
    private timers: Map<string, NodeJS.Timeout | null> = new Map();

    private _onStatusChange = new vscode.EventEmitter<number>();
    public readonly onStatusChange = this._onStatusChange.event;

    constructor(private storageService: StorageService) { }

    private async performCheckLogic(item: UrlItem): Promise<'up' | 'down'> {
        try {
            const config: AxiosRequestConfig = {
                method: item.method,
                url: item.url,
                headers: { ...item.headers },
                timeout: 10000
            };

            if (item.queryParams && item.queryParams.length > 0) {
                const url = new URL(config.url!);
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
                    if (!config.headers!['Content-Type']) {
                        try {
                            JSON.parse(item.body.content);
                            config.headers!['Content-Type'] = 'application/json';
                        } catch {
                            config.headers!['Content-Type'] = 'text/plain';
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
                        config.headers!['Authorization'] = `Bearer ${auth.token}`;
                    }
                    break;
                case 'apikey':
                    if (auth.key && auth.value) {
                        if (auth.addTo === 'header') {
                            config.headers![auth.key] = auth.value;
                        } else {
                            const url = new URL(config.url!);
                            url.searchParams.append(auth.key, auth.value);
                            config.url = url.toString();
                        }
                    }
                    break;
            }

            const response = await axios(config);
            return response.status === item.expectedStatusCode ? 'up' : 'down';
        } catch (error) {
            return 'down';
        }
    }

    private async updateAndNotify(itemId: string, status: 'up' | 'down'): Promise<void> {
        await this.storageService.updateItemStatus(itemId, status);
        this.updateErrorStatus();
    }

    public async checkItemImmediately(item: UrlItem): Promise<void> {
        const status = await this.performCheckLogic(item);
        await this.updateAndNotify(item.id, status);
    }

    async startMonitoring(): Promise<void> {
        const items = await this.storageService.getItems();
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
            const currentItems = await this.storageService.getItems();
            const currentItem = currentItems.find(i => i.id === item.id);

            if (!currentItem) {
                if (this.timers.has(item.id)) {
                    const timer = this.timers.get(item.id);
                    if (timer) clearTimeout(timer);
                    this.timers.delete(item.id);
                }
                return;
            }

            const status = await this.performCheckLogic(currentItem);
            await this.updateAndNotify(currentItem.id, status);

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
        const items = await this.storageService.getItems();
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
        const items = await this.storageService.getItems();
        const checkPromises = items.map(item => this.checkItemImmediately(item));
        await Promise.all(checkPromises);
    }
}
