import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import NameOrderSequencer from './src/test/integration/sequencer.ts'

/**
 * End-to-end: the real React app and services talk HTTP to a real uvicorn
 * running the Python backend against a throw-away SQLite database
 * (see src/test/integration/globalSetup.ts).
 *
 *   npm run test:integration        (needs `pip install -r backend/requirements.txt` at the repo root)
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/test/integration/**/*.test.{ts,tsx}'],
    globalSetup: ['src/test/integration/globalSetup.ts'],
    // the files share one database and must run one after another, in file-name order
    fileParallelism: false,
    maxWorkers: 1,
    sequence: { shuffle: false, sequencer: NameOrderSequencer },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: { VITE_API_BASE_URL: 'http://127.0.0.1:8765/api/v0.5' },
  },
})
