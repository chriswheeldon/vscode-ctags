import * as vscode from 'vscode';

export function log(...args: any[]) {
  args.splice(0, 0, 'vscode-ctags:');
  console.log.apply(null, args);
  vscode.debug.activeDebugConsole.appendLine(args.join(' '));
}
