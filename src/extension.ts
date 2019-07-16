'use strict';
import * as path from 'path';
import * as vscode from 'vscode';
import * as ctags from './ctags';
import * as util from './util';

const tagsfile = '.vscode-ctags';
let tags: ctags.CTags;

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
    const matches = await tags.lookup(query);
    if (!matches) {
      util.log(`"${query}" has no matches.`);
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
    const matches = await tags.lookup(query);
    if (!matches) {
      util.log(`"${query}" has no matches.`);
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
    const matches = await tags.lookupCompletions(prefix);
    if (!matches) {
      util.log(`"${prefix}" has no matches.`);
      return null;
    }
    return matches.map(match => {
      return new vscode.CompletionItem(match.name);
    });
  }
}

function regenerateArgs(): string[] {
  const config = vscode.workspace.getConfiguration('ctags');
  const excludes = config
    .get<string[]>('excludePatterns', [])
    .map((pattern: string) => {
      return '--exclude=' + pattern;
    })
    .join(' ');
  const languages =
    '--languages=' + config.get<string[]>('languages', ['all']).join(',');
  return [languages, excludes];
}

function regenerateCTags() {
  const args = regenerateArgs();
  const title =
    args && args.length
      ? `Generating CTags index (${args.join(' ')})`
      : 'Generating CTags index';
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title
    },
    async (progress, token) => {
      await tags.regenerate(regenerateArgs());
    }
  );
}

export function activate(context: vscode.ExtensionContext) {
  util.log('extension activated.');

  tags = new ctags.CTags(vscode.workspace.rootPath || '', tagsfile);
  tags
    .reindex()
    .then(() => {
      vscode.window.setStatusBarMessage('CTags index loaded', 2000);
    })
    .catch(() => {
      regenerateCTags();
    });

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

  const regenerateCTagsCommand = vscode.commands.registerCommand(
    'extension.regenerateCTags',
    () => {
      regenerateCTags();
    }
  );

  context.subscriptions.push(regenerateCTagsCommand);

  vscode.workspace.onDidSaveTextDocument(event => {
    util.log('saved', event.fileName, event.languageId);
    const config = vscode.workspace.getConfiguration('ctags');
    const autoRegenerate = config.get<boolean>('regenerateOnSave');
    if (autoRegenerate) {
      regenerateCTags();
    }
  });
}

export function deactivate() {}
