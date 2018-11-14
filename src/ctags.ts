import { timingSafeEqual } from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { TextIndex, TextIndexer } from "textindexer";
import * as util from "./util";

function regexEscape(s: string): string {
  // modified version of the regex escape from 1.
  // we don't need to escape \ or / since the no-magic
  // ctags pattern already escapes these
  // 1. https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
  return s.replace(/[-^$*+?.()|[\]{}]/g, "\\$&");
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

export class CTagsIndex {
  private baseDir: string;
  private filename: string;
  private indexer: TextIndexer;
  private index: Promise<TextIndex>;

  constructor(baseDir: string, filename: string) {
    this.baseDir = baseDir;
    this.filename = filename;
    this.indexer = new TextIndexer(
      path.join(this.baseDir, filename),
      line => line.split("\t")[0],
      7
    );
    this.index = Promise.resolve({ start: 0, end: 0, children: {} });
  }

  public async reindex(): Promise<void> {
    this.index = this.indexer.index();
    await this.index;
  }

  public async lookup(symbol: string): Promise<Match[] | null> {
    await this.index;
    const matchedRange = await this.indexer.lookup(symbol);
    if (!matchedRange) {
      return Promise.resolve(null);
    }
    const matches: Tag[] = [];
    const rs = fs.createReadStream(path.join(this.baseDir, this.filename), {
      start: matchedRange.start,
      end: matchedRange.end
    });
    const lr = readline.createInterface(rs);
    lr.on("line", line => {
      const tokens = line.split("\t");
      if (tokens[0] === symbol) {
        matches.push({
          name: symbol,
          path: tokens[1],
          pattern: tokens[2]
        });
      }
    });
    return new Promise<Match[]>((resolve, reject) => {
      lr.on("close", () => {
        rs.destroy();
        resolve(Promise.all<Match>(matches.map(this.resolveMatch.bind(this))));
      });
      rs.on("error", () => {
        rs.destroy();
        reject();
      });
    });
  }

  private parsePattern(token: string): RegExp | number | null {
    if (token.startsWith("/^") && token.endsWith("/;\"")) {
      // tag pattern is a no-magic pattern with start and possibly end anchors (/^...$/)
      // http://vimdoc.sourceforge.net/htmldoc/pattern.html#/magic
      // http://ctags.sourceforge.net/FORMAT
      const anchoredEol = token.endsWith("$/;\"");
      const end = anchoredEol ? -4 : -3;
      return new RegExp(
        "^" + regexEscape(token.slice(2, end)) + (anchoredEol ? "$" : "")
      );
    }
    const lineno = parseInt(token, 10);
    if (!isNaN(lineno)) {
      return lineno - 1;
    }
    return null;
  }

  private resolveMatch(tag: Tag): Promise<Match> {
    const pattern = this.parsePattern(tag.pattern);
    if (typeof pattern === "number") {
      return Promise.resolve({
        lineno: pattern,
        path: path.join(this.baseDir, tag.path)
      });
    }
    return this.findTagInFile(pattern, path.join(this.baseDir, tag.path));
  }

  private findTagInFile(
    pattern: RegExp | null,
    filename: string
  ): Promise<Match> {
    const match = { lineno: 0, path: filename };
    if (!pattern) {
      return Promise.resolve(match);
    }
    const rs = fs.createReadStream(filename);
    const rl = readline.createInterface({ input: rs });
    return new Promise<Match>((resolve, _) => {
      let lineno = 0;
      rl.on("line", line => {
        if (pattern.test(line)) {
          match.lineno = lineno;
          rl.close();
        }
        lineno++;
      });
      rl.on("close", () => {
        rs.destroy();
        resolve(match);
      });
      rs.on("error", (error: string) => {
        util.log("findTagsInFile:", error);
        rs.destroy();
        resolve(match);
      });
    });
  }
}
