import * as vscode from 'vscode';
import type { LogEntry } from '../models/LogEntry';
import type { TreeViewItem } from '../models/UrlItem';
import { isUrlItem } from '../models/UrlItem';
import { LogService } from '../services/LogService';
import { StorageService } from '../services/StorageService';

export class SaveLogCommand {
    constructor(
        private logService: LogService,
        private storageService: StorageService
    ) { }

    public async execute(context?: TreeViewItem): Promise<void> {
        try {
            let logs: LogEntry[] = [];
            let logTitle = 'All Monitor Logs';
            let defaultFileName = 'url_monitor_all.log';

            if (!context) {
                logs = await this.logService.getLogs();
            } else if (isUrlItem(context)) {
                logs = await this.logService.getLogs([context.id]);
                logTitle = `Logs for Item: ${context.name}`;
                defaultFileName = `url_monitor_${context.name.replace(/[^a-z0-9]/gi, '_')}.log`;
            } else {
                const descendantItems = await this.storageService.getDescendantUrlItems(context.id);
                if (descendantItems.length === 0) {
                    vscode.window.showInformationMessage(`Folder "${context.name}" has no items with logs to save.`);
                    return;
                }
                const descendantIds = descendantItems.map(d => d.id);
                logs = await this.logService.getLogs(descendantIds);
                logTitle = `Logs for Folder: ${context.name}`;
                defaultFileName = `url_monitor_folder_${context.name.replace(/[^a-z0-9]/gi, '_')}.log`;
            }

            if (logs.length === 0) {
                vscode.window.showInformationMessage('There are no logs to save for the selected scope.');
                return;
            }

            // Reverse logs to show most recent first
            logs.reverse();

            const formattedLogs = this.formatLogsAsTable(logs);
            const logContent = `URL & API Monitor - ${logTitle}\nGenerated on: ${new Date().toLocaleString()}\nTotal Entries: ${logs.length}\n\n${formattedLogs}`;

            const uri = await vscode.window.showSaveDialog({
                title: 'Save Monitor Logs',
                filters: {
                    'Log Files': ['log'],
                    'Text Files': ['txt']
                },
                defaultUri: vscode.Uri.file(defaultFileName)
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(logContent, 'utf8'));
                vscode.window.showInformationMessage(`Successfully saved ${logs.length} log entries to ${uri.fsPath}`);

                // Open the saved log file in the editor
                const document = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(document);

            } else {
                vscode.window.showInformationMessage('Save operation cancelled.');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save logs: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private formatLogsAsTable(logs: LogEntry[]): string {
        // Calculate column widths for table formatting
        const headers = {
            timestamp: 'Timestamp',
            status: 'Status',
            itemName: 'Item',
            statusCode: 'Code',
            duration: 'Duration',
            error: 'Error'
        };
        const columnWidths = {
            timestamp: headers.timestamp.length,
            status: headers.status.length,
            itemName: headers.itemName.length,
            statusCode: headers.statusCode.length,
            duration: headers.duration.length,
            error: headers.error.length
        };

        for (const log of logs) {
            const ts = log.timestamp;
            const sc = log.statusCode ? log.statusCode.toString() : '';
            const dur = log.durationMs ? `${log.durationMs}ms` : '';
            const errorText = log.error || '';
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

        const headerLine =
            `| ${headers.timestamp.padEnd(columnWidths.timestamp)} ` +
            `| ${headers.status.padEnd(columnWidths.status)} ` +
            `| ${headers.itemName.padEnd(columnWidths.itemName)} ` +
            `| ${headers.statusCode.padEnd(columnWidths.statusCode)} ` +
            `| ${headers.duration.padEnd(columnWidths.duration)} ` +
            `| ${headers.error.padEnd(columnWidths.error)} |`;

        const separatorLine =
            `|-${'-'.repeat(columnWidths.timestamp)}-` +
            `|-${'-'.repeat(columnWidths.status)}-` +
            `|-${'-'.repeat(columnWidths.itemName)}-` +
            `|-${'-'.repeat(columnWidths.statusCode)}-` +
            `|-${'-'.repeat(columnWidths.duration)}-` +
            `|-${'-'.repeat(columnWidths.error)}-|`;

        const rows = logs.map(log => {
            const ts = log.timestamp;
            const sc = log.statusCode ? log.statusCode.toString() : '';
            const dur = log.durationMs ? `${log.durationMs}ms` : '';
            const errorText = log.error || '';
            return (
                `| ${ts.padEnd(columnWidths.timestamp)} ` +
                `| ${log.status.padEnd(columnWidths.status)} ` +
                `| ${log.itemName.padEnd(columnWidths.itemName)} ` +
                `| ${sc.padEnd(columnWidths.statusCode)} ` +
                `| ${dur.padEnd(columnWidths.duration)} ` +
                `| ${errorText.padEnd(columnWidths.error)} |`
            );
        });

        return [headerLine, separatorLine, ...rows].join('\n');
    }
}