import fs from 'fs-extra';
import path from 'path';
import { ImpactCovConfig } from '../types.js';

export async function initCommand() {
  const p = path.join(process.cwd(), 'impactcov.config.json');
  const exists = await fs.pathExists(p);
  if (exists) {
    console.log('impactcov.config.json already exists.');
    return;
  }
  const cfg: ImpactCovConfig = {
    project: 'app',
    language: 'javascript',
    monorepo: false,
    test: { framework: 'jest', command: 'npm test --' },
    coverage: { tool: 'istanbul', perTest: true },
    impact: {
      defaultSince: 'origin/main',
      fallbackRunAll: true,
      fileGranularity: 'line',
      diffCoverageThreshold: 85,
    },
    ci: { provider: 'github' },
    upload: { enabled: true, artifacts: ['.impactcov/coverage-map.jsonl'] },
  };
  await fs.writeFile(p, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  console.log('Created impactcov.config.json');
}
