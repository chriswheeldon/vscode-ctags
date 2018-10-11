import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { trie } from 'trie.ts';
import { isNullOrUndefined } from 'util';
import * as util from './util';

function regexEscape(s: string): string {
  // modified version of the regex escape from 1.
  // we don't need to escape \ or / since the no-magic
  // ctags pattern already escapes these
  // 1. https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
  return s.replace(/[-^$*+?.()|[\]{}]/g, '\\$&');
}

interface Tag {
  name: string;
  path: string;
  pattern?: RegExp;
  lineno?: number;
}

export interface Match {
  path: string;
  lineno: number;
}

class CTagsReader {
  private tagspath: string;

  constructor(tagspath: string) {
    this.tagspath = tagspath;
  }

  /**
   * readTags
   */
  public readTags(): Promise<Tag[]> {
    const readStream = fs.createReadStream(this.tagspath);
    const rl = readline.createInterface({
      input: readStream
    });
    const p = new Promise<Tag[]>((resolve, reject) => {
      const tags: Tag[] = [];
      rl.on('line', line => {
        const tag = this.parseTagLine(line);
        if (tag) {
          tags.push(tag);
        }
      });
      rl.on('close', () => {
        util.log(`CTags indexing complete, found ${tags.length} tags`);
        resolve(tags);
      });
      readStream.on('error', (error: string) => {
        reject(error);
      });
    });
    return p;
  }

  private parseTagLine(line: string): Tag | null {
    if (line.startsWith('!_TAG_')) {
      return null;
    }
    const tokens: string[] = line.split('\t');
    if (!tokens) {
      return null;
    }
    if (tokens.length < 3) {
      return null;
    }
    const pattern = this.parsePattern(tokens[2]);
    return {
      name: tokens[0],
      path: tokens[1],
      pattern: pattern instanceof RegExp ? pattern : undefined,
      lineno: typeof pattern === 'number' ? pattern : undefined
    };
  }

  private parsePattern(token: string): RegExp | number | null {
    if (token.startsWith('/^') && token.endsWith('/;"')) {
      // tag pattern is a no-magic pattern with start and possibly end anchors (/^...$/)
      // http://vimdoc.sourceforge.net/htmldoc/pattern.html#/magic
      // http://ctags.sourceforge.net/FORMAT
      const anchoredEol = token.endsWith('$/;"');
      const end = anchoredEol ? -4 : -3;
      return new RegExp(
        '^' + regexEscape(token.slice(2, end)) + (anchoredEol ? '$' : '')
      );
    }
    const lineno = parseInt(token, 10);
    if (!isNaN(lineno)) {
      return lineno - 1;
    }
    return null;
  }
}

export class CTagsIndex {
  private tags: Promise<trie<Tag[]>> = Promise.resolve(new trie<Tag[]>());
  private baseDir: string;
  private reader: CTagsReader;
  private len: number;

  constructor(baseDir: string, filename: string) {
    this.baseDir = baseDir;
    this.reader = new CTagsReader(path.join(baseDir, filename));
    this.len = 0;
  }

  public get length(): number {
    return this.len;
  }

  public reindex(): Promise<trie<Tag[]>> {
    this.len = 0;
    this.tags = this.reader.readTags().then((tags) => {
      const tr = new trie<Tag[]>();
      tags.forEach((tag) => {
        const indexed = tr.get(tag.name);
        if (!indexed) {
          tr.insert(tag.name, [tag]);
        } else {
          indexed.push(tag);
        }
      });
      this.len = tags.length;
      return tr;
    });
    return this.tags;
  }

  public async lookup(symbol: string): Promise<Match[] | null> {
    const tags = await this.tags;
    const matches = tags.get(symbol);
    if (!matches) {
      return Promise.resolve(null);
    }
    return Promise.all<Match>(matches.map(this.resolveMatch.bind(this)));
  }

  private resolveMatch(tag: Tag): Promise<Match> {
    const filename = path.join(this.baseDir, tag.path);
    if (!isNullOrUndefined(tag.lineno)) {
      return Promise.resolve({ lineno: tag.lineno, path: filename });
    }
    return this.findTagInFile(tag, filename);
  }

  private findTagInFile(tag: Tag, filename: string): Promise<Match> {
    const match = { lineno: 0, path: filename };
    if (!tag.pattern) {
      return Promise.resolve(match);
    }
    const rs = fs.createReadStream(filename);
    const rl = readline.createInterface({ input: rs });
    return new Promise<Match>((resolve, reject) => {
      let lineno = 0;
      rl.on('line', line => {
        if (!!tag.pattern && tag.pattern.test(line)) {
          match.lineno = lineno;
          rl.close();
        }
        lineno++;
      });
      rl.on('close', () => {
        rs.destroy();
        resolve(match);
      });
      rs.on('error', (error: string) => {
        util.log('findTagsInFile:', error);
        rs.destroy();
        resolve(match);
      });
    });
  }
}
