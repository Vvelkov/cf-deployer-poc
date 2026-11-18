# CF Deployer

A local web UI that demonstrates deploying AI agents to Cloud Foundry: it
sandboxifies a user-provided container image and deploys it behind a single
router URL, then lets you drive A2A test traffic and watch the CF app landscape
change live.

It orchestrates three existing scripts — `sandboxify.sh`, `deploy-service-2.sh`,
and the A2A request flow of `test-request.sh` — behind a React UI.

## Run

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
npm run dev      # backend on :3001, frontend on :5173
```

Open http://localhost:5173.

Deployments always run for real: the UI runs the actual `docker`/`cf` scripts.
Requires `docker`, the `cf` CLI (logged in), Java 21, and Maven on PATH.
A mock mode (deterministic, no Docker/CF) exists only for the automated e2e
test, which starts the app with `VITE_DEPLOY_MODE=mock`.

## Direct deploy (without the sandbox router)

By default the deploy step runs `deploy-service-2.sh`, which pushes a stopped
template app plus `<app>-sandbox-router` and lets the router clone one app per
tenant. `scripts/direct-deploy/` is an opt-in alternative that pushes the
sandboxified image as **one CF app with its own route** — no template, no
router, no tenant clones:

- `deploy.sh` — same arguments as `deploy-service-2.sh`. Runs
  `cf push --docker-image … --no-start`, sets the env vars, `cf restart`, and
  prints the `router URL:` line the UI reads. If the app does not start, it
  prints the app's last log lines into the deploy log.
- `undeploy.sh` — same arguments as `undeploy-service-2.sh`. Runs
  `cf delete <app> -r -f`.

Both log in with the CF API, user and password from the Configuration tab when
the cf CLI is not logged in to that API (password via environment, never on
the command line). Point the backend at them, from the repo root:

```bash
export CF_HOME=$HOME/.cf-deployer && mkdir -p "$CF_HOME"   # optional: keeps your normal cf login untouched
export DEPLOY_PATH=$PWD/scripts/direct-deploy/deploy.sh
export UNDEPLOY_PATH=$PWD/scripts/direct-deploy/undeploy.sh
npm run dev
```

The A2A client then talks to the app itself (its route is shown as the router
URL). There is no router in front of it, so the app gets the tenant claim
unverified.

> **Privileged containers.** The OpenShell supervisor needs a privileged
> container to create its network namespace. On a standard Cloud Foundry,
> `cf push` runs Docker apps unprivileged, so the supervisor stops with
> `Network namespace creation failed … Operation not permitted`. The app still
> looks healthy (the port bridge keeps `$PORT` open), but every request returns
> 502. Deploy into a space where Docker apps get privileged containers, e.g. via
> a Cloud Controller change scoped to one isolation segment.

## Tabs

- **Configuration** — CF credentials, the Docker registry host/username/password,
  and the JWT secret (in memory only, never persisted). The registry host is
  passed to sandboxify as `REGISTRY` (the push target CF pulls the sandboxed
  image from). The JWT secret must match the router's `JWT_DEV_SECRET` — the A2A
  client signs requests with it, or the router rejects them as unauthorized.
- **Deployment** — create a deployment (image, org/space, editable default
  policy, a masked credentials upload passed to sandboxify's `--provider-env`
  (secrets hidden from the process list; real values kept server-side only,
  never returned to the browser), and a plain env-vars file upload passed to the
  deploy script's `--extra-env-file`, shown with full values); watch the
  two-step sandboxify → deploy pipeline; get the router URL. Each deployment has
  a **Delete** button that (after confirmation) runs the undeploy script to tear
  down its CF apps, streams teardown progress, and removes the deployment when done.
  An **Edit** button lets you change the image, policy, env vars, or credentials
  (org/space/app-name stay fixed), then **Save & Redeploy** fully undeploys the
  existing bundle and redeploys from scratch — so new requests spawn tenant
  clones from the freshly sandboxified image. This drives the sandboxing demo:
  deploy with a policy missing a writable path → the agent can't write there →
  edit the policy to add it → redeploy → the agent can.
- **A2A client** — send a `message/send` request as any tenant (JWT signed with
  the configured JWT secret).
- **CF Status** — a live side panel (shown alongside the Deployment and A2A
  client tabs, not on Configuration) listing the CF apps (`poc=sandbox-router`),
  which grows as A2A traffic spawns per-tenant clones.

## Test

```bash
npm test                      # backend + frontend unit tests
npm --prefix frontend run test:e2e   # Playwright happy path (mock mode)
```

## Architecture

The backend is the only component that touches `docker`/`cf`/the scripts. All
tool invocation goes through an `Executor` interface with `MockExecutor` and
`RealExecutor` implementations, selected per run by the `mode` flag. All state
is in-memory. See `docs/superpowers/specs/` and `docs/superpowers/plans/`.
