#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# highsea's installer for a Linux machine that has Docker (install-simplicity.md › C, ADR 0057).
#
#   curl -fsSL https://get.highsea.tv | sh
#   curl -fsSL https://get.highsea.tv | sh -s -- --data /srv/media
#
# It writes compose.yaml to /opt/highsea (or --dir), starts highsea and prints the address to
# open. Run it again to update: an existing compose.yaml is kept as it is, and the image is pulled
# and restarted. It never installs Docker, and links Docker's own instructions instead. It does
# install avahi-daemon where the host doesn't run it (--no-avahi skips that): highsea has its own
# network, so the built-in VPN's tunnel stays highsea's, and the apps' Bonjour reaches the network
# through the host's avahi (ADR 0020 and 0042, 2026-11-19).
#
# To check it before running it:
#   curl -fsSLO https://get.highsea.tv/install.sh
#   curl -fsSL https://get.highsea.tv/install.sh.sha256 | sha256sum -c
#   sh install.sh
#
# The guide: https://docs.highsea.tv/install/script/
#
# Everything is inside main(), called on the last line, so a download cut short runs nothing
# (as Tailscale's installer does: https://tailscale.com/install.sh).
set -eu

main() {
  dir=/opt/highsea
  data=""
  version=latest
  print=""
  start=1
  avahi=1
  while [ $# -gt 0 ]; do
    case "$1" in
      --dir) dir="${2:?--dir needs a folder}"; shift 2 ;;
      --data) data="${2:?--data needs a folder}"; shift 2 ;;
      --version) version="${2:?--version needs a version, such as 0.2.0}"; shift 2 ;;
      --print-compose) print=1; shift ;;
      --no-start) start=""; shift ;;
      --no-avahi) avahi=""; shift ;;
      -h | --help) usage; return 0 ;;
      *) fail "There's no option $1. Run with --help to see the options." ;;
    esac
  done
  case "$dir" in /*) ;; *) dir="$(pwd)/$dir" ;; esac
  [ -n "$data" ] || data="$dir/data"
  case "$data" in /*) ;; *) data="$(pwd)/$data" ;; esac

  if [ -n "$print" ]; then
    compose_file "$data" "$version" ""
    return 0
  fi

  [ "$(uname -s)" = Linux ] ||
    fail "This installer is for Linux. On a Mac or Windows, follow https://docs.highsea.tv/install/docker/"

  # Files in --dir are written as root only when the user can't write there themselves.
  sudo=""
  if [ "$(id -u)" != 0 ] && ! can_write "$dir"; then
    command -v sudo >/dev/null 2>&1 ||
      fail "Writing to $dir needs root. Run this as root, or choose a folder you own with --dir."
    sudo=sudo
    say "Writing to $dir needs root, so sudo may ask for your password."
  fi

  docker_checks
  nvidia=""
  graphics
  bonjour_note=""
  [ -z "$avahi" ] || bonjour

  file="$dir/compose.yaml"
  if [ -f "$file" ]; then
    say "Keeping your $file, and updating the image it names."
  else
    taken
    run mkdir -p "$dir"
    if [ ! -d "$data" ]; then
      run mkdir -p "$data"
      # highsea runs as whoever owns /data (ADR 0057): the person who ran this, not root
      if [ -n "${SUDO_UID:-}" ] && [ "$SUDO_UID" != 0 ]; then
        run chown "$SUDO_UID:${SUDO_GID:-$SUDO_UID}" "$data"
      elif [ -n "$sudo" ]; then
        run chown "$(id -u):$(id -g)" "$data"
      fi
    fi
    compose_file "$data" "$version" "$nvidia" | run tee "$file.new" >/dev/null
    run mv "$file.new" "$file"
    say "Wrote $file, with your films in $data."
    owner="$(stat -c '%U (%u:%g)' "$data" 2>/dev/null || true)"
    case "$owner" in
      "" | root*) ;;
      *) say "highsea runs as $owner, who owns $data." ;;
    esac
  fi

  if [ -z "$start" ]; then
    say "Not started (--no-start). To start it: cd $dir && docker compose up -d"
    [ -z "$bonjour_note" ] || say "$bonjour_note"
    return 0
  fi
  (cd "$dir" && $docker compose pull --quiet && $docker compose up -d --remove-orphans) ||
    fail "Docker couldn't start highsea. Its output is above."
  wait_healthy
  address="$(lan_address)"
  say ""
  say "highsea is running. Open http://${address:-<this machine>}:3000 to set it up."
  [ -z "$bonjour_note" ] ||
    say "The iPhone and Apple TV apps won't find it by themselves: in the app, choose Add a server and type http://${address:-<this machine>}:3000"
  say "To update later, run this installer again. The guides: https://docs.highsea.tv/"
}

usage() {
  cat <<'EOF'
highsea's installer for Linux with Docker.

  curl -fsSL https://get.highsea.tv | sh -s -- [options]

  --dir FOLDER      where compose.yaml and highsea's settings go (default /opt/highsea)
  --data FOLDER     one folder for downloads and the library, so imports can hardlink
                    (default FOLDER/data under --dir)
  --version X.Y.Z   a version to pin instead of the newest stable release (latest)
  --no-start        write compose.yaml without starting it
  --no-avahi        don't install avahi-daemon where the host doesn't run it
  --print-compose   print the compose.yaml it would write, and do nothing else

Run it again to update. The guide: https://docs.highsea.tv/install/script/
EOF
}

say() { printf '%s\n' "$*"; }
fail() {
  printf 'highsea: %s\n' "$*" >&2
  exit 1
}
run() { $sudo "$@"; }

# The folder, or the nearest one above it that exists, is writable by this user.
can_write() {
  d="$1"
  while [ ! -e "$d" ]; do d="$(dirname "$d")"; done
  [ -w "$d" ]
}

docker_checks() {
  command -v docker >/dev/null 2>&1 ||
    fail "Docker isn't installed. Install Docker Engine first: https://docs.docker.com/engine/install/"
  docker="docker"
  if ! docker info >/dev/null 2>&1; then
    if [ "$(id -u)" != 0 ] && command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
      docker="sudo docker"
    else
      fail "Docker is installed but isn't answering. Start it (sudo systemctl start docker), or see https://docs.docker.com/engine/install/linux-postinstall/"
    fi
  fi
  $docker compose version >/dev/null 2>&1 ||
    fail "Docker Compose isn't installed. Install its plugin: https://docs.docker.com/compose/install/linux/"
  case "$($docker info --format '{{.OperatingSystem}}' 2>/dev/null)" in
    *"Docker Desktop"*)
      say "This is Docker Desktop, which runs containers in a virtual machine. Apps on your network may not find highsea by themselves: https://docs.highsea.tv/install/docker/" ;;
  esac
}

# Graphics (ADR 0056): /dev/dri is always handed over, and highsea checks it at start. NVIDIA
# needs NVIDIA's container toolkit; where its runtime exists but isn't Docker's default, the
# compose file names it.
graphics() {
  if [ -e /dev/dri ]; then
    say "Found graphics at /dev/dri. highsea checks it at start, and uses it when it works."
  fi
  if command -v nvidia-smi >/dev/null 2>&1 || [ -e /dev/nvidia0 ]; then
    runtimes="$($docker info --format '{{json .Runtimes}}' 2>/dev/null || true)"
    case "$runtimes" in
      *'"nvidia"'*)
        if [ "$($docker info --format '{{.DefaultRuntime}}' 2>/dev/null)" != nvidia ]; then nvidia=1; fi
        say "Found an NVIDIA card and NVIDIA's container toolkit." ;;
      *)
        say "Found an NVIDIA card, but not NVIDIA's container toolkit, so highsea can't use the card yet. To add it: https://docs.highsea.tv/install/hardware-acceleration/" ;;
    esac
  fi
}

# Bonjour (ADR 0020, 2026-11-19). highsea runs in its own network, so the built-in VPN's interface
# and routes stay its own (ADR 0042), and multicast doesn't leave that network. So highsea publishes
# _highsea._tcp through the host's avahi, over the system bus compose.yaml mounts (/run/dbus); the
# iPhone and the Apple TV find servers by Bonjour alone. Where the host doesn't run avahi, this
# installs it from the distribution's own package (Debian and Ubuntu's avahi-daemon, Fedora's,
# openSUSE's, Alpine's and Arch's avahi: https://wiki.archlinux.org/title/Avahi) and starts it.
# Nothing else depends on it, so a failure here says what to do and carries on.
avahi_running() {
  pgrep -x avahi-daemon >/dev/null 2>&1 ||
    { command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet avahi-daemon 2>/dev/null; }
}

bonjour() {
  if avahi_running; then
    say "Found avahi. Apps on your network find highsea through it."
    return 0
  fi
  # Never a prompt an unattended install would wait on: sudo only where it needs no password, or
  # where someone is at a terminal to give it; apt, dnf, zypper, apk and pacman all told not to ask.
  root=""
  if [ "$(id -u)" != 0 ]; then
    if command -v sudo >/dev/null 2>&1 && { sudo -n true 2>/dev/null || (: </dev/tty) 2>/dev/null; }; then
      root=sudo
    else
      no_bonjour "installing it needs root"
      return 0
    fi
  fi
  say "The iPhone and Apple TV apps find highsea by Bonjour, through this machine's avahi, which isn't running. Installing avahi-daemon from your distribution's packages and starting it (--no-avahi skips this)."
  ok=1
  if command -v apt-get >/dev/null 2>&1; then
    { $root env DEBIAN_FRONTEND=noninteractive apt-get update -qq &&
      $root env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold avahi-daemon; } >/dev/null 2>&1 || ok=""
  elif command -v dnf >/dev/null 2>&1; then
    $root dnf install -y -q avahi >/dev/null 2>&1 || ok=""
  elif command -v zypper >/dev/null 2>&1; then
    $root zypper --non-interactive --quiet install avahi >/dev/null 2>&1 || ok=""
  elif command -v apk >/dev/null 2>&1; then
    { $root apk add --quiet avahi dbus &&
      $root rc-update add dbus default && $root rc-update add avahi-daemon default &&
      $root rc-service dbus start && $root rc-service avahi-daemon start; } >/dev/null 2>&1 || ok=""
  elif command -v pacman >/dev/null 2>&1; then
    $root pacman -S --noconfirm --needed --quiet avahi >/dev/null 2>&1 || ok=""
  else
    no_bonjour "this installer doesn't know this system's package manager"
    return 0
  fi
  if [ -n "$ok" ] && command -v systemctl >/dev/null 2>&1; then
    $root systemctl enable --now avahi-daemon >/dev/null 2>&1 || ok=""
  fi
  if [ -n "$ok" ] && avahi_running; then
    say "Installed and started avahi-daemon. The iPhone and Apple TV apps find highsea through it."
  else
    no_bonjour "installing or starting it didn't work"
  fi
}

# Said where it happens, and again with the address at the end, so it isn't lost in Docker's output.
no_bonjour() {
  bonjour_note="avahi isn't running on this machine ($1), so the iPhone and Apple TV apps won't find highsea by themselves. In the app, choose Add a server and type its address. The desktop app still finds it. To add avahi later: https://docs.highsea.tv/install/docker/"
  say "$bonjour_note"
}

# Another container called highsea, from another folder, would stop `up`. Something else on port
# 3000 would stop highsea's web server.
taken() {
  other="$($docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' highsea 2>/dev/null || true)"
  if $docker inspect highsea >/dev/null 2>&1 && [ "$other" != "$dir" ]; then
    fail "A container called highsea already exists${other:+, from $other}. Run this with --dir ${other:-<its folder>} to update it, or remove it first (docker rm -f highsea)."
  fi
  if command -v ss >/dev/null 2>&1 && ss -ltnH 'sport = :3000' 2>/dev/null | grep -q .; then
    fail "Something else is using port 3000. highsea needs it for its web page."
  fi
}

wait_healthy() {
  i=0
  while [ $i -lt 90 ]; do
    state="$($docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' highsea 2>/dev/null || true)"
    case "$state" in
      healthy) return 0 ;;
      exited | dead) fail "highsea stopped as it started. Its log: docker logs highsea" ;;
    esac
    sleep 2
    i=$((i + 2))
  done
  say "highsea is still starting. If the page doesn't open, its log says why: docker logs highsea"
}

# The address other machines reach this one on: the source address of the route out.
lan_address() {
  if command -v ip >/dev/null 2>&1; then
    ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -n 1
  elif command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | cut -d' ' -f1
  fi
}

# The repository's compose.yaml, with the data folder, the version and NVIDIA's runtime filled in
# (apps/docs/test/install.test.ts keeps the two in step).
compose_file() {
  cat <<EOF
# SPDX-License-Identifier: AGPL-3.0-only
# Written by highsea's installer (https://get.highsea.tv). Run the installer again to update; it
# keeps this file as it is, so your changes stay. The guide: https://docs.highsea.tv/install/script/
services:
  highsea:
    image: ghcr.io/highsea-tv/highsea:$2
    container_name: highsea
    # this machine's name, so setup offers it as the server's
    hostname: $(hostname -s 2>/dev/null || hostname)
    ports:
      - "3000:3000"
      - "6881:6881/tcp"
      - "6881:6881/udp"
      - "7368:7368/udp"
    # the built-in VPN's WireGuard interface and routes, in highsea's own network (ADR 0042)
    cap_add: [NET_ADMIN]
EOF
  [ -z "$3" ] || printf '    runtime: nvidia\n'
  cat <<EOF
    # highsea runs as whoever owns /data, and takes the time zone from your browser at setup.
    # To choose instead, or to give the address people use from outside:
    # environment:
    #   PUID: "1000"
    #   PGID: "1000"
    #   TZ: Europe/London
    #   HIGHSEA_PUBLIC_URL: https://highsea.example.net
    volumes:
      # the database, settings, logs and backups
      - ./config:/config
      # one folder for downloads and the library, on one disk, so imports can hardlink
      - $1:/data
      - /dev/dri:/dev/dri
      - /run/dbus:/run/dbus:ro
    # Intel and AMD graphics: the render nodes and nothing else (ADR 0056)
    device_cgroup_rules:
      - "c 226:128 rw"
      - "c 226:129 rw"
      - "c 226:130 rw"
      - "c 226:131 rw"
      - "c 226:132 rw"
      - "c 226:133 rw"
      - "c 226:134 rw"
      - "c 226:135 rw"
    restart: unless-stopped
EOF
}

main "$@"
