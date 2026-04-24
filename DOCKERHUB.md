# Docker Hub Listing Pack

Use this content for the Docker Hub repository page.

## Short description

Production-ready Assetto Corsa dedicated server image with `amd64` + `arm64` support and Box86 integration.

## Full description

Assetto Corsa Server Pro provides a practical, production-focused Docker setup for the official Assetto Corsa dedicated server.

Key points:

- lightweight base image (`debian:bookworm-slim`)
- multi-arch support (`linux/amd64`, `linux/arm64`)
- ARM64 support through Box86 for the original x86 server binary
- automatic SteamCMD update/install at startup (`AppID 244210`)
- non-root runtime user (`steam`)
- persistent data paths for `/cfg`, `/content`, `/logs`
- optional web control panel with auth and RBAC
- ready for Dokploy and CI-based image publishing

Project links:

- GitHub: https://github.com/Falassio/assetto-corsa-server-pro
- GHCR: https://ghcr.io/falassio/assetto-corsa-server-pro

## Recommended categories

Primary:

- `Networking`

Optional:

- `Developer tools`
- `Integration & delivery`

## Suggested tags

- `assetto-corsa`
- `assetto-corsa-server`
- `game-server`
- `steamcmd`
- `box86`
- `amd64`
- `arm64`
- `multi-arch`
- `dokploy`
