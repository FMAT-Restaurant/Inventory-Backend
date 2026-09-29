#!/usr/bin/env bash
set -euo pipefail

TAG="${1:?Indica un tag, por ejemplo v1.0.0}"

git rev-parse --verify "${TAG}^{commit}" >/dev/null

PREVIOUS_TAG="$(
  git describe --tags --abbrev=0 --match 'v[0-9]*' "${TAG}^" 2>/dev/null || true
)"

printf '# Cambios de %s\n\n' "$TAG"

if [[ -n "$PREVIOUS_TAG" ]]; then
  git log "${PREVIOUS_TAG}..${TAG}" --pretty=format:'- %s (%h)'
else
  git log "$TAG" --pretty=format:'- %s (%h)'
fi

printf '\n'
