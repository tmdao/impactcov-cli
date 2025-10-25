import { loadConfig } from '../lib/config.js';
import { loadCoverageMap } from '../lib/coverage.js';

export async function diffCoverageCommand(opts: { since?: string; threshold?: number }) {
  const cfg = await loadConfig();
  const threshold = opts.threshold ?? cfg.impact?.diffCoverageThreshold ?? 80;
  const map = await loadCoverageMap();
  const coveredChangedLines = map.length * 10; // placeholder
  const totalChangedLines = coveredChangedLines + 10;
  const pct = Math.round((coveredChangedLines / totalChangedLines) * 100);

  const result = { diffCoverage: pct, threshold, pass: pct >= threshold };
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 2;
}
