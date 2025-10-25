#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { coverCommand } from './commands/cover.js';
import { impactedCommand } from './commands/impacted.js';
import { runCommand } from './commands/run.js';
import { diffCoverageCommand } from './commands/report.js';
import { uploadCommand } from './commands/upload.js';

const program = new Command();
program
  .name('tia-cli')
  .description('ImpactCov: Test Impact Analysis & Coverage Mapping CLI')
  .version('0.1.0');

program
  .command('init')
  .description('Create a starter impactcov.config.json')
  .action(async () => {
    await initCommand();
  });

program
  .command('cover')
  .argument('[test-pattern]', 'Optional test pattern')
  .description('Run tests with per-test coverage and update coverage map cache')
  .action(async (pattern) => {
    await coverCommand(pattern);
  });

program
  .command('impacted')
  .description('List impacted tests for a diff')
  .option('--since <gitref>', 'Base ref (default from config)')
  .option('--diff <a..b>', 'Explicit diff range (not yet implemented)')
  .option('--files <list>', 'Comma-separated changed files')
  .option('--json', 'Emit JSON payload', false)
  .action(async (opts: { since?: string; diff?: string; files?: string; json?: boolean }) => {
    const files = opts.files
      ? opts.files
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    const since = typeof opts.since === 'string' ? opts.since : undefined;
    const diff = typeof opts.diff === 'string' ? opts.diff : undefined;
    const jsonFlag = Boolean(opts.json);
    const impactedOpts: Parameters<typeof impactedCommand>[0] = {
      since,
      diff,
      files,
      json: jsonFlag,
    };
    await impactedCommand(impactedOpts);
  });

program
  .command('run')
  .description('Run only impacted tests; fail-open to all tests if needed')
  .option('--since <gitref>', 'Base ref (default from config)')
  .option('--files <list>', 'Comma-separated changed files')
  .option('--all-on-miss', 'Fallback to run all tests on miss (default true)')
  .option('--report <path>', 'Write JSON summary report')
  .action(async (opts: { since?: string; files?: string; allOnMiss?: boolean; report?: string }) => {
    const files = opts.files
      ? opts.files
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
      : undefined;
    await runCommand({ since: opts.since, files, allOnMiss: opts.allOnMiss, report: opts.report });
  });

const report = program.command('report').description('Reporting utilities');
report
  .command('diff-coverage')
  .option('--since <gitref>', 'Base ref (default from config)')
  .option('--threshold <n>', 'Percent threshold', (v) => Number(v))
  .description('Check changed-lines coverage against a threshold')
  .action(async (opts: { since?: string; threshold?: number }) => {
    await diffCoverageCommand(opts);
  });

program
  .command('upload')
  .description('Upload build/coverage metadata to API endpoint')
  .option('--build <id>', 'Build id')
  .option('--endpoint <url>', 'API endpoint (overrides config)')
  .option('--token <token>', 'Project token (overrides config)')
  .action(async (opts: { build?: string; endpoint?: string; token?: string }) => {
    await uploadCommand(opts);
  });

// Ensure we don't drop the returned promise
void program.parseAsync(process.argv);
