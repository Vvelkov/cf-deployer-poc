# CF Deployer — Design

**Date:** 2026-08-20
**Status:** Draft for review

## Purpose

A local web UI that demonstrates how AI agents are deployed, sandboxed, and served on a Cloud Foundry (CF) landscape. It is a presentation-oriented skin over an existing, working pipeline of shell scripts — it orchestrates and visualizes them, it does not reinvent their behavior.

The target scenario: a user provides a container image and gets back a single URL. Behind that URL, the CF Deployer has (1) sandboxified the image and (2) deployed a router whose per-tenant clones run the sandboxified image. Requests to the URL cause the router to spin clones up (and idle ones down), which the UI reflects live.

## Scope

In scope: the four tabs from the idea (Configuration, Deployment, A2A client, CF Status), the chained sandboxify→deploy pipeline, live progress, masked credential upload, auto-updating CF status, and a deterministic mock mode for testing and safe demos.

Out of scope: deploying the CF Deployer itself (runs locally only), persisting deployments across restarts, multi-user concerns, changes to the underlying scripts beyond how they are invoked.

## Architecture

- **Frontend:** React single-page app (Vite).
- **Backend:** local Node.js (Express). The only component that touches `docker`, `cf`, or the shell scripts. Talks to the SPA over REST + SSE (server-sent events) for live progress and CF status.
- **Executor seam (the one load-bearing abstraction):**
  - `RealExecutor` — spawns the real scripts and `cf` as child processes; streams stdout line-by-line to an SSE channel; captures exit code + stderr tail.
  - `MockExecutor` — replays scripted, timed, always-successful output and drives a fake in-memory CF app list that mutates when A2A requests are sent.
  - A per-run flag (`mode=real|mock`), surfaced as a UI toggle, selects the executor. Tests and the safe-demo path both use `MockExecutor` — no Docker/CF required.

State is **in-memory only**: the deployment list lives while the backend runs and resets on restart. The CF apps themselves keep running independently.

## Underlying scripts (reused as-is)

| UI action | Script |
|---|---|
| Sandboxify step | `sandboxify/sandboxify.sh` (invoked with `--no-deploy`) |
| Deploy-to-CF step | `sandbox-router-cf-poc/scripts/deploy-service-2.sh` |
| A2A request | logic equivalent to `sandbox-router-cf-poc/scripts/test-request.sh` |
| CF Status | `cf apps` filtered to label `poc=sandbox-router` |

## The deployment pipeline (chained)

One "Deployment" runs two visible steps against the selected executor:

1. **Sandboxify:** `sandboxify.sh --image <user-image> --policy <policy> --provider-env <secrets> --no-deploy` → builds + pushes the derived sandboxed image → backend captures the printed image ref (`$REGISTRY/$APP:<timestamp>`).
2. **Deploy to CF:** `deploy-service-2.sh --org --space --app-name --docker-image <sandboxed-ref-from-step-1> --docker-username --docker-password --extra-env-file <app.env>` → pushes the stopped template (now the *sandboxed* image) + the router → backend parses the printed **router URL**.

Result surfaced to the user: **one URL (the router)**. Each step streams its log; the UI shows two progress indicators (running → done/failed) with the tail of the log. This chaining (sandboxify output feeding the router deploy) is the one piece of integration glue not present when the scripts run standalone.

## Components (tabs)

- **Configuration** — form for `CF_API`, `CF_USERNAME`, `CF_PASSWORD`, Docker (`REGISTRY_USER`/`REGISTRY_PASS`). Held in backend memory, injected as env when spawning scripts. Never written to disk. Extensible for later fields.
- **Deployment** — in-memory list, initially empty, "New" button. The New form collects: container image; org/space; policy (prefilled with the default OpenShell policy YAML from the idea, editable); credentials via an **Upload** button that parses a `KEY=VALUE` file and displays each entry masked (e.g. `AI_CORE_SECRET=asd1…`). Creating a deployment kicks off the async two-step pipeline with live progress.
- **A2A client** — free-text tenant + message. Backend mints the JWT (as `test-request.sh` does) and POSTs an A2A `message/send` to the deployment's router URL; shows the JSON response. Sending as different tenants produces different clones.
- **CF Status** — polls `cf apps` filtered to `poc=sandbox-router` every few seconds via SSE; renders a live grid of template / router / tenant-clone apps and their state; visibly grows and shrinks as A2A traffic drives the router's create/evict cycle.

## Error handling

Each script step captures exit code + stderr tail. Non-zero exit → step marked failed, log preserved, UI shows the failure with the log tail. Required-field validation runs before a real deployment. Mock mode never fails, making it safe for rehearsal and deterministic for tests.

## Testing

- **Backend unit tests:** the parsers — sandboxified image-ref extraction, router-URL extraction, `KEY=VALUE` masking, `cf apps` table parsing — against fixture strings.
- **Backend integration tests:** pipeline orchestration against `MockExecutor` (deterministic, no CF/Docker).
- **Frontend:** component tests plus an end-to-end happy path against the mock backend — create a deployment, watch both steps complete, send an A2A request, see the CF Status grid change.

## Runtime prerequisites (real mode)

The demo machine needs `docker`, the `cf` CLI (logged in), Java 21, and Maven on PATH — because the underlying scripts require them. Mock mode needs none of these.

## Fidelity to the original idea

Every element of the original idea is covered: the four tabs, the empty-list + New flow, the exact configuration fields, the image→sandboxify→router→single-URL→sandboxed-clones scenario, async two-step progress, masked credential upload, the editable default policy, and the auto-updating CF status. The only addition beyond the written idea is the mock executor / demo mode, which directly serves the idea's own requirement to "think of ways to test the implemented web UI easily and deterministically" and de-risks a live demo.
