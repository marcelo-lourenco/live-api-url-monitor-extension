import * as vscode from 'vscode';
import { LogService } from '../services/LogService';
import type { LogEntry } from '../models/LogEntry';

export class SaveLogCommand {
    constructor(private logService: LogService) { }

    private formatLogsAsTable(logs: LogEntry[]): string {
        const headers = {
            timestamp: 'Timestamp',
            status: 'State ',
            itemName: 'Item Name',
            statusCode: 'Status',
            duration: 'Time (ms)',
            error: 'Error'
        };

        // Initialize with header lengths to ensure they are the minimum width
        const columnWidths = {
            timestamp: headers.timestamp.length,
            status: headers.status.length,
            itemName: headers.itemName.length,
            statusCode: headers.statusCode.length,
            duration: headers.duration.length,
            error: headers.error.length
        };

        // Calculate the maximum width required for each column
        for (const log of logs) {
            const ts = new Date(log.timestamp).toLocaleString();
            const dur = String(log.durationMs ?? 'N/A');
            const sc = String(log.statusCode ?? 'N/A');
            const errorText = log.error ? `ERROR: ${log.error}` : '';

            if (ts.length > columnWidths.timestamp) {
                columnWidths.timestamp = ts.length;
            }
            if (log.status.length > columnWidths.status) {
                columnWidths.status = log.status.length;
            }
            if (log.itemName.length > columnWidths.itemName) {
                columnWidths.itemName = log.itemName.length;
            }
             if (sc.length > columnWidths.statusCode) {
                columnWidths.statusCode = sc.length;
            }
            if (dur.length > columnWidths.duration) {
                columnWidths.duration = dur.length;
            }
            if (errorText.length > columnWidths.error) {
                columnWidths.error = errorText.length;
            }
        }

        // Build the table header
        const headerLine =
            `| ${headers.timestamp.padEnd(columnWidths.timestamp)} ` +
            `| ${headers.status.padEnd(columnWidths.status)} ` +
            `| ${headers.itemName.padEnd(columnWidths.itemName)} `+
            `| ${headers.statusCode.padEnd(columnWidths.statusCode)} ` +
            `| ${headers.duration.padEnd(columnWidths.duration)} ` +
            `| ${headers.error.padEnd(columnWidths.error)} |`;


        const separatorLine =
            `|-${'-'.repeat(columnWidths.timestamp)}-` +
            `+-${'-'.repeat(columnWidths.status)}-` +
            `+-${'-'.repeat(columnWidths.itemName)}-` +
            `+-${'-'.repeat(columnWidths.statusCode)}-` +
            `+-${'-'.repeat(columnWidths.duration)}-` +
            `+-${'-'.repeat(columnWidths.error)}-|`;

        const rows = logs.map(log => {
            const ts = new Date(log.timestamp).toLocaleString(); 
            const status = log.status.toUpperCase();
            const sc = String(log.statusCode ?? 'N/A');
            const dur = String(log.durationMs ?? 'N/A');
            const errorText = log.error ? `ERROR: ${log.error}` : '';

            const rowLine =
                `| ${ts.padEnd(columnWidths.timestamp)} ` +
                `| ${status.padEnd(columnWidths.status)} ` +
                `| ${log.itemName.padEnd(columnWidths.itemName)} ` +
                `| ${sc.padEnd(columnWidths.statusCode)} ` +
                `| ${dur.padEnd(columnWidths.duration)} ` +
                `| ${errorText.padEnd(columnWidths.error)} |`;

            return rowLine;
        });

        return [headerLine, separatorLine, ...rows].join('\n');
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

            const formattedLogs = this.formatLogsAsTable(logs);
            const logContent = `URL & API Monitor Logs\nGenerated on: ${new Date().toLocaleString()}\nTotal Entries: ${logs.length}\n\n${formattedLogs}`;

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

                // Abre o arquivo de log salvo no editor
                const document = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(document);

            } else {
                vscode.window.showInformationMessage('Save operation cancelled.');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save logs: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}