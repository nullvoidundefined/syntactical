#!/usr/bin/env bash
# Fails when a built image holds key material or an .ssh directory: in its build history, in the
# file list of any layer, or in the bytes of any layer or metadata blob.
#
#   server/scripts/scanImageForKeys.sh <image>
#   server/scripts/scanImageForKeys.sh --self-test    (proves the scan catches a planted key)
set -euo pipefail

# Private key armor, an OpenSSH private key body, and an ssh key file by name.
content_pattern='PRIVATE KEY-----|b3BlbnNzaC1rZXktdjE'
path_pattern='(^|/)\.ssh(/|$)|(^|/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$|(^|/)deploy_key$'
history_pattern="${content_pattern}|\\.ssh|id_(rsa|dsa|ecdsa|ed25519)|deploy_key"

scan_image() {
  local image="$1" work found=0
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' RETURN

  if docker history --no-trunc --format '{{.CreatedBy}}' "$image" | grep -Eqe "$history_pattern"; then
    echo "scan: build history of $image mentions key material or .ssh" >&2
    found=1
  fi

  docker save "$image" -o "$work/image.tar"
  mkdir "$work/image"
  tar -xf "$work/image.tar" -C "$work/image"
  local blob layers=0
  while IFS= read -r blob; do
    if tar -tf "$blob" >"$work/listing" 2>/dev/null; then
      layers=$((layers + 1))
      if grep -Eq -e "$path_pattern" "$work/listing"; then
        echo "scan: a layer holds a key file or an .ssh directory: $(grep -E -e "$path_pattern" "$work/listing" | head -3 | tr '\n' ' ')" >&2
        found=1
      fi
      if tar -xOf "$blob" 2>/dev/null | grep -aEq -e "$content_pattern"; then
        echo "scan: a layer holds private key material" >&2
        found=1
      fi
    elif grep -aEq -e "$content_pattern" "$blob"; then
      echo "scan: image metadata holds private key material" >&2
      found=1
    fi
  done < <(find "$work/image" -type f)
  if [ "$layers" -eq 0 ]; then
    echo "scan: found no layers in $image; the scan would prove nothing" >&2
    return 1
  fi
  return "$found"
}

if [ "${1:-}" = --self-test ]; then
  tag="syntactical-scan-selftest:$$"
  trap 'docker image rm "$tag" >/dev/null 2>&1 || true' EXIT
  # Both plants are assembled at run time inside the build, so neither this file nor the build
  # history carries a key-shaped literal; only the layer content does. That exercises the layer
  # scan on its own.
  docker build --quiet --label throwaway=syntactical-scan-selftest -t "$tag" - >/dev/null <<'DOCKERFILE'
FROM node:22.21.1-bookworm-slim
RUN d=.ss; n=25519; mkdir -p "/root/${d}h" && : > "/root/${d}h/id_ed${n}" \
    && a='-----BEGIN OPENSSH PRIV'; b='ATE KEY-----'; printf '%s%s\n' "$a" "$b" > /tmp/planted
DOCKERFILE
  output="$(scan_image "$tag" 2>&1 || true)"
  if grep -q 'key file or an .ssh directory' <<<"$output" && grep -q 'a layer holds private key material' <<<"$output"; then
    echo 'scan self-test: the scan caught the planted .ssh directory and key material'
    exit 0
  fi
  echo "scan self-test: the scan missed a planted key; output was: $output" >&2
  exit 1
fi

image="${1:?usage: scanImageForKeys.sh <image>}"
scan_image "$image"
echo "scan: $image has no key material and no .ssh directory"
