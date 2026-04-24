#!/usr/bin/env bash
set -Eeuo pipefail

# Entrypoint robusto per Assetto Corsa Server:
# - aggiorna automaticamente il server via SteamCMD
# - gestisce runtime x86_64 e ARM64 (con box86)
# - collega le directory persistenti richieste (/cfg, /content, /logs)

STEAMCMD_DIR="${STEAMCMD_DIR:-/opt/steamcmd}"
STEAM_APP_ID="${STEAM_APP_ID:-244210}"
AC_INSTALL_DIR="${AC_INSTALL_DIR:-/opt/ac-server}"
AC_SERVER_BIN="${AC_SERVER_BIN:-acServer}"
STEAMCMD_MAX_RETRIES="${STEAMCMD_MAX_RETRIES:-3}"
STEAMCMD_RETRY_DELAY="${STEAMCMD_RETRY_DELAY:-5}"
STEAM_VALIDATE="${STEAM_VALIDATE:-1}"
SKIP_UPDATE="${SKIP_UPDATE:-0}"
STEAMCMD_ALLOW_FAILURE_IF_INSTALLED="${STEAMCMD_ALLOW_FAILURE_IF_INSTALLED:-1}"
AC_SERVER_ARGS="${AC_SERVER_ARGS:-}"

CFG_DIR="/cfg"
CONTENT_DIR="/content"
LOGS_DIR="/logs"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

prepare_persistent_link() {
  local persistent_dir="$1"
  local target_dir="$2"

  mkdir -p "${persistent_dir}"

  if [[ -d "${target_dir}" && ! -L "${target_dir}" ]]; then
    if [[ -z "$(ls -A "${persistent_dir}")" && -n "$(ls -A "${target_dir}")" ]]; then
      log "Inizializzo ${persistent_dir} con i contenuti di default di ${target_dir}"
      cp -a "${target_dir}/." "${persistent_dir}/"
    fi
    rm -rf "${target_dir}"
  fi

  if [[ -L "${target_dir}" ]]; then
    rm -f "${target_dir}"
  fi

  ln -s "${persistent_dir}" "${target_dir}"
}

select_runtime() {
  local arch
  arch="$(uname -m)"

  case "${arch}" in
    x86_64|amd64)
      log "Architettura rilevata: ${arch} (runtime nativo)"
      export AC_RUNTIME="native"
      ;;
    aarch64|arm64)
      command -v box86 >/dev/null 2>&1 || die "box86 non trovato: impossibile avviare il binario x86 su ARM64"
      log "Architettura rilevata: ${arch} (runtime emulato con box86)"
      export AC_RUNTIME="box86"
      ;;
    *)
      die "Architettura non supportata: ${arch}"
      ;;
  esac
}

update_server() {
  local steamcmd_native="${STEAMCMD_DIR}/steamcmd.sh"
  local steamcmd_x86="${STEAMCMD_DIR}/linux32/steamcmd"
  local attempt=1
  local server_path="${AC_INSTALL_DIR}/${AC_SERVER_BIN}"
  local steam_args=(
    +@ShutdownOnFailedCommand 1
    +@NoPromptForPassword 1
    +force_install_dir "${AC_INSTALL_DIR}"
    +login anonymous
    +app_update "${STEAM_APP_ID}"
  )

  if [[ "${SKIP_UPDATE}" == "1" ]]; then
    log "SKIP_UPDATE=1: salto aggiornamento SteamCMD"
    return 0
  fi

  if [[ "${STEAM_VALIDATE}" == "1" ]]; then
    steam_args+=(validate)
  fi

  steam_args+=(+quit)

  log "Aggiornamento Assetto Corsa Dedicated Server (AppID ${STEAM_APP_ID})"

  while (( attempt <= STEAMCMD_MAX_RETRIES )); do
    log "SteamCMD tentativo ${attempt}/${STEAMCMD_MAX_RETRIES}"

    if [[ "${AC_RUNTIME}" == "box86" ]]; then
      [[ -x "${steamcmd_x86}" ]] || die "SteamCMD x86 non trovato: ${steamcmd_x86}"
      if box86 "${steamcmd_x86}" "${steam_args[@]}"; then
        return 0
      fi
    else
      [[ -x "${steamcmd_native}" ]] || die "SteamCMD non trovato: ${steamcmd_native}"
      if "${steamcmd_native}" "${steam_args[@]}"; then
        return 0
      fi
    fi

    (( attempt++ ))
    if (( attempt <= STEAMCMD_MAX_RETRIES )); then
      log "SteamCMD fallito, nuovo tentativo tra ${STEAMCMD_RETRY_DELAY}s"
      sleep "${STEAMCMD_RETRY_DELAY}"
    fi
  done

  if [[ "${STEAMCMD_ALLOW_FAILURE_IF_INSTALLED}" == "1" && -f "${server_path}" ]]; then
    log "SteamCMD non ha restituito exit code pulito, ma il server esiste gia (${server_path}). Continuo l'avvio."
    return 0
  fi

  die "SteamCMD ha fallito dopo ${STEAMCMD_MAX_RETRIES} tentativi"
}

start_server() {
  local server_path="${AC_INSTALL_DIR}/${AC_SERVER_BIN}"
  local parsed_args=()
  [[ -f "${server_path}" ]] || die "Binario server non trovato: ${server_path}"
  chmod +x "${server_path}" || true

  cd "${AC_INSTALL_DIR}"

  if [[ "${AC_RUNTIME}" == "box86" ]]; then
    log "Avvio server con box86"
    if [[ -n "${AC_SERVER_ARGS}" ]]; then
      # shellcheck disable=SC2206
      parsed_args=( ${AC_SERVER_ARGS} )
      exec box86 "${server_path}" "${parsed_args[@]}" "$@"
    fi
    exec box86 "${server_path}" "$@"
  fi

  log "Avvio server nativo"
  if [[ -n "${AC_SERVER_ARGS}" ]]; then
    # shellcheck disable=SC2206
    parsed_args=( ${AC_SERVER_ARGS} )
    exec "${server_path}" "${parsed_args[@]}" "$@"
  fi
  exec "${server_path}" "$@"
}

main() {
  mkdir -p "${AC_INSTALL_DIR}" "${CFG_DIR}" "${CONTENT_DIR}" "${LOGS_DIR}"

  select_runtime
  update_server

  prepare_persistent_link "${CFG_DIR}" "${AC_INSTALL_DIR}/cfg"
  prepare_persistent_link "${CONTENT_DIR}" "${AC_INSTALL_DIR}/content"
  prepare_persistent_link "${LOGS_DIR}" "${AC_INSTALL_DIR}/logs"

  start_server "$@"
}

main "$@"
