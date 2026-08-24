import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic'
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url))
    },
    // Engine modules use NodeNext-style `.js` specifiers → map to TS sources.
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs']
    }
  },
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 85
      }
    },
    // Integration tests share a single Postgres container and some specs reset
    // the schema (DROP CASCADE). Run them sequentially to avoid collisions.
    sequence: {
      concurrent: false
    },
    // Serialize test FILES too — specs share one database and reset its schema.
    fileParallelism: false
  }
});
