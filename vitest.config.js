import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.js'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'services',
          include: ['tests/services/**/*.test.js'],
          environment: 'node',
          setupFiles: ['tests/setup.js'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.js'],
          environment: 'node',
          testTimeout: 30_000,
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
        },
      },
      {
        test: {
          name: 'snapshots',
          include: ['tests/snapshots/**/*.test.js'],
          environment: 'node',
          testTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/index.js'],
      reporter: ['text', 'lcov'],
    },
  },
})
