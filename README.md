# Assetto Corsa Server Pro

[![Build](https://img.shields.io/github/actions/workflow/status/Falassio/assetto-corsa-server-pro/docker.yml?branch=main&label=build)](https://github.com/Falassio/assetto-corsa-server-pro/actions/workflows/docker.yml)
[![Docker Pulls](https://img.shields.io/docker/pulls/falassio/assetto-corsa-server-pro)](https://hub.docker.com/r/falassio/assetto-corsa-server-pro)
[![Architecture](https://img.shields.io/badge/arch-x86__64%20%7C%20arm64-blue)](https://github.com/Falassio/assetto-corsa-server-pro)
[![License](https://img.shields.io/github/license/Falassio/assetto-corsa-server-pro)](https://github.com/Falassio/assetto-corsa-server-pro/blob/main/LICENSE)
[![GHCR](https://img.shields.io/badge/registry-ghcr.io-blue)](https://ghcr.io/falassio/assetto-corsa-server-pro)

> The first Assetto Corsa Docker image with native-like ARM64 performance via Box86 integration.

Assetto Corsa Server Pro is a production-ready Docker stack for the official Assetto Corsa dedicated server. It is designed for repeatable deployments, lightweight runtime, and practical operations on both `amd64` and `arm64`.

## Why this image

- `debian:bookworm-slim` base for low image size
- `linux/amd64` and `linux/arm64` support
- ARM64 execution through Box86 for the original x86 server binary
- automatic SteamCMD update flow at startup (AppID `244210`)
- non-root runtime user (`steam`)
- persistent storage for `/cfg`, `/content`, `/logs`
- hardened compose defaults (`no-new-privileges`, dropped caps, healthcheck)
- optional web control panel with auth and RBAC

## Product roadmap delivered

- MVP data: online players, lap ingestion, base leaderboard
- Realtime: WebSocket live updates + public widget endpoint
- Competitive: seasonal ranking + player profiles
- Ops: alert webhook hook, backup verification, canary status endpoint

## Repository layout

- `Dockerfile`: game server image
- `entrypoint.sh`: update/install/start orchestration
- `docker-compose.yml`: game server stack
- `docker-compose.control-plane.yml`: control panel stack
- `apps/api`: control API (auth, actions, audit)
- `apps/web`: control panel UI
- `.env.example`: local baseline env
- `.env.production.example`: production baseline env
- `scripts/preflight-env.sh`: env validation
- `docs/PRODUCTION-CHECKLIST.md`: go-live runbook
- `DOCKERHUB.md`: Docker Hub listing copy

## Ports

- `9600/tcp` game port
- `9600/udp` game port
- `8081/tcp` HTTP/management port
- `3000/tcp` control panel (default, configurable)

## Quick start

1) Create local env:

```bash
cp .env.example .env
```

2) Validate env:

```bash
bash scripts/preflight-env.sh .env
```

3) Build and run game server:

```bash
docker compose up -d --build
```

4) Check status:

```bash
docker compose ps
docker compose logs -f ac-server
```

## Production rollout

1) Use production template:

```bash
cp .env.production.example .env
```

2) Set secure values in `.env`:

- `CONTROL_PANEL_PASSWORD`
- `CONTROL_PANEL_SESSION_SECRET`
- `WEB_ORIGIN`

3) Validate:

```bash
bash scripts/preflight-env.sh .env
```

4) Start game server:

```bash
docker compose up -d --build
```

5) Start control plane:

```bash
docker compose -f docker-compose.control-plane.yml up -d --build
```

6) Verify both stacks:

```bash
docker compose ps
docker compose -f docker-compose.control-plane.yml ps
docker compose logs -f ac-server
docker compose -f docker-compose.control-plane.yml logs -f api web
```

For a complete operational checklist, use `docs/PRODUCTION-CHECKLIST.md`.

## Control panel

The control panel includes:

- login and role-based permissions (`admin`, `operator`, `viewer`)
- live overview (status, uptime, host, cpu, memory)
- server actions (start, stop, restart, update, backup)
- config editor
- logs and audit trail
- online players table
- base leaderboard and seasonal ranking panels
- player profile lookup
- backup verification + canary status panel

Default URL:

```text
http://localhost:3000
```

Configure with `CONTROL_PANEL_PORT`.

### Auth model

Single-user mode:

- `CONTROL_PANEL_USERNAME`
- `CONTROL_PANEL_PASSWORD`
- `CONTROL_PANEL_ROLE`

Optional multi-user mode:

- `CONTROL_PANEL_USERS_JSON`

If `CONTROL_PANEL_USERS_JSON` is set, it overrides the single-user variables.

## Real action wiring

By default, control actions run in safe mock mode:

```env
ACTION_MODE=mock
```

To run real commands:

```env
ACTION_MODE=command
ACTION_START_CMD="docker start assetto-corsa-server"
ACTION_STOP_CMD="docker stop assetto-corsa-server"
ACTION_RESTART_CMD="docker restart assetto-corsa-server"
ACTION_UPDATE_CMD="docker exec assetto-corsa-server /usr/local/bin/entrypoint.sh"
ACTION_BACKUP_CMD="tar -czf /data/backup-$(date +%Y%m%d%H%M%S).tgz /cfg /content /logs"
```

The API stack mounts `/var/run/docker.sock` to support Docker CLI commands in command mode.

## Public endpoints and widget

Public API endpoints (no auth):

- `/public/online`
- `/public/leaderboard`
- `/public/ranking`

Widget script:

- `/widget/online.js?id=acsp-widget`

Example embed:

```html
<div id="acsp-widget"></div>
<script src="https://your-domain/widget/online.js?id=acsp-widget"></script>
```

## Telemetry and ranking APIs

Authenticated telemetry endpoints:

- `POST /api/telemetry/online`
- `POST /api/telemetry/lap`

Ranking endpoints:

- `GET /api/leaderboard/base`
- `GET /api/ranking/seasonal`
- `GET /api/profiles/:playerId`

Ops endpoints:

- `GET /api/backups`
- `POST /api/backups/verify`
- `GET /api/ops/canary`

## Dokploy test checklist

After deploy on Dokploy, run this minimum acceptance flow:

1. Login to control panel and verify overview updates.
2. Trigger `start`, `restart`, `backup` and confirm audit entries.
3. Push telemetry sample and verify tables update.
4. Check public endpoints from browser.
5. Verify WebSocket updates by opening two panel tabs.

Sample telemetry commands:

```bash
TOKEN="<your_jwt>"

curl -X POST "https://your-domain/api/telemetry/online" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"players":[{"playerId":"steam_1","name":"Falassio","car":"ks_ferrari_488_gt3","track":"monza"}]}'

curl -X POST "https://your-domain/api/telemetry/lap" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"playerId":"steam_1","playerName":"Falassio","track":"monza","car":"ks_ferrari_488_gt3","lapTimeMs":111234,"valid":true}'
```

## ARM64 SteamCMD behavior

On some ARM64 hosts, SteamCMD may complete work but still exit non-zero during bootstrap. This image handles that case with:

- `STEAMCMD_ALLOW_FAILURE_IF_INSTALLED=1`

When enabled, startup continues if the server binary is already present.

## CI/CD

Workflow: `.github/workflows/docker.yml`

- ShellCheck + env validation on CI
- multi-arch build for `amd64` and `arm64`
- image publish to GHCR and Docker Hub on `main` and `v*` tags

Docker Hub secrets required in GitHub:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

## Manual publish

GHCR:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/falassio/assetto-corsa-server-pro:latest \
  --push .
```

Docker Hub:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t falassio/assetto-corsa-server-pro:latest \
  --push .
```

## License and notice

Licensed under MIT (`LICENSE`).

This repository ships containerization and automation only. Assetto Corsa binaries and assets remain subject to their original licenses.
