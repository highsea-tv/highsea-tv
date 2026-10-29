# SPDX-License-Identifier: AGPL-3.0-only
# The highsea server: one Node process (ADR 0003) with ffmpeg, under tini, as PUID:PGID.
# 6881 is the torrent engine's port, TCP and the DHT (ADR 0037). Checkpoint 6b adds unar, wireguard-tools,
# iproute2 and wireguard-go, and keeps CAP_NET_ADMIN for the PUID user when the container has it (ADR 0042).
# Checkpoint 9a slims it (phase-3-checkpoint-9.md › Docker), from Docker's multi-stage builds
# (https://docs.docker.com/build/building/multi-stage/):
#   manifests   the workspace's package.json files and bun.lock, and nothing else
#   build       the whole workspace installed, and the admin and the web app (`/web`) built
#   production  only what `node server.ts` loads (scripts/image.ts): production dependencies, the
#               server's workspace packages as source without their tests, Next's build, and
#               the web app's static files
#   runtime     the slim image, from `production` alone
# CI builds it natively for linux/amd64 and linux/arm64 (.github/workflows/ci.yml).

# ---- manifests: what `bun install` reads, so the install is its own layer and a commit that leaves
# the dependencies alone reuses it from the cache: dependencies before sources, as Docker's
# "Order your layers" advises (https://docs.docker.com/build/cache/optimize/#order-your-layers).
# Copying a stage's files is cached by their contents, so this stage's output only changes with them
FROM node:26.11.1-trixie-slim AS manifests
WORKDIR /app
COPY . .
RUN find . -type f ! -name package.json ! -name bun.lock -delete

# ---- build: Bun installs and builds; Node 26.11.1 (.nvmrc) is here too, so native modules (better-sqlite3)
# are built for the Node that runs them
FROM node:26.11.1-trixie-slim AS build
COPY --from=oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=manifests /app .
# behind a TLS-inspecting proxy, pass its CA: `docker build --secret id=ca,src=/path/ca.crt .`
# (a secret, so it never lands in a layer)
RUN --mount=type=secret,id=ca,required=false \
  if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi \
  && bun install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/server && bun run build
RUN cd apps/web && bun run build

# ---- production: a clean install of the server's production dependencies, checked, plus the
# sources it runs (scripts/image.ts says what goes in and what stays out)
FROM build AS production
RUN --mount=type=secret,id=ca,required=false \
  if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi \
  && bun scripts/image.ts production /app /production

# ---- e2e-fixtures: the end-to-end run's other side (scripts/e2e/fixtures.ts), never published:
# the whole workspace with ffmpeg, for the clip it seeds
FROM build AS e2e-fixtures
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
CMD ["bun", "scripts/e2e/fixtures.ts"]

# ---- runtime
FROM node:26.11.1-trixie-slim AS runtime
# unar (LGPL-2.1, Debian main) extracts archived releases (ADR 0039 › 6b); never unrar (non-free)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg unar tini gosu ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# highsea connects (ADR 0042): `ip` (iproute2) and `wg` (wireguard-tools) run as separate programs,
# and wireguard-go stands in where the kernel has no WireGuard. setpriv (util-linux, already in the
# image) keeps CAP_NET_ADMIN for the PUID user. Their sources: docker/NOTICE.
# avahi-publish (avahi-utils) publishes highsea through the host's avahi when the container is
# given /run/dbus (ADR 0020's 2026-10-28 section)
RUN apt-get update \
  && apt-get install -y --no-install-recommends wireguard-tools iproute2 wireguard-go avahi-utils \
  && rm -rf /var/lib/apt/lists/*
# Hardware acceleration (ADR 0056), on amd64 only, where Intel and AMD graphics are: Intel's media
# driver for VAAPI, oneVPL's runtime and dispatcher for Quick Sync (libmfx-gen1.2, libvpl2), Mesa's
# VAAPI driver for AMD, and Mesa's Vulkan drivers so libplacebo tone maps on AMD and Intel GPUs. The
# driver is the non-free build (intel-media-va-driver-non-free, Debian's non-free component, added
# for it alone): its GPU kernels come from Intel as binaries, and it's the one that encodes on chips
# before Ice Lake, such as the J4125, without the HuC firmware loaded on the host
# (https://github.com/intel/media-driver#build-types). NVIDIA's libraries come from the host,
# through NVIDIA's container toolkit. Their sources: docker/NOTICE.
ARG TARGETARCH
RUN if [ "$TARGETARCH" = amd64 ]; then \
    sed -i 's/^Components: main$/Components: main non-free/' /etc/apt/sources.list.d/debian.sources \
    && grep -q '^Components: main non-free$' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends intel-media-va-driver-non-free libmfx-gen1.2 \
      libvpl2 mesa-va-drivers mesa-vulkan-drivers \
    && rm -rf /var/lib/apt/lists/*; \
  fi
WORKDIR /app
COPY --from=production /production /app
COPY docker/entrypoint.sh /usr/local/bin/highsea-entrypoint
COPY docker/NOTICE /usr/share/doc/highsea/NOTICE
# highsea's OpenSubtitles.com key: release builds pass it as a build secret
# (`--secret id=opensubtitles,env=HIGHSEA_OPENSUBTITLES_KEY`) and it's kept in the image, never in
# the repository. Without it, OpenSubtitles.com shows as unavailable.
RUN --mount=type=secret,id=opensubtitles,required=false \
  if [ -s /run/secrets/opensubtitles ]; then \
    install -D -m 0444 /run/secrets/opensubtitles /usr/share/highsea/opensubtitles.key; \
  fi
# highsea's Trakt application, the same way (`--secret id=trakt_id,env=HIGHSEA_TRAKT_CLIENT_ID`,
# `--secret id=trakt_secret,env=HIGHSEA_TRAKT_CLIENT_SECRET`, optional). Without the Client ID, Trakt
# lists are off.
RUN --mount=type=secret,id=trakt_id,required=false \
  --mount=type=secret,id=trakt_secret,required=false \
  if [ -s /run/secrets/trakt_id ]; then \
    install -D -m 0444 /run/secrets/trakt_id /usr/share/highsea/trakt-client-id; \
  fi; \
  if [ -s /run/secrets/trakt_secret ]; then \
    install -D -m 0444 /run/secrets/trakt_secret /usr/share/highsea/trakt-client-secret; \
  fi
# highsea's TMDB key, the API Read Access Token, the same way (`--secret id=tmdb,env=HIGHSEA_TMDB_READ_TOKEN`;
# install-simplicity.md, answer 7). An owner's own key in Settings › General wins. Without either,
# System › Health says so.
RUN --mount=type=secret,id=tmdb,required=false \
  if [ -s /run/secrets/tmdb ]; then \
    install -D -m 0444 /run/secrets/tmdb /usr/share/highsea/tmdb-read-token; \
  fi
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  HIGHSEA_CONFIG_DIR=/config \
  HIGHSEA_DATA_DIR=/data \
  HIGHSEA_OPENSUBTITLES_KEY_FILE=/usr/share/highsea/opensubtitles.key \
  HIGHSEA_TRAKT_CLIENT_ID_FILE=/usr/share/highsea/trakt-client-id \
  HIGHSEA_TRAKT_CLIENT_SECRET_FILE=/usr/share/highsea/trakt-client-secret \
  HIGHSEA_TMDB_READ_TOKEN_FILE=/usr/share/highsea/tmdb-read-token \
  PORT=3000 \
  NVIDIA_VISIBLE_DEVICES=all \
  NVIDIA_DRIVER_CAPABILITIES=compute,video,utility
VOLUME ["/config", "/data"]
EXPOSE 3000 6881/tcp 6881/udp 7368/udp
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# The OCI annotations GitHub's package page reads: source (which links the package to its
# repository), description (up to 512 characters) and licenses (an SPDX expression)
# (https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#labelling-container-images,
# https://github.com/opencontainers/image-spec/blob/main/annotations.md). CI's docker/metadata-action
# also sets version, revision and created, and the same keys as annotations on the manifest and
# the index, where GitHub reads a multi-arch image's description.
ARG VERSION=dev
LABEL org.opencontainers.image.title="highsea" \
  org.opencontainers.image.description="highsea finds, downloads and organises your films, with their subtitles, and serves them to your own apps. One self-hosted server in place of Radarr, Prowlarr, qBittorrent and Bazarr." \
  org.opencontainers.image.source="https://github.com/highsea-tv/highsea-tv" \
  org.opencontainers.image.documentation="https://docs.highsea.tv" \
  org.opencontainers.image.licenses="AGPL-3.0-only" \
  org.opencontainers.image.vendor="highsea" \
  org.opencontainers.image.version="${VERSION}"
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/highsea-entrypoint"]
CMD ["node", "server.ts"]
