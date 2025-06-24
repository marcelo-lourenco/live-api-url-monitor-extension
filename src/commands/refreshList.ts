import * as vscode from 'vscode';

export class RefreshListCommand {
  execute() {
    vscode.commands.executeCommand('urlMonitor.list.refresh');
  }
}