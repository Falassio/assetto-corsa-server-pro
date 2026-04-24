# Assetto Corsa Server Pro

[![Build](https://img.shields.io/github/actions/workflow/status/Falassio/assetto-corsa-server-pro/docker.yml?branch=main&label=build)](https://github.com/Falassio/assetto-corsa-server-pro/actions/workflows/docker.yml)
[![Docker Pulls](https://img.shields.io/docker/pulls/falassio/assetto-corsa-server-pro)](https://hub.docker.com/r/falassio/assetto-corsa-server-pro)
[![Architecture](https://img.shields.io/badge/arch-x86__64%20%7C%20arm64-blue)](https://github.com/Falassio/assetto-corsa-server-pro)
[![License](https://img.shields.io/github/license/Falassio/assetto-corsa-server-pro)](https://github.com/Falassio/assetto-corsa-server-pro/blob/main/LICENSE)
[![GHCR](https://img.shields.io/badge/registry-ghcr.io-blue)](https://ghcr.io/falassio/assetto-corsa-server-pro)

> The first Assetto Corsa Docker Image with native-like performance on ARM64 via Box86 integration.

Assetto Corsa Server Pro is a production-ready container image for the official Assetto Corsa dedicated server.
It focuses on three things: reliability, low overhead, and fast deployment on platforms like Dokploy.

## Why this project exists

Most legacy Assetto Corsa images have the same pain points:

- no real ARM64 path
- large base layers and unnecessary packages
- fragile startup logic
- root runtime in production

This project fixes those issues with a modern, reproducible setup.

## What you get

- `debian:bookworm-slim` base image
- multi-architecture support (`linux/amd64`, `linux/arm64`)
- automatic SteamCMD install/update at startup (`AppID 244210`)
- retry logic for SteamCMD updates
- ARM64 support via Box86 for the original x86 server binary
- non-root runtime (`steam` user)
- persistent volumes for config, content, and logs
- built-in healthcheck and graceful shutdown
- hardened defaults (`no-new-privileges`, `cap_drop: ALL`)
- CI pipeline for shell lint + multi-arch image build/publish
- Dokploy-friendly `docker-compose.yml`

## Repository layout

- `Dockerfile`: multi-arch build with ARM64 Box86 integration
- `entrypoint.sh`: arch detection, SteamCMD update, persistent path linking, server startup
- `docker-compose.yml`: ready-to-run service with ports, volumes, and security settings
- `.env.example`: environment template
- `scripts/preflight-env.sh`: env validation before deployment
- `RELEASE.md`: release and hotfix flow
- `docs/PRODUCTION-CHECKLIST.md`: operational checklist for go-live
- `DOCKERHUB.md`: ready-to-paste Docker Hub listing content
- `apps/api`: control plane API
- `apps/web`: professional control panel UI
- `docker-compose.control-plane.yml`: control panel stack

## Ports

- `9600/tcp`
- `9600/udp`
- `8081/tcp`

## Persistent data

The following paths are persisted through Docker volumes:

- `/cfg`
- `/content`
- `/logs`

At startup, `entrypoint.sh` links `/opt/ac-server/{cfg,content,logs}` to those paths.

## Quick start

1. Create your env file:

```bash
cp .env.example .env
```

2. Validate configuration:

```bash
bash scripts/preflight-env.sh .env
```

3. Start the service:

```bash
docker compose up -d --build
```

4. Check status:

```bash
docker compose ps
docker compose logs -f ac-server
```

## Control panel (professional UI)

A full web control plane is included, with:

- real-time server overview (status, uptime, host, cpu, memory)
- lifecycle actions (start, stop, restart, update, backup)
- JSON config editor with save flow
- live logs view and audit trail
- login authentication with role-based access
- env-driven credentials for single-tenant deployments
- API rate limiting and secure headers
- responsive layout for desktop and mobile

Run it with:

```bash
docker compose -f docker-compose.control-plane.yml up -d --build
```

Then open:

```text
http://localhost:3000
```

Change panel port with `CONTROL_PANEL_PORT` in `.env`.

Default login is configured with:

- `CONTROL_PANEL_USERNAME`
- `CONTROL_PANEL_PASSWORD`

Change both before exposing the panel.

Optional multi-user mode is available with `CONTROL_PANEL_USERS_JSON`.

## Real action wiring

By default the panel runs in `ACTION_MODE=mock`.

To execute real actions on your own runtime, set:

```env
ACTION_MODE=command
```

And define commands in `.env`:

```env
ACTION_START_CMD=docker start assetto-corsa-server
ACTION_STOP_CMD=docker stop assetto-corsa-server
ACTION_RESTART_CMD=docker restart assetto-corsa-server
ACTION_UPDATE_CMD=docker exec assetto-corsa-server /usr/local/bin/entrypoint.sh
ACTION_BACKUP_CMD=tar -czf /data/backup-$(date +%Y%m%d%H%M%S).tgz /cfg /content /logs
```

Command mode runs shell commands from the API container context. Adjust commands to your environment.
The control API compose stack mounts `/var/run/docker.sock` to allow Docker CLI commands.

## Dokploy deployment

1. Create a new Docker Compose app in Dokploy.
2. Point it to this repository.
3. Use `docker-compose.yml` as compose file.
4. Set env values from `.env.example`.
5. Deploy and wait for first SteamCMD sync.

## Build and publish (manual)

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/falassio/assetto-corsa-server-pro:latest \
  --push .
```

For Docker Hub:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t falassio/assetto-corsa-server-pro:latest \
  --push .
```

## CI/CD

Workflow: `.github/workflows/docker.yml`

- runs ShellCheck on scripts
- validates `.env.example`
- builds `linux/amd64` and `linux/arm64` images on PRs
- pushes images to GHCR and Docker Hub on `main` and version tags (`v*`)

Required repository secrets for Docker Hub publishing:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

Create token: Docker Hub -> Account Settings -> Personal access tokens.

## Release process

- Versioning follows SemVer (`vMAJOR.MINOR.PATCH`)
- tagging a version (example `v1.0.0`) triggers multi-arch publish
- release notes are tracked in `CHANGELOG.md`
- full release procedure is in `RELEASE.md`

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Production defaults

- healthcheck based on live server process detection
- log rotation (`10m`, 3 files)
- `no-new-privileges` + `cap_drop: ALL`
- retry and delay controls for SteamCMD

Operational checklist: `docs/PRODUCTION-CHECKLIST.md`.

## Environment variables

- `IMAGE_NAME` (default: `ghcr.io/falassio/assetto-corsa-server-pro:latest`)
- `CONTAINER_NAME` (default: `assetto-corsa-server`)
- `STEAM_APP_ID` (default: `244210`)
- `AC_INSTALL_DIR` (default: `/opt/ac-server`)
- `AC_SERVER_BIN` (default: `acServer`)
- `AC_SERVER_ARGS` (default: empty)
- `AC_TCP_PORT` (default: `9600`)
- `AC_UDP_PORT` (default: `9600`)
- `HTTP_PORT` (default: `8081`)
- `CONTROL_PANEL_PORT` (default: `3000`)
- `AUTH_ENABLED` (`1`/`0`, default: `1`)
- `CONTROL_PANEL_USERNAME` (default: `admin`)
- `CONTROL_PANEL_PASSWORD` (default: `change-me-now`)
- `CONTROL_PANEL_ROLE` (`admin`/`operator`/`viewer`, default: `admin`)
- `CONTROL_PANEL_SESSION_SECRET` (set a long random value)
- `CONTROL_PANEL_TOKEN_TTL_SEC` (default: `43200`)
- `CONTROL_PANEL_RATE_LIMIT_RPM` (default: `120`)
- `WEB_ORIGIN` (default: `*`, lock down in production)
- `ALLOW_CONFIG_WRITE` (`1`/`0`, default: `1`)
- `ACTION_MODE` (`mock`/`command`, default: `mock`)
- `ACTION_TIMEOUT_MS` (default: `20000`)
- `ACTION_START_CMD` / `ACTION_STOP_CMD` / `ACTION_RESTART_CMD`
- `ACTION_UPDATE_CMD` / `ACTION_BACKUP_CMD`
- `STEAMCMD_MAX_RETRIES` (default: `3`)
- `STEAMCMD_RETRY_DELAY` (default: `5`)
- `STEAM_VALIDATE` (`1`/`0`, default: `1`)
- `SKIP_UPDATE` (`1`/`0`, default: `0`)
- `TZ` (example: `Europe/Rome`)

## Notes

- first boot may take several minutes due to SteamCMD download
- next restarts apply incremental updates
- ARM64 runtime automatically switches to Box86
- if `docker` is not found locally, install Docker Desktop or use CI publishing

## Disclaimer

This repository provides containerization and automation only.
Assetto Corsa Dedicated Server binaries and assets remain subject to their original licenses.
