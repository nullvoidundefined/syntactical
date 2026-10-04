#!/usr/bin/env bash
# Fetches exactly one commit of a repository into a new directory and verifies it.
#
#   fetchPinnedCommit.sh <repo-url> <sha> <dir>
#
# The sha must be 40 lowercase hex characters; it is checked before any git call, which also keeps a
# value that looks like an option out of git's argument list. The commit is fetched shallowly by
# sha, checked out detached, and HEAD must equal the sha, so the tree is never a moving branch head.
# Git's transport settings (such as GIT_SSH_COMMAND) come from the caller's environment.
set -euo pipefail

repo="${1:?usage: fetchPinnedCommit.sh <repo-url> <sha> <dir>}"
sha="${2:?usage: fetchPinnedCommit.sh <repo-url> <sha> <dir>}"
dir="${3:?usage: fetchPinnedCommit.sh <repo-url> <sha> <dir>}"

if ! printf '%s' "$sha" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "fetchPinnedCommit: sha must be exactly 40 lowercase hex characters" >&2
  exit 1
fi

git init --quiet "$dir"
git -C "$dir" remote add origin "$repo"
git -C "$dir" fetch --quiet --depth 1 origin "$sha"
git -C "$dir" checkout --quiet --detach FETCH_HEAD
[ "$(git -C "$dir" rev-parse HEAD)" = "$sha" ] || {
  echo "fetchPinnedCommit: fetched commit does not match the pinned sha" >&2
  exit 1
}
