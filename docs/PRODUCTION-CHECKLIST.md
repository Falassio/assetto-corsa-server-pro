# Production Checklist

Use this checklist before and after go-live on Dokploy.

## 1) Pre-deploy

- Confirm DNS, firewall, and host port availability (`9600/tcp`, `9600/udp`, `8081/tcp`).
- Confirm storage class/volume mapping for persistent data (`/cfg`, `/content`, `/logs`).
- Copy `.env.example` to `.env` and review all values.
- Decide update policy:
  - `SKIP_UPDATE=0` for automatic updates on restart
  - `SKIP_UPDATE=1` for pinned runtime windows
- Keep `STEAM_VALIDATE=1` on first install; optionally set `0` later for faster restarts.

## 2) First deploy

- Deploy using `docker-compose.yml` in Dokploy.
- Wait for first SteamCMD sync (can take several minutes).
- Check service health status and container logs.
- Verify game visibility/reachability from external clients.

## 3) Post-deploy validation

- Ensure healthcheck remains `healthy` for at least 15 minutes.
- Confirm files persist after a container restart:
  - config in `/cfg`
  - content in `/content`
  - logs in `/logs`
- Confirm restart behavior (graceful stop within configured grace period).

## 4) Backup strategy

- Back up volume data at least daily (`/cfg`, `/content`, `/logs`).
- Keep at least one off-host backup copy.
- Test restoration monthly in a staging environment.

## 5) Update and rollback strategy

- Update by deploying a new immutable image tag.
- Keep the previous known-good tag available for rollback.
- Rollback plan:
  1. Switch to previous image tag
  2. Redeploy
  3. Verify health and connectivity

## 6) Monitoring and operations

- Alert on container unhealthy state.
- Alert on restart loops.
- Track disk growth for `/logs` and content volume.
- Review logs after every deploy and after each restart event.

## 7) Security baseline

- Keep compose hardening enabled (`no-new-privileges`, dropped capabilities).
- Do not run the service as root.
- Restrict inbound access to only required ports.
- Keep host OS and Docker runtime updated.
