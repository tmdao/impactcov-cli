import { execa } from 'execa';
import { loadConfig } from '../lib/config.js';
import { addCoverageRecords } from '../lib/coverage.js';

export async function coverCommand(testPattern?: string) {
  const cfg = await loadConfig();
  console.log('Running tests with coverage (stub)...');
  // In a real implementation, we'd hook Istanbul per-test here.
  // For scaffold, we just run the user's test command and add a sample mapping for demo.
  const parts = cfg.test.command.split(' ');
  const cmd = parts[0];
  const args = parts.slice(1);
  if (testPattern) args.push(testPattern);
  try {
    await execa(cmd, args, { stdio: 'inherit', env: cfg.test.env });
  } catch {
    console.warn('Test command exited with non-zero code; continuing.');
  }
  await addCoverageRecords([
    { testId: 'Auth › logs in', file: 'src/auth/login.ts', lines: [10, 11, 12] },
    { testId: 'Cart › adds item', file: 'src/cart/add.ts', lines: [5, 6, 7] },
    { testId: 'Cart › removes item', file: 'src/cart/remove.ts', lines: [14, 15] },
  ]);
  console.log('Per-test coverage map updated at .impactcov/coverage-map.jsonl');
}
