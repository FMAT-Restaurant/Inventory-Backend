#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/6] Repository contract check"
python3 scripts/check_repo_contract.py

echo "[2/6] Lint"
npm run lint

echo "[3/6] Unit tests"
npm test

echo "[4/6] Build"
npm run build

echo "[5/6] OpenAPI generation"
npm run openapi:generate

echo "[6/6] Contract summary"
echo "verify_repo: PASS"
