# Smoke Test

NaviRouter includes a small smoke-test script for validating a running router without printing credentials.

Minimum check:

```bash
npm run smoke
```

This verifies router health and diagnostics. To test AudioMuse-backed endpoints, provide Navidrome credentials and at least one processed song ID:

```bash
NAVIROUTER_SMOKE_USERNAME=<navidrome-user> \
NAVIROUTER_SMOKE_PASSWORD=<navidrome-password> \
NAVIROUTER_SMOKE_SEED_ID=<song-id> \
npm run smoke
```

To include `findSonicPath`, add an ending song ID:

```bash
NAVIROUTER_SMOKE_USERNAME=<navidrome-user> \
NAVIROUTER_SMOKE_PASSWORD=<navidrome-password> \
NAVIROUTER_SMOKE_SEED_ID=<song-id> \
NAVIROUTER_SMOKE_END_ID=<song-id> \
npm run smoke
```

Supported variables:

| Variable | Purpose |
| --- | --- |
| `NAVIROUTER_SMOKE_URL` | Router URL, defaults to `http://127.0.0.1:8098`. |
| `NAVIROUTER_SMOKE_USERNAME` | Navidrome/Subsonic username. Falls back to `NAVIDROME_USERNAME`. |
| `NAVIROUTER_SMOKE_PASSWORD` | Navidrome/Subsonic password. Falls back to `NAVIDROME_PASSWORD`. |
| `NAVIROUTER_SMOKE_TOKEN` | Subsonic token auth value. |
| `NAVIROUTER_SMOKE_SALT` | Subsonic token auth salt. |
| `NAVIROUTER_SMOKE_SEED_ID` | Seed song ID for similar-song checks. |
| `NAVIROUTER_SMOKE_END_ID` | End song ID for `findSonicPath`. |
| `NAVIROUTER_SMOKE_CLIENT` | Subsonic client name, defaults to `navirouter-smoke`. |

The script prints endpoint status, result counts, and first result names. It does not print passwords, tokens, or salts.

## Docker

The production image includes the smoke-test script, so you can run it from the container after setting the required environment variables:

```bash
docker exec \
  -e NAVIROUTER_SMOKE_USERNAME=<navidrome-user> \
  -e NAVIROUTER_SMOKE_PASSWORD=<navidrome-password> \
  -e NAVIROUTER_SMOKE_SEED_ID=<song-id> \
  navirouter npm run smoke
```

Inside the NaviRouter container, `NAVIROUTER_SMOKE_URL` defaults to `http://127.0.0.1:8098`, which checks the router running in that same container.
