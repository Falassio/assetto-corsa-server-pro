# Assetto Corsa Server Pro

[![Build](https://img.shields.io/github/actions/workflow/status/bytedminds/assetto-corsa-server-pro/docker.yml?branch=main&label=build)](https://github.com/bytedminds/assetto-corsa-server-pro/actions/workflows/docker.yml)
[![GHCR](https://img.shields.io/badge/registry-ghcr.io-blue)](https://ghcr.io/bytedminds/assetto-corsa-server-pro)
[![Platforms](https://img.shields.io/badge/platforms-amd64%20%7C%20arm64-green)](https://github.com/bytedminds/assetto-corsa-server-pro)

> The first Assetto Corsa Docker Image with native-like performance on ARM64 via Box86 integration.

Assetto Corsa Server Pro is a production-ready Docker setup for the official dedicated server.
It is built for reliability, low overhead, and easy deployment on modern hosting platforms like Dokploy.

## Why this image exists

Most older Assetto Corsa Docker images share the same issues:

- no serious ARM64 support
- oversized base images and unnecessary packages
- fragile bootstrap scripts
- server process running as root

This project fixes those points with a cleaner architecture and predictable startup behavior.

## Highlights

- `debian:bookworm-slim` base image
- multi-architecture support (`linux/amd64`, `linux/arm64`)
- automatic SteamCMD install/update on container startup (`AppID 244210`)
- retry logic for SteamCMD updates (network-safe startup)
- ARM64 runtime through Box86 for the original x86 server binary
- non-root runtime user (`steam`)
- persistent volumes for config, content, and logs
- built-in healthcheck and graceful shutdown window
- hardened runtime (`no-new-privileges`, dropped Linux capabilities)
- GitHub Actions pipeline for shell lint + multi-arch Docker build/publish
- Dokploy-friendly `docker-compose.yml`

## Project layout

- `Dockerfile` - minimal multi-arch image build with ARM64 Box86 integration
- `entrypoint.sh` - architecture detection, SteamCMD update, persistent directory linking, server start
- `docker-compose.yml` - ready-to-run service definition with named volumes and required ports
- `.env.example` - environment template with documented defaults
- `scripts/preflight-env.sh` - environment validation before deploy
- `RELEASE.md` - practical release and hotfix process

## Exposed ports

- `9600/tcp`
- `9600/udp`
- `8081/tcp`

## Persistent data

The container persists data in:

- `/cfg`
- `/content`
- `/logs`

At startup, `entrypoint.sh` links `/opt/ac-server/{cfg,content,logs}` to those persistent paths.

## Quick start

1. Copy the environment template:

```bash
cp .env.example .env
```

2. Start the stack:

```bash
bash scripts/preflight-env.sh .env
```

3. Start the stack:

```bash
docker compose up -d --build
```

## Dokploy deployment

1. Create a new Docker Compose app in Dokploy.
2. Point it to this repository.
3. Use `docker-compose.yml` as compose file.
4. Configure domain/network as needed and deploy.

## Optional: build and publish multi-arch image

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/bytedminds/assetto-corsa-server-pro:latest \
  --push .
```

## CI/CD

The repository ships with `.github/workflows/docker.yml`:

- runs ShellCheck on scripts
- builds `linux/amd64` and `linux/arm64` images on PRs
- pushes to GHCR on `main` and on version tags (`v*`)

## Release process

- Versioning follows SemVer (`vMAJOR.MINOR.PATCH`)
- Tagging a version (example `v1.0.0`) triggers a multi-arch image publish
- Detailed release notes live in `CHANGELOG.md`
- Full release runbook: `RELEASE.md`

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Production runbook

For go-live and operations checklist, see `docs/PRODUCTION-CHECKLIST.md`.

## Notes

- First boot can take a few minutes because SteamCMD downloads the server files.
- Subsequent boots apply incremental updates.
- On ARM64, the startup script automatically switches to Box86.

## Production defaults included

- healthcheck based on live server process detection
- log rotation (`10m`, 3 files)
- `no-new-privileges` + `cap_drop: ALL`
- retry and delay controls for SteamCMD

## Environment variables

- `STEAM_APP_ID` (default: `244210`)
- `AC_INSTALL_DIR` (default: `/opt/ac-server`)
- `AC_SERVER_BIN` (default: `acServer`)
- `AC_SERVER_ARGS` (default: empty)
- `STEAMCMD_MAX_RETRIES` (default: `3`)
- `STEAMCMD_RETRY_DELAY` (default: `5`)
- `STEAM_VALIDATE` (`1`/`0`, default: `1`)
- `SKIP_UPDATE` (`1`/`0`, default: `0`)
- `TZ` (example: `Europe/Rome`)

## Disclaimer

This repository provides containerization and automation only.
Assetto Corsa Dedicated Server binaries and assets remain subject to their original licenses.
