import * as vscode from 'vscode';

export function log(...args: any[]) {
  args.unshift('vscode-ctags:');
  console.log(...args);
  vscode.debug.activeDebugConsole.appendLine(args.join(' '));
}
