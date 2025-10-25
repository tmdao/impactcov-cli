import fs from 'fs-extra';
import path from 'path';

export const CWD = process.cwd();
export const DOT_DIR = path.join(CWD, '.impactcov');
export const CACHE_MAP = path.join(DOT_DIR, 'coverage-map.jsonl');
export const LOCAL_REPORT = path.join(DOT_DIR, 'report.json');

export async function ensureDotDir() {
  await fs.ensureDir(DOT_DIR);
}

export async function readJSON<T>(p: string, def: T): Promise<T> {
  try {
    const c = await fs.readFile(p, 'utf8');
    return JSON.parse(c) as T;
  } catch {
    return def;
  }
}

export async function writeJSON<T>(p: string, data: T) {
  await fs.ensureDir(path.dirname(p));
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf8');
}

export async function appendLines(p: string, lines: string[]) {
  await fs.ensureDir(path.dirname(p));
  await fs.appendFile(p, lines.join('\n') + '\n', 'utf8');
}
