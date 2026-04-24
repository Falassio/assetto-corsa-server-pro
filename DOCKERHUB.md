# Docker Hub Listing

Use this content when configuring the Docker Hub repository page.

## Short description

Production-ready Assetto Corsa dedicated server image with amd64 + arm64 support and Box86 acceleration.

## Full description

Assetto Corsa Server Pro is a production-ready Docker image for hosting the official Assetto Corsa dedicated server.

Highlights:

- Lightweight base image (`debian:bookworm-slim`)
- Multi-arch support (`linux/amd64`, `linux/arm64`)
- ARM64 compatibility via Box86 for the original x86 binary
- Automatic SteamCMD install/update on startup (AppID `244210`)
- Non-root runtime (`steam` user)
- Persistent data volumes for `/cfg`, `/content`, and `/logs`
- Hardened runtime defaults and built-in healthcheck
- Ready for Dokploy and GitHub Actions CI/CD

Source and docs:

- GitHub: https://github.com/Falassio/assetto-corsa-server-pro
- GHCR: https://ghcr.io/falassio/assetto-corsa-server-pro

## Recommended category

- `Networking`

Optional additional categories:

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
