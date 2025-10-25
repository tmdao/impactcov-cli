// src/lib/fsutils.ts
import fs from "fs-extra";
import path from "path";
var CWD = process.cwd();
var DOT_DIR = path.join(CWD, ".impactcov");
var CACHE_MAP = path.join(DOT_DIR, "coverage-map.jsonl");
var LOCAL_REPORT = path.join(DOT_DIR, "report.json");
async function ensureDotDir() {
  await fs.ensureDir(DOT_DIR);
}
async function readJSON(p, def) {
  try {
    const c = await fs.readFile(p, "utf8");
    return JSON.parse(c);
  } catch {
    return def;
  }
}
async function writeJSON(p, data) {
  await fs.ensureDir(path.dirname(p));
  await fs.writeFile(p, JSON.stringify(data, null, 2), "utf8");
}
async function appendLines(p, lines) {
  await fs.ensureDir(path.dirname(p));
  await fs.appendFile(p, lines.join("\n") + "\n", "utf8");
}

export {
  CWD,
  DOT_DIR,
  CACHE_MAP,
  LOCAL_REPORT,
  ensureDotDir,
  readJSON,
  writeJSON,
  appendLines
};
//# sourceMappingURL=chunk-VDCAPT5O.js.map