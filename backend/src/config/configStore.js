const EMPTY = {
  cfApi: '', cfUsername: '', cfPassword: '',
  dockerRegistry: '', dockerUsername: '', dockerPassword: '',
  jwtSecret: '',
}

export function createConfigStore() {
  let cfg = { ...EMPTY }
  return {
    get: () => ({ ...cfg }),
    set: (partial) => { cfg = { ...cfg, ...partial }; return { ...cfg } },
    toEnv: () => ({
      CF_API: cfg.cfApi, CF_USERNAME: cfg.cfUsername, CF_PASSWORD: cfg.cfPassword,
      REGISTRY: cfg.dockerRegistry, REGISTRY_USER: cfg.dockerUsername, REGISTRY_PASS: cfg.dockerPassword,
    }),
  }
}
