# CF Deployer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web UI that sandboxifies a user-provided container image and deploys it behind a single router URL on Cloud Foundry, visualizing the two-step pipeline, A2A test traffic, and the live CF app landscape.

**Architecture:** A local Node.js/Express backend is the only component that touches `docker`, `cf`, and the existing shell scripts; it exposes REST + SSE to a React (Vite) single-page app. All tool invocation goes through an `Executor` interface with two implementations — `MockExecutor` (deterministic, scripted, always-succeeds) and `RealExecutor` (spawns the real scripts) — selected per run by a `mode` flag. All state is in-memory.

**Tech Stack:** Node.js 20+, Express, `eventsource`/native SSE, Vitest (backend + frontend unit tests), React 18 + Vite, Playwright (one end-to-end happy path). No database.

## Global Constraints

- Backend is the ONLY component that spawns `docker`, `cf`, or the shell scripts. The SPA never shells out.
- All state is in-memory; nothing is persisted to disk. Config values (CF + Docker credentials) are never written to disk or logged.
- Every tool invocation goes through the `Executor` interface. Tests and demo/rehearsal runs use `MockExecutor`; no test requires Docker or CF.
- The `mode` flag (`"real"` | `"mock"`) is chosen per run and defaults to `"mock"`.
- The two pipeline steps are, in order: (1) sandboxify with `--no-deploy`, capturing the pushed image ref; (2) deploy-to-CF using that image ref, capturing the router URL.
- Underlying scripts (invoked as-is, absolute paths, do not modify them):
  - Sandboxify: `/Users/I072325/Documents/git/sandboxify/sandboxify.sh`
  - Deploy: `/Users/I072325/Documents/git/sandbox-router-cf-poc/scripts/deploy-service-2.sh`
  - A2A reference behavior: `/Users/I072325/Documents/git/sandbox-router-cf-poc/scripts/test-request.sh`
- CF Status filters CF apps by label `poc=sandbox-router`.
- The default OpenShell policy YAML (from the idea file) is prefilled into every new deployment and is editable.

---

## File Structure

```
cf-deployer-poc/
  package.json                      # root: dev script runs backend + frontend
  backend/
    package.json
    src/
      server.js                     # Express app wiring, route registration
      config/configStore.js         # in-memory config (CF + Docker creds)
      parsers/imageRef.js           # extract pushed image ref from sandboxify output
      parsers/routerUrl.js          # extract router URL from deploy output
      parsers/cfApps.js             # parse `cf apps` table -> app rows
      parsers/credentials.js        # parse + mask KEY=VALUE files
      executor/executor.js          # Executor interface + shared types (JSDoc)
      executor/mockExecutor.js      # scripted, deterministic executor + fake CF state
      executor/realExecutor.js      # spawns real scripts / cf, streams stdout
      deployments/deploymentStore.js# in-memory deployment list + lifecycle
      deployments/pipeline.js       # chained sandboxify -> deploy orchestration
      a2a/a2aClient.js              # JWT mint + message/send POST
      cfstatus/cfStatus.js          # polls executor for cf apps, diffs
      defaults/defaultPolicy.js     # the default policy YAML string
    test/                           # Vitest specs mirror src/ paths
  frontend/
    package.json
    index.html
    src/
      main.jsx
      api.js                        # REST + SSE client
      App.jsx                       # tab shell
      tabs/ConfigurationTab.jsx
      tabs/DeploymentTab.jsx
      tabs/A2AClientTab.jsx
      tabs/CFStatusTab.jsx
      components/                   # shared UI bits (progress, masked list, grid)
    test/                           # Vitest + Testing Library specs
    e2e/happy-path.spec.js          # Playwright end-to-end vs mock backend
```

---

### Task 1: Repo scaffold + one dev command

**Files:**
- Create: `package.json`, `backend/package.json`, `backend/src/server.js`, `frontend/package.json`, `frontend/index.html`, `frontend/src/main.jsx`, `frontend/src/App.jsx`, `frontend/vite.config.js`
- Test: `backend/test/server.health.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: an Express `app` exported from `backend/src/server.js`; a `GET /api/health` route returning `{ status: "ok" }`. Root `npm run dev` starts backend (port 3001) and Vite (port 5173, proxying `/api` to 3001).

- [ ] **Step 1: Write the failing test**

```js
// backend/test/server.health.test.js
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../src/server.js'

describe('health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/server.health.test.js`
Expected: FAIL — cannot import `../src/server.js` (does not exist).

- [ ] **Step 3: Write minimal implementation**

Scaffold `backend/package.json` (type: module; deps: express; devDeps: vitest, supertest), `frontend/package.json` (react, react-dom, vite, @vitejs/plugin-react), root `package.json` with `"dev": "concurrently \"npm --prefix backend run dev\" \"npm --prefix frontend run dev\""`. Then:

```js
// backend/src/server.js
import express from 'express'
export const app = express()
app.use(express.json())
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
if (process.env.NODE_ENV !== 'test') {
  app.listen(3001, () => console.log('backend on :3001'))
}
```

Minimal `frontend/src/App.jsx` renders `<h1>CF Deployer</h1>`; `main.jsx` mounts it; `vite.config.js` proxies `/api` → `http://localhost:3001`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/server.health.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json backend frontend
git commit -m "chore: scaffold backend + frontend with health check"
```

---

### Task 2: Default policy constant

**Files:**
- Create: `backend/src/defaults/defaultPolicy.js`
- Test: `backend/test/defaultPolicy.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `export const DEFAULT_POLICY_YAML` — a string containing the exact default OpenShell policy from the idea file (`version: 1`, `filesystem_policy`, `landlock`, `process`, `network_policies` with `allow_github`/`allow_aicore`/`allow_oauth`).

- [ ] **Step 1: Write the failing test**

```js
// backend/test/defaultPolicy.test.js
import { describe, it, expect } from 'vitest'
import { DEFAULT_POLICY_YAML } from '../src/defaults/defaultPolicy.js'

describe('DEFAULT_POLICY_YAML', () => {
  it('is the OpenShell policy with the three network policies', () => {
    expect(DEFAULT_POLICY_YAML).toContain('version: 1')
    expect(DEFAULT_POLICY_YAML).toContain('allow_github')
    expect(DEFAULT_POLICY_YAML).toContain('allow_aicore')
    expect(DEFAULT_POLICY_YAML).toContain('allow_oauth')
    expect(DEFAULT_POLICY_YAML).toContain('landlock')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/defaultPolicy.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/defaults/defaultPolicy.js` exporting `DEFAULT_POLICY_YAML` as a template literal containing the full policy YAML copied verbatim from `IDEA.md` lines 46–93.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/defaultPolicy.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/defaults/defaultPolicy.js backend/test/defaultPolicy.test.js
git commit -m "feat: add default OpenShell policy constant"
```

---

### Task 3: Credentials parser + masking

**Files:**
- Create: `backend/src/parsers/credentials.js`
- Test: `backend/test/credentials.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseEnvFile(text) -> Array<{ key: string, value: string }>` — splits on newlines, skips blank lines and lines starting with `#`, splits each on the first `=`.
  - `maskValue(value) -> string` — first 4 chars then `…` (e.g. `asd123abc` → `asd1…`); values ≤ 4 chars become `…`.
  - `toMaskedList(text) -> Array<{ key: string, masked: string }>`.

- [ ] **Step 1: Write the failing test**

```js
// backend/test/credentials.test.js
import { describe, it, expect } from 'vitest'
import { parseEnvFile, maskValue, toMaskedList } from '../src/parsers/credentials.js'

describe('credentials', () => {
  it('parses KEY=VALUE, skipping blanks and comments', () => {
    const text = 'A=1\n\n# c\nB=two=parts'
    expect(parseEnvFile(text)).toEqual([
      { key: 'A', value: '1' },
      { key: 'B', value: 'two=parts' },
    ])
  })
  it('masks values keeping first 4 chars', () => {
    expect(maskValue('asd123abc')).toBe('asd1…')
    expect(maskValue('ab')).toBe('…')
  })
  it('produces a masked list', () => {
    expect(toMaskedList('AI_CORE_SECRET=asd123')).toEqual([
      { key: 'AI_CORE_SECRET', masked: 'asd1…' },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/credentials.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/parsers/credentials.js
export function parseEnvFile(text) {
  return text.split(/\r?\n/)
    .filter(l => l.trim() !== '' && !l.trimStart().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return { key: l.slice(0, i), value: l.slice(i + 1) }
    })
}
export function maskValue(value) {
  return value.length > 4 ? value.slice(0, 4) + '…' : '…'
}
export function toMaskedList(text) {
  return parseEnvFile(text).map(({ key, value }) => ({ key, masked: maskValue(value) }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/credentials.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/parsers/credentials.js backend/test/credentials.test.js
git commit -m "feat: add KEY=VALUE credentials parser with masking"
```

---

### Task 4: Sandboxify image-ref parser

**Files:**
- Create: `backend/src/parsers/imageRef.js`
- Test: `backend/test/imageRef.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `extractImageRef(stdout) -> string | null` — finds the tag line `sandboxify.sh` prints. It builds `TAG="$REGISTRY/$APP:<timestamp>"` and logs it via `building sandboxed image: <TAG>` and `Built + pushed <TAG>`. Return the ref from the last matching line, or `null` if absent.

- [ ] **Step 1: Write the failing test**

```js
// backend/test/imageRef.test.js
import { describe, it, expect } from 'vitest'
import { extractImageRef } from '../src/parsers/imageRef.js'

describe('extractImageRef', () => {
  it('reads the ref from the "building sandboxed image" line', () => {
    const out = '==> building sandboxed image: my.reg/sbx-app:20260820120000 (base pkg-mgr: apt)'
    expect(extractImageRef(out)).toBe('my.reg/sbx-app:20260820120000')
  })
  it('prefers the "Built + pushed" line when present', () => {
    const out = [
      '==> building sandboxed image: my.reg/sbx-app:1 (base pkg-mgr: apt)',
      'Built + pushed my.reg/sbx-app:2 (skipping deploy).',
    ].join('\n')
    expect(extractImageRef(out)).toBe('my.reg/sbx-app:2')
  })
  it('returns null when no ref present', () => {
    expect(extractImageRef('nothing here')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/imageRef.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/parsers/imageRef.js
const REF = /([^\s]+\/[^\s]+:[^\s)]+)/
export function extractImageRef(stdout) {
  const lines = stdout.split(/\r?\n/)
  const built = [...lines].reverse().find(l => l.includes('Built + pushed'))
  const building = [...lines].reverse().find(l => l.includes('building sandboxed image:'))
  const line = built || building
  if (!line) return null
  const m = line.match(REF)
  return m ? m[1] : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/imageRef.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/parsers/imageRef.js backend/test/imageRef.test.js
git commit -m "feat: add sandboxify image-ref parser"
```

---

### Task 5: Router-URL parser

**Files:**
- Create: `backend/src/parsers/routerUrl.js`
- Test: `backend/test/routerUrl.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `extractRouterUrl(stdout) -> string | null` — `deploy-service-2.sh` prints `  router URL:    https://<host>`. Return the URL, or `null`.

- [ ] **Step 1: Write the failing test**

```js
// backend/test/routerUrl.test.js
import { describe, it, expect } from 'vitest'
import { extractRouterUrl } from '../src/parsers/routerUrl.js'

describe('extractRouterUrl', () => {
  it('reads the router URL line', () => {
    const out = '=== bundle ready ===\n  router URL:    https://sbx-poc-sandbox-router.cfapps.example.io\n'
    expect(extractRouterUrl(out)).toBe('https://sbx-poc-sandbox-router.cfapps.example.io')
  })
  it('returns null when absent', () => {
    expect(extractRouterUrl('no url')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/routerUrl.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/parsers/routerUrl.js
export function extractRouterUrl(stdout) {
  const line = stdout.split(/\r?\n/).find(l => l.includes('router URL:'))
  if (!line) return null
  const m = line.match(/(https?:\/\/[^\s]+)/)
  return m ? m[1] : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/routerUrl.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/parsers/routerUrl.js backend/test/routerUrl.test.js
git commit -m "feat: add router-URL parser"
```

---

### Task 6: `cf apps` table parser

**Files:**
- Create: `backend/src/parsers/cfApps.js`
- Test: `backend/test/cfApps.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseCfApps(stdout) -> Array<{ name: string, requestedState: string, processes: string, routes: string }>` — parses the standard `cf apps` table (header row `name  requested state  processes  routes`, then rows). Blank lines and pre-table noise (e.g. `Getting apps...`) are ignored.

- [ ] **Step 1: Write the failing test**

```js
// backend/test/cfApps.test.js
import { describe, it, expect } from 'vitest'
import { parseCfApps } from '../src/parsers/cfApps.js'

describe('parseCfApps', () => {
  it('parses rows below the header', () => {
    const out = [
      'Getting apps in org test / space sample_apps...',
      '',
      'name                    requested state   processes   routes',
      'sbx-poc-sandbox-router  started           web:1/1     r1.example.io',
      'agent-sandbox-t1        started           web:1/1     t1.example.io',
    ].join('\n')
    const rows = parseCfApps(out)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      name: 'sbx-poc-sandbox-router', requestedState: 'started',
      processes: 'web:1/1', routes: 'r1.example.io',
    })
    expect(rows[1].name).toBe('agent-sandbox-t1')
  })
  it('returns [] when no table', () => {
    expect(parseCfApps('No apps found')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/cfApps.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/parsers/cfApps.js
export function parseCfApps(stdout) {
  const lines = stdout.split(/\r?\n/)
  const headerIdx = lines.findIndex(l => /^name\s+requested state\s+processes\s+routes/.test(l))
  if (headerIdx === -1) return []
  return lines.slice(headerIdx + 1)
    .filter(l => l.trim() !== '')
    .map(l => {
      const [name, requestedState, processes, ...rest] = l.trim().split(/\s{2,}/)
      return { name, requestedState, processes, routes: (rest.join('  ') || '').trim() }
    })
    .filter(r => r.name)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/cfApps.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/parsers/cfApps.js backend/test/cfApps.test.js
git commit -m "feat: add cf apps table parser"
```

---

### Task 7: In-memory config store

**Files:**
- Create: `backend/src/config/configStore.js`
- Test: `backend/test/configStore.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `createConfigStore() -> { get(): Config, set(partial): Config, toEnv(): Record<string,string> }` where `Config = { cfApi, cfUsername, cfPassword, dockerUsername, dockerPassword }` (all strings, default `''`). `toEnv()` maps to the env names the scripts expect: `CF_API`, `CF_USERNAME`, `CF_PASSWORD`, `REGISTRY_USER`, `REGISTRY_PASS`.

- [ ] **Step 1: Write the failing test**

```js
// backend/test/configStore.test.js
import { describe, it, expect } from 'vitest'
import { createConfigStore } from '../src/config/configStore.js'

describe('configStore', () => {
  it('defaults to empty strings', () => {
    expect(createConfigStore().get().cfApi).toBe('')
  })
  it('merges partial updates', () => {
    const s = createConfigStore()
    s.set({ cfApi: 'https://api', dockerUsername: 'u' })
    expect(s.get().cfApi).toBe('https://api')
    expect(s.get().dockerUsername).toBe('u')
  })
  it('maps to script env names', () => {
    const s = createConfigStore()
    s.set({ cfApi: 'a', cfUsername: 'b', cfPassword: 'c', dockerUsername: 'd', dockerPassword: 'e' })
    expect(s.toEnv()).toEqual({
      CF_API: 'a', CF_USERNAME: 'b', CF_PASSWORD: 'c', REGISTRY_USER: 'd', REGISTRY_PASS: 'e',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/configStore.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/config/configStore.js
const EMPTY = { cfApi: '', cfUsername: '', cfPassword: '', dockerUsername: '', dockerPassword: '' }
export function createConfigStore() {
  let cfg = { ...EMPTY }
  return {
    get: () => ({ ...cfg }),
    set: (partial) => { cfg = { ...cfg, ...partial }; return { ...cfg } },
    toEnv: () => ({
      CF_API: cfg.cfApi, CF_USERNAME: cfg.cfUsername, CF_PASSWORD: cfg.cfPassword,
      REGISTRY_USER: cfg.dockerUsername, REGISTRY_PASS: cfg.dockerPassword,
    }),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/configStore.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/config/configStore.js backend/test/configStore.test.js
git commit -m "feat: add in-memory config store"
```

---

### Task 8: Executor interface + MockExecutor

**Files:**
- Create: `backend/src/executor/executor.js`, `backend/src/executor/mockExecutor.js`
- Test: `backend/test/mockExecutor.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `executor.js`: JSDoc `@typedef` for `Executor` with methods:
    - `sandboxify(opts, onLine) -> Promise<{ code: number, imageRef: string|null, log: string }>`
    - `deploy(opts, onLine) -> Promise<{ code: number, routerUrl: string|null, log: string }>`
    - `a2a(opts) -> Promise<{ status: number, body: any }>`
    - `cfApps() -> Promise<Array<CfAppRow>>`
    - `onLine(line: string)` is a callback invoked per stdout line (for SSE streaming).
  - `mockExecutor.js`: `createMockExecutor() -> Executor` — emits a fixed sequence of scripted lines (with `await` delays kept tiny/0 in tests), returns `imageRef: 'mock.reg/sbx-<name>:mock'` and `routerUrl: 'https://<name>-sandbox-router.mock.example.io'`, and keeps a mutable in-memory CF app list: starts with template (stopped) + router (started); `a2a({ tenant })` adds `agent-sandbox-<tenant>` (started) if absent; `cfApps()` returns the current list.

- [ ] **Step 1: Write the failing test**

```js
// backend/test/mockExecutor.test.js
import { describe, it, expect } from 'vitest'
import { createMockExecutor } from '../src/executor/mockExecutor.js'

describe('mockExecutor', () => {
  it('sandboxify streams lines and returns a mock image ref', async () => {
    const ex = createMockExecutor()
    const lines = []
    const r = await ex.sandboxify({ appName: 'app', image: 'i', policy: 'p' }, l => lines.push(l))
    expect(r.code).toBe(0)
    expect(r.imageRef).toBe('mock.reg/sbx-app:mock')
    expect(lines.length).toBeGreaterThan(0)
  })
  it('deploy returns a mock router url', async () => {
    const ex = createMockExecutor()
    const r = await ex.deploy({ appName: 'app', dockerImage: 'x' }, () => {})
    expect(r.routerUrl).toBe('https://app-sandbox-router.mock.example.io')
  })
  it('a2a creates a tenant clone visible in cfApps', async () => {
    const ex = createMockExecutor()
    await ex.deploy({ appName: 'app', dockerImage: 'x' }, () => {})
    const before = await ex.cfApps()
    await ex.a2a({ tenant: 't1', message: 'hi', url: 'u', secret: 's' })
    const after = await ex.cfApps()
    expect(after.length).toBe(before.length + 1)
    expect(after.some(a => a.name.includes('t1'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/mockExecutor.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `executor.js` with JSDoc typedefs only (no runtime code). Implement `mockExecutor.js` per the Produces contract: push scripted lines via `onLine`, track a `apps` array, mutate on `deploy`/`a2a`, return the fixed refs/urls.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/mockExecutor.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/executor/executor.js backend/src/executor/mockExecutor.js backend/test/mockExecutor.test.js
git commit -m "feat: add executor interface and mock executor"
```

---

### Task 9: RealExecutor (spawns scripts + cf)

**Files:**
- Create: `backend/src/executor/realExecutor.js`
- Test: `backend/test/realExecutor.test.js`

**Interfaces:**
- Consumes: parsers from Tasks 4–6 (`extractImageRef`, `extractRouterUrl`, `parseCfApps`); `child_process.spawn`.
- Produces: `createRealExecutor({ spawn, scripts, env }) -> Executor` — `spawn` is injectable (defaults to Node's `child_process.spawn`) so tests pass a fake. `scripts` holds absolute paths (see Global Constraints). `sandboxify` spawns the sandboxify script with `--no-deploy` and the mapped flags, streams stdout via `onLine`, and on close returns `{ code, imageRef: extractImageRef(log), log }`. `deploy` spawns the deploy script similarly, returns `{ code, routerUrl: extractRouterUrl(log), log }`. `cfApps` spawns `cf apps` and returns `parseCfApps(stdout)`. `a2a` performs JWT mint + POST (delegated to Task 11's `a2aClient`).

- [ ] **Step 1: Write the failing test**

```js
// backend/test/realExecutor.test.js
import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { createRealExecutor } from '../src/executor/realExecutor.js'

function fakeSpawn(stdoutText, code = 0) {
  return () => {
    const cp = new EventEmitter()
    cp.stdout = new EventEmitter(); cp.stderr = new EventEmitter()
    setImmediate(() => {
      cp.stdout.emit('data', Buffer.from(stdoutText))
      cp.emit('close', code)
    })
    return cp
  }
}

describe('realExecutor.sandboxify', () => {
  it('streams lines and parses the image ref', async () => {
    const ex = createRealExecutor({
      spawn: fakeSpawn('==> building sandboxed image: r/sbx-app:9 (base pkg-mgr: apt)\n'),
      scripts: { sandboxify: '/s.sh', deploy: '/d.sh' }, env: {},
    })
    const lines = []
    const r = await ex.sandboxify({ appName: 'app', image: 'i', policy: '/p.yaml' }, l => lines.push(l))
    expect(r.code).toBe(0)
    expect(r.imageRef).toBe('r/sbx-app:9')
    expect(lines.join('\n')).toContain('building sandboxed image')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/realExecutor.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Implement `createRealExecutor`: a private `run(cmd, args, onLine)` helper that spawns, buffers stdout into `log`, splits on newlines to call `onLine`, resolves `{ code, log }` on `close`. `sandboxify`/`deploy`/`cfApps` build their arg arrays (sandboxify always includes `--no-deploy`) and post-process with the Task 4–6 parsers. Leave `a2a` delegating to a passed-in `a2aClient` (wired in Task 11).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/realExecutor.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/executor/realExecutor.js backend/test/realExecutor.test.js
git commit -m "feat: add real executor spawning scripts and cf"
```

---

### Task 10: Deployment store + pipeline orchestration

**Files:**
- Create: `backend/src/deployments/deploymentStore.js`, `backend/src/deployments/pipeline.js`
- Test: `backend/test/deploymentStore.test.js`, `backend/test/pipeline.test.js`

**Interfaces:**
- Consumes: an `Executor` (Task 8/9).
- Produces:
  - `createDeploymentStore() -> { create(input): Deployment, get(id): Deployment, list(): Deployment[], update(id, patch): Deployment }`. `Deployment = { id, image, org, space, appName, policy, credentials: Array<{key,masked}>, steps: { sandboxify: Step, deploy: Step }, routerUrl: string|null }`; `Step = { status: 'pending'|'running'|'done'|'failed', log: string }`.
  - `runPipeline({ deployment, executor, store, env, onLine }) -> Promise<Deployment>` — runs sandboxify (status running→done/failed; on failure, deploy stays `pending` and pipeline stops), then deploy using the captured `imageRef` as `dockerImage`, sets `routerUrl`. Each streamed line calls `onLine(stepName, line)` and appends to that step's log.

- [ ] **Step 1: Write the failing tests**

```js
// backend/test/deploymentStore.test.js
import { describe, it, expect } from 'vitest'
import { createDeploymentStore } from '../src/deployments/deploymentStore.js'

describe('deploymentStore', () => {
  it('creates with pending steps and lists', () => {
    const s = createDeploymentStore()
    const d = s.create({ image: 'i', org: 'o', space: 'sp', appName: 'a', policy: 'p', credentials: [] })
    expect(d.steps.sandboxify.status).toBe('pending')
    expect(d.steps.deploy.status).toBe('pending')
    expect(s.list()).toHaveLength(1)
    expect(s.get(d.id).image).toBe('i')
  })
})
```

```js
// backend/test/pipeline.test.js
import { describe, it, expect } from 'vitest'
import { createDeploymentStore } from '../src/deployments/deploymentStore.js'
import { runPipeline } from '../src/deployments/pipeline.js'
import { createMockExecutor } from '../src/executor/mockExecutor.js'

describe('runPipeline', () => {
  it('runs both steps and captures router url', async () => {
    const store = createDeploymentStore()
    const d = store.create({ image: 'i', org: 'o', space: 'sp', appName: 'app', policy: 'p', credentials: [] })
    const out = await runPipeline({ deployment: d, executor: createMockExecutor(), store, env: {}, onLine: () => {} })
    expect(out.steps.sandboxify.status).toBe('done')
    expect(out.steps.deploy.status).toBe('done')
    expect(out.routerUrl).toBe('https://app-sandbox-router.mock.example.io')
  })
  it('stops and marks failed when sandboxify fails', async () => {
    const failing = { ...createMockExecutor(), sandboxify: async () => ({ code: 1, imageRef: null, log: 'boom' }) }
    const store = createDeploymentStore()
    const d = store.create({ image: 'i', org: 'o', space: 'sp', appName: 'app', policy: 'p', credentials: [] })
    const out = await runPipeline({ deployment: d, executor: failing, store, env: {}, onLine: () => {} })
    expect(out.steps.sandboxify.status).toBe('failed')
    expect(out.steps.deploy.status).toBe('pending')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run test/deploymentStore.test.js test/pipeline.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write minimal implementation**

Implement `deploymentStore.js` (Map keyed by an incrementing id; `create` seeds both steps `pending`). Implement `pipeline.js` `runPipeline`: set sandboxify `running`, call `executor.sandboxify`, on `code!==0` set `failed` and return; else `done`, then deploy `running`, call `executor.deploy({ dockerImage: imageRef, ... })`, set `done`/`failed`, set `routerUrl`. Append streamed lines to the active step's log and forward via `onLine`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run test/deploymentStore.test.js test/pipeline.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/deployments backend/test/deploymentStore.test.js backend/test/pipeline.test.js
git commit -m "feat: add deployment store and chained pipeline"
```

---

### Task 11: A2A client (JWT mint + POST)

**Files:**
- Create: `backend/src/a2a/a2aClient.js`
- Test: `backend/test/a2aClient.test.js`

**Interfaces:**
- Consumes: `node:crypto`; an injectable `fetch`.
- Produces:
  - `mintJwt({ secret, tenant, now, ttl = 3600 }) -> string` — HS256 JWT with header `{alg:HS256,typ:JWT}` and payload `{ sub: tenant, iat: now, exp: now+ttl }`, base64url-encoded, HMAC-SHA256 signature (mirrors `test-request.sh`).
  - `sendMessage({ url, secret, tenant, message, fetch, now }) -> Promise<{ status, body }>` — POSTs the A2A `message/send` JSON-RPC envelope with `Authorization: Bearer <jwt>` to `url`.

- [ ] **Step 1: Write the failing test**

```js
// backend/test/a2aClient.test.js
import { describe, it, expect } from 'vitest'
import { mintJwt, sendMessage } from '../src/a2a/a2aClient.js'

describe('a2aClient', () => {
  it('mints a three-part JWT with the tenant as sub', () => {
    const jwt = mintJwt({ secret: 's', tenant: 't1', now: 1000 })
    const [, payloadB64] = jwt.split('.')
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    expect(jwt.split('.')).toHaveLength(3)
    expect(payload.sub).toBe('t1')
    expect(payload.exp).toBe(1000 + 3600)
  })
  it('posts message/send with bearer auth', async () => {
    let captured
    const fakeFetch = async (u, opts) => { captured = { u, opts }; return { status: 200, json: async () => ({ ok: true }) } }
    const r = await sendMessage({ url: 'https://r/', secret: 's', tenant: 't1', message: 'hi', fetch: fakeFetch, now: 1 })
    expect(r.status).toBe(200)
    expect(captured.opts.headers.Authorization).toMatch(/^Bearer /)
    expect(JSON.parse(captured.opts.body).method).toBe('message/send')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/a2aClient.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Implement `mintJwt` using `crypto.createHmac('sha256', secret)` over `header.payload` with base64url encoding. Implement `sendMessage` building the JSON-RPC body `{jsonrpc:'2.0',id:1,method:'message/send',params:{message:{messageId:'m1',role:'user',parts:[{kind:'text',text:message}]}}}`, POST via injected `fetch`, return `{ status, body: await res.json() }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/a2aClient.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/a2a/a2aClient.js backend/test/a2aClient.test.js
git commit -m "feat: add A2A client with JWT mint and message/send"
```

---

### Task 12: Backend REST + SSE routes

**Files:**
- Modify: `backend/src/server.js`
- Create: `backend/src/routes.js`
- Test: `backend/test/routes.test.js`

**Interfaces:**
- Consumes: config store (T7), deployment store + pipeline (T10), executors (T8/T9), a2a (T11), credentials parser (T3), default policy (T2).
- Produces (all JSON unless noted):
  - `GET /api/config` → current config (passwords omitted from response). `PUT /api/config` → merge partial, returns sanitized config.
  - `GET /api/default-policy` → `{ policy: DEFAULT_POLICY_YAML }`.
  - `POST /api/credentials/parse` (body `{ text }`) → `{ credentials: Array<{key,masked}> }`.
  - `GET /api/deployments` → list. `POST /api/deployments` (body includes `mode`) → creates + starts pipeline async, returns the created deployment. `GET /api/deployments/:id` → one.
  - `GET /api/deployments/:id/events` (SSE) → streams `{ step, line }` and a final `{ done: true }`.
  - `POST /api/deployments/:id/a2a` (body `{ tenant, message }`) → `{ status, body }`.
  - `GET /api/cf-status?mode=` (SSE) → periodic `cf apps` snapshots as `{ apps: [...] }`.
  - An executor factory picks mock/real by `mode`.

- [ ] **Step 1: Write the failing test**

```js
// backend/test/routes.test.js
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../src/server.js'

describe('routes', () => {
  it('serves the default policy', async () => {
    const res = await request(app).get('/api/default-policy')
    expect(res.status).toBe(200)
    expect(res.body.policy).toContain('allow_github')
  })
  it('parses credentials without leaking values', async () => {
    const res = await request(app).post('/api/credentials/parse').send({ text: 'K=secretvalue' })
    expect(res.body.credentials).toEqual([{ key: 'K', masked: 'secr…' }])
  })
  it('creates a deployment in mock mode and lists it', async () => {
    const res = await request(app).post('/api/deployments')
      .send({ image: 'i', org: 'o', space: 'sp', appName: 'app', policy: 'p', credentials: [], mode: 'mock' })
    expect(res.status).toBe(201)
    const list = await request(app).get('/api/deployments')
    expect(list.body.some(d => d.id === res.body.id)).toBe(true)
  })
  it('omits passwords from GET /api/config', async () => {
    await request(app).put('/api/config').send({ cfPassword: 'p', cfApi: 'a' })
    const res = await request(app).get('/api/config')
    expect(res.body.cfApi).toBe('a')
    expect(res.body.cfPassword).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/routes.test.js`
Expected: FAIL — routes not registered.

- [ ] **Step 3: Write minimal implementation**

Create `routes.js` exporting `registerRoutes(app, deps)` where `deps` bundles the stores/factories (constructed once in `server.js`). Implement each route per the Produces contract; SSE routes set `Content-Type: text/event-stream` and write `data: <json>\n\n`. `GET /api/config` strips `cfPassword`/`dockerPassword`. Wire `registerRoutes(app, ...)` into `server.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/routes.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/server.js backend/src/routes.js backend/test/routes.test.js
git commit -m "feat: add REST and SSE routes"
```

---

### Task 13: CF Status poller

**Files:**
- Create: `backend/src/cfstatus/cfStatus.js`
- Test: `backend/test/cfStatus.test.js`

**Interfaces:**
- Consumes: an `Executor` (its `cfApps()`).
- Produces: `startCfStatusStream({ executor, intervalMs, emit, setInterval, clearInterval }) -> stop()` — calls `executor.cfApps()` immediately then every `intervalMs`, invokes `emit({ apps })` each time; `setInterval`/`clearInterval` injectable for tests. `stop()` clears the timer.

- [ ] **Step 1: Write the failing test**

```js
// backend/test/cfStatus.test.js
import { describe, it, expect, vi } from 'vitest'
import { startCfStatusStream } from '../src/cfstatus/cfStatus.js'

describe('startCfStatusStream', () => {
  it('emits an initial snapshot from the executor', async () => {
    const executor = { cfApps: vi.fn().mockResolvedValue([{ name: 'r', requestedState: 'started', processes: 'web:1/1', routes: 'x' }]) }
    const emits = []
    const stop = startCfStatusStream({ executor, intervalMs: 1000, emit: e => emits.push(e), setInterval: () => 1, clearInterval: () => {} })
    await new Promise(r => setImmediate(r))
    expect(emits[0].apps[0].name).toBe('r')
    stop()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/cfStatus.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/cfstatus/cfStatus.js
export function startCfStatusStream({ executor, intervalMs, emit, setInterval = globalThis.setInterval, clearInterval = globalThis.clearInterval }) {
  const tick = async () => { emit({ apps: await executor.cfApps() }) }
  tick()
  const id = setInterval(tick, intervalMs)
  return () => clearInterval(id)
}
```

Then wire the `GET /api/cf-status` SSE route (Task 12) to this, choosing the executor by `mode`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/cfStatus.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/cfstatus/cfStatus.js backend/test/cfStatus.test.js
git commit -m "feat: add cf status poller"
```

---

### Task 14: Frontend API client + tab shell

**Files:**
- Modify: `frontend/src/App.jsx`
- Create: `frontend/src/api.js`, `frontend/src/components/Tabs.jsx`
- Test: `frontend/test/App.test.jsx`

**Interfaces:**
- Consumes: backend REST/SSE (Task 12).
- Produces: `api.js` with `getConfig`, `putConfig`, `getDefaultPolicy`, `parseCredentials`, `listDeployments`, `createDeployment`, `openDeploymentEvents(id, onEvent)`, `sendA2A(id, body)`, `openCfStatus(mode, onSnapshot)` (SSE via `EventSource`). `App.jsx` renders four tabs (Configuration, Deployment, A2A client, CF Status) with a `mode` toggle in the header; clicking a tab shows its panel.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/test/App.test.jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from '../src/App.jsx'

describe('App', () => {
  it('shows four tabs and switches panels', () => {
    render(<App />)
    expect(screen.getByRole('tab', { name: /configuration/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /deployment/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /a2a/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /cf status/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /a2a/i }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent(/tenant/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run test/App.test.jsx`
Expected: FAIL — tabs not present.

- [ ] **Step 3: Write minimal implementation**

Implement `api.js` (fetch wrappers + `EventSource` helpers). Implement `Tabs.jsx` (ARIA `role="tab"`/`tabpanel"`, active index state). `App.jsx` composes the four tab components (stubs for now, each rendering its heading text so the test's `/tenant/i` etc. can be satisfied by minimal placeholders) and the mode toggle.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run test/App.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.js frontend/src/App.jsx frontend/src/components/Tabs.jsx frontend/test/App.test.jsx
git commit -m "feat: add frontend api client and tab shell"
```

---

### Task 15: Configuration tab

**Files:**
- Create: `frontend/src/tabs/ConfigurationTab.jsx`
- Test: `frontend/test/ConfigurationTab.test.jsx`

**Interfaces:**
- Consumes: `api.getConfig`, `api.putConfig`.
- Produces: a form with the five fields (CF API URL, CF Username, CF Password, Docker Username, Docker Password); password fields use `type="password"`; a Save button calls `putConfig` with the values.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/test/ConfigurationTab.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ConfigurationTab from '../src/tabs/ConfigurationTab.jsx'
import * as api from '../src/api.js'

describe('ConfigurationTab', () => {
  it('loads config and saves edits', async () => {
    vi.spyOn(api, 'getConfig').mockResolvedValue({ cfApi: 'https://api' })
    const put = vi.spyOn(api, 'putConfig').mockResolvedValue({})
    render(<ConfigurationTab />)
    await waitFor(() => expect(screen.getByLabelText(/CF API URL/i)).toHaveValue('https://api'))
    fireEvent.change(screen.getByLabelText(/Docker Username/i), { target: { value: 'me' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(put).toHaveBeenCalledWith(expect.objectContaining({ dockerUsername: 'me' })))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run test/ConfigurationTab.test.jsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write minimal implementation**

Implement `ConfigurationTab.jsx`: `useEffect` loads config into state, labeled inputs (label `htmlFor`/`id` pairs so `getByLabelText` works), Save button calls `putConfig(state)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run test/ConfigurationTab.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/tabs/ConfigurationTab.jsx frontend/test/ConfigurationTab.test.jsx
git commit -m "feat: add configuration tab"
```

---

### Task 16: Deployment tab (list + New form + live progress)

**Files:**
- Create: `frontend/src/tabs/DeploymentTab.jsx`, `frontend/src/components/NewDeploymentForm.jsx`, `frontend/src/components/StepProgress.jsx`, `frontend/src/components/MaskedCredList.jsx`
- Test: `frontend/test/DeploymentTab.test.jsx`, `frontend/test/NewDeploymentForm.test.jsx`

**Interfaces:**
- Consumes: `api.listDeployments`, `api.createDeployment`, `api.openDeploymentEvents`, `api.getDefaultPolicy`, `api.parseCredentials`.
- Produces: `DeploymentTab` shows an initially-empty list + a "New" button opening `NewDeploymentForm`. The form has: image input, org input, space input, app-name input, a policy `<textarea>` prefilled from `getDefaultPolicy`, and an Upload `<input type="file">` whose contents go to `parseCredentials` and render via `MaskedCredList`. Submit calls `createDeployment` then subscribes with `openDeploymentEvents` to update `StepProgress` (two steps: Sandboxify, Deploy) live. On completion the router URL is shown.

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/test/NewDeploymentForm.test.jsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import NewDeploymentForm from '../src/components/NewDeploymentForm.jsx'
import * as api from '../src/api.js'

describe('NewDeploymentForm', () => {
  it('prefills the policy textarea from the default policy', async () => {
    vi.spyOn(api, 'getDefaultPolicy').mockResolvedValue({ policy: 'version: 1\nallow_github: {}' })
    render(<NewDeploymentForm onCreated={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText(/policy/i)).toHaveValue(expect.stringContaining('version: 1')))
  })
})
```

```jsx
// frontend/test/DeploymentTab.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DeploymentTab from '../src/tabs/DeploymentTab.jsx'
import * as api from '../src/api.js'

describe('DeploymentTab', () => {
  it('starts empty and reveals the New form', async () => {
    vi.spyOn(api, 'listDeployments').mockResolvedValue([])
    render(<DeploymentTab mode="mock" />)
    await waitFor(() => expect(screen.getByText(/no deployments/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /new/i }))
    expect(screen.getByLabelText(/container image/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run test/NewDeploymentForm.test.jsx test/DeploymentTab.test.jsx`
Expected: FAIL — components not found.

- [ ] **Step 3: Write minimal implementation**

Implement the four components per the Produces contract. `StepProgress` renders each step's status (pending/running/done/failed) and the tail of its log. `MaskedCredList` renders `key=masked` rows. `DeploymentTab` shows "No deployments yet" when the list is empty.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run test/NewDeploymentForm.test.jsx test/DeploymentTab.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/tabs/DeploymentTab.jsx frontend/src/components/NewDeploymentForm.jsx frontend/src/components/StepProgress.jsx frontend/src/components/MaskedCredList.jsx frontend/test/NewDeploymentForm.test.jsx frontend/test/DeploymentTab.test.jsx
git commit -m "feat: add deployment tab with new form and live progress"
```

---

### Task 17: A2A client tab

**Files:**
- Create: `frontend/src/tabs/A2AClientTab.jsx`
- Test: `frontend/test/A2AClientTab.test.jsx`

**Interfaces:**
- Consumes: `api.listDeployments` (to pick a target deployment/router URL), `api.sendA2A`.
- Produces: a deployment selector, a free-text tenant input, a message `<textarea>`, a Send button that calls `sendA2A(deploymentId, { tenant, message })` and renders the JSON response.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/test/A2AClientTab.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import A2AClientTab from '../src/tabs/A2AClientTab.jsx'
import * as api from '../src/api.js'

describe('A2AClientTab', () => {
  it('sends tenant + message and shows the response', async () => {
    vi.spyOn(api, 'listDeployments').mockResolvedValue([{ id: '1', appName: 'app', routerUrl: 'https://r' }])
    const send = vi.spyOn(api, 'sendA2A').mockResolvedValue({ status: 200, body: { ok: true } })
    render(<A2AClientTab />)
    await waitFor(() => screen.getByLabelText(/tenant/i))
    fireEvent.change(screen.getByLabelText(/tenant/i), { target: { value: 't1' } })
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(send).toHaveBeenCalledWith('1', { tenant: 't1', message: 'hi' }))
    await waitFor(() => expect(screen.getByText(/"ok": true/)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run test/A2AClientTab.test.jsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write minimal implementation**

Implement `A2AClientTab.jsx` per the contract; render the response with `JSON.stringify(body, null, 2)` inside a `<pre>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run test/A2AClientTab.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/tabs/A2AClientTab.jsx frontend/test/A2AClientTab.test.jsx
git commit -m "feat: add A2A client tab"
```

---

### Task 18: CF Status tab (live grid)

**Files:**
- Create: `frontend/src/tabs/CFStatusTab.jsx`, `frontend/src/components/CFAppGrid.jsx`
- Test: `frontend/test/CFStatusTab.test.jsx`

**Interfaces:**
- Consumes: `api.openCfStatus(mode, onSnapshot)`.
- Produces: `CFStatusTab` subscribes on mount and renders `CFAppGrid` with the latest `apps` snapshot (columns: name, state, processes, routes). Rows update as snapshots arrive. Unsubscribes on unmount.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/test/CFStatusTab.test.jsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import CFStatusTab from '../src/tabs/CFStatusTab.jsx'
import * as api from '../src/api.js'

describe('CFStatusTab', () => {
  it('renders apps from a snapshot', async () => {
    vi.spyOn(api, 'openCfStatus').mockImplementation((_mode, onSnapshot) => {
      onSnapshot({ apps: [{ name: 'sbx-poc-sandbox-router', requestedState: 'started', processes: 'web:1/1', routes: 'r' }] })
      return () => {}
    })
    render(<CFStatusTab mode="mock" />)
    await waitFor(() => expect(screen.getByText('sbx-poc-sandbox-router')).toBeInTheDocument())
    expect(screen.getByText('started')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run test/CFStatusTab.test.jsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write minimal implementation**

Implement `CFAppGrid.jsx` (a `<table>`) and `CFStatusTab.jsx` (`useEffect` subscribes via `openCfStatus`, stores snapshot in state, returns the unsubscribe fn as cleanup).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run test/CFStatusTab.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/tabs/CFStatusTab.jsx frontend/src/components/CFAppGrid.jsx frontend/test/CFStatusTab.test.jsx
git commit -m "feat: add cf status tab with live grid"
```

---

### Task 19: End-to-end happy path (mock backend)

**Files:**
- Create: `frontend/e2e/happy-path.spec.js`, `frontend/playwright.config.js`
- Modify: root `package.json` (add `test:e2e` script that starts backend + frontend then runs Playwright)

**Interfaces:**
- Consumes: the whole app in `mode=mock`.
- Produces: a Playwright test that drives the full journey against the mock backend (no Docker/CF).

- [ ] **Step 1: Write the failing test**

```js
// frontend/e2e/happy-path.spec.js
import { test, expect } from '@playwright/test'

test('deploy in mock mode, send A2A, see clone appear', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: /deployment/i }).click()
  await page.getByRole('button', { name: /new/i }).click()
  await page.getByLabel(/container image/i).fill('example/agent:latest')
  await page.getByLabel(/^org/i).fill('test')
  await page.getByLabel(/space/i).fill('sample_apps')
  await page.getByLabel(/app name/i).fill('app')
  await page.getByRole('button', { name: /create|deploy/i }).click()
  await expect(page.getByText(/done/i).first()).toBeVisible({ timeout: 15000 })

  await page.getByRole('tab', { name: /a2a/i }).click()
  await page.getByLabel(/tenant/i).fill('t1')
  await page.getByLabel(/message/i).fill('hello')
  await page.getByRole('button', { name: /send/i }).click()

  await page.getByRole('tab', { name: /cf status/i }).click()
  await expect(page.getByText(/t1/)).toBeVisible({ timeout: 15000 })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:e2e`
Expected: FAIL initially (until config + selectors line up), confirming the harness runs.

- [ ] **Step 3: Make it pass**

Add `playwright.config.js` (baseURL `http://localhost:5173`, `webServer` starting `npm run dev`, `mode=mock` as the app default). Adjust any label/text selectors in the tab components so the journey resolves. No product code beyond selector/label alignment.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/e2e frontend/playwright.config.js package.json
git commit -m "test: add end-to-end happy path against mock backend"
```

---

## Self-Review

**1. Spec coverage:**
- Architecture (React SPA + local Node backend, REST+SSE) → Tasks 1, 12, 14. ✓
- Executor seam (Real + Mock, per-run `mode`) → Tasks 8, 9, 12. ✓
- Chained sandboxify(`--no-deploy`)→deploy pipeline, single router URL → Tasks 4, 5, 9, 10. ✓
- Configuration tab (five fields, in-memory, never on disk) → Tasks 7, 12, 15. ✓
- Deployment tab (empty list, New, image/org-space/editable default policy/masked upload, live two-step progress) → Tasks 2, 3, 16. ✓
- A2A client (free-text tenant + message, JWT mint) → Tasks 11, 17. ✓
- CF Status (poll `poc=sandbox-router`, live grid) → Tasks 6, 13, 18. ✓
- Error handling (step failed + log tail, stop on sandboxify failure) → Task 10 (pipeline failure test), 16 (StepProgress). ✓
- Testing strategy (parser units, pipeline vs mock, frontend, e2e happy path) → Tasks 3–6, 10, 14–19. ✓
- In-memory only, secrets never persisted/logged → Tasks 7, 12 (passwords stripped from GET). ✓

**2. Placeholder scan:** No TBD/TODO; every code step has concrete code. The one "adjust selectors" step (Task 19) is explicitly bounded to label/text alignment, not unspecified product code. ✓

**3. Type consistency:** `Executor` methods (`sandboxify`/`deploy`/`a2a`/`cfApps`) are used identically in Tasks 8–10, 12, 13. `Deployment.steps.{sandboxify,deploy}` shape consistent across Tasks 10 and 16. `imageRef`/`routerUrl` naming consistent across parsers, executor, pipeline. API client method names in Task 14 match their usage in Tasks 15–18. ✓

**Note on `cf apps` label filtering:** the label filter (`poc=sandbox-router`) is applied in the RealExecutor's `cfApps` invocation (`cf apps` in the target space; the poc labels every app). If a future CF CLI needs explicit filtering, that lives in `realExecutor.js` `cfApps` args — no interface change.
