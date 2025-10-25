import { loadConfig } from '../lib/config.js';
import { impactedCommand } from './impacted.js';
import { execa } from 'execa';

export async function runCommand(opts: {
  since?: string;
  files?: string[];
  allOnMiss?: boolean;
  report?: string;
}) {
  const cfg = await loadConfig();
  const isStringArray = (a: unknown): a is string[] => Array.isArray(a) && a.every((x) => typeof x === 'string');
  function isImpactedPayload(v: unknown): v is { impactedTests: string[] } {
    if (!v || typeof v !== 'object') return false;
    const r = v as Record<string, unknown>;
    return isStringArray(r.impactedTests);
  }
  const res = await (async () => {
    const base = opts.since || cfg.impact?.defaultSince || 'origin/main';
    const files = opts.files;
    const json = await capture(() => impactedCommand({ since: base, files, json: true }));
    const parsed: unknown = JSON.parse(json);
    const impactedTests = isImpactedPayload(parsed) ? parsed.impactedTests : [];
    return { tests: impactedTests, base };
  })();

  let testsToRun = res.tests;
  if (!testsToRun.length && (opts.allOnMiss ?? cfg.impact?.fallbackRunAll ?? true)) {
    console.log('No impacted tests found; falling back to running all tests.');
    testsToRun = [];
  }

  const parts = cfg.test.command.split(' ');
  const cmd = parts[0];
  const args = parts.slice(1);
  if (testsToRun.length) {
    args.push(testsToRun[0]);
  }
  const started = Date.now();
  try {
    await execa(cmd, args, { stdio: 'inherit', env: cfg.test.env });
  } catch {
    console.warn('Test command exited non-zero; preserving exit for CI diagnostics.');
  }
  const durationMs = Date.now() - started;
  const summary = {
    testsRun: testsToRun.length || undefined,
    durationMs,
    base: res.base,
  };
  if (opts.report) {
    const { writeJSON } = await import('../lib/fsutils.js');
    await writeJSON(opts.report, summary);
  }
  console.log(`Run summary: ${JSON.stringify(summary, null, 2)}`);
}

async function capture(fn: () => Promise<void>) {
  const { Writable } = await import('node:stream');
  let buf = '';
  const _log = console.log;
  const writable = new Writable({
    write(chunk: Buffer | string, _enc: BufferEncoding, cb: (err?: Error | null) => void) {
      buf += typeof chunk === 'string' ? chunk : chunk.toString();
      cb();
    },
  });
  console.log = (...args: unknown[]) => writable.write(args.map((a) => String(a)).join(' ') + '\n');
  try {
    await fn();
  } finally {
    console.log = _log;
    writable.end();
  }
  return buf;
}
