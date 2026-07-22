import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'

// Le test d'isolation lit process.env. Vitest ne charge pas .env.local seul.
config({ path: '.env.local' })

export default defineConfig({
  test: {
    environment: 'node',
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
})
