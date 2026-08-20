// A deterministic, always-succeeding executor for tests and safe demos.
// It never spawns docker/cf; it replays scripted output and keeps a mutable
// in-memory CF app list that grows as A2A requests arrive.

const SANDBOXIFY_LINES = [
  '==> pulling user image',
  '==> building sandboxed image (mock)',
  '==> docker push (mock)',
  'Built + pushed (mock).',
]

const DEPLOY_LINES = [
  '[1/4] cf target (mock)',
  '[2/4] push template (mock)',
  '[3/4] build router (mock)',
  '[4/4] push router (mock)',
  '=== bundle ready ===',
]

const UNDEPLOY_LINES = [
  '[1/4] deleting tenant clone apps (mock)',
  '[2/4] deleting orphaned tenant routes (mock)',
  '[3/4] deleting router (mock)',
  '[4/4] deleting template (mock)',
  '=== undeploy complete ===',
]

export function createMockExecutor() {
  // Seeded lazily on first deploy: template (stopped) + router (started).
  let apps = []
  let appName = null

  const emit = async (lines, onLine) => {
    for (const l of lines) {
      onLine(l)
      // zero-delay await keeps ordering async without slowing tests
      await Promise.resolve()
    }
  }

  return {
    async sandboxify(opts, onLine) {
      await emit(SANDBOXIFY_LINES, onLine)
      return { code: 0, imageRef: `mock.reg/sbx-${opts.appName}:mock`, log: SANDBOXIFY_LINES.join('\n') }
    },

    async deploy(opts, onLine) {
      appName = opts.appName
      apps = [
        { name: `${appName}-app-template`, requestedState: 'stopped', processes: 'web:0/1', routes: '' },
        { name: `${appName}-sandbox-router`, requestedState: 'started', processes: 'web:1/1', routes: `${appName}-sandbox-router.mock.example.io` },
      ]
      await emit(DEPLOY_LINES, onLine)
      const routerUrl = `https://${appName}-sandbox-router.mock.example.io`
      return { code: 0, routerUrl, log: DEPLOY_LINES.join('\n') }
    },

    async a2a({ tenant }) {
      const cloneName = `${appName || 'agent'}-sandbox-${tenant}`
      if (!apps.some(a => a.name === cloneName)) {
        apps.push({ name: cloneName, requestedState: 'started', processes: 'web:1/1', routes: `${cloneName}.mock.example.io` })
      }
      return { status: 200, body: { jsonrpc: '2.0', id: 1, result: { message: { role: 'agent', parts: [{ kind: 'text', text: `mock reply to "${tenant}"` }] } } } }
    },

    async cfApps() {
      return apps.map(a => ({ ...a }))
    },

    async resolveRouterUrl(name) {
      return `https://${name}-sandbox-router.mock.example.io`
    },

    // Mock never blocks deployments — demos/tests always proceed.
    async hasExistingTemplate() {
      return false
    },

    async deleteClones(opts, onLine = () => {}) {
      const prefix = `${opts.appName}-sandbox-`
      const before = apps.length
      // Mock clones are named <appName>-sandbox-<tenant> (see a2a); drop them.
      apps = apps.filter((a) => !(a.name.startsWith(prefix) && !a.name.endsWith('-router')))
      const count = before - apps.length
      onLine(count ? `deleted ${count} mock tenant clone(s)` : 'no tenant clones to delete')
      return { count }
    },

    async undeploy(opts, onLine) {
      await emit(UNDEPLOY_LINES, onLine)
      apps = []
      appName = null
      return { code: 0, log: UNDEPLOY_LINES.join('\n') }
    },
  }
}
