'use strict';
import * as child_process from 'child_process';
import { CTagsIndex } from './ctagsindex';

export class CTags {
  private baseDir: string;
  private filename: string;
  private index: Promise<CTagsIndex>;

  constructor(baseDir: string, filename: string) {
    this.baseDir = baseDir;
    this.filename = filename;
    this.index = this.nullIndex();
  }

  public regenerate(args?: string[]): Promise<CTagsIndex> {
    this.index = new Promise((resolve, _) => {
      const command = ['ctags']
        .concat(args || [])
        .concat([`-f`, this.filename, '.'])
        .join(' ');
      child_process.exec(command, (err, stdout, stderr) => {
        resolve();
      });
    });
    return this.index;
  }

  public async reindex(): Promise<CTagsIndex> {
    await this.index;
    return new CTagsIndex(this.baseDir, this.filename).build();
  }

  private nullIndex(): Promise<CTagsIndex> {
    return Promise.resolve(new CTagsIndex(this.baseDir, this.filename));
  }
}
