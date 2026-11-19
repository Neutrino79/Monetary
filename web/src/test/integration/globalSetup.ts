/// <reference types="node" />
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const PORT = 8765
let server: ChildProcess | undefined
let dir = ''

async function waitForHealth(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/health`)
      if (r.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('The Python backend did not become healthy in time (is `pip install -r backend/requirements.txt` done at the repo root?)')
}

async function assertPortFree() {
  try {
    await fetch(`http://127.0.0.1:${PORT}/health`)
  } catch {
    return // nothing listening: good
  }
  throw new Error(`Port ${PORT} is already in use (a stale backend?). Stop it so the suite runs against a fresh database.`)
}

export default async function setup() {
  await assertPortFree()
  dir = mkdtempSync(join(tmpdir(), 'monetary-it-'))
  server = spawn(process.env.PYTHON ?? 'python3', ['-m', 'uvicorn', 'monetary.presentation.api.app:app', '--port', String(PORT), '--log-level', 'warning'], {
    cwd: resolve(__dirname, '../../../../backend'), // the backend package root
    env: {
      ...process.env,
      MONETARY_DATA_DIR: dir,
      MONETARY_ENV: 'development',
      MONETARY_CAPTCHA_DIFFICULTY: '3000', // the built-in captcha stays on, just quick to solve
      MONETARY_CORS_ORIGINS: '*',
      MONETARY_APP_NAME: 'Monetary',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  await waitForHealth()

  return async () => {
    server?.kill('SIGTERM')
    rmSync(dir, { recursive: true, force: true })
  }
}
