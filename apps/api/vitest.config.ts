import { defineProject } from 'vitest/config'

// Integration tests need the docker infra (`npm run infra:up`): they use a throwaway Mongo database
// and Redis key prefix per test file.
export default defineProject({
  test: { name: 'api', environment: 'node', include: ['test/**/*.test.ts'], testTimeout: 30_000, hookTimeout: 30_000 },
})
