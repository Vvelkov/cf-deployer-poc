import { parseEnvFile, toMaskedList } from '../parsers/credentials.js'

let seq = 0

export function createDeploymentStore() {
  const byId = new Map()
  // Raw credential values are kept here, keyed by deployment id — never on the
  // deployment object, so they can't leak through any JSON response.
  const rawCredsById = new Map()

  return {
    create(input) {
      const id = String(++seq)
      // Accept either a raw credentials file (credentialsText) — from which we
      // derive masked display values AND retain the real values server-side —
      // or a pre-masked list (credentials) for callers/tests that pass one.
      let credentials = input.credentials || []
      if (input.credentialsText) {
        credentials = toMaskedList(input.credentialsText)
        rawCredsById.set(id, parseEnvFile(input.credentialsText))
      }
      const d = {
        id,
        image: input.image,
        org: input.org,
        space: input.space,
        appName: input.appName,
        policy: input.policy,
        credentials,
        envVars: input.envVars || [],
        steps: {
          sandboxify: { status: 'pending', log: '' },
          deploy: { status: 'pending', log: '' },
          undeploy: { status: 'pending', log: '' },
        },
        routerUrl: null,
      }
      byId.set(id, d)
      return d
    },
    get: (id) => byId.get(id),
    list: () => [...byId.values()],
    getCredentials: (id) => rawCredsById.get(id) || [],
    remove: (id) => { rawCredsById.delete(id); return byId.delete(id) },
    update(id, patch) {
      const d = byId.get(id)
      if (!d) return undefined
      Object.assign(d, patch)
      return d
    },
    // Apply an edit and reset the deployment for a fresh redeploy. Updates
    // image/policy/envVars; replaces credentials only when new credentialsText
    // is supplied (otherwise the existing server-side creds are kept). Resets
    // all step statuses/logs and clears routerUrl.
    updateForRedeploy(id, { image, policy, envVars, credentialsText } = {}) {
      const d = byId.get(id)
      if (!d) return undefined
      if (image !== undefined) d.image = image
      if (policy !== undefined) d.policy = policy
      if (envVars !== undefined) d.envVars = envVars
      if (credentialsText) {
        d.credentials = toMaskedList(credentialsText)
        rawCredsById.set(id, parseEnvFile(credentialsText))
      }
      d.steps = {
        sandboxify: { status: 'pending', log: '' },
        deploy: { status: 'pending', log: '' },
        undeploy: { status: 'pending', log: '' },
      }
      d.routerUrl = null
      return d
    },
  }
}
