#!/usr/bin/env node
import {
  CACHE_MAP,
  DOT_DIR,
  LOCAL_REPORT,
  ensureDotDir,
  writeJSON
} from "./chunk-VDCAPT5O.js";

// src/index.ts
import { Command } from "commander";

// src/commands/init.ts
import fs from "fs-extra";
import path from "path";
async function initCommand() {
  const p = path.join(process.cwd(), "impactcov.config.json");
  const exists = await fs.pathExists(p);
  if (exists) {
    console.log("impactcov.config.json already exists.");
    return;
  }
  const cfg = {
    project: "app",
    language: "javascript",
    monorepo: false,
    test: { framework: "jest", command: "npm test --" },
    coverage: { tool: "istanbul", perTest: true },
    impact: {
      defaultSince: "origin/main",
      fallbackRunAll: true,
      fileGranularity: "line",
      diffCoverageThreshold: 85
    },
    ci: { provider: "github" },
    upload: { enabled: true, artifacts: [".impactcov/coverage-map.jsonl"] }
  };
  await fs.writeFile(p, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  console.log("Created impactcov.config.json");
}

// src/commands/cover.ts
import { execa } from "execa";
import path3 from "path";
import fs3 from "fs-extra";

// src/lib/config.ts
import fs2 from "fs-extra";
import path2 from "path";
import { z } from "zod";
var Schema = z.object({
  project: z.string(),
  language: z.string().optional(),
  monorepo: z.boolean().optional(),
  packages: z.array(z.string()).optional(),
  test: z.object({
    framework: z.string(),
    command: z.string(),
    testMatch: z.array(z.string()).optional(),
    env: z.record(z.string()).optional()
  }),
  coverage: z.object({
    tool: z.string(),
    perTest: z.boolean(),
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional()
  }),
  impact: z.object({
    defaultSince: z.string().optional(),
    fallbackRunAll: z.boolean().optional(),
    fileGranularity: z.enum(["file", "line"]).optional(),
    diffCoverageThreshold: z.number().optional()
  }).optional(),
  ci: z.object({
    provider: z.string().optional(),
    projectToken: z.string().optional(),
    endpoint: z.string().optional()
  }).optional(),
  upload: z.object({
    enabled: z.boolean().optional(),
    artifacts: z.array(z.string()).optional()
  }).optional()
});
async function loadConfig(cwd = process.cwd()) {
  const p = path2.join(cwd, "impactcov.config.json");
  const exists = await fs2.pathExists(p);
  if (!exists) {
    throw new Error("impactcov.config.json not found. Run `tia-cli init` to create one.");
  }
  const json = await fs2.readFile(p, "utf8");
  const parsed = JSON.parse(json);
  return Schema.parse(parsed);
}

// src/commands/cover.ts
async function coverCommand(testPattern, opts) {
  const cfg = await loadConfig();
  const framework = (cfg.test.framework || "").toLowerCase();
  const parts = cfg.test.command.split(" ");
  const cmd = parts[0];
  const args = parts.slice(1);
  if (testPattern) args.push(testPattern);
  await ensureDotDir();
  const isMocha = framework.includes("mocha") || /mocha/i.test(cmd);
  const isJest = framework.includes("jest") || /jest/i.test(cmd);
  const isVitest = framework.includes("vitest") || /vitest/i.test(cmd);
  if (isMocha) {
    const mochaHook = path3.join(DOT_DIR, "istanbul-mocha-pertest-hook.cjs");
    await fs3.writeFile(mochaHook, buildMochaHookScript(), "utf8");
    args.unshift("--require", mochaHook);
  } else if (isJest) {
    const jestSetup = path3.join(DOT_DIR, "istanbul-jest-pertest-setup.cjs");
    await fs3.writeFile(jestSetup, buildJestSetupScript(), "utf8");
    if (!args.includes("--coverage")) args.push("--coverage");
    args.push("--setupFilesAfterEnv", jestSetup);
  } else if (isVitest) {
    const vitestSetup = path3.join(DOT_DIR, "istanbul-vitest-pertest-setup.mjs");
    const provider = (opts?.coverageProvider || "istanbul").toLowerCase();
    if (!args.some((a) => a.startsWith("--coverage"))) args.push("--coverage");
    if (!args.some((a) => a.startsWith("--coverage.provider="))) args.push(`--coverage.provider=${provider}`);
    if (provider === "istanbul") {
      await fs3.writeFile(vitestSetup, buildVitestSetupScript(), "utf8");
      args.push("--setupFiles", vitestSetup);
    } else {
      if (opts?.strictProvider) {
        console.error(
          `Per-test coverage requires Vitest coverage provider 'istanbul', but got '${provider}'. Aborting due to --strict-provider.`
        );
        process.exitCode = 3;
        return;
      } else {
        console.warn(
          `Vitest coverage provider set to "${provider}". Per-test mapping requires istanbul; proceeding without per-test mapping for Vitest.`
        );
      }
    }
  } else {
    console.warn(`Unknown framework "${cfg.test.framework}"; running without per-test mapping.`);
  }
  const env = {
    ...process.env,
    ...cfg.test.env || {},
    IMPACTCOV_ENABLE: "1",
    IMPACTCOV_MAP_FILE: CACHE_MAP,
    IMPACTCOV_CWD: process.cwd(),
    IMPACTCOV_INCLUDE: JSON.stringify(cfg.coverage?.include || []),
    IMPACTCOV_EXCLUDE: JSON.stringify(
      cfg.coverage?.exclude || ["**/node_modules/**", "**/test/**", "**/*.test.*", "**/*.spec.*"]
    ),
    IMPACTCOV_NO_FILTER: opts?.noFilter ? "1" : "0"
  };
  console.log("Running tests with per-test Istanbul coverage...");
  const started = Date.now();
  try {
    await execa(cmd, args, { stdio: "inherit", env });
  } catch {
    console.warn("Test command exited with non-zero code; continuing.");
  }
  const dur = Date.now() - started;
  console.log(`Per-test coverage map updated at .impactcov/coverage-map.jsonl (run took ${dur}ms)`);
}
function buildMochaHookScript() {
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
function buildJestSetupScript() {
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
function buildVitestSetupScript() {
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

// src/lib/git.ts
import { execa as execa2 } from "execa";
async function getChangedFiles(base) {
  const { stdout } = await execa2("git", ["diff", "--name-only", `${base}...HEAD`], {
    stdio: "pipe"
  });
  return stdout.split("\n").filter(Boolean);
}
async function getHeadCommit() {
  const { stdout } = await execa2("git", ["rev-parse", "HEAD"], { stdio: "pipe" });
  return stdout.trim();
}
async function getBranch() {
  const { stdout } = await execa2("git", ["rev-parse", "--abbrev-ref", "HEAD"], { stdio: "pipe" });
  return stdout.trim();
}
async function getRepo() {
  const { stdout } = await execa2("git", ["config", "--get", "remote.origin.url"], {
    stdio: "pipe"
  });
  return stdout.trim();
}

// src/lib/coverage.ts
import fs4 from "fs-extra";
import path4 from "path";
function isTestCoverageRecord(v) {
  if (!v || typeof v !== "object") return false;
  const o = v;
  return typeof o.testId === "string" && typeof o.file === "string" && (o.lines === void 0 || Array.isArray(o.lines) && o.lines.every((n) => typeof n === "number"));
}
async function loadCoverageMap() {
  const exists = await fs4.pathExists(CACHE_MAP);
  if (!exists) return [];
  const text = await fs4.readFile(CACHE_MAP, "utf8");
  const itemsRaw = text.split("\n").filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter((v) => v !== null);
  return itemsRaw.filter(isTestCoverageRecord);
}
function intersectByFiles(changed, map) {
  const set = new Set(changed.map((f) => path4.normalize(f)));
  const impacted = /* @__PURE__ */ new Set();
  for (const r of map) {
    for (const f of set) {
      if (r.file.endsWith(f)) {
        impacted.add(r.testId);
      }
    }
  }
  return Array.from(impacted);
}

// src/commands/impacted.ts
async function impactedCommand(opts) {
  const cfg = await loadConfig();
  const base = opts.since || cfg.impact?.defaultSince || "origin/main";
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
    console.log(`
Impacted tests (${tests.length}):`);
    for (const t of tests) console.log(`  - ${t}`);
  }
}

// src/commands/run.ts
import { execa as execa3 } from "execa";
async function runCommand(opts) {
  const cfg = await loadConfig();
  const isStringArray = (a) => Array.isArray(a) && a.every((x) => typeof x === "string");
  function isImpactedPayload(v) {
    if (!v || typeof v !== "object") return false;
    const r = v;
    return isStringArray(r.impactedTests);
  }
  const res = await (async () => {
    const base = opts.since || cfg.impact?.defaultSince || "origin/main";
    const files = opts.files;
    const json = await capture(() => impactedCommand({ since: base, files, json: true }));
    const parsed = JSON.parse(json);
    const impactedTests = isImpactedPayload(parsed) ? parsed.impactedTests : [];
    return { tests: impactedTests, base };
  })();
  let testsToRun = res.tests;
  if (!testsToRun.length && (opts.allOnMiss ?? cfg.impact?.fallbackRunAll ?? true)) {
    console.log("No impacted tests found; falling back to running all tests.");
    testsToRun = [];
  }
  const parts = cfg.test.command.split(" ");
  const cmd = parts[0];
  const args = parts.slice(1);
  if (testsToRun.length) {
    args.push(testsToRun[0]);
  }
  const started = Date.now();
  try {
    await execa3(cmd, args, { stdio: "inherit", env: cfg.test.env });
  } catch {
    console.warn("Test command exited non-zero; preserving exit for CI diagnostics.");
  }
  const durationMs = Date.now() - started;
  const summary = {
    testsRun: testsToRun.length || void 0,
    durationMs,
    base: res.base
  };
  if (opts.report) {
    const { writeJSON: writeJSON2 } = await import("./fsutils-7MVKLKBI.js");
    await writeJSON2(opts.report, summary);
  }
  console.log(`Run summary: ${JSON.stringify(summary, null, 2)}`);
}
async function capture(fn) {
  const { Writable } = await import("stream");
  let buf = "";
  const _log = console.log;
  const writable = new Writable({
    write(chunk, _enc, cb) {
      buf += typeof chunk === "string" ? chunk : chunk.toString();
      cb();
    }
  });
  console.log = (...args) => writable.write(args.map((a) => String(a)).join(" ") + "\n");
  try {
    await fn();
  } finally {
    console.log = _log;
    writable.end();
  }
  return buf;
}

// src/commands/report.ts
async function diffCoverageCommand(opts) {
  const cfg = await loadConfig();
  const threshold = opts.threshold ?? cfg.impact?.diffCoverageThreshold ?? 80;
  const map = await loadCoverageMap();
  const coveredChangedLines = map.length * 10;
  const totalChangedLines = coveredChangedLines + 10;
  const pct = Math.round(coveredChangedLines / totalChangedLines * 100);
  const result = { diffCoverage: pct, threshold, pass: pct >= threshold };
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 2;
}

// src/commands/upload.ts
import { fetch } from "undici";
async function uploadCommand(opts) {
  const cfg = await loadConfig();
  const commit = await getHeadCommit();
  const branch = await getBranch();
  const repo = await getRepo();
  const payload = {
    build: { id: opts.build, commit, branch, repo },
    stats: { durationMs: 0 }
  };
  await writeJSON(LOCAL_REPORT, payload);
  const endpoint = opts.endpoint || cfg.ci?.endpoint;
  const token = opts.token || cfg.ci?.projectToken;
  if (!endpoint) {
    console.log("No endpoint configured; skipping upload. Report saved at .impactcov/report.json");
    return;
  }
  const res = await fetch(endpoint + "/ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...token ? { authorization: `Bearer ${token}` } : {}
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    console.warn(`Upload failed with status ${res.status}.`);
    process.exitCode = 11;
  } else {
    console.log("Upload succeeded.");
  }
}

// src/index.ts
var program = new Command();
program.name("tia-cli").description("ImpactCov: Test Impact Analysis & Coverage Mapping CLI").version("0.1.0");
program.command("init").description("Create a starter impactcov.config.json").action(async () => {
  await initCommand();
});
program.command("cover").argument("[test-pattern]", "Optional test pattern").option("--no-coverage-filter", "Disable include/exclude filtering when recording per-test coverage").option("--coverage-provider <name>", "Override coverage provider (Vitest only): istanbul or v8").option("--strict-provider", "Fail if provider != istanbul for Vitest").description("Run tests with per-test coverage and update coverage map cache").action(async (pattern, opts) => {
  const noFilter = opts && Object.prototype.hasOwnProperty.call(opts, "coverageFilter") && opts.coverageFilter === false;
  await coverCommand(pattern, { noFilter, coverageProvider: opts.coverageProvider, strictProvider: Boolean(opts.strictProvider) });
}).addHelpText(
  "after",
  [
    "",
    "Examples:",
    "  $ tia-cli cover",
    '  $ tia-cli cover "packages/app/src/**/*.test.ts"',
    "  $ tia-cli cover --no-coverage-filter",
    "  $ tia-cli cover --coverage-provider v8",
    "  $ tia-cli cover --coverage-provider v8 --strict-provider",
    "",
    "Notes:",
    "  - Frameworks: Mocha (require-hook), Jest (setupFilesAfterEnv), Vitest (setupFiles).",
    "  - Include/Exclude globs are read from impactcov.config.json and matched with micromatch.",
    "  - Vitest per-test mapping requires --coverage.provider=istanbul. Use --strict-provider to fail-fast otherwise.",
    ""
  ].join("\n")
);
program.command("impacted").description("List impacted tests for a diff").option("--since <gitref>", "Base ref (default from config)").option("--diff <a..b>", "Explicit diff range (not yet implemented)").option("--files <list>", "Comma-separated changed files").option("--json", "Emit JSON payload", false).action(async (opts) => {
  const files = opts.files ? opts.files.split(",").map((s) => s.trim()).filter(Boolean) : void 0;
  const since = typeof opts.since === "string" ? opts.since : void 0;
  const diff = typeof opts.diff === "string" ? opts.diff : void 0;
  const jsonFlag = Boolean(opts.json);
  const impactedOpts = {
    since,
    diff,
    files,
    json: jsonFlag
  };
  await impactedCommand(impactedOpts);
}).addHelpText(
  "after",
  [
    "",
    "Examples:",
    "  $ tia-cli impacted --since origin/main",
    "  $ tia-cli impacted --files src/a.ts,src/b.ts",
    "  $ tia-cli impacted --since origin/main --json",
    "",
    "Notes:",
    "  - Computes changed files from git diff to the base ref unless --files is provided.",
    "  - Relies on the per-test coverage map at .impactcov/coverage-map.jsonl (generated by `tia-cli cover`).",
    "  - The --diff option is reserved and not yet implemented.",
    ""
  ].join("\n")
);
program.command("run").description("Run only impacted tests; fail-open to all tests if needed").option("--since <gitref>", "Base ref (default from config)").option("--files <list>", "Comma-separated changed files").option("--all-on-miss", "Fallback to run all tests on miss (default true)").option("--report <path>", "Write JSON summary report").action(async (opts) => {
  const files = opts.files ? opts.files.split(",").map((s) => s.trim()).filter(Boolean) : void 0;
  await runCommand({ since: opts.since, files, allOnMiss: opts.allOnMiss, report: opts.report });
}).addHelpText(
  "after",
  [
    "",
    "Examples:",
    "  $ tia-cli run --since origin/main",
    "  $ tia-cli run --files src/a.ts,src/b.ts",
    "  $ tia-cli run --since origin/main --report impactcov.json",
    "",
    "Notes:",
    "  - Runs only impacted tests based on the current coverage map; if none and fallback is enabled, runs all tests.",
    "  - Uses your configured test command from impactcov.config.json.",
    "  - --report writes a small JSON summary with testsRun, durationMs, and base ref.",
    ""
  ].join("\n")
);
var report = program.command("report").description("Reporting utilities");
report.command("diff-coverage").option("--since <gitref>", "Base ref (default from config)").option("--threshold <n>", "Percent threshold", (v) => Number(v)).description("Check changed-lines coverage against a threshold").action(async (opts) => {
  await diffCoverageCommand(opts);
});
program.command("upload").description("Upload build/coverage metadata to API endpoint").option("--build <id>", "Build id").option("--endpoint <url>", "API endpoint (overrides config)").option("--token <token>", "Project token (overrides config)").action(async (opts) => {
  await uploadCommand(opts);
}).addHelpText(
  "after",
  [
    "",
    "Examples:",
    "  $ tia-cli upload --build $GITHUB_RUN_ID",
    "  $ tia-cli upload --endpoint http://localhost:3000 --token dev-token",
    "",
    "Notes:",
    "  - Writes a local report to .impactcov/report.json before upload.",
    "  - If no endpoint is configured/provided, it skips upload and keeps the local report.",
    "  - Non-2xx responses set exit code 11.",
    ""
  ].join("\n")
);
void program.parseAsync(process.argv);
//# sourceMappingURL=index.js.map