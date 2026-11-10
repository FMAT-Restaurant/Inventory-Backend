#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPTS_DIR="${ROOT_DIR}/tests/k6"
OUT_DIR="${K6_OUT_DIR:-${SCRIPTS_DIR}/out}"
SUITE="${1:-smoke}"

mkdir -p "${OUT_DIR}"

case "${SUITE}" in
  smoke)
    FILES=("api/smoke.js")
    ;;
  api)
    FILES=(
      "api/smoke.js"
      "api/items-crud.js"
      "api/suppliers-crud.js"
      "api/batches-crud.js"
      "api/recipes-crud.js"
      "api/reservations-read.js"
      "api/mixed-workload.js"
    )
    ;;
  events)
    FILES=(
      "events/menu-plate.js"
      "events/orders-reservation.js"
      "events/outbound-events.js"
    )
    ;;
  all)
    FILES=(
      "api/smoke.js"
      "api/items-crud.js"
      "api/suppliers-crud.js"
      "api/batches-crud.js"
      "api/recipes-crud.js"
      "api/reservations-read.js"
      "api/mixed-workload.js"
      "events/menu-plate.js"
      "events/orders-reservation.js"
      "events/outbound-events.js"
    )
    ;;
  *)
    if [ -f "${SCRIPTS_DIR}/${SUITE}" ]; then
      FILES=("${SUITE}")
    else
      echo "Suite desconocida: ${SUITE}" >&2
      echo "Usa: smoke | api | events | all | <ruta-relativa-a-tests/k6>" >&2
      exit 1
    fi
    ;;
esac

run_native() {
  local bin="$1"
  for file in "${FILES[@]}"; do
    local name
    name="$(basename "${file}" .js)"
    echo "==> ${file}"
    "${bin}" run \
      --summary-export "${OUT_DIR}/${name}.json" \
      --summary-trend-stats "avg,min,med,p(90),p(95),p(99),max" \
      "${SCRIPTS_DIR}/${file}"
  done
}

run_docker_compose() {
  local compose=(
    docker compose
    --project-directory "${ROOT_DIR}"
    -f "${ROOT_DIR}/compose.yaml"
    -f "${ROOT_DIR}/compose.loadtest.yaml"
  )

  reset_app_database() {
    echo "==> Limpiando base de datos antes de recrear índices"
    "${compose[@]}" exec -T app node -e \
      "fetch('http://127.0.0.1:8083/apo/test/reset', { method: 'DELETE' }).then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));"
  }

  restart_app() {
    echo "==> Reiniciando app para recrear índices tras reset"
    "${compose[@]}" restart app >/dev/null
    "${compose[@]}" up -d --wait app >/dev/null
  }

  if [ "${K6_COMPOSE_UP:-true}" = "true" ]; then
    "${compose[@]}" up -d --build --wait
  fi

  # El reset de la app usa dropDatabase(), que elimina los índices únicos.
  # Limpiar y reiniciar la app los recrea antes de las suites que validan
  # conflictos (409).
  if [ "${K6_RESET_DB:-false}" = "true" ]; then
    reset_app_database
    restart_app
  fi

  for file in "${FILES[@]}"; do
    local name
    name="$(basename "${file}" .js)"
    echo "==> ${file}"
    "${compose[@]}" --profile loadtest run --rm -T k6 \
      run \
      --summary-export "/scripts/out/${name}.json" \
      --summary-trend-stats "avg,min,med,p(90),p(95),p(99),max" \
      "/scripts/${file}"

    if [ "${K6_RESET_DB:-false}" = "true" ]; then
      restart_app
    fi
  done
}

if [ -n "${K6_BIN:-}" ] && [ -x "${K6_BIN}" ]; then
  run_native "${K6_BIN}"
elif [ -x "${ROOT_DIR}/bin/k6" ] && "${ROOT_DIR}/bin/k6" version >/dev/null 2>&1; then
  run_native "${ROOT_DIR}/bin/k6"
elif command -v k6 >/dev/null 2>&1; then
  run_native "$(command -v k6)"
else
  if ! command -v docker >/dev/null 2>&1; then
    echo "No hay k6 nativo ni Docker disponible." >&2
    exit 1
  fi
  run_docker_compose
fi
