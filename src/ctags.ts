'use strict';
import * as child_process from 'child_process';
import { rename } from 'fs';
import * as path from 'path';
import { CTagsIndex, Match, Tag } from './ctagsindex';
import { TaskQueue } from './taskqueue';
import { log } from './util';

export class CTags {
  private baseDir: string;
  private filename: string;
  private index: CTagsIndex;
  private tasks: TaskQueue;

  constructor(baseDir: string, filename: string) {
    this.baseDir = baseDir;
    this.filename = filename;
    this.index = new CTagsIndex(this.baseDir, this.filename);
    this.tasks = new TaskQueue();
  }

  public async regenerate(args?: string[]): Promise<void> {
    log('Enqueing regenerate ctags task.');
    await this.tasks.append(() => {
      return this.regenerateFile(args);
    });
    await this.tasks.append(async () => {
      await this.swapTagFile();
      await this.index.build();
      log('Regenerated ctags.');
    }, true);
  }

  public async lookup(symbol: string): Promise<Match[] | null> {
    return this.tasks.append(() => {
      return this.index.lookup(symbol);
    });
  }

  public async lookupCompletions(prefix: string): Promise<Tag[] | null> {
    return this.tasks.append(() => {
      return this.index.lookupCompletions(prefix);
    });
  }

  private regenerateFile(args?: string[]): Promise<void> {
    return new Promise((resolve, _) => {
      const command = ['ctags']
        .concat(args || [])
        .concat([`-R`])
        .concat([`-f`, this.filename + '.next', '.'])
        .join(' ');
      child_process.exec(
        command,
        { cwd: this.baseDir },
        (err, stdout, stderr) => {
          if (err) {
            log(command, err, stdout, stderr);
          }
          resolve();
        }
      );
    });
  }

  private swapTagFile(): Promise<void> {
    return new Promise((resolve, _) => {
      rename(
        path.join(this.baseDir, this.filename + '.next'),
        path.join(this.baseDir, this.filename),
        err => {
          if (err) {
            log('rename:' + err);
          }
          resolve();
        }
      );
    });
  }
}
