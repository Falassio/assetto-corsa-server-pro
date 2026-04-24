FROM debian:bookworm-slim

ARG TARGETARCH
ARG STEAM_APP_ID=244210

LABEL org.opencontainers.image.title="Assetto Corsa Server Pro"
LABEL org.opencontainers.image.description="Lightweight, multi-arch Assetto Corsa dedicated server image"
LABEL org.opencontainers.image.source="https://github.com/Falassio/assetto-corsa-server-pro"

ENV DEBIAN_FRONTEND=noninteractive
ENV STEAM_APP_ID=${STEAM_APP_ID}
ENV STEAMCMD_DIR=/opt/steamcmd
ENV AC_INSTALL_DIR=/opt/ac-server
ENV AC_SERVER_BIN=acServer
ENV STEAMCMD_MAX_RETRIES=3
ENV STEAMCMD_RETRY_DELAY=5
ENV STEAM_VALIDATE=1
ENV SKIP_UPDATE=0
ENV STEAMCMD_ALLOW_FAILURE_IF_INSTALLED=1
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8
ENV HOME=/home/steam

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      curl \
      file \
      locales \
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
    sed -i 's/^# *en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen; \
    locale-gen; \
    if [[ "${TARGETARCH}" == "amd64" ]]; then \
      dpkg --add-architecture i386; \
      apt-get update; \
      apt-get install -y --no-install-recommends libc6-i386 lib32gcc-s1 lib32stdc++6; \
    fi; \
    if [[ "${TARGETARCH}" == "arm64" ]]; then \
      dpkg --add-architecture armhf; \
      apt-get update; \
      apt-get install -y --no-install-recommends \
        build-essential \
        cmake \
        git \
        python3 \
        gcc-arm-linux-gnueabihf \
        g++-arm-linux-gnueabihf \
        libc6-dev-armhf-cross \
        libc6:armhf \
        libstdc++6:armhf \
        libgcc-s1:armhf \
        zlib1g:armhf \
        libncurses6:armhf \
        libcurl4:armhf; \
      git clone --depth=1 https://github.com/ptitSeb/box86 /tmp/box86; \
      CC=arm-linux-gnueabihf-gcc CXX=arm-linux-gnueabihf-g++ \
        cmake -S /tmp/box86 -B /tmp/box86/build \
        -DCMAKE_BUILD_TYPE=RelWithDebInfo \
        -DARM64=1 \
        -DCMAKE_INSTALL_PREFIX=/usr; \
      cmake --build /tmp/box86/build -j"$(nproc)"; \
      cmake --install /tmp/box86/build; \
      rm -rf /tmp/box86; \
      apt-get purge -y --auto-remove \
        build-essential \
        cmake \
        git \
        python3 \
        gcc-arm-linux-gnueabihf \
        g++-arm-linux-gnueabihf \
        libc6-dev-armhf-cross; \
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
