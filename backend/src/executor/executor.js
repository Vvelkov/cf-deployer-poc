/**
 * @typedef {Object} CfAppRow
 * @property {string} name
 * @property {string} requestedState
 * @property {string} processes
 * @property {string} routes
 */

/**
 * @typedef {Object} SandboxifyResult
 * @property {number} code
 * @property {string|null} imageRef
 * @property {string} log
 */

/**
 * @typedef {Object} DeployResult
 * @property {number} code
 * @property {string|null} routerUrl
 * @property {string} log
 */

/**
 * @typedef {Object} A2AResult
 * @property {number} status
 * @property {*} body
 */

/**
 * @callback OnLine
 * @param {string} line
 * @returns {void}
 */

/**
 * @typedef {Object} Executor
 * @property {(opts: Object, onLine: OnLine) => Promise<SandboxifyResult>} sandboxify
 * @property {(opts: Object, onLine: OnLine) => Promise<DeployResult>} deploy
 * @property {(opts: Object) => Promise<A2AResult>} a2a
 * @property {() => Promise<CfAppRow[]>} cfApps
 */

export {}
