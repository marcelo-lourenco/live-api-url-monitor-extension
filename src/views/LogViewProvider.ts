import * as vscode from 'vscode';
import { LogService } from '../services/LogService';
import { LogEntry } from '../models/LogEntry';

export class LogViewProvider implements vscode.TextDocumentContentProvider {
    public static readonly scheme = 'url-monitor-log';

    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    constructor(private logService: LogService) { }

    public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const query = new URLSearchParams(uri.query);
        const idsParam = query.get('ids');
        const itemIds = idsParam ? idsParam.split(',') : undefined;

        const logs = await this.logService.getLogs(itemIds);

        if (logs.length === 0) {
            return `No log entries found for: ${uri.path.substring(1)}\n`;
        }

        // Reverse logs to show most recent first
        logs.reverse();

        const formattedLogs = logs.map(this.formatLogEntry).join('\n');
        const header = `LOGS FOR: ${uri.path.substring(1)}\n${'='.repeat(80)}\n\n`;
        return header + formattedLogs;
    }

    private formatLogEntry(log: LogEntry): string {
        const statusIcon = log.status === 'up' ? '✅' : '❌';
        let line = `[${log.timestamp}] ${statusIcon} ${log.itemName} (${log.status.toUpperCase()})`;
        line += ` | Status: ${log.statusCode ?? 'N/A'}`;
        line += ` | Duration: ${log.durationMs}ms`;
        if (log.error) {
            line += `\n  └─ ERROR: ${log.error}`;
        }
        // return line + '\n' + '-'.repeat(80);
        return line;
    }

    public async showLog(title: string, itemIds?: string[]): Promise<void> {
        const query = itemIds ? `?ids=${itemIds.join(',')}` : '';
        const uri = vscode.Uri.parse(`${LogViewProvider.scheme}:/${title}${query}`);

        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });
        this._onDidChange.fire(uri); // Ensure content is fresh
    }
}