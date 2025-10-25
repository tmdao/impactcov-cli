import { execa } from 'execa';
import path from 'path';
import fs from 'fs-extra';
import { loadConfig } from '../lib/config.js';
import { ensureDotDir, CACHE_MAP, DOT_DIR } from '../lib/fsutils.js';

export async function coverCommand(
  testPattern?: string,
  opts?: { noFilter?: boolean; coverageProvider?: string; strictProvider?: boolean },
) {
  const cfg = await loadConfig();

  const framework = (cfg.test.framework || '').toLowerCase();
  const parts = cfg.test.command.split(' ');
  const cmd = parts[0];
  const args = parts.slice(1);
  if (testPattern) args.push(testPattern);

  await ensureDotDir();
  const isMocha = framework.includes('mocha') || /mocha/i.test(cmd);
  const isJest = framework.includes('jest') || /jest/i.test(cmd);
  const isVitest = framework.includes('vitest') || /vitest/i.test(cmd);

  if (isMocha) {
    const mochaHook = path.join(DOT_DIR, 'istanbul-mocha-pertest-hook.cjs');
    await fs.writeFile(mochaHook, buildMochaHookScript(), 'utf8');
    args.unshift('--require', mochaHook);
  } else if (isJest) {
    const jestSetup = path.join(DOT_DIR, 'istanbul-jest-pertest-setup.cjs');
    await fs.writeFile(jestSetup, buildJestSetupScript(), 'utf8');
    if (!args.includes('--coverage')) args.push('--coverage');
    args.push('--setupFilesAfterEnv', jestSetup);
  } else if (isVitest) {
    const vitestSetup = path.join(DOT_DIR, 'istanbul-vitest-pertest-setup.mjs');
    const provider = (opts?.coverageProvider || 'istanbul').toLowerCase();
    if (!args.some((a) => a.startsWith('--coverage'))) args.push('--coverage');
    if (!args.some((a) => a.startsWith('--coverage.provider='))) args.push(`--coverage.provider=${provider}`);
    if (provider === 'istanbul') {
      await fs.writeFile(vitestSetup, buildVitestSetupScript(), 'utf8');
      args.push('--setupFiles', vitestSetup);
    } else {
      if (opts?.strictProvider) {
        console.error(
          `Per-test coverage requires Vitest coverage provider 'istanbul', but got '${provider}'. Aborting due to --strict-provider.`,
        );
        process.exitCode = 3;
        return;
      } else {
        console.warn(
          `Vitest coverage provider set to "${provider}". Per-test mapping requires istanbul; proceeding without per-test mapping for Vitest.`,
        );
      }
    }
  } else {
    console.warn(`Unknown framework "${cfg.test.framework}"; running without per-test mapping.`);
  }

  const env = {
    ...process.env,
    ...(cfg.test.env || {}),
    IMPACTCOV_ENABLE: '1',
    IMPACTCOV_MAP_FILE: CACHE_MAP,
    IMPACTCOV_CWD: process.cwd(),
    IMPACTCOV_INCLUDE: JSON.stringify(cfg.coverage?.include || []),
    IMPACTCOV_EXCLUDE: JSON.stringify(
      cfg.coverage?.exclude || ['**/node_modules/**', '**/test/**', '**/*.test.*', '**/*.spec.*'],
    ),
    IMPACTCOV_NO_FILTER: opts?.noFilter ? '1' : '0',
  } as NodeJS.ProcessEnv;

  console.log('Running tests with per-test Istanbul coverage...');
  const started = Date.now();
  try {
    await execa(cmd, args, { stdio: 'inherit', env });
  } catch {
    console.warn('Test command exited with non-zero code; continuing.');
  }
  const dur = Date.now() - started;
  console.log(`Per-test coverage map updated at .impactcov/coverage-map.jsonl (run took ${dur}ms)`);
}

function buildMochaHookScript(): string {
  return String.raw`
'use strict';
const fs = require('fs');
const path = require('path');
const mm = require('micromatch');
const { hookRequire } = require('istanbul-lib-hook');
const { createInstrumenter } = require('istanbul-lib-instrument');
const { createCoverageMap } = require('istanbul-lib-coverage');

const MAP_FILE = process.env.IMPACTCOV_MAP_FILE || path.join(process.cwd(), '.impactcov', 'coverage-map.jsonl');
const CWD = process.env.IMPACTCOV_CWD || process.cwd();
const INCLUDES = safeParseJSON(process.env.IMPACTCOV_INCLUDE, []);
const EXCLUDES = safeParseJSON(process.env.IMPACTCOV_EXCLUDE, ['**/node_modules/**']);
const NO_FILTER = process.env.IMPACTCOV_NO_FILTER === '1';

function safeParseJSON(s, def) { try { return s ? JSON.parse(s) : def; } catch { return def; } }

function toPosix(p) { return p.split('\\').join('/'); }
function rel(p) { return toPosix(path.relative(CWD, p)); }

function shouldInstrument(filename) {
  const r = rel(filename);
  if (!r || r.startsWith('..')) return false;
  if (r.includes('node_modules/')) return false;
  // Always exclude common test patterns from instrumentation
  if (/(^|\/)__(tests|mocks)__(\/|$)/i.test(r)) return false;
  if (/(^|\/)test(\/|$)/i.test(r)) return false;
  if (/\.(test|spec)\.[jt]sx?$/i.test(r)) return false;
  if (NO_FILTER) return true;
  if (Array.isArray(EXCLUDES) && EXCLUDES.length && mm.isMatch(r, EXCLUDES)) return false;
  if (!Array.isArray(INCLUDES) || INCLUDES.length === 0) return true;
  return mm.isMatch(r, INCLUDES);
}

const instrumenter = createInstrumenter({ coverageVariable: '__coverage__' });
hookRequire(shouldInstrument, (code, { filename }) => {
  try { return instrumenter.instrumentSync(code, filename); } catch { return code; }
});

function resetCoverage() {
  const cov = global.__coverage__ || {};
  Object.keys(cov).forEach((f) => {
    const fc = cov[f] || {};
    if (fc.s) { Object.keys(fc.s).forEach((k) => (fc.s[k] = 0)); }
    if (fc.f) { Object.keys(fc.f).forEach((k) => (fc.f[k] = 0)); }
    if (fc.b) {
      Object.keys(fc.b).forEach((k) => {
        const arr = fc.b[k] || [];
        for (let i = 0; i < arr.length; i++) arr[i] = 0;
      });
    }
  });
}

function recordCoverage(test) {
  const cov = global.__coverage__ || {};
  const map = createCoverageMap(cov);
  const files = map.files();
  if (!files.length) return;
  const testId = typeof test.fullTitle === 'function' ? test.fullTitle() : String((test && test.title) || 'unknown');
  const linesOut = [];
  for (const f of files) {
    try {
      const r = rel(f);
      if (!NO_FILTER) {
        if (Array.isArray(EXCLUDES) && EXCLUDES.length && mm.isMatch(r, EXCLUDES)) continue;
        if (Array.isArray(INCLUDES) && INCLUDES.length && !mm.isMatch(r, INCLUDES)) continue;
      }
      const fc = map.fileCoverageFor(f);
      const lineCov = fc.getLineCoverage ? fc.getLineCoverage() : {};
      const lines = Object.keys(lineCov).filter((ln) => Number(lineCov[ln]) > 0).map((ln) => Number(ln));
      if (lines.length) {
        linesOut.push(JSON.stringify({ testId, file: f, lines }));
      }
    } catch {}
  }
  if (linesOut.length) {
    try {
      fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
      fs.appendFileSync(MAP_FILE, linesOut.join('\n') + '\n', 'utf8');
    } catch {}
  }
}

try {
  const Mocha = require('mocha');
  if (Mocha && Mocha.Runner && Mocha.Runner.prototype && typeof Mocha.Runner.prototype.runTest === 'function') {
    const RP = Mocha.Runner.prototype;
    const orig = RP.runTest;
    RP.runTest = function(fn) {
      const t = this.test;
      try { resetCoverage(); } catch {}
      return orig.call(this, (err) => {
        try { recordCoverage(t); } catch {}
        fn(err);
      });
    };
  }
} catch {}
`;
}

function buildJestSetupScript(): string {
  return String.raw`
'use strict';
const fs = require('fs');
const path = require('path');
const mm = require('micromatch');
const { createCoverageMap } = require('istanbul-lib-coverage');
let expectRef;
try { expectRef = require('@jest/globals').expect; } catch { expectRef = global.expect; }

const MAP_FILE = process.env.IMPACTCOV_MAP_FILE || path.join(process.cwd(), '.impactcov', 'coverage-map.jsonl');
const CWD = process.env.IMPACTCOV_CWD || process.cwd();
function toPosix(p) { return p.split('\\').join('/'); }
function rel(p) { return toPosix(path.relative(CWD, p)); }
function safeParseJSON(s, def) { try { return s ? JSON.parse(s) : def; } catch { return def; } }
const INCLUDES = safeParseJSON(process.env.IMPACTCOV_INCLUDE, []);
const EXCLUDES = safeParseJSON(process.env.IMPACTCOV_EXCLUDE, ['**/node_modules/**']);
const NO_FILTER = process.env.IMPACTCOV_NO_FILTER === '1';

function resetCoverage() {
  const cov = global.__coverage__ || {};
  Object.keys(cov).forEach((f) => {
    const fc = cov[f] || {};
    if (fc.s) { Object.keys(fc.s).forEach((k) => (fc.s[k] = 0)); }
    if (fc.f) { Object.keys(fc.f).forEach((k) => (fc.f[k] = 0)); }
    if (fc.b) {
      Object.keys(fc.b).forEach((k) => {
        const arr = fc.b[k] || [];
        for (let i = 0; i < arr.length; i++) arr[i] = 0;
      });
    }
  });
}

function recordCoverage(testId) {
  const cov = global.__coverage__ || {};
  const map = createCoverageMap(cov);
  const files = map.files();
  if (!files.length) return;
  const linesOut = [];
  for (const f of files) {
    try {
      const r = rel(f);
      if (!NO_FILTER) {
        if (Array.isArray(EXCLUDES) && EXCLUDES.length && mm.isMatch(r, EXCLUDES)) continue;
        if (Array.isArray(INCLUDES) && INCLUDES.length && !mm.isMatch(r, INCLUDES)) continue;
      }
      const fc = map.fileCoverageFor(f);
      const lineCov = fc.getLineCoverage ? fc.getLineCoverage() : {};
      const lines = Object.keys(lineCov).filter((ln) => Number(lineCov[ln]) > 0).map((ln) => Number(ln));
      if (lines.length) {
        linesOut.push(JSON.stringify({ testId, file: f, lines }));
      }
    } catch {}
  }
  if (linesOut.length) {
    try {
      fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
      fs.appendFileSync(MAP_FILE, linesOut.join('\n') + '\n', 'utf8');
    } catch {}
  }
}

beforeEach(() => { try { resetCoverage(); } catch {} });
afterEach(() => {
  try {
    const state = expectRef && typeof expectRef.getState === 'function' ? expectRef.getState() : {};
    const testId = (state && state.currentTestName) || 'unknown';
    recordCoverage(testId);
  } catch {}
});
`;
}

function buildVitestSetupScript(): string {
  return String.raw`
import fs from 'fs';
import path from 'path';
import { beforeEach, afterEach, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createCoverageMap } = require('istanbul-lib-coverage');
const mm = require('micromatch');

const MAP_FILE = process.env.IMPACTCOV_MAP_FILE || path.join(process.cwd(), '.impactcov', 'coverage-map.jsonl');
const CWD = process.env.IMPACTCOV_CWD || process.cwd();
function toPosix(p) { return p.split('\\').join('/'); }
function rel(p) { return toPosix(path.relative(CWD, p)); }
function safeParseJSON(s, def) { try { return s ? JSON.parse(s) : def; } catch { return def; } }
const INCLUDES = safeParseJSON(process.env.IMPACTCOV_INCLUDE, []);
const EXCLUDES = safeParseJSON(process.env.IMPACTCOV_EXCLUDE, ['**/node_modules/**']);
const NO_FILTER = process.env.IMPACTCOV_NO_FILTER === '1';

function resetCoverage() {
  const cov = globalThis.__coverage__ || {};
  Object.keys(cov).forEach((f) => {
    const fc = cov[f] || {};
    if (fc.s) { Object.keys(fc.s).forEach((k) => (fc.s[k] = 0)); }
    if (fc.f) { Object.keys(fc.f).forEach((k) => (fc.f[k] = 0)); }
    if (fc.b) {
      Object.keys(fc.b).forEach((k) => {
        const arr = fc.b[k] || [];
        for (let i = 0; i < arr.length; i++) arr[i] = 0;
      });
    }
  });
}

function recordCoverage(testId) {
  const cov = globalThis.__coverage__ || {};
  const map = createCoverageMap(cov);
  const files = map.files();
  if (!files.length) return;
  const linesOut = [];
  for (const f of files) {
    try {
      const r = rel(f);
      if (!NO_FILTER) {
        if (Array.isArray(EXCLUDES) && EXCLUDES.length && mm.isMatch(r, EXCLUDES)) continue;
        if (Array.isArray(INCLUDES) && INCLUDES.length && !mm.isMatch(r, INCLUDES)) continue;
      }
      const fc = map.fileCoverageFor(f);
      const lineCov = fc.getLineCoverage ? fc.getLineCoverage() : {};
      const lines = Object.keys(lineCov).filter((ln) => Number(lineCov[ln]) > 0).map((ln) => Number(ln));
      if (lines.length) {
        linesOut.push(JSON.stringify({ testId, file: f, lines }));
      }
    } catch {}
  }
  if (linesOut.length) {
    try {
      fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
      fs.appendFileSync(MAP_FILE, linesOut.join('\n') + '\n', 'utf8');
    } catch {}
  }
}

beforeEach(() => { try { resetCoverage(); } catch {} });
afterEach(() => {
  try {
    const state = expect && typeof expect.getState === 'function' ? expect.getState() : {};
    const testId = (state && state.currentTestName) || 'unknown';
    recordCoverage(testId);
  } catch {}
});
`;
}
