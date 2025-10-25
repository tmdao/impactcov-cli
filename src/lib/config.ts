import fs from 'fs-extra';
import path from 'path';
import { z } from 'zod';
import { ImpactCovConfig } from '../types.js';

const Schema = z.object({
  project: z.string(),
  language: z.string().optional(),
  monorepo: z.boolean().optional(),
  packages: z.array(z.string()).optional(),
  test: z.object({
    framework: z.string(),
    command: z.string(),
    testMatch: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
  }),
  coverage: z.object({
    tool: z.string(),
    perTest: z.boolean(),
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
  }),
  impact: z
    .object({
      defaultSince: z.string().optional(),
      fallbackRunAll: z.boolean().optional(),
      fileGranularity: z.enum(['file', 'line']).optional(),
      diffCoverageThreshold: z.number().optional(),
    })
    .optional(),
  ci: z
    .object({
      provider: z.string().optional(),
      projectToken: z.string().optional(),
      endpoint: z.string().optional(),
    })
    .optional(),
  upload: z
    .object({
      enabled: z.boolean().optional(),
      artifacts: z.array(z.string()).optional(),
    })
    .optional(),
});

export async function loadConfig(cwd = process.cwd()): Promise<ImpactCovConfig> {
  const p = path.join(cwd, 'impactcov.config.json');
  const exists = await fs.pathExists(p);
  if (!exists) {
    throw new Error('impactcov.config.json not found. Run `tia-cli init` to create one.');
  }
  const json = await fs.readFile(p, 'utf8');
  const parsed: unknown = JSON.parse(json);
  return Schema.parse(parsed);
}
