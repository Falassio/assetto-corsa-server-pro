#!/usr/bin/env bash
set -Eeuo pipefail

server_bin="${AC_SERVER_BIN:-acServer}"

if pgrep -f "(^|/)${server_bin}(\s|$)" >/dev/null 2>&1; then
  exit 0
fi

if pgrep -f "box86.*${server_bin}" >/dev/null 2>&1; then
  exit 0
fi

exit 1
