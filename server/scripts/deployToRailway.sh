#!/usr/bin/env bash
# Uploads the API build context to Railway with `railway up`, for one environment.
#
#   RAILWAY_TOKEN=<environment-scoped project token> server/scripts/deployToRailway.sh <staging|production> <cli-version>
#   DEPLOY_DRY_RUN=1 server/scripts/deployToRailway.sh <staging|production> <cli-version>
#
# The upload is a clean directory outside the repository: the committed tree (git archive HEAD,
# so no .git and no untracked files) plus the staged build/ directory from stageBuildContent.sh.
# It refuses to upload when that directory holds .git, an .ssh directory, known_hosts, an env file,
# a PEM or key file, or a deploy key, so a key can never reach Railway even if a later step stages
# one by mistake. DEPLOY_DRY_RUN=1 runs every check and stops before contacting Railway (tests use
# it, together with DEPLOY_ROOT to point at a scratch repository).
set -euo pipefail

environment="${1:?usage: deployToRailway.sh <staging|production> <cli-version>}"
cli_version="${2:?usage: deployToRailway.sh <staging|production> <cli-version>}"
case "$environment" in
  staging | production) ;;
  *) echo "unknown environment: $environment" >&2; exit 1 ;;
esac
dry_run="${DEPLOY_DRY_RUN:-0}"
if [ "$dry_run" != 1 ]; then
  [ -n "${RAILWAY_TOKEN:-}" ] || { echo 'RAILWAY_TOKEN is not set; nothing was deployed.' >&2; exit 1; }
fi

root="${DEPLOY_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
[ -d "$root/build/content" ] && [ -d "$root/build/paid-content" ] \
  || { echo 'build/ is not staged; run server/scripts/stageBuildContent.sh first.' >&2; exit 1; }

upload="$(mktemp -d)"
trap 'chmod -R u+w "$upload" 2>/dev/null || true; rm -rf "$upload"' EXIT

git -C "$root" archive HEAD | tar -x -C "$upload"
mkdir -p "$upload/build"
cp -R "$root/build/content" "$root/build/paid-content" "$upload/build/"

forbidden="$(find "$upload" \( -name .git -o -name .ssh -o -name known_hosts -o -name '.env*' \
  -o -name '*.pem' -o -name '*.key' -o -name '*.ppk' -o -iname '*deploy_key*' -o -name 'id_*' \) -print)"
if [ -n "$forbidden" ]; then
  echo 'Refusing to upload: the build context contains files that must never reach Railway:' >&2
  echo "$forbidden" | sed "s#^$upload/#  #" >&2
  exit 1
fi

if [ "$dry_run" = 1 ]; then
  echo "dry run: the $environment upload passed every check; nothing was sent to Railway."
  exit 0
fi

npx --yes "@railway/cli@$cli_version" up "$upload" --ci --no-gitignore --service api --environment "$environment"
