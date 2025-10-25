export type ImpactCovConfig = {
  project: string;
  language?: string;
  monorepo?: boolean;
  packages?: string[];
  test: {
    framework: string;
    command: string;
    testMatch?: string[];
    env?: Record<string, string>;
  };
  coverage: {
    tool: 'istanbul' | 'none' | string;
    perTest: boolean;
    include?: string[];
    exclude?: string[];
  };
  impact?: {
    defaultSince?: string;
    fallbackRunAll?: boolean;
    fileGranularity?: 'file' | 'line';
    diffCoverageThreshold?: number;
  };
  ci?: {
    provider?: 'github' | 'gitlab' | 'circle' | 'jenkins' | string;
    projectToken?: string;
    endpoint?: string;
  };
  upload?: { enabled?: boolean; artifacts?: string[] };
};

export type TestCoverageRecord = {
  testId: string;
  file: string;
  lines?: number[];
};

export type BuildPayload = {
  build: { id?: string; commit: string; branch?: string; repo?: string };
  stats?: { testsRun?: number; testsSkipped?: number; durationMs?: number };
  diff?: { base?: string; changedFiles?: string[] };
  coverageMapUrl?: string;
  resultsUrl?: string;
};
