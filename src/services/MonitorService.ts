import axios, { AxiosRequestConfig } from 'axios';
import { UrlItem } from '../models/UrlItem';
import { StorageService } from './StorageService';

export class MonitorService {
    private timers: Map<string, NodeJS.Timeout> = new Map();
    private statusChangeListeners: ((hasErrors: boolean) => void)[] = [];

    constructor(private storageService: StorageService) {}

    async startMonitoring() {
        const items = await this.storageService.getItems();
        this.clearTimers();
        
        for (const item of items) {
            this.scheduleCheck(item);
        }
    }

    private scheduleCheck(item: UrlItem) {
        if (this.timers.has(item.id)) {
            clearTimeout(this.timers.get(item.id)!);
        }

        const check = async () => {
            try {
                const config: AxiosRequestConfig = {
                    method: item.method,
                    url: item.url,
                    headers: item.headers,
                    timeout: 10000
                };

                if (item.username && item.password) {
                    config.auth = {
                        username: item.username,
                        password: item.password
                    };
                }

                const response = await axios(config);
                const isUp = response.status === item.expectedStatusCode;
                
                await this.storageService.updateItemStatus(item.id, isUp ? 'up' : 'down');
                this.updateErrorStatus();
            } catch (error) {
                await this.storageService.updateItemStatus(item.id, 'down');
                this.updateErrorStatus();
            } finally {
                this.timers.set(item.id, setTimeout(check, item.interval * 1000));
            }
        };

        check();
    }

    private clearTimers() {
        this.timers.forEach(timer => clearTimeout(timer));
        this.timers.clear();
    }

    private async updateErrorStatus() {
        const items = await this.storageService.getItems();
        const hasErrors = items.some(item => item.lastStatus === 'down');
        this.notifyStatusChange(hasErrors);
    }

    onStatusChange(listener: (hasErrors: boolean) => void) {
        this.statusChangeListeners.push(listener);
    }

    private notifyStatusChange(hasErrors: boolean) {
        this.statusChangeListeners.forEach(listener => listener(hasErrors));
    }

    stopMonitoring() {
        this.clearTimers();
    }
}