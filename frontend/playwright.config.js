import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: { baseURL: 'http://localhost:5173' },
  webServer: {
    // Start both backend and frontend from the repo root, in mock mode: the UI itself only
    // offers real deployments, so the e2e run switches to mock via VITE_DEPLOY_MODE.
    command: 'npm --prefix .. run dev',
    env: { VITE_DEPLOY_MODE: 'mock' },
    // Wait on the backend health endpoint *through the Vite proxy*: this is 200
    // only once BOTH Vite and the backend are up. Waiting on the bare Vite URL
    // races — Vite becomes ready before the backend, so the app's first API
    // calls hit a 500 from the proxy.
    url: 'http://localhost:5173/api/health',
    // Never reuse a running cf-deployer: it would deploy for real.
    reuseExistingServer: false,
    timeout: 60000,
  },
})
