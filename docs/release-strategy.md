# Release Strategy

## Repository

NaviRouter is ready for a public GitHub mirror for community discovery:

```text
https://github.com/potseeslc/navirouter
```

The maintainer may still use a self-hosted Git remote as the day-to-day source of truth, but public documentation, issue templates, and package metadata should point community users to GitHub.

Why:

- GitHub is easier for the Navidrome/Subsonic community to find, star, fork, and file issues against.
- The repo now has Docker, security, release, smoke-test, and compatibility docs.
- The README and examples no longer depend on private LAN addresses.
- Public support should avoid exposing private hostnames, credentials, or library diagnostics.

## Versioning

- `v0.1.0`: first MVP tag.
- `v0.1.1`: router roadmap update with dashboard, library-scope inference, playlist save/update/generation APIs, attribution docs, deployment-security docs, and improved sonic path bridge ranking.
- `v0.1.2`: public alpha with generic signed webhooks, correlated AudioMuse radio/playback/fallback events, graceful container shutdown, and a community client-testing workflow.

Use patch releases while the public API is still settling. Move to `v0.2.0` when another client beyond Arpeggi is verified, GitHub community feedback changes behavior, or a client profile becomes necessary.

## Public Alpha Positioning

Present `v0.1.2` as a GitHub pre-release and keep the existing tag stable. The alpha is intentionally AI-forward: human-directed AI coding agents assist with planning, implementation, tests, documentation, and review, while the human maintainer owns decisions and releases.

Community outreach should link to [Public Alpha Testing](public-alpha.md), emphasize LAN/VPN-only deployment, and request structured runtime evidence for Amperfy, Symfonium, Play:Sub, Narjo, and other Subsonic/OpenSubsonic clients.

## Release Gate

Before tagging:

```bash
npm test
docker compose -f deploy/docker-compose.yml config
docker build -t navirouter:local .
NAVIROUTER_SMOKE_URL=http://127.0.0.1:8098 npm run smoke
```

Authenticated smoke checks require `NAVIROUTER_SMOKE_USERNAME` plus password or token/salt auth. Do not paste credentials into release notes, screenshots, or terminal transcripts.
