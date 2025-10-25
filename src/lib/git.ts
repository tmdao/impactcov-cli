import { execa } from 'execa';

export async function getChangedFiles(base: string): Promise<string[]> {
  const { stdout } = await execa('git', ['diff', '--name-only', `${base}...HEAD`], {
    stdio: 'pipe',
  });
  return stdout.split('\n').filter(Boolean);
}

export async function getHeadCommit(): Promise<string> {
  const { stdout } = await execa('git', ['rev-parse', 'HEAD'], { stdio: 'pipe' });
  return stdout.trim();
}

export async function getBranch(): Promise<string> {
  const { stdout } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { stdio: 'pipe' });
  return stdout.trim();
}

export async function getRepo(): Promise<string> {
  const { stdout } = await execa('git', ['config', '--get', 'remote.origin.url'], {
    stdio: 'pipe',
  });
  return stdout.trim();
}
