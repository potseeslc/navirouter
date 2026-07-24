# NaviRouter v0.1.2 — Public Alpha

NaviRouter v0.1.2 is the first release explicitly presented as a public alpha. It is ready for careful testing by Navidrome and AudioMuse users on trusted LAN/VPN deployments.

## AI-Forward, Human-Accountable

NaviRouter is intentionally developed through human-directed collaboration with AI coding agents. AI agents assist with planning, implementation, tests, documentation, and code review. The human maintainer owns product decisions, verifies releases, and remains accountable for what ships.

This is disclosed prominently because community testers should know how the software is made and should evaluate whether the resulting code, documentation, diagnostics, and evidence are understandable and trustworthy.

## What Is Proven

- Normal Subsonic/OpenSubsonic proxying to Navidrome
- AudioMuse-backed `getSimilarSongs` and `getSimilarSongs2`
- OpenSubsonic `getSonicSimilarTracks` and `findSonicPath`
- Arpeggi browsing, library switching, streaming, scrobbling, and radio
- JSON and XML responses
- Library-scoped candidate filtering
- Redacted diagnostics and request logging
- Signed, bounded webhook delivery
- Graceful `SIGTERM` and `SIGINT` shutdown
- Automated tests, Docker build validation, and authenticated live smoke checks

## What Needs Community Testing

Runtime compatibility for:

- Amperfy
- Symfonium
- Play:Sub
- Narjo
- Other Subsonic/OpenSubsonic clients

We especially need observed evidence for library switching and calls to `getSimilarSongs`, `getSimilarSongs2`, `getSonicSimilarTracks`, or `findSonicPath`.

## Safety

This alpha is LAN/VPN-first. Do not expose NaviRouter directly to the public internet.

Start with the fake [Client Method Logger](client-method-logger.md). Never include usernames, passwords, tokens, salts, cookies, private URLs, or complete diagnostic dumps in a public report.

Read the full [Public Alpha Testing Guide](public-alpha.md) before testing.
