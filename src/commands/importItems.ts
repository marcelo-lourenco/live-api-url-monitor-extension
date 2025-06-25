import * as vscode from 'vscode';
import { StorageService } from '../services/StorageService';
import { MonitorService } from '../services/MonitorService';
import { UrlItem } from '../models/UrlItem';

export class ImportItemsCommand {
  constructor(
    private storageService: StorageService,
    private monitorService: MonitorService
  ) {}

  public async execute(): Promise<void> {
    try {
      const uri = await vscode.window.showOpenDialog({
        title: 'Import URL Monitor Items',
        filters: {
          'JSON Files': ['json']
        },
        canSelectMany: false,
        openLabel: 'Import'
      });

      if (!uri || uri.length === 0) {
        vscode.window.showInformationMessage('Import cancelled.');
        return;
      }

      const fileContent = await vscode.workspace.fs.readFile(uri[0]);
      const jsonString = Buffer.from(fileContent).toString('utf8');
      const importedItems: UrlItem[] = JSON.parse(jsonString);

      if (!Array.isArray(importedItems)) {
        throw new Error('Invalid JSON format: Expected an array of URL items.');
      }

      let importedCount = 0;
      for (const item of importedItems) {
        // Basic validation to ensure it's a plausible UrlItem
        if (item && typeof item.name === 'string' && typeof item.url === 'string') {
          // addItem generates a new ID, preventing conflicts with existing items
          // and ensuring consistency if the imported JSON had IDs.
          await this.storageService.addItem({
            ...item,
            lastStatus: undefined, // Reset status on import
            lastChecked: undefined // Reset last checked on import
          });
          importedCount++;
        }
      }

      await this.monitorService.startMonitoring(); // Restart monitoring to include new items
      vscode.window.showInformationMessage(`Successfully imported ${importedCount} item(s) from ${uri[0].fsPath}`);
      // The ListView will refresh via the onStatusChange event from MonitorService
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to import items: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}