import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { isNullOrUndefined } from 'util';

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
        console.log(`CTags indexing complete, found ${tags.length} tags`);
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
      return new RegExp('^' + regexEscape(token.slice(2, end)) + (anchoredEol ? '$' : ''));
    }
    const lineno = parseInt(token, 10);
    if (!isNaN(lineno)) {
      return lineno - 1;
    }
    return null;
  }
}

export class CTagsIndex {
  private tags: Promise<Tag[]> = Promise.resolve([]);
  private baseDir: string;
  private reader: CTagsReader;

  constructor(baseDir: string, filename: string) {
    this.baseDir = baseDir;
    this.reader = new CTagsReader(path.join(baseDir, filename));
  }

  public reindex(): Promise<Tag[]> {
    this.tags = this.reader.readTags();
    return this.tags;
  }

  public async lookup(symbol: string): Promise<Match[] | null> {
    const tags = await this.tags;
    const matches = tags.filter((t: Tag) => {
      return t.name === symbol;
    });
    if (!matches.length) {
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
        resolve(match);
      });
      rs.on('error', (error: string) => {
        console.log('findTagsInFile:', error);
        resolve(match);
      });
    });
  }
}
