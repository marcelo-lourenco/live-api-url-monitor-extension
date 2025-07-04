import * as vscode from 'vscode';
import { LogService } from '../services/LogService';
import { LogEntry } from '../models/LogEntry';

export class SaveLogCommand {
    constructor(private logService: LogService) { }

    private formatLogEntry(log: LogEntry): string {
        const statusIcon = log.status === 'up' ? '✅' : '❌';
        let line = `[${new Date(log.timestamp).toLocaleString()}] ${statusIcon} ${log.itemName} (${log.status.toUpperCase()})`;
        line += ` | Status: ${log.statusCode ?? 'N/A'}`;
        line += ` | Duration: ${log.durationMs}ms`;
        if (log.error) {
            line += `\n  └─ ERROR: ${log.error}`;
        }
        return line;
    }

    public async execute(): Promise<void> {
        try {
            const logs = await this.logService.getLogs();
            if (logs.length === 0) {
                vscode.window.showInformationMessage('There are no logs to save.');
                return;
            }

            // Inverte os logs para mostrar os mais recentes primeiro, o que é comum em arquivos de log.
            logs.reverse();

            const formattedLogs = logs.map(this.formatLogEntry).join('\n' + '-'.repeat(80) + '\n');
            const logContent = `URL & API Monitor Logs\nGenerated on: ${new Date().toLocaleString()}\nTotal Entries: ${logs.length}\n\n${'='.repeat(80)}\n${formattedLogs}`;

            const uri = await vscode.window.showSaveDialog({
                title: 'Save Monitor Logs',
                filters: {
                    'Log Files': ['log'],
                    'Text Files': ['txt']
                },
                defaultUri: vscode.Uri.file('url_monitor.log')
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(logContent, 'utf8'));
                vscode.window.showInformationMessage(`Successfully saved ${logs.length} log entries to ${uri.fsPath}`);
            } else {
                vscode.window.showInformationMessage('Save operation cancelled.');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save logs: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}