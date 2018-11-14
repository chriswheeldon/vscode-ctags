"use strict";
import * as child_process from "child_process";
import * as vscode from "vscode";
import * as ctags from "./ctags";
import * as util from "./util";

const tagsfile = "tags";
let ctagsIndex: ctags.CTagsIndex;

class CTagsDefinitionProvider implements vscode.DefinitionProvider {
  public provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition> {
    return new Promise((resolve, reject) => {
      const query = document.getText(document.getWordRangeAtPosition(position));
      ctagsIndex
        .lookup(query)
        .then(matches => {
          if (!matches) {
            util.log(`"${query}" has no matches`);
            return reject();
          }
          const locations = matches.map(match => {
            util.log(`"${query}" matches ${match.path}:${match.lineno}`);
            return new vscode.Location(
              vscode.Uri.file(match.path),
              new vscode.Position(match.lineno, 0)
            );
          });
          resolve(locations);
        })
        .catch(error => {
          util.log(`"${query}" lookup failed: ${error}`);
          reject();
        });
    });
  }
}

function reindexTagsWithProgress(
  progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<void> {
  progress.report({ increment: 0, message: "Indexing CTags" });
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
      return execCTags().then(() => {
        reindexTagsWithProgress.bind(null, progress);
      });
    }
  );
}

export function activate(context: vscode.ExtensionContext) {
  util.log("CTags extension active");

  ctagsIndex = new ctags.CTagsIndex(vscode.workspace.rootPath || "", tagsfile);
  reindexTags();

  const definitionsProvider = new CTagsDefinitionProvider();
  vscode.languages.registerDefinitionProvider(
    { scheme: "file", language: "cpp" },
    definitionsProvider
  );
  vscode.languages.registerDefinitionProvider(
    { scheme: "file", language: "c" },
    definitionsProvider
  );

  const reloadCTagsCommand = vscode.commands.registerCommand(
    "extension.reloadCTags",
    () => {
      reindexTags();
    }
  );

  const regenerateCTagsCommand = vscode.commands.registerCommand(
    "extension.regenerateCTags",
    () => {
      regenerateCTags();
    }
  );

  context.subscriptions.push(reloadCTagsCommand);
  context.subscriptions.push(regenerateCTagsCommand);
}

export function deactivate() {}
