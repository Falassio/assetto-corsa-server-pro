FROM --platform=$TARGETPLATFORM debian:bookworm-slim

ARG TARGETARCH
ARG TARGETPLATFORM
ARG STEAM_APP_ID=244210

LABEL org.opencontainers.image.title="Assetto Corsa Server Pro"
LABEL org.opencontainers.image.description="Lightweight, multi-arch Assetto Corsa dedicated server image"
LABEL org.opencontainers.image.source="https://github.com/bytedminds/assetto-corsa-server-pro"

ENV DEBIAN_FRONTEND=noninteractive
ENV STEAM_APP_ID=${STEAM_APP_ID}
ENV STEAMCMD_DIR=/opt/steamcmd
ENV AC_INSTALL_DIR=/opt/ac-server
ENV AC_SERVER_BIN=acServer
ENV STEAMCMD_MAX_RETRIES=3
ENV STEAMCMD_RETRY_DELAY=5
ENV STEAM_VALIDATE=1
ENV SKIP_UPDATE=0
ENV HOME=/home/steam

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      curl \
      file \
      procps \
      tini \
      tar \
      xz-utils \
      libasound2 \
      libc6 \
      libcurl4 \
      libgcc-s1 \
      libstdc++6 \
      libncurses6 \
      libnss3; \
    if [[ "${TARGETARCH}" == "amd64" ]]; then \
      dpkg --add-architecture i386; \
      apt-get update; \
      apt-get install -y --no-install-recommends libc6-i386 lib32gcc-s1 lib32stdc++6; \
    fi; \
    if [[ "${TARGETARCH}" == "arm64" ]]; then \
      apt-get install -y --no-install-recommends build-essential cmake git python3; \
      git clone --depth=1 https://github.com/ptitSeb/box86 /tmp/box86; \
      cmake -S /tmp/box86 -B /tmp/box86/build -DCMAKE_BUILD_TYPE=RelWithDebInfo -DARM_DYNAREC=ON -DCMAKE_INSTALL_PREFIX=/usr; \
      cmake --build /tmp/box86/build -j"$(nproc)"; \
      cmake --install /tmp/box86/build; \
      rm -rf /tmp/box86; \
      apt-get purge -y --auto-remove build-essential cmake git python3; \
    fi; \
    rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    useradd --create-home --home-dir /home/steam --shell /bin/bash --uid 1000 steam; \
    mkdir -p "${STEAMCMD_DIR}" "${AC_INSTALL_DIR}" /cfg /content /logs; \
    chown -R steam:steam /home/steam "${STEAMCMD_DIR}" "${AC_INSTALL_DIR}" /cfg /content /logs

RUN set -eux; \
    curl -fsSL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" \
      | tar -xz -C "${STEAMCMD_DIR}"; \
    chown -R steam:steam "${STEAMCMD_DIR}"

COPY --chmod=755 entrypoint.sh /usr/local/bin/entrypoint.sh
COPY --chmod=755 healthcheck.sh /usr/local/bin/healthcheck.sh

USER steam
WORKDIR /home/steam

EXPOSE 9600/tcp
EXPOSE 9600/udp
EXPOSE 8081/tcp

VOLUME ["/cfg", "/content", "/logs"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=5 \
  CMD ["/usr/local/bin/healthcheck.sh"]

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
