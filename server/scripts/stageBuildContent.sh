#!/usr/bin/env bash
# Stages the content the API image bakes in, under <repo>/build, which server/Dockerfile copies.
# The Docker build never sees a key: this script uses the deploy key outside Docker.
#
#   CONTENT_DEPLOY_KEY=<private key text> server/scripts/stageBuildContent.sh private
#   server/scripts/stageBuildContent.sh fixture
#
#   private  the public content from this repo plus the paid banks fetched from the private
#            syntactical-content repo with a read-only deploy key, at the exact commit recorded
#            in content/paid-content.ref (never the moving head of main).
#   fixture  the tiny content set under server/ci-fixture (no key needed).
#
# Output: build/content (manifest and free banks) and build/paid-content (paid banks). Only the
# files the manifest names are copied, each checked against its manifest hash, so neither the
# clone's .git nor any other file from the content repo reaches the build context. The key is
# written to a mode 0600 file in a fresh temp directory outside the repository and removed on exit.
set -euo pipefail

mode="${1:?usage: stageBuildContent.sh <private|fixture>}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
out="$root/build"
copy="$root/server/scripts/copyContent.mjs"

rm -rf "${out:?}/content" "${out:?}/paid-content"
mkdir -p "$out"

case "$mode" in
  fixture)
    fixture="$root/server/ci-fixture"
    node "$copy" "$fixture/public/manifest.json" "$fixture/public" "$out/content" free
    node "$copy" "$fixture/public/manifest.json" "$fixture/paid" "$out/paid-content" paid
    ;;
  private)
    : "${CONTENT_DEPLOY_KEY:?CONTENT_DEPLOY_KEY must be set for private mode}"
    repo="${CONTENT_REPO:-git@github.com:nullvoidundefined/syntactical-content.git}"
    ref_file="$root/content/paid-content.ref"
    [ -f "$ref_file" ] || { echo "stageBuildContent: missing content/paid-content.ref" >&2; exit 1; }
    ref="$(tr -d '\n' < "$ref_file")"
    if ! printf '%s' "$ref" | grep -Eq '^[0-9a-f]{40}$'; then
      echo "stageBuildContent: content/paid-content.ref must be exactly 40 lowercase hex characters" >&2
      exit 1
    fi
    work="$(mktemp -d)"
    trap 'rm -rf "$work"' EXIT
    umask 077
    printf '%s\n' "$CONTENT_DEPLOY_KEY" > "$work/deploy_key"
    # Trust only GitHub's published ed25519 host key: the scanned key must match the pinned
    # fingerprint, or staging fails.
    ssh-keyscan -t ed25519 github.com > "$work/known_hosts" 2>/dev/null
    ssh-keygen -lf "$work/known_hosts" | grep -q 'SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU'
    export GIT_SSH_COMMAND="ssh -i $work/deploy_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$work/known_hosts"
    "$root/server/scripts/fetchPinnedCommit.sh" "$repo" "$ref" "$work/content"
    node "$copy" "$root/content/manifest.json" "$root/content" "$out/content" free
    node "$copy" "$root/content/manifest.json" "$work/content" "$out/paid-content" paid
    ;;
  *)
    echo "stageBuildContent: unknown mode '$mode' (expected private or fixture)" >&2
    exit 2
    ;;
esac
echo "stageBuildContent: staged $mode content under build/"
