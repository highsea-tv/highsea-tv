#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Runs the server as PUID:PGID (so files in /config and /data belong to the host user), creating
# that user if needed. As root with PUID=0, it stays root.
#
# highsea connects (ADR 0042) needs CAP_NET_ADMIN to make its WireGuard interface and routes. A
# capability given with `cap_add` is lost when gosu switches to a non-root user, so when the
# container's bounding set holds CAP_NET_ADMIN (bit 12 of CapBnd, capabilities(7)), the switch is
# made with setpriv(1) instead: it sets PR_SET_KEEPCAPS, changes user, then raises CAP_NET_ADMIN in
# the inheritable and ambient sets, so `node` (and the `ip`, `wg` and wireguard-go it runs) keep it
# across execve (capabilities(7), "Ambient capability set"). Without the capability, nothing changes.
set -eu
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
mkdir -p "$HIGHSEA_CONFIG_DIR" "$HIGHSEA_DATA_DIR"
if [ "$(id -u)" = "0" ] && [ "$PUID" != "0" ]; then
  getent group "$PGID" >/dev/null || groupadd -o -g "$PGID" highsea
  getent passwd "$PUID" >/dev/null || useradd -o -u "$PUID" -g "$PGID" -M -d /config -s /usr/sbin/nologin highsea
  chown "$PUID:$PGID" "$HIGHSEA_CONFIG_DIR"
  # Hardware acceleration (ADR 0056): the user joins the group of each render node passed through
  # (/dev/dri/renderD128 and on), whatever the host numbered it, so ffmpeg can open the GPU. A
  # compose file's group_add reaches only the container's first process, and gosu given uid:gid
  # drops every other group, so the switch is then made with setpriv's --init-groups, which takes
  # them from /etc/group (setpriv(1), initgroups(3)).
  user="$(getent passwd "$PUID" | cut -d: -f1)"
  groups=""
  for node in /dev/dri/renderD*; do
    [ -e "$node" ] || continue
    gid="$(stat -c %g "$node")"
    [ "$gid" = 0 ] && continue
    getent group "$gid" >/dev/null || groupadd -o -g "$gid" "render$gid"
    usermod -aG "$(getent group "$gid" | cut -d: -f1)" "$user"
    groups=1
  done
  [ -n "$(ls -A "$HIGHSEA_DATA_DIR" 2>/dev/null)" ] || chown "$PUID:$PGID" "$HIGHSEA_DATA_DIR"
  cd /app/apps/server
  capbnd="$(sed -n 's/^CapBnd:[[:space:]]*//p' /proc/self/status 2>/dev/null || true)"
  if [ -n "$capbnd" ] && [ $(( (0x$capbnd >> 12) & 1 )) = 1 ]; then
    exec setpriv --reuid="$PUID" --regid="$PGID" --init-groups \
      --inh-caps=+net_admin --ambient-caps=+net_admin -- "$@"
  fi
  if [ -n "$groups" ]; then
    exec setpriv --reuid="$PUID" --regid="$PGID" --init-groups -- "$@"
  fi
  exec gosu "$PUID:$PGID" "$@"
fi
cd /app/apps/server
exec "$@"
