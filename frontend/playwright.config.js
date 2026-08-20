import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: { baseURL: 'http://localhost:5173' },
  webServer: {
    // Start both backend and frontend from the repo root.
    command: 'npm --prefix .. run dev',
    // Wait on the backend health endpoint *through the Vite proxy*: this is 200
    // only once BOTH Vite and the backend are up. Waiting on the bare Vite URL
    // races — Vite becomes ready before the backend, so the app's first API
    // calls hit a 500 from the proxy.
    url: 'http://localhost:5173/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
})
