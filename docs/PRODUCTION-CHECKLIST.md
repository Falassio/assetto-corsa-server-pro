# Production Checklist

Use this checklist for go-live and routine operations.

## 1) Before deployment

- Confirm host ports are open: `9600/tcp`, `9600/udp`, `8081/tcp`, panel port.
- Confirm persistent storage for `/cfg`, `/content`, `/logs`.
- Create `.env` from `.env.production.example`.
- Set strong values for:
  - `CONTROL_PANEL_PASSWORD`
  - `CONTROL_PANEL_SESSION_SECRET`
  - `WEB_ORIGIN`
- Validate config with:

```bash
bash scripts/preflight-env.sh .env
```

## 2) First deployment

- Start game server stack:

```bash
docker compose up -d --build
```

- Start control plane stack:

```bash
docker compose -f docker-compose.control-plane.yml up -d --build
```

- Verify health and logs:

```bash
docker compose ps
docker compose -f docker-compose.control-plane.yml ps
docker compose logs -f ac-server
docker compose -f docker-compose.control-plane.yml logs -f api web
```

## 3) Post-deploy validation

- Confirm server is reachable from external clients.
- Confirm control panel login works with configured credentials.
- Confirm action buttons work as expected for your `ACTION_MODE`.
- Restart containers once and verify data persists.

## 4) Security baseline

- Keep `AUTH_ENABLED=1`.
- Restrict `WEB_ORIGIN` to your panel domain.
- Keep least privilege defaults enabled in compose.
- Do not expose Docker socket publicly.
- Keep host OS and Docker runtime patched.

## 5) Update and rollback

- Deploy immutable image tags for releases.
- Keep the previous known-good tag available.
- Rollback path:
  1. switch image tag to previous stable version
  2. redeploy
  3. verify health and connectivity

## 6) Backups and retention

- Back up `/cfg`, `/content`, `/logs` at least daily.
- Keep one off-host copy.
- Test restore monthly.

## 7) Monitoring essentials

- Alert on unhealthy status.
- Alert on restart loops.
- Track disk usage growth for logs and content.
- Review audit log after config or action changes.
