import { test, expect } from '@playwright/test'

test('deploy in mock mode, send A2A, see clone appear in the side panel', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('tab', { name: /deployment/i }).click()
  await page.getByRole('button', { name: /^new$/i }).click()
  await page.getByLabel(/container image/i).fill('example/agent:latest')
  await page.getByLabel(/^org$/i).fill('test')
  await page.getByLabel(/^space$/i).fill('sample_apps')
  await page.getByLabel(/app name/i).fill('app')
  await page.getByRole('button', { name: /create deployment/i }).click()

  // Both steps reach "done" in mock mode; the router URL shows on the card.
  await expect(page.getByText('done', { exact: false }).first()).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('link', { name: /app-sandbox-router\.mock\.example\.io/ })).toBeVisible({ timeout: 15000 })

  // The CF Status side panel is visible here (Deployment tab) — router + template rows.
  const panel = page.getByTestId('cf-status-panel')
  await expect(panel.getByRole('cell', { name: 'app-sandbox-router', exact: true })).toBeVisible({ timeout: 15000 })

  await page.getByRole('tab', { name: /a2a/i }).click()
  await page.getByLabel(/tenant/i).fill('t1')
  await page.getByLabel(/message/i).fill('hello')
  await page.getByRole('button', { name: /send/i }).click()
  // The agent text renders in the "Agent response" box (and also in the
  // collapsed raw JSON), so scope to the first match.
  await expect(page.getByText(/mock reply/i).first()).toBeVisible({ timeout: 15000 })

  // No tab switch needed — the per-tenant clone appears in the always-visible panel.
  await expect(page.getByTestId('cf-status-panel').getByRole('cell', { name: 'app-sandbox-t1', exact: true }))
    .toBeVisible({ timeout: 15000 })

  // Delete the deployment: confirm, watch teardown, card disappears, panel empties.
  await page.getByRole('tab', { name: /deployment/i }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: /^delete$/i }).click()
  await expect(page.getByText('app — example/agent:latest')).toHaveCount(0, { timeout: 15000 })
  await expect(page.getByTestId('cf-status-panel').getByRole('cell', { name: 'app-sandbox-router', exact: true }))
    .toHaveCount(0, { timeout: 15000 })
})
