#!/usr/bin/env bash
# Stages the content the API image bakes in, under <repo>/build/content, which server/Dockerfile
# copies. Every bank is public, so no key and no second repository are involved.
#
#   server/scripts/stageBuildContent.sh public    this repository's content/ (deploys and CI)
#   server/scripts/stageBuildContent.sh fixture   the tiny content set under server/ci-fixture/public
#
# Only the manifest and the banks it names are copied, each bank checked against its manifest hash.
set -euo pipefail

mode="${1:?usage: stageBuildContent.sh <public|fixture>}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
out="$root/build"
copy="$root/server/scripts/copyContent.mjs"

case "$mode" in
  public) source_dir="$root/content" ;;
  fixture) source_dir="$root/server/ci-fixture/public" ;;
  *)
    echo "stageBuildContent: unknown mode '$mode' (expected public or fixture)" >&2
    exit 2
    ;;
esac

rm -rf "${out:?}/content" "${out:?}/paid-content"
mkdir -p "$out"
node "$copy" "$source_dir/manifest.json" "$source_dir" "$out/content"
echo "stageBuildContent: staged $mode content under build/content"
