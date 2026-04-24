#!/usr/bin/env bash
set -Eeuo pipefail

env_file="${1:-.env}"

if [[ ! -f "${env_file}" ]]; then
  printf 'ERROR: env file not found: %s\n' "${env_file}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${env_file}"
set +a

errors=0

require_var() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    printf 'ERROR: missing required variable: %s\n' "${key}" >&2
    errors=$((errors + 1))
  fi
}

require_numeric() {
  local key="$1"
  local value="${!key:-}"
  if [[ ! "${value}" =~ ^[0-9]+$ ]]; then
    printf 'ERROR: %s must be numeric, got: %s\n' "${key}" "${value}" >&2
    errors=$((errors + 1))
  fi
}

require_port() {
  local key="$1"
  local value="${!key:-}"
  if [[ ! "${value}" =~ ^[0-9]+$ ]] || (( value < 1 || value > 65535 )); then
    printf 'ERROR: %s must be a valid port (1-65535), got: %s\n' "${key}" "${value}" >&2
    errors=$((errors + 1))
  fi
}

require_bool01() {
  local key="$1"
  local value="${!key:-}"
  if [[ "${value}" != "0" && "${value}" != "1" ]]; then
    printf 'ERROR: %s must be 0 or 1, got: %s\n' "${key}" "${value}" >&2
    errors=$((errors + 1))
  fi
}

require_var IMAGE_NAME
require_var CONTAINER_NAME
require_var TZ
require_var STEAM_APP_ID
require_var AC_INSTALL_DIR
require_var AC_SERVER_BIN
require_var AC_TCP_PORT
require_var AC_UDP_PORT
require_var HTTP_PORT
require_var STEAMCMD_MAX_RETRIES
require_var STEAMCMD_RETRY_DELAY
require_var STEAM_VALIDATE
require_var SKIP_UPDATE
require_var STEAMCMD_ALLOW_FAILURE_IF_INSTALLED
require_var CONTROL_PANEL_PORT
require_var AUTH_ENABLED
require_var CONTROL_PANEL_USERNAME
require_var CONTROL_PANEL_PASSWORD
require_var CONTROL_PANEL_ROLE
require_var CONTROL_PANEL_SESSION_SECRET
require_var CONTROL_PANEL_TOKEN_TTL_SEC
require_var CONTROL_PANEL_RATE_LIMIT_RPM
require_var WEB_ORIGIN
require_var ALLOW_CONFIG_WRITE
require_var ACTION_MODE
require_var ACTION_TIMEOUT_MS

require_numeric STEAM_APP_ID
require_numeric STEAMCMD_MAX_RETRIES
require_numeric STEAMCMD_RETRY_DELAY
require_numeric CONTROL_PANEL_TOKEN_TTL_SEC
require_numeric CONTROL_PANEL_RATE_LIMIT_RPM
require_numeric ACTION_TIMEOUT_MS

require_port AC_TCP_PORT
require_port AC_UDP_PORT
require_port HTTP_PORT
require_port CONTROL_PANEL_PORT

require_bool01 STEAM_VALIDATE
require_bool01 SKIP_UPDATE
require_bool01 STEAMCMD_ALLOW_FAILURE_IF_INSTALLED
require_bool01 AUTH_ENABLED
require_bool01 ALLOW_CONFIG_WRITE

if [[ "${ACTION_MODE}" != "mock" && "${ACTION_MODE}" != "command" ]]; then
  printf 'ERROR: ACTION_MODE must be mock or command, got: %s\n' "${ACTION_MODE}" >&2
  errors=$((errors + 1))
fi

if [[ "${ACTION_MODE}" == "command" ]]; then
  require_var ACTION_START_CMD
  require_var ACTION_STOP_CMD
  require_var ACTION_RESTART_CMD
fi

if (( errors > 0 )); then
  printf 'Preflight failed with %d error(s).\n' "${errors}" >&2
  exit 1
fi

if [[ "${CONTROL_PANEL_PASSWORD}" == "change-me-now" ]]; then
  printf 'WARNING: CONTROL_PANEL_PASSWORD still set to default value.\n' >&2
fi

if [[ "${CONTROL_PANEL_SESSION_SECRET}" == "change-this-secret" ]]; then
  printf 'WARNING: CONTROL_PANEL_SESSION_SECRET still set to default value.\n' >&2
fi

printf 'Preflight passed for %s\n' "${env_file}"
