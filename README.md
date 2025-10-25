# ImpactCov CLI (tia-cli)

A TypeScript CLI that powers test-impact analysis and coverage mapping.

## Features

- `init` — create a starter config
- `cover` — run tests with per-test coverage and cache a test↔files map
- `impacted` — compute impacted tests for a diff
- `run` — run only the impacted tests (fails open in CI)
- `report diff-coverage` — changed-lines coverage gate
- `upload` — upload build/coverage metadata to an API endpoint

> This repo is a scaffold with working stubs so you can iterate quickly.
> Commands aim to be side-effect-free unless explicitly running your test command.

## Quick start

> Package manager: This repo is configured for pnpm via the `packageManager` field. If pnpm isn't installed globally, use Corepack (bundled with Node 18+) to activate it:

```bash
# Enable Corepack once (may require sudo on some systems)
corepack enable

# Activate the version declared in package.json
corepack install
```

```bash
# Install deps
pnpm install  # or npm/yarn if you prefer

# Build (tsup bundles to dist/)
pnpm build

# Link CLI for local testing
pnpm link --global || npm link

# Show help
tia-cli --help
```

## Config

Create `impactcov.config.json` in your repo root. Example:

```json
{
  "project": "webapp",
  "language": "javascript",
  "monorepo": false,
  "test": {
    "framework": "jest",
    "command": "npm test --",
    "testMatch": ["**/*.test.ts?(x)"]
  },
  "coverage": {
    "tool": "istanbul",
    "perTest": true,
    "include": ["src/**/*.{ts,tsx,js,jsx}"],
    "exclude": ["**/*.d.ts", "dist/**"]
  },
  "impact": {
    "defaultSince": "origin/main",
    "fallbackRunAll": true,
    "fileGranularity": "line",
    "diffCoverageThreshold": 85
  },
  "ci": {
    "provider": "github",
    "projectToken": "${IMPACTCOV_TOKEN}",
    "endpoint": "https://api.impactcov.dev"
  },
  "upload": {
    "enabled": true,
    "artifacts": [".impactcov/coverage-map.jsonl"]
  }
}
```

## GitHub Action (example)

```yaml
name: Impacted tests
on:
  pull_request:
jobs:
  impacted:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: Run impacted tests
        run: |
          node dist/index.js run --since origin/main --report impactcov.json || true
          node dist/index.js upload --build ${{ github.run_id }}
```
