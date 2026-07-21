# Contributing

NaviRouter is early, but useful reports are welcome. The project is trying to stay small: a secure router that makes existing Navidrome/Subsonic clients better by using AudioMuse similarity.

## Good First Contributions

- Client compatibility reports.
- Reproducible bugs with `/api/router/status` output.
- Docs for Docker, reverse proxies, and client setup.
- Focused fixes for Subsonic/OpenSubsonic endpoint compatibility.
- Tests that capture real client behavior.

## Before Opening An Issue

Run the smoke test when possible:

```bash
npm run smoke
```

For AudioMuse-backed checks, include a processed song ID:

```bash
NAVIROUTER_SMOKE_USERNAME=<navidrome-user> \
NAVIROUTER_SMOKE_PASSWORD=<navidrome-password> \
NAVIROUTER_SMOKE_SEED_ID=<song-id> \
npm run smoke
```

Do not paste passwords, tokens, salts, cookies, or full private URLs into issues.

## Development

```bash
npm test
npm start
```

Docker validation:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml config
docker build -t navirouter:local .
```

## Pull Requests

Keep pull requests small and behavior-focused. Include:

- What changed.
- Which client or endpoint it affects.
- Test output.
- Any security or compatibility tradeoffs.

Security-sensitive reports should follow `SECURITY.md` instead of public issue discussion.
