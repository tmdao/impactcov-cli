import fs from 'fs-extra';
import path from 'path';
import { appendLines, CACHE_MAP, ensureDotDir } from './fsutils.js';
import { TestCoverageRecord } from '../types.js';

function isTestCoverageRecord(v: unknown): v is TestCoverageRecord {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.testId === 'string' && typeof o.file === 'string' &&
    (o.lines === undefined || (Array.isArray(o.lines) && o.lines.every((n) => typeof n === 'number')));
}

export async function loadCoverageMap(): Promise<TestCoverageRecord[]> {
  const exists = await fs.pathExists(CACHE_MAP);
  if (!exists) return [];
  const text = await fs.readFile(CACHE_MAP, 'utf8');
  const itemsRaw = text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        return null;
      }
    })
    .filter((v): v is unknown => v !== null);
  return itemsRaw.filter(isTestCoverageRecord);
}

export async function addCoverageRecords(records: TestCoverageRecord[]) {
  await ensureDotDir();
  const lines = records.map((r) => JSON.stringify(r));
  await appendLines(CACHE_MAP, lines);
}

export function intersectByFiles(changed: string[], map: TestCoverageRecord[]): string[] {
  const set = new Set<string>(changed.map((f) => path.normalize(f)));
  const impacted = new Set<string>();
  for (const r of map) {
    for (const f of set) {
      if (r.file.endsWith(f)) {
        impacted.add(r.testId);
      }
    }
  }
  return Array.from(impacted);
}
