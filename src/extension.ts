import * as vscode from 'vscode';
import { StorageService } from './services/StorageService';
import { MonitorService } from './services/MonitorService';
import { ListView } from './views/ListView';
import { ExportItemsCommand } from './commands/exportItems';
import { ImportItemsCommand } from './commands/importItems';
import { AddEditView } from './views/AddEditView';
import { ImportCurlCommand } from './commands/importCurl';

export async function activate(context: vscode.ExtensionContext) { // Marcado como async
  // Initialize services
  const storageService = new StorageService(context.globalState);
  const monitorService = new MonitorService(storageService);
  const addEditView = new AddEditView(context);
  // Passa monitorService para ListView
  const exportItemsCommand = new ExportItemsCommand(storageService);
  const importItemsCommand = new ImportItemsCommand(storageService, monitorService);
  const importCurlCommand = new ImportCurlCommand(storageService, monitorService);
  const listView = new ListView(context, storageService, addEditView, monitorService);

  // Register webview panel serializer
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer('urlMonitor.addEdit', {
      async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
        // O 'state' pode ser usado se você salvar o estado do webview
        // Aqui, estamos apenas restaurando a visualização.
        addEditView.restoreWebview(webviewPanel);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('urlMonitor.exportItems', () => exportItemsCommand.execute())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('urlMonitor.importItems', () => importItemsCommand.execute())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('urlMonitor.importCurl', async () => {
      const success = await importCurlCommand.execute();
      if (success) {
        listView.refresh();
      }
    })
  );


  // Setup status change notification
  // É importante registrar este "ouvinte" antes de iniciar o monitoramento.
  monitorService.onStatusChange((errorCount: number) => {
    listView.updateBadge(errorCount);
    // Atualiza a lista para refletir as mudanças de status nos ícones de cada item.
    // Isso é importante se um status mudar devido ao monitoramento em background
    listView.refresh();
  });

  // Inicializa o contador de erros com 0 na ativação.
  listView.updateBadge(0);

  // Start monitoring and then refresh list, showing progress
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'URL Monitor',
    cancellable: false
  }, async (progress) => {
    progress.report({ increment: 0, message: 'Checking initial URL statuses...' });
    try {
      await monitorService.startMonitoring(); // Espera o primeiro ciclo de verificações
      progress.report({ increment: 90, message: 'Loading URL list...' });
      // A lista é atualizada pelo onStatusChange, mas uma atualização aqui garante
      listView.refresh();
      progress.report({ increment: 100, message: 'URL Monitor is ready.' });
    } catch (error) {
      progress.report({ increment: 100, message: 'Initialization failed.' });
      vscode.window.showErrorMessage(`URL Monitor initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      console.error('URL Monitor initialization error:', error);
    }
    // Pequeno delay para a notificação de progresso desaparecer.
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

}

export function deactivate() {
  // Aqui você pode adicionar lógicas para parar o monitoramento se necessário,
  // embora o VS Code geralmente lide bem com a finalização de extensões.
  // Exemplo:
  // const storageService = new StorageService(context.globalState); // Precisaria do context ou de outra forma de acesso
  // const monitorService = new MonitorService(storageService);
  // monitorService.stopMonitoring();
}
