# Release Guide

This document defines the release flow for Assetto Corsa Server Pro.

## Branching model

- `main` is always deployable.
- feature and fix work should be merged through Pull Requests.
- direct pushes to `main` should be avoided.

## Versioning

Versioning follows Semantic Versioning:

- `MAJOR`: breaking changes
- `MINOR`: backward-compatible features
- `PATCH`: backward-compatible fixes

Tag format:

- `vMAJOR.MINOR.PATCH` (example: `v1.1.0`)

## Release checklist

1. Ensure `main` is green in GitHub Actions.
2. Update `CHANGELOG.md`:
   - move relevant items from `Unreleased`
   - add a new version section with date
3. Validate configuration with:

```bash
bash scripts/preflight-env.sh .env
```

4. Create and push the git tag:

```bash
git checkout main
git pull --ff-only
git tag v1.0.0
git push origin main --tags
```

5. Verify GitHub Actions completed successfully:
   - shell lint passes
   - multi-arch image pushed to GHCR
6. Create GitHub Release notes from the new changelog section.

## Hotfix flow

1. Branch from `main` with `hotfix/<name>`.
2. Apply fix, open PR, merge after review.
3. Tag next patch version (`vX.Y.Z+1`).
4. Publish release notes.

## Rollback

If a release causes issues in production:

1. Switch deployment image tag to the previous stable tag.
2. Redeploy on Dokploy.
3. Confirm container health and connectivity.
4. Open a postmortem issue with root cause and corrective action.
