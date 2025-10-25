import { loadConfig } from '../lib/config.js';
import { getChangedFiles } from '../lib/git.js';
import { loadCoverageMap, intersectByFiles } from '../lib/coverage.js';

export async function impactedCommand(opts: {
  since?: string;
  diff?: string;
  files?: string[];
  json?: boolean;
}) {
  const cfg = await loadConfig();
  const base = opts.since || cfg.impact?.defaultSince || 'origin/main';
  const changed = opts.files?.length ? opts.files : await getChangedFiles(base);
  const map = await loadCoverageMap();
  const tests = intersectByFiles(changed, map);
  const payload = { base, changed, impactedTests: tests, coverageRecords: map.length };
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`Base: ${base}`);
    console.log(`Changed files (${changed.length}):`);
    for (const f of changed) console.log(`  - ${f}`);
    console.log(`\nImpacted tests (${tests.length}):`);
    for (const t of tests) console.log(`  - ${t}`);
  }
}
