#!/usr/bin/env bash
# undeploy.sh - cf-deployer undeploy step for the direct deploy.sh: deletes the app and its route.
# Same arguments as sandbox-router/scripts/undeploy-service-2.sh. Logs in like deploy.sh if needed.
set -euo pipefail

ORG=""; SPACE=""; APP_NAME=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --org)      ORG="$2"; shift 2 ;;
    --space)    SPACE="$2"; shift 2 ;;
    --app-name) APP_NAME="$2"; shift 2 ;;
    -h|--help)  echo "Usage: $(basename "$0") --org <org> --space <space> --app-name <name>"; exit 0 ;;
    *)          echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
if [[ -z "$APP_NAME" ]]; then
  echo "no app name given: nothing was deployed, so there is nothing to undeploy"
  exit 0
fi
for var in ORG SPACE APP_NAME; do
  [[ -n "${!var}" ]] || { echo "missing required argument for $var" >&2; exit 2; }
done

if [[ -n "${CF_API:-}" ]]; then
  current="$(cf api 2>/dev/null | awk '/API endpoint:/{print $3}')"
  if [[ "$current" != "$CF_API" ]] || ! cf oauth-token >/dev/null 2>&1; then
    echo "[0/2] log in: cf api $CF_API, cf auth ${CF_USERNAME:-<CF_USERNAME not set>}"
    cf api "$CF_API" >/dev/null
    cf auth >/dev/null
  fi
fi

echo "[1/2] cf target -o $ORG -s $SPACE"
cf target -o "$ORG" -s "$SPACE" >/dev/null

echo "[2/2] cf delete $APP_NAME (with its route)"
cf delete "$APP_NAME" -r -f
echo "=== removed $APP_NAME ==="
