# SPDX-License-Identifier: AGPL-3.0-only
# The highsea server: one Node process (ADR 0003) with ffmpeg, under tini, as PUID:PGID.
# 6881 is the torrent engine's port, TCP and the DHT (ADR 0037). Checkpoint 6b adds unar, wireguard-tools,
# iproute2 and wireguard-go, and keeps CAP_NET_ADMIN for the PUID user when the container has it (ADR 0042).
# Checkpoint 1 keeps it simple: the whole workspace and its dependencies. Checkpoint 9 slims it
# and builds it for amd64 and arm64.

# ---- build: Bun installs and builds; Node 24.21.0 (.nvmrc) is here too, so native modules (better-sqlite3)
# are built for the Node that runs them
FROM node:24.21.0-bookworm-slim AS build
COPY --from=oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
# behind a TLS-inspecting proxy, pass its CA: `docker build --secret id=ca,src=/path/ca.crt .`
# (a secret, so it never lands in a layer)
RUN --mount=type=secret,id=ca,required=false \
  if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi \
  && bun install --frozen-lockfile
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/server && bun run build

# ---- runtime
FROM node:24.21.0-bookworm-slim
# unar (LGPL-2.1, Debian main) extracts archived releases (ADR 0039 › 6b); never unrar (non-free)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg unar tini gosu ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# highsea connects (ADR 0042): `ip` (iproute2) and `wg` (wireguard-tools) run as separate programs,
# and wireguard-go stands in where the kernel has no WireGuard. setpriv (util-linux, already in the
# image) keeps CAP_NET_ADMIN for the PUID user. Their sources: docker/NOTICE.
RUN apt-get update \
  && apt-get install -y --no-install-recommends wireguard-tools iproute2 wireguard-go \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app /app
COPY docker/entrypoint.sh /usr/local/bin/highsea-entrypoint
COPY docker/NOTICE /usr/share/doc/highsea/NOTICE
# highsea's OpenSubtitles.com key: release builds pass it as a build secret
# (`--secret id=opensubtitles,env=HIGHSEA_OPENSUBTITLES_KEY`) and it's kept in the image, never in
# the repository. Without it, OpenSubtitles.com shows as unavailable.
RUN --mount=type=secret,id=opensubtitles,required=false \
  if [ -s /run/secrets/opensubtitles ]; then \
    install -D -m 0444 /run/secrets/opensubtitles /usr/share/highsea/opensubtitles.key; \
  fi
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  HIGHSEA_CONFIG_DIR=/config \
  HIGHSEA_DATA_DIR=/data \
  HIGHSEA_OPENSUBTITLES_KEY_FILE=/usr/share/highsea/opensubtitles.key \
  PORT=3000 \
  PUID=1000 \
  PGID=1000
VOLUME ["/config", "/data"]
EXPOSE 3000 6881/tcp 6881/udp 7368/udp
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/highsea-entrypoint"]
CMD ["node", "server.ts"]
