import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { trie } from 'trie.ts';
import * as util from './util';
import { EventEmitter } from 'events';

function regexEscape(s: string): string {
  // modified version of the regex escape from 1.
  // we don't need to escape \ or / since the no-magic
  // ctags pattern already escapes these
  // 1. https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
  return s.replace(/[-^$*+?.()|[\]{}]/g, '\\$&');
}
interface TagValue {
  dir: symbol;
  filename: string;
  pattern: string;
}

interface Tag {
  name: string;
  path: string;
  pattern: string;
}

export interface Match {
  path: string;
  lineno: number;
}

class CTagsReader extends EventEmitter {
  private tagspath: string;

  constructor(tagspath: string) {
    super();
    this.tagspath = tagspath;
  }

  /**
   * readTags
   */
  public readTags(): void {
    const readStream = fs.createReadStream(this.tagspath);
    const rl = readline.createInterface({
      input: readStream
    });
    rl.on('line', line => {
      const tag = this.parseTagLine(line);
      if (tag) {
        this.emit("tag", tag);
      }
    });
    rl.on('close', () => {
      this.emit('end');
      readStream.destroy();
    });
    readStream.on('error', (error: string) => {
      this.emit('end');
    });
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
    return {
      name: tokens[0],
      path: tokens[1],
      pattern: tokens[2]
    };
  }
}

export class CTagsIndex {
  private tags: Promise<trie<TagValue[]>> = Promise.resolve(new trie<TagValue[]>());
  private baseDir: string;
  private reader: CTagsReader;
  private len: number = 0;

  constructor(baseDir: string, filename: string) {
    this.baseDir = baseDir;
    this.reader = new CTagsReader(path.join(baseDir, filename));
  }

  public get length(): number {
    return this.len;
  }

  public reindex(): Promise<trie<TagValue[]>> {
    this.len = 0;
    this.tags = new Promise<trie<TagValue[]>>((resolve, reject) => {
      const tr = new trie<TagValue[]>();
      this.reader.on('tag', (tag: Tag) => {
        const tagValue = {
          filename: path.basename(tag.path),
          dir: Symbol.for(path.dirname(tag.path)),
          pattern: tag.pattern
        };
        const indexed = tr.get(tag.name);
        if (!indexed) {
          tr.insert(tag.name, [tagValue]);
        } else {
          indexed.push(tagValue);
        }
        this.len += 1;
      });
      this.reader.on('end', () => {
        this.reader.removeAllListeners();
        resolve(tr);
      });
      this.reader.readTags();
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

  private resolveMatch(tag: TagValue): Promise<Match> {
    const dir = Symbol.keyFor(tag.dir);
    if (dir === undefined) {
      return Promise.reject();
    }
    const filename = path.join(this.baseDir, path.join(dir, tag.filename));
    const pattern =  this.parsePattern(tag.pattern);
    if (typeof(pattern) === 'number') {
      return Promise.resolve({ lineno: pattern, path: filename });
    }
    return this.findTagInFile(pattern, filename);
  }

  private findTagInFile(pattern: RegExp | null, filename: string): Promise<Match> {
    const match = { lineno: 0, path: filename };
    if (!pattern) {
      return Promise.resolve(match);
    }
    const rs = fs.createReadStream(filename);
    const rl = readline.createInterface({ input: rs });
    return new Promise<Match>((resolve, reject) => {
      let lineno = 0;
      rl.on('line', line => {
        if (pattern.test(line)) {
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
