import axios, { AxiosRequestConfig } from 'axios';
import { UrlItem } from '../models/UrlItem';
import { StorageService } from './StorageService';

export class MonitorService {
    private timers: Map<string, NodeJS.Timeout | null> = new Map(); // Pode ser null temporariamente
    private statusChangeListeners: ((hasErrors: boolean) => void)[] = [];

    constructor(private storageService: StorageService) {}

    private async performCheckLogic(item: UrlItem): Promise<'up' | 'down'> {
        try {
            const config: AxiosRequestConfig = {
                method: item.method,
                url: item.url,
                headers: item.headers,
                timeout: 10000 // 10 segundos de timeout
            };

            if (item.username && item.password) {
                config.auth = {
                    username: item.username,
                    password: item.password
                };
            }

            const response = await axios(config);
            return response.status === item.expectedStatusCode ? 'up' : 'down';
        } catch (error) {
            // console.error(`Error checking ${item.url}:`, error); // Opcional: logar o erro específico
            return 'down';
        }
    }

    private async updateAndNotify(itemId: string, status: 'up' | 'down'): Promise<void> {
        await this.storageService.updateItemStatus(itemId, status);
        this.updateErrorStatus(); // Notifica sobre o estado geral de erros
    }

    public async checkItemImmediately(item: UrlItem): Promise<void> {
        const status = await this.performCheckLogic(item);
        await this.updateAndNotify(item.id, status);
    }

    async startMonitoring(): Promise<void> {
        const items = await this.storageService.getItems();
        const oldTimers = new Map(this.timers); // Copia os timers existentes
        this.timers.clear(); // Limpa o mapa principal para reconstruir

        const initialCheckPromises: Promise<void>[] = [];

        for (const item of items) {
            // Limpa o timer antigo específico se existir, para evitar duplicidade
            if (oldTimers.has(item.id)) {
                const oldTimer = oldTimers.get(item.id);
                if (oldTimer) {
                    clearTimeout(oldTimer);
                }
                oldTimers.delete(item.id); // Remove do mapa de timers antigos
            }
            // Agenda a verificação e adiciona a promessa da primeira verificação
            this.scheduleCheck(item, initialCheckPromises);
        }

        // Limpa timers de itens que foram removidos do storage
        oldTimers.forEach((timer) => {
            if (timer) {
                clearTimeout(timer);
            }
        });
        
        // Espera todas as verificações iniciais serem concluídas
        await Promise.all(initialCheckPromises);
    }

    private scheduleCheck(item: UrlItem, initialCheckPromises?: Promise<void>[]) {
        // Função que executa a verificação e se reagenda
        const checkAndReschedule = async () => {
            // Busca o item mais recente do storage, pois pode ter sido atualizado
            const currentItems = await this.storageService.getItems();
            const currentItem = currentItems.find(i => i.id === item.id);

            if (!currentItem) { // Item foi removido ou não existe mais
                if (this.timers.has(item.id)) {
                    const timer = this.timers.get(item.id);
                    if (timer) clearTimeout(timer);
                    this.timers.delete(item.id);
                }
                return;
            }

            // Realiza a lógica de verificação
            const status = await this.performCheckLogic(currentItem);
            await this.updateAndNotify(currentItem.id, status);

            // Reagendar apenas se o monitoramento para este item ainda está ativo
            // (indicado pela presença do ID no mapa this.timers)
            if (this.timers.has(currentItem.id)) {
                 const newTimeout = setTimeout(checkAndReschedule, currentItem.interval * 1000);
                 this.timers.set(currentItem.id, newTimeout); // Atualiza o timer no mapa
            }
        };

        // Adiciona um placeholder no mapa de timers para indicar que este item está sendo monitorado.
        // Isso é importante para a lógica de `stopMonitoring` e para o reagendamento em `checkAndReschedule`.
        // O `null` será substituído pelo `NodeJS.Timeout` real após a primeira execução de `checkAndReschedule`.
        this.timers.set(item.id, null);

        // Executa a primeira verificação
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

    public async forceCheckAllItems(): Promise<void> {
        const items = await this.storageService.getItems();
        // Não interrompe os timers agendados, apenas faz uma checagem extra para cada item.
        const checkPromises = items.map(item => this.checkItemImmediately(item));
        await Promise.all(checkPromises);
    }
}
