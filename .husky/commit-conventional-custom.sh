#!/usr/bin/env bash
set -euo pipefail

ALLOWED_PREFIXES=(feat fix build chore ci docs style refactor perf test)
TERMINAL_RED=$'\033[0;31m'
TERMINAL_BLUE=$'\033[0;36m'
TERMINAL_YELLOW=$'\033[0;33m'
TERMINAL_NO_COLOR=$'\033[0m'

MESSAGE_FILE="${1:?Falta el archivo del mensaje de commit}"
MESSAGE="$(head -n 1 "$MESSAGE_FILE")"
TYPE_AND_SCOPE="${MESSAGE%%:*}"
TYPE="${TYPE_AND_SCOPE%%\(*}"

printf 'message: %s\n' "$MESSAGE"

if [[ "$MESSAGE" != *": "* ]] || [[ ! " ${ALLOWED_PREFIXES[*]} " == *" ${TYPE} "* ]]; then
  printf '%s\n' "${TERMINAL_RED}====== ERROR ======${TERMINAL_NO_COLOR}"
  printf '%s\n' "${TERMINAL_BLUE}Formato esperado: <tipo>: <mensaje>${TERMINAL_NO_COLOR}"
  printf '%s\n' "${TERMINAL_YELLOW}Tipos permitidos: ${ALLOWED_PREFIXES[*]}${TERMINAL_NO_COLOR}"
  exit 1
fi
