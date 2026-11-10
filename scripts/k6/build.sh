#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${K6_OUT_DIR:-${ROOT_DIR}/bin}"
K6_VERSION="${K6_VERSION:-v0.45.1}"
XK6_VERSION="${XK6_VERSION:-v0.10.0}"
XK6_AMQP_VERSION="${XK6_AMQP_VERSION:-v0.4.1}"
EXTENSION="github.com/grafana/xk6-amqp@${XK6_AMQP_VERSION}"

mkdir -p "${OUT_DIR}"

if command -v xk6 >/dev/null 2>&1 && command -v go >/dev/null 2>&1; then
  echo "Construyendo k6 con xk6 local..."
  xk6 build "${K6_VERSION}" --with "${EXTENSION}" --output "${OUT_DIR}/k6"
  echo "Binario listo: ${OUT_DIR}/k6"
  exit 0
fi

if command -v go >/dev/null 2>&1; then
  echo "Instalando xk6 ${XK6_VERSION} con Go..."
  go install "go.k6.io/xk6/cmd/xk6@${XK6_VERSION}"
  "${GOPATH:-$(go env GOPATH)}/bin/xk6" build "${K6_VERSION}" \
    --with "${EXTENSION}" \
    --output "${OUT_DIR}/k6"
  echo "Binario listo: ${OUT_DIR}/k6"
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "No se encontró Go/xk6 ni Docker. Instala una de las dos herramientas." >&2
  exit 1
fi

OUTPUT="bin/k6"
if [ "$(uname -s)" != "Linux" ]; then
  OUTPUT="bin/k6-linux"
  echo "Docker generará un binario Linux (${OUTPUT})."
  echo "En macOS usa 'scripts/k6/run.sh', que ejecuta k6 dentro de Docker Compose."
fi

echo "Construyendo k6 con Go 1.21 en Docker..."
docker run --rm \
  --entrypoint /bin/sh \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e GOPATH=/tmp/go \
  -e GOBIN=/tmp/go/bin \
  -e GOCACHE=/tmp/go-cache \
  -e GOMODCACHE=/tmp/go-mod \
  -e K6_VERSION="${K6_VERSION}" \
  -e XK6_VERSION="${XK6_VERSION}" \
  -e EXTENSION="${EXTENSION}" \
  -e OUTPUT="${OUTPUT}" \
  -v "${ROOT_DIR}":/xk6 \
  -w /xk6 \
  golang:1.21-bookworm \
  -c 'go install "go.k6.io/xk6/cmd/xk6@${XK6_VERSION}" \
      && /tmp/go/bin/xk6 build "${K6_VERSION}" \
           --with "${EXTENSION}" \
           --output "${OUTPUT}"'

echo "Binario listo: ${ROOT_DIR}/${OUTPUT}"
