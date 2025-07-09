export interface LogEntry {
    timestamp: string; // ISO 8601 format (UTC date and time)
    itemId: string;
    itemName: string;
    status: 'up' | 'down';
    statusCode?: number;
    durationMs: number;
    error?: string; // Error message if the request failed
}