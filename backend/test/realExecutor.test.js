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

// Mimics Node when the binary/script cannot be spawned: an 'error' event
// (ENOENT) followed by a 'close' with a negative code.
function fakeSpawnError(err) {
  return () => {
    const cp = new EventEmitter()
    cp.stdout = new EventEmitter(); cp.stderr = new EventEmitter()
    setImmediate(() => {
      cp.emit('error', err)
      cp.emit('close', -2)
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

  it('captures a spawn error (missing binary/script) instead of dropping it', async () => {
    const err = Object.assign(new Error('spawn /s.sh ENOENT'), { code: 'ENOENT' })
    const ex = createRealExecutor({
      spawn: fakeSpawnError(err),
      scripts: { sandboxify: '/s.sh', deploy: '/d.sh' }, env: {},
    })
    const lines = []
    const r = await ex.sandboxify({ appName: 'app', image: 'i', policy: '/p.yaml' }, l => lines.push(l))
    // Non-zero code, no image ref, and the error text is in both the log and the stream.
    expect(r.code).not.toBe(0)
    expect(r.imageRef).toBeNull()
    expect(r.log).toContain('ENOENT')
    expect(lines.join('\n')).toContain('ENOENT')
  })

  it('writes the policy YAML to a temp file and passes its path to --policy', async () => {
    const writes = []
    let capturedArgs
    const spy = (cmd, args) => {
      capturedArgs = args
      const cp = new EventEmitter()
      cp.stdout = new EventEmitter(); cp.stderr = new EventEmitter()
      setImmediate(() => cp.emit('close', 0))
      return cp
    }
    const ex = createRealExecutor({
      spawn: spy,
      scripts: { sandboxify: '/s.sh', deploy: '/d.sh' },
      env: {},
      writePolicyFile: (content) => { writes.push(content); return '/tmp/policy-abc.yaml' },
    })
    await ex.sandboxify({ appName: 'app', image: 'i', policy: 'version: 1\nlandlock: {}' }, () => {})
    // The YAML content was written out...
    expect(writes[0]).toContain('version: 1')
    // ...and the --policy flag points at the written file, NOT the raw content.
    const idx = capturedArgs.indexOf('--policy')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(capturedArgs[idx + 1]).toBe('/tmp/policy-abc.yaml')
  })

  it('writes credentials to a temp file and passes --provider-env', async () => {
    const writes = []
    let capturedArgs
    const spy = (cmd, args) => {
      capturedArgs = args
      const cp = new EventEmitter()
      cp.stdout = new EventEmitter(); cp.stderr = new EventEmitter()
      setImmediate(() => cp.emit('close', 0))
      return cp
    }
    const ex = createRealExecutor({
      spawn: spy,
      scripts: { sandboxify: '/s.sh', deploy: '/d.sh' },
      env: {},
      writePolicyFile: () => '/tmp/policy.yaml',
      writeProviderEnvFile: (creds) => { writes.push(creds); return '/tmp/provider-abc.env' },
    })
    await ex.sandboxify({ appName: 'app', image: 'i', policy: 'p', credentials: [{ key: 'API_KEY', value: 'secret' }] }, () => {})
    expect(writes[0]).toEqual([{ key: 'API_KEY', value: 'secret' }])
    const idx = capturedArgs.indexOf('--provider-env')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(capturedArgs[idx + 1]).toBe('/tmp/provider-abc.env')
  })

  it('omits --provider-env when there are no credentials', async () => {
    let capturedArgs
    const spy = (cmd, args) => {
      capturedArgs = args
      const cp = new EventEmitter()
      cp.stdout = new EventEmitter(); cp.stderr = new EventEmitter()
      setImmediate(() => cp.emit('close', 0))
      return cp
    }
    const ex = createRealExecutor({
      spawn: spy, scripts: { sandboxify: '/s.sh', deploy: '/d.sh' }, env: {}, writePolicyFile: () => '/tmp/policy.yaml',
    })
    await ex.sandboxify({ appName: 'app', image: 'i', policy: 'p', credentials: [] }, () => {})
    expect(capturedArgs.includes('--provider-env')).toBe(false)
  })
})

describe('realExecutor.deploy', () => {
  it('passes registry creds from env so CF can pull the private image', async () => {
    let capturedArgs
    const spy = (cmd, args) => {
      capturedArgs = args
      const cp = new EventEmitter()
      cp.stdout = new EventEmitter(); cp.stderr = new EventEmitter()
      setImmediate(() => cp.emit('close', 0))
      return cp
    }
    const ex = createRealExecutor({
      spawn: spy,
      scripts: { sandboxify: '/s.sh', deploy: '/d.sh' },
      env: { REGISTRY_USER: 'ruser', REGISTRY_PASS: 'rpass' },
    })
    await ex.deploy({ org: 'o', space: 'sp', appName: 'app', dockerImage: 'reg/app:1' }, () => {})
    const uIdx = capturedArgs.indexOf('--docker-username')
    const pIdx = capturedArgs.indexOf('--docker-password')
    expect(uIdx).toBeGreaterThanOrEqual(0)
    expect(capturedArgs[uIdx + 1]).toBe('ruser')
    expect(pIdx).toBeGreaterThanOrEqual(0)
    expect(capturedArgs[pIdx + 1]).toBe('rpass')
  })

  it('writes envVars to a temp file and passes --extra-env-file', async () => {
    let capturedArgs
    const written = []
    const spy = (cmd, args) => {
      capturedArgs = args
      const cp = new EventEmitter()
      cp.stdout = new EventEmitter(); cp.stderr = new EventEmitter()
      setImmediate(() => cp.emit('close', 0))
      return cp
    }
    const ex = createRealExecutor({
      spawn: spy,
      scripts: { sandboxify: '/s.sh', deploy: '/d.sh' },
      env: {},
      writeEnvFile: (envVars) => { written.push(envVars); return '/tmp/extra-abc.env' },
    })
    await ex.deploy({ org: 'o', space: 'sp', appName: 'app', dockerImage: 'reg/app:1', envVars: [{ key: 'FOO', value: 'bar' }] }, () => {})
    expect(written[0]).toEqual([{ key: 'FOO', value: 'bar' }])
    const idx = capturedArgs.indexOf('--extra-env-file')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(capturedArgs[idx + 1]).toBe('/tmp/extra-abc.env')
  })

  it('omits --extra-env-file when there are no env vars', async () => {
    let capturedArgs
    const spy = (cmd, args) => {
      capturedArgs = args
      const cp = new EventEmitter()
      cp.stdout = new EventEmitter(); cp.stderr = new EventEmitter()
      setImmediate(() => cp.emit('close', 0))
      return cp
    }
    const ex = createRealExecutor({
      spawn: spy, scripts: { sandboxify: '/s.sh', deploy: '/d.sh' }, env: {},
    })
    await ex.deploy({ org: 'o', space: 'sp', appName: 'app', dockerImage: 'reg/app:1', envVars: [] }, () => {})
    expect(capturedArgs.includes('--extra-env-file')).toBe(false)
  })

  it('prefers explicit opts creds over env creds', async () => {
    let capturedArgs
    const spy = (cmd, args) => {
      capturedArgs = args
      const cp = new EventEmitter()
      cp.stdout = new EventEmitter(); cp.stderr = new EventEmitter()
      setImmediate(() => cp.emit('close', 0))
      return cp
    }
    const ex = createRealExecutor({
      spawn: spy,
      scripts: { sandboxify: '/s.sh', deploy: '/d.sh' },
      env: { REGISTRY_USER: 'ruser', REGISTRY_PASS: 'rpass' },
    })
    await ex.deploy({ org: 'o', space: 'sp', appName: 'app', dockerImage: 'reg/app:1', dockerUsername: 'explicit', dockerPassword: 'xpass' }, () => {})
    const uIdx = capturedArgs.indexOf('--docker-username')
    expect(capturedArgs[uIdx + 1]).toBe('explicit')
  })
})

describe('realExecutor.undeploy', () => {
  it('spawns the undeploy script with org/space/app-name', async () => {
    let capturedCmd, capturedArgs
    const spy = (cmd, args) => {
      capturedCmd = cmd; capturedArgs = args
      const cp = new EventEmitter()
      cp.stdout = new EventEmitter(); cp.stderr = new EventEmitter()
      setImmediate(() => { cp.stdout.emit('data', Buffer.from('=== undeploy complete ===\n')); cp.emit('close', 0) })
      return cp
    }
    const ex = createRealExecutor({
      spawn: spy,
      scripts: { sandboxify: '/s.sh', deploy: '/d.sh', undeploy: '/u.sh' },
      env: {},
    })
    const lines = []
    const r = await ex.undeploy({ org: 'o', space: 'sp', appName: 'app' }, l => lines.push(l))
    expect(capturedCmd).toBe('/u.sh')
    expect(capturedArgs).toEqual(['--org', 'o', '--space', 'sp', '--app-name', 'app'])
    expect(r.code).toBe(0)
    expect(lines.join('\n')).toContain('undeploy complete')
  })
})

describe('realExecutor.resolveRouterUrl', () => {
  it('runs cf apps and returns the router external route', async () => {
    const appsOutput = [
      'name                  requested state   processes   routes',
      'app-app-template      stopped           web:0/1     ',
      'app-sandbox-router    started           web:1/1     app-sandbox-router.cfapps.example.io, app-sandbox-router.apps.internal',
    ].join('\n')
    const spy = (cmd, args) => {
      const cp = new EventEmitter()
      cp.stdout = new EventEmitter(); cp.stderr = new EventEmitter()
      setImmediate(() => { cp.stdout.emit('data', Buffer.from(appsOutput + '\n')); cp.emit('close', 0) })
      return cp
    }
    const ex = createRealExecutor({
      spawn: spy, scripts: { sandboxify: '/s.sh', deploy: '/d.sh', undeploy: '/u.sh' }, env: {},
    })
    expect(await ex.resolveRouterUrl('app', { org: 'o', space: 'sp' })).toBe('https://app-sandbox-router.cfapps.example.io')
  })
})

describe('realExecutor space targeting', () => {
  it('cf apps targets the given org/space first', async () => {
    const calls = []
    const spy = (cmd, args) => {
      calls.push([cmd, ...args])
      const cp = new EventEmitter()
      cp.stdout = new EventEmitter(); cp.stderr = new EventEmitter()
      setImmediate(() => { cp.stdout.emit('data', Buffer.from('name   requested state   processes   routes\n')); cp.emit('close', 0) })
      return cp
    }
    const ex = createRealExecutor({
      spawn: spy, scripts: { sandboxify: '/s.sh', deploy: '/d.sh', undeploy: '/u.sh' }, env: {},
    })
    await ex.cfApps({ org: 'gvisor-eval', space: 'sandboxed-apps' })
    expect(calls).toContainEqual(['cf', 'target', '-o', 'gvisor-eval', '-s', 'sandboxed-apps'])
    expect(calls.some(c => c[0] === 'cf' && c[1] === 'apps')).toBe(true)
    // target must precede apps
    const targetIdx = calls.findIndex(c => c[1] === 'target')
    const appsIdx = calls.findIndex(c => c[1] === 'apps')
    expect(targetIdx).toBeLessThan(appsIdx)
  })

  it('cf apps skips targeting when org/space are absent', async () => {
    const calls = []
    const spy = (cmd, args) => {
      calls.push([cmd, ...args])
      const cp = new EventEmitter()
      cp.stdout = new EventEmitter(); cp.stderr = new EventEmitter()
      setImmediate(() => { cp.stdout.emit('data', Buffer.from('name   requested state   processes   routes\n')); cp.emit('close', 0) })
      return cp
    }
    const ex = createRealExecutor({
      spawn: spy, scripts: { sandboxify: '/s.sh', deploy: '/d.sh', undeploy: '/u.sh' }, env: {},
    })
    await ex.cfApps()
    expect(calls.some(c => c[1] === 'target')).toBe(false)
  })
})

describe('realExecutor.hasExistingTemplate', () => {
  const spyWith = (appsOutput) => (cmd, args) => {
    const cp = new EventEmitter()
    cp.stdout = new EventEmitter(); cp.stderr = new EventEmitter()
    const out = args[0] === 'apps' ? appsOutput + '\n' : ''
    setImmediate(() => { if (out) cp.stdout.emit('data', Buffer.from(out)); cp.emit('close', 0) })
    return cp
  }
  const mk = (appsOutput) => createRealExecutor({
    spawn: spyWith(appsOutput), scripts: { sandboxify: '/s.sh', deploy: '/d.sh', undeploy: '/u.sh' }, env: {},
  })

  it('is true when a *-app-template already exists in the space', async () => {
    const out = [
      'name                 requested state   processes   routes',
      'roko-app-template    stopped           web:0/1     ',
      'roko-sandbox-router  started           web:1/1     r.example.io',
    ].join('\n')
    expect(await mk(out).hasExistingTemplate({ org: 'o', space: 'sp' })).toBe(true)
  })

  it('is false when no template app exists', async () => {
    const out = [
      'name       requested state   processes   routes',
      'other-app  started           web:1/1     o.example.io',
    ].join('\n')
    expect(await mk(out).hasExistingTemplate({ org: 'o', space: 'sp' })).toBe(false)
  })
})

describe('realExecutor.deleteClones', () => {
  it('deletes apps named <appName>-tenant-* (with route) after targeting the space', async () => {
    const appsOutput = [
      'name                        requested state   processes   routes',
      'roko2-app-template          stopped           web:0/1     ',
      'roko2-sandbox-router        started           web:1/1     roko2-sandbox-router.example.io',
      'roko2-tenant-aaa111         started           web:1/1     roko2-tenant-aaa111.apps.internal',
      'roko2-tenant-bbb222         started           web:1/1     roko2-tenant-bbb222.apps.internal',
      'unrelated-app               started           web:1/1     unrelated.example.io',
    ].join('\n')
    const calls = []
    const spy = (cmd, args) => {
      calls.push([cmd, ...args])
      const cp = new EventEmitter()
      cp.stdout = new EventEmitter(); cp.stderr = new EventEmitter()
      const out = args[0] === 'apps' ? appsOutput + '\n' : ''
      setImmediate(() => { if (out) cp.stdout.emit('data', Buffer.from(out)); cp.emit('close', 0) })
      return cp
    }
    const ex = createRealExecutor({
      spawn: spy, scripts: { sandboxify: '/s.sh', deploy: '/d.sh', undeploy: '/u.sh' }, env: {},
    })
    const lines = []
    const r = await ex.deleteClones({ org: 'gvisor-eval', space: 'sandboxed-apps', appName: 'roko2' }, l => lines.push(l))

    // Targeted the space, then listed apps.
    expect(calls).toContainEqual(['cf', 'target', '-o', 'gvisor-eval', '-s', 'sandboxed-apps'])
    // Deleted exactly the two tenant clones, with -f -r, and nothing else.
    const deletes = calls.filter(c => c[1] === 'delete').map(c => c[2])
    expect(deletes.sort()).toEqual(['roko2-tenant-aaa111', 'roko2-tenant-bbb222'])
    for (const c of calls.filter(c => c[1] === 'delete')) {
      expect(c).toContain('-f')
      expect(c).toContain('-r')
    }
    expect(r.count).toBe(2)
  })

  it('is a no-op when there are no clones', async () => {
    const appsOutput = [
      'name                   requested state   processes   routes',
      'roko2-app-template     stopped           web:0/1     ',
      'roko2-sandbox-router   started           web:1/1     r.example.io',
    ].join('\n')
    const calls = []
    const spy = (cmd, args) => {
      calls.push([cmd, ...args])
      const cp = new EventEmitter()
      cp.stdout = new EventEmitter(); cp.stderr = new EventEmitter()
      const out = args[0] === 'apps' ? appsOutput + '\n' : ''
      setImmediate(() => { if (out) cp.stdout.emit('data', Buffer.from(out)); cp.emit('close', 0) })
      return cp
    }
    const ex = createRealExecutor({
      spawn: spy, scripts: { sandboxify: '/s.sh', deploy: '/d.sh', undeploy: '/u.sh' }, env: {},
    })
    const r = await ex.deleteClones({ org: 'o', space: 'sp', appName: 'roko2' }, () => {})
    expect(calls.some(c => c[1] === 'delete')).toBe(false)
    expect(r.count).toBe(0)
  })
})
