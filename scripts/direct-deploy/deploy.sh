#!/usr/bin/env bash
# deploy.sh - cf-deployer deploy step WITHOUT the sandbox router: pushes the sandboxified image as ONE CF app
# with its own route (no template app, no router, no tenant clones). Drop-in replacement for
# sandbox-router/scripts/deploy-service-2.sh: same arguments, and it prints the "router URL:" line cf-deployer reads.
#
# cf-deployer passes CF_API / CF_USERNAME / CF_PASSWORD (Configuration tab) in the environment. If the cf CLI is not
# logged in to CF_API, this script logs in with them (password via environment, never on the command line).
# Start cf-deployer with its own CF_HOME (export CF_HOME=$HOME/.cf-deployer) so your normal cf login stays as it is.
set -euo pipefail

usage() {
  cat <<EOF
Usage: $(basename "$0") --org <org> --space <space> --app-name <name> --docker-image <image>
                 [--docker-username <user> --docker-password <pass>] [--extra-env-file <file>]
Environment: MEMORY (default 512M), DISK (default 2G), CF_API + CF_USERNAME + CF_PASSWORD (optional auto-login)
EOF
}

ORG=""; SPACE=""; APP_NAME=""; DOCKER_IMAGE=""; DOCKER_USERNAME=""; DOCKER_PASSWORD=""; EXTRA_ENV_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --org)             ORG="$2"; shift 2 ;;
    --space)           SPACE="$2"; shift 2 ;;
    --app-name)        APP_NAME="$2"; shift 2 ;;
    --docker-image)    DOCKER_IMAGE="$2"; shift 2 ;;
    --docker-username) DOCKER_USERNAME="$2"; shift 2 ;;
    --docker-password) DOCKER_PASSWORD="$2"; shift 2 ;;
    --extra-env-file)  EXTRA_ENV_FILE="$2"; shift 2 ;;
    -h|--help)         usage; exit 0 ;;
    *)                 echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done
for var in ORG SPACE APP_NAME DOCKER_IMAGE; do
  [[ -n "${!var}" ]] || { echo "missing required argument for $var" >&2; usage >&2; exit 2; }
done
MEMORY="${MEMORY:-512M}"
DISK="${DISK:-2G}"

echo "=== Deploy (direct: one app with its own route, no router) ==="
echo "  org/space:  $ORG / $SPACE"
echo "  app:        $APP_NAME"
echo "  image:      $DOCKER_IMAGE"
echo

if [[ -n "${CF_API:-}" ]]; then
  current="$(cf api 2>/dev/null | awk '/API endpoint:/{print $3}')"
  if [[ "$current" != "$CF_API" ]] || ! cf oauth-token >/dev/null 2>&1; then
    echo "[0/3] log in: cf api $CF_API, cf auth ${CF_USERNAME:-<CF_USERNAME not set>}"
    cf api "$CF_API" >/dev/null
    cf auth >/dev/null
  fi
fi

echo "[1/3] cf target -o $ORG -s $SPACE"
cf target -o "$ORG" -s "$SPACE" >/dev/null

echo "[2/3] cf push $APP_NAME (docker image, $MEMORY memory, $DISK disk, default route)"
push=(cf push "$APP_NAME" --docker-image "$DOCKER_IMAGE" -m "$MEMORY" -k "$DISK" -i 1 --no-start)
if [[ -n "$DOCKER_USERNAME" ]]; then
  CF_DOCKER_PASSWORD="$DOCKER_PASSWORD" "${push[@]}" --docker-username "$DOCKER_USERNAME"
else
  "${push[@]}"
fi
cf set-label app "$APP_NAME" poc=sandbox-router role=direct bundle="$APP_NAME" >/dev/null || true
if [[ -n "$EXTRA_ENV_FILE" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in ''|'#'*) continue ;; esac
    cf set-env "$APP_NAME" "${line%%=*}" "${line#*=}" >/dev/null
    echo "      env ${line%%=*} set"
  done < "$EXTRA_ENV_FILE"
fi

# restart = start for a new app; for an existing app it stages and runs the newly pushed image
echo "[3/3] start $APP_NAME"
if ! cf restart "$APP_NAME"; then
  echo
  echo "=== $APP_NAME did not start; last app logs ==="
  cf logs "$APP_NAME" --recent 2>&1 | tail -n 40
  exit 1
fi

route="$(cf app "$APP_NAME" | awk -F'routes:[[:space:]]*' '/^routes:/{print $2}' | tr ',' '\n' \
         | awk '{$1=$1; print}' | grep -v '\.apps\.internal$' | head -n1)"
echo
echo "=== app ready ==="
echo "  router URL:   https://$route"
