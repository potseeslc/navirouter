# Release Checklist

Use this before tagging or sharing a NaviRouter MVP build.

## Code Checks

```bash
npm test
docker compose -f deploy/docker-compose.yml config
docker build -t navirouter:local .
```

## Runtime Checks

Start NaviRouter, then run:

```bash
curl http://localhost:8098/api/health
curl http://localhost:8098/api/router/status
curl http://localhost:8098/api/version
npm run smoke
```

For full AudioMuse-backed smoke coverage, include credentials and processed song IDs:

```bash
NAVIROUTER_SMOKE_USERNAME=<navidrome-user> \
NAVIROUTER_SMOKE_PASSWORD=<navidrome-password> \
NAVIROUTER_SMOKE_SEED_ID=<song-id> \
NAVIROUTER_SMOKE_END_ID=<song-id> \
npm run smoke
```

Expected results:

- Health is `ok`.
- `/api/version` reports the expected NaviRouter version.
- Navidrome is reachable.
- AudioMuse is reachable.
- `getOpenSubsonicExtensions` returns `sonicSimilarity`.
- `getSonicSimilarTracks` returns `sonicMatch` entries.
- `getSimilarSongs2` returns song entries.
- `findSonicPath` returns start, bridge, and end entries.
- `/api/router/status` shows recent methods without credentials.

## Docker Smoke

After building the image:

```bash
docker run --rm navirouter:local npm run smoke
```

For a container-to-host router check, set `NAVIROUTER_SMOKE_URL` to the host address reachable from Docker.

## Security Review

- No `.env` or token files are staged.
- Diagnostics do not include Subsonic `u`, `p`, `t`, or `s` values.
- AudioMuse bearer token is not printed by tests or smoke output.
- `NAVIROUTER_ALLOWED_NAVIDROME_HOSTS` and `NAVIROUTER_ALLOWED_AUDIOMUSE_HOSTS` remain narrow in examples.
- Public-internet deployment is still documented as out of scope for MVP.

## Git Publishing

```bash
git status --short
git push origin HEAD
```

Confirm the public GitHub repo is reachable before announcing a build. If the maintainer uses a self-hosted Git remote as `origin`, push that first.

For GitHub, publish a clean public snapshot instead of mirroring the full internal history when earlier commits include private LAN URLs, private issue links, or other maintainer-only context.
