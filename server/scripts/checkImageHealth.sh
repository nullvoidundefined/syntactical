#!/usr/bin/env bash
# Runs a built server image once and proves it works: the image's own CMD (migrations, then the
# server) comes up, the image's own HEALTHCHECK turns healthy, /health and /health/ready
# answer, migrations ran at start, the process is not root, and SIGTERM stops it cleanly.
#
#   DATABASE_URL=<url the container can reach> [DOCKER_NETWORK=<network>] \
#     server/scripts/checkImageHealth.sh <image>
#
# NODE_ENV is development here only because CI's Postgres has no TLS and production requires
# verified TLS; the TLS rules are unit tested in createDatabasePool.test.ts. The container is
# labeled and is the only thing this script removes.
set -euo pipefail

image="${1:?usage: checkImageHealth.sh <image>}"
: "${DATABASE_URL:?DATABASE_URL must be set}"
network="${DOCKER_NETWORK:-host}"
name="syntactical-image-check-$$"

# Random run-time values, never stored anywhere.
secret() { head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --detach --name "$name" --label throwaway=syntactical-image-check --network "$network" \
  --health-interval 2s --health-timeout 5s --health-retries 10 --health-start-period 1s \
  -e NODE_ENV=development \
  -e DATABASE_URL \
  -e ALLOWED_ORIGINS=https://syntactical.dev \
  -e PUBLIC_BASE_URL=https://api.syntactical.dev \
  -e 'EMAIL_FROM=Syntactical <sign-in@syntactical.dev>' \
  -e "RESEND_API_KEY=$(secret)" \
  -e "RATE_LIMIT_KEY_SECRET=$(secret)" \
  -e "REVENUECAT_WEBHOOK_AUTH=$(secret)" \
  "$image" >/dev/null

status=starting
for _ in $(seq 1 60); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$name")"
  if [ "$status" = healthy ] || [ "$(docker inspect --format '{{.State.Running}}' "$name")" != true ]; then
    break
  fi
  sleep 1
done
if [ "$status" != healthy ]; then
  echo "image check: HEALTHCHECK status is '$status'; container log follows" >&2
  docker logs "$name" >&2 || true
  exit 1
fi

if ! docker logs "$name" 2>&1 | grep -q 'Migrations complete!'; then
  echo 'image check: the start command did not run migrations; container log follows' >&2
  docker logs "$name" >&2 || true
  exit 1
fi

probe() {
  docker exec "$name" node -e "fetch('http://127.0.0.1:3001$1').then(async (r) => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); })"
}
probe /health
probe /health/ready

user_id="$(docker exec "$name" id -u)"
if [ "$user_id" = 0 ]; then
  echo 'image check: the server runs as root' >&2
  exit 1
fi

docker stop --time 15 "$name" >/dev/null
exit_code="$(docker inspect --format '{{.State.ExitCode}}' "$name")"
if [ "$exit_code" != 0 ]; then
  echo "image check: SIGTERM shutdown exited with code $exit_code" >&2
  docker logs "$name" >&2 || true
  exit 1
fi
echo 'image check: migrated, healthy, non-root, and clean SIGTERM shutdown'
