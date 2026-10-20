#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Runs the server as PUID:PGID (so files in /config and /data belong to the host user), creating
# that user if needed. As root with PUID=0, it stays root.
set -eu
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
mkdir -p "$HIGHSEA_CONFIG_DIR" "$HIGHSEA_DATA_DIR"
if [ "$(id -u)" = "0" ] && [ "$PUID" != "0" ]; then
  getent group "$PGID" >/dev/null || groupadd -o -g "$PGID" highsea
  getent passwd "$PUID" >/dev/null || useradd -o -u "$PUID" -g "$PGID" -M -d /config -s /usr/sbin/nologin highsea
  chown "$PUID:$PGID" "$HIGHSEA_CONFIG_DIR"
  [ -n "$(ls -A "$HIGHSEA_DATA_DIR" 2>/dev/null)" ] || chown "$PUID:$PGID" "$HIGHSEA_DATA_DIR"
  cd /app/apps/server
  exec gosu "$PUID:$PGID" "$@"
fi
cd /app/apps/server
exec "$@"
