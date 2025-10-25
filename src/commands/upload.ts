import { loadConfig } from '../lib/config.js';
import { getHeadCommit, getBranch, getRepo } from '../lib/git.js';
import { writeJSON, LOCAL_REPORT } from '../lib/fsutils.js';
import { BuildPayload } from '../types.js';
import { fetch } from 'undici';

export async function uploadCommand(opts: { build?: string; endpoint?: string; token?: string }) {
  const cfg = await loadConfig();
  const commit = await getHeadCommit();
  const branch = await getBranch();
  const repo = await getRepo();

  const payload: BuildPayload = {
    build: { id: opts.build, commit, branch, repo },
    stats: { durationMs: 0 },
  };
  await writeJSON(LOCAL_REPORT, payload);

  const endpoint = opts.endpoint || cfg.ci?.endpoint;
  const token = opts.token || cfg.ci?.projectToken;

  if (!endpoint) {
    console.log('No endpoint configured; skipping upload. Report saved at .impactcov/report.json');
    return;
  }
  const res = await fetch(endpoint + '/ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.warn(`Upload failed with status ${res.status}.`);
    process.exitCode = 11;
  } else {
    console.log('Upload succeeded.');
  }
}
