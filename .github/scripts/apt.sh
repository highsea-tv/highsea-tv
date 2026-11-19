#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# apt on GitHub's Ubuntu runners, so a slow or stalled mirror costs minutes, not the job: every
# workflow's apt steps go through here (next-branch.md › Progress, 2026-11-19).
#
#   bash .github/scripts/apt.sh update
#   bash .github/scripts/apt.sh install <package>…
#
# Why it's needed. The image's own apt settings bound a *stalled* connection: retries and a 15 s
# timeout, kept low so apt falls through to the next mirror in /etc/apt/apt-mirrors.txt quickly
# (images/ubuntu/scripts/build/configure-apt.sh in actions/runner-images, which writes them in
# /etc/apt/apt.conf.d/zz-retries so they win). So this adds no Acquire::Retries or
# Acquire::http::Timeout of its own: more retries on one URI would only delay that fallback
# (apt.conf(5), apt-transport-mirror(1)). What those settings can't catch is a *slow* transfer:
# azure.archive.ubuntu.com, the list's first mirror, has sent packages at about 40 kB/s, which
# never trips a timeout, and a step that takes 20 s took 20 to 29 minutes (ci.yml's note on the
# tests' apt steps, 2026-11-06; the 0.4.2 release's playback job, 2026-11-17; the 0.4.7
# release's Linux desktop job, 28 minutes, 2026-11-19). Hence:
#
#   1. When Azure's name doesn't resolve, its line comes off the mirror list first, since each file
#      would otherwise wait about 20 s on DNS before falling back (ci.yml's note, 2026-11-11).
#   2. Each network part runs under `timeout` (coreutils), APT_ATTEMPT_SECONDS a try (default 180;
#      `update` 60), up to APT_ATTEMPTS tries (default 3). After a try that failed or ran out of
#      time, Azure's line comes off the list, so the next try goes to archive.ubuntu.com.
#   3. `install` first downloads with `--download-only`, which is safe to stop at any point (no
#      package is unpacked; apt-get(8)), and only then installs from what it downloaded, with no
#      timeout of its own: the step's `timeout-minutes` bounds it.
#
# APT_ARCHIVES, when set, is the folder the .debs are downloaded to and installed from
# (Dir::Cache::Archives, apt.conf(5)), for the jobs that keep them in the Actions cache.
# On arm64 runners the sources are ports.ubuntu.com, with no mirror list; the tries still apply.
set -euo pipefail

mirrors=/etc/apt/apt-mirrors.txt
attempts="${APT_ATTEMPTS:-3}"

drop_azure() {
  if [ -f "$mirrors" ] && grep -q 'azure\.archive\.ubuntu\.com' "$mirrors"; then
    echo "::warning::$1; apt now uses the image's other mirrors"
    sudo sed -i '/azure\.archive\.ubuntu\.com/d' "$mirrors"
  fi
}

if [ -f "$mirrors" ] && ! timeout 10 getent hosts azure.archive.ubuntu.com > /dev/null; then
  drop_azure "azure.archive.ubuntu.com doesn't resolve"
fi

# try <seconds> <apt-get arguments…>
try() {
  local seconds="$1"
  shift
  for i in $(seq 1 "$attempts"); do
    if sudo timeout --kill-after=15 "$seconds" apt-get "$@"; then
      return 0
    fi
    echo "apt-get $1: try $i of $attempts failed or took over $seconds s"
    drop_azure "apt-get $1 was slow or failed on try $i"
  done
  echo "apt-get $1 failed $attempts times" >&2
  return 1
}

archives=()
if [ -n "${APT_ARCHIVES:-}" ]; then
  mkdir -p "$APT_ARCHIVES/partial"
  archives=(-o "Dir::Cache::Archives=$APT_ARCHIVES")
fi

case "${1:-}" in
  update)
    try "${APT_ATTEMPT_SECONDS:-60}" update
    ;;
  install)
    shift
    [ "$#" -gt 0 ] || { echo "apt.sh install: no packages" >&2; exit 2; }
    try "${APT_ATTEMPT_SECONDS:-180}" install -y --no-install-recommends --download-only "${archives[@]}" "$@"
    sudo apt-get install -y --no-install-recommends "${archives[@]}" "$@"
    ;;
  *)
    echo "usage: apt.sh update | apt.sh install <package>…" >&2
    exit 2
    ;;
esac
