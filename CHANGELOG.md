# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and the project follows Semantic Versioning.

## [Unreleased]

### Added
- Reserved for upcoming changes.

## [1.0.0] - 2026-04-24

### Added
- Initial production-ready Docker stack for Assetto Corsa Dedicated Server.
- `debian:bookworm-slim` base with non-root runtime user (`steam`).
- Multi-arch support for `linux/amd64` and `linux/arm64`.
- ARM64 compatibility through Box86 integration for x86 server binaries.
- Automatic SteamCMD bootstrap and update flow (`AppID 244210`).
- Persistent volume mapping for `/cfg`, `/content`, and `/logs`.
- Runtime healthcheck script and Docker healthcheck wiring.
- Compose hardening (`no-new-privileges`, `cap_drop: ALL`, `tmpfs`, log rotation).
- CI pipeline for shell linting and multi-arch image build/publish to GHCR.
- English documentation, `.env.example`, and production deployment guidance.
