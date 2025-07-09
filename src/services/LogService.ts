import * as vscode from 'vscode';
import type { LogEntry } from '../models/LogEntry';

export class LogService {
    private logFileUri: vscode.Uri;

    constructor(context: vscode.ExtensionContext) {
        this.logFileUri = vscode.Uri.joinPath(context.globalStorageUri, 'requests.log.ndjson');
        // Ensure the global storage directory exists (ignore errors if already exists)
        vscode.workspace.fs.createDirectory(context.globalStorageUri).then(
            () => { /* success - no action needed */ },
            () => { /* suppress errors, e.g., if directory already exists */ }
        );
    }

    public async addLog(entryData: Omit<LogEntry, 'timestamp'>): Promise<void> {
        const entry: LogEntry = {
            ...entryData,
            timestamp: new Date().toISOString()
        };
        const logLine = JSON.stringify(entry) + '\n';
        const content = new TextEncoder().encode(logLine);

        try {
            let existingContent = new Uint8Array(0);
            try {
                existingContent = await vscode.workspace.fs.readFile(this.logFileUri);
            } catch {
                // File doesn't exist, will be created
            }
            const newContent = new Uint8Array(existingContent.length + content.length);
            newContent.set(existingContent, 0);
            newContent.set(content, existingContent.length);
            await vscode.workspace.fs.writeFile(this.logFileUri, newContent);
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    public async getLogs(itemIds?: string[]): Promise<LogEntry[]> {
        try {
            const fileContent = await vscode.workspace.fs.readFile(this.logFileUri);
            const text = new TextDecoder().decode(fileContent);
            const lines = text.split('\n').filter(line => line.trim() !== '');
            const allLogs: LogEntry[] = lines.map(line => JSON.parse(line));

            if (itemIds) {
                const idSet = new Set(itemIds);
                return allLogs.filter(log => idSet.has(log.itemId));
            }
            return allLogs;
        } catch (error) {
            if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
                return [];
            }
            console.error('Failed to read log file:', error);
            return [];
        }
    }

    public async clearAllLogs(): Promise<void> {
        try {
            await vscode.workspace.fs.delete(this.logFileUri);
            vscode.window.showInformationMessage('All logs have been cleared.');
        } catch (error) {
            if (!(error instanceof vscode.FileSystemError && error.code === 'FileNotFound')) {
                console.error('Failed to clear logs:', error);
            }
        }
    }

    public async clearLogsForItem(itemId: string): Promise<void> {
        try {
            const allLogs = await this.getLogs();
            const logsToKeep = allLogs.filter(log => log.itemId !== itemId);

            if (logsToKeep.length === allLogs.length) {
                return; // No logs for this item were found
            }

            if (logsToKeep.length === 0) {
                // If no logs are left, delete the file
                await this.clearAllLogs();
            } else {
                // Rewrite the file with the remaining logs
                const newLogContent = logsToKeep.map(log => JSON.stringify(log)).join('\n') + '\n';
                const content = new TextEncoder().encode(newLogContent);
                await vscode.workspace.fs.writeFile(this.logFileUri, content);
            }
        } catch (error) {
            console.error(`Failed to clear logs for item ${itemId}:`, error);
        }
    }
}
