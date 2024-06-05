import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    clearMocks: true,
    // better-sqlite3 is a native addon and it does not survive being torn down
    // on a worker thread, so the suite runs in the main one. It costs a few
    // seconds and it stops the run dying with a segfault half way through.
    threads: false,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary'],
      include: ['src/**/*.ts'],
    },
  },
});
