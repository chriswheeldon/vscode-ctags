'use strict';
import * as child_process from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import * as ctags from './ctags';
import * as util from './util';

const tagsfile = 'tags';
let ctagsIndex: ctags.CTagsIndex;

class CTagsDefinitionProvider implements vscode.DefinitionProvider {
  public provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition> {
    const query = document.getText(document.getWordRangeAtPosition(position));
    return this.resolveDefinitions(query);
  }

  private async resolveDefinitions(query: string): Promise<vscode.Definition> {
    const matches = await ctagsIndex.lookup(query);
    if (!matches) {
      util.log(`"${query}" has no matches`);
      return [];
    }
    return matches.map(match => {
      util.log(`"${query}" matches ${match.path}:${match.lineno}`);
      return new vscode.Location(
        vscode.Uri.file(match.path),
        new vscode.Position(match.lineno, 0)
      );
    });
  }
}

class CTagsHoverProvider implements vscode.HoverProvider {
  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    const query = document.getText(document.getWordRangeAtPosition(position));
    return this.resolveHover(query);
  }

  private async resolveHover(query: string): Promise<vscode.Hover | null> {
    const matches = await ctagsIndex.lookup(query);
    if (!matches) {
      util.log(`"${query}" has no matches`);
      return null;
    }
    const summary = matches.map(match => {
      return (
        path.relative(vscode.workspace.rootPath || '', match.path) +
        ':' +
        match.lineno
      );
    });
    return new vscode.Hover(new vscode.MarkdownString(summary.join('  \n')));
  }
}

class CTagsCompletionProvider implements vscode.CompletionItemProvider {
  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    const prefix = document.getText(document.getWordRangeAtPosition(position));
    return this.resolveCompletion(prefix);
  }

  private async resolveCompletion(
    prefix: string
  ): Promise<vscode.CompletionItem[] | null> {
    const matches = await ctagsIndex.lookupCompletions(prefix);
    if (!matches) {
      util.log(`"${prefix}" has no matches`);
      return null;
    }
    return matches.map(match => {
      return new vscode.CompletionItem(match.name);
    });
  }
}

function reindexTagsWithProgress(
  progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<void> {
  progress.report({ increment: 0, message: 'Indexing CTags' });
  return ctagsIndex
    .reindex()
    .then(() => {
      progress.report({ increment: 100 });
      vscode.window.setStatusBarMessage(`Indexing CTags complete`, 3000);
    })
    .catch((reason: any) => {
      progress.report({ increment: 100 });
      vscode.window.setStatusBarMessage(
        `Failed to index CTags: ${reason}.`,
        3000
      );
    });
}

function reindexTags() {
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window
    },
    (progress, token) => {
      return reindexTagsWithProgress(progress);
    }
  );
}

function execCTags(): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = `ctags -R -f ${tagsfile} .`;
    child_process.exec(
      cmd,
      { cwd: vscode.workspace.rootPath },
      (err, stdout, stderr) => {
        resolve();
      }
    );
  });
}

function regenerateCTags() {
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: `Regenerating CTags (ctags -R -f ${tagsfile} .)`
    },
    (progress, token) => {
      progress.report({ increment: 0 });
      return execCTags().then(reindexTagsWithProgress.bind(null, progress));
    }
  );
}

export function activate(context: vscode.ExtensionContext) {
  util.log('CTags extension active');

  ctagsIndex = new ctags.CTagsIndex(vscode.workspace.rootPath || '', tagsfile);
  reindexTags();

  const definitionsProvider = new CTagsDefinitionProvider();
  vscode.languages.registerDefinitionProvider(
    { scheme: 'file', language: 'cpp' },
    definitionsProvider
  );
  vscode.languages.registerDefinitionProvider(
    { scheme: 'file', language: 'c' },
    definitionsProvider
  );

  const hoverProvider = new CTagsHoverProvider();
  vscode.languages.registerHoverProvider(
    { scheme: 'file', language: 'c' },
    hoverProvider
  );
  vscode.languages.registerHoverProvider(
    { scheme: 'file', language: 'cpp' },
    hoverProvider
  );

  const completionProvider = new CTagsCompletionProvider();
  vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'c' },
    completionProvider
  );

  vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'cpp' },
    completionProvider
  );

  const reloadCTagsCommand = vscode.commands.registerCommand(
    'extension.reloadCTags',
    () => {
      reindexTags();
    }
  );

  const regenerateCTagsCommand = vscode.commands.registerCommand(
    'extension.regenerateCTags',
    () => {
      regenerateCTags();
    }
  );

  context.subscriptions.push(reloadCTagsCommand);
  context.subscriptions.push(regenerateCTagsCommand);
}

export function deactivate() {}
