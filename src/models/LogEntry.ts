export interface LogEntry {
    timestamp: string; // ISO 8601 format
    itemId: string;
    itemName: string;
    status: 'up' | 'down';
    statusCode?: number;
    durationMs: number;
    error?: string;
}