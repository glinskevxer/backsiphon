import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    clearMocks: true,
    // better-sqlite3 is a native addon and it does not survive being torn down
    // on a worker thread, so every file gets a forked process of its own. It
    // costs a few seconds and it stops the run dying with a segfault half way
    // through. This is the vitest 1 spelling of what used to be threads: false.
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary'],
      include: ['src/**/*.ts'],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
    },
  },
});
