# NaviRouter Public Alpha Testing

NaviRouter v0.1.2 is a public alpha for people who run Navidrome and AudioMuse and are comfortable testing software on a trusted LAN or VPN.

The core router has passed automated tests, Docker build validation, and authenticated live smoke checks. Arpeggi is confirmed. The main unknown is how other Subsonic/OpenSubsonic clients expose radio, similar-song, library-switching, and sonic-path features.

## Why This Alpha Is AI-Forward

NaviRouter is intentionally developed through human-directed collaboration with AI coding agents. AI agents help plan, implement, test, document, and review changes. A human maintainer owns product decisions, approves releases, and remains accountable for what ships.

This alpha asks the community to test two things:

1. Whether NaviRouter behaves correctly with real clients and homelab configurations.
2. Whether an openly AI-forward development process can produce software that is understandable, verifiable, and useful to human operators.

AI-generated claims are not considered proof. Runtime captures, automated tests, reproducible steps, and human review are the evidence standard.

## Clients We Need

Highest-priority reports:

- Amperfy
- Symfonium
- Play:Sub
- Narjo

Reports for any other Subsonic/OpenSubsonic client are welcome.

## Safe Test Path

1. Keep NaviRouter on a trusted LAN or VPN. Do not expose it directly to the public internet.
2. Start with the [Client Method Logger](client-method-logger.md). It uses fake credentials and a fake library.
3. In the client, test login, browsing, playlists, music-folder/library switching, streaming controls, and radio/similar-song features.
4. Capture the redacted method summary.
5. If the fake-server test looks good, optionally repeat against a real NaviRouter deployment.
6. Open the GitHub **Client compatibility** issue template with the summarized evidence.

The methods we especially want to observe are:

```text
getMusicFolders
getIndexes with musicFolderId
getSimilarSongs
getSimilarSongs2
getSonicSimilarTracks
findSonicPath
getOpenSubsonicExtensions
```

## Never Share

Do not post:

- Navidrome usernames or passwords
- Subsonic `p`, `t`, or `s` values
- AudioMuse bearer tokens
- Cookies or authorization headers
- Private hostnames, IP addresses, or complete URLs
- Full `/api/router/status` dumps
- Library metadata unrelated to reproducing the issue

Prefer the built-in summary workflow, which redacts authentication fields and reports only the endpoint evidence needed for compatibility work.

## What Counts as a Useful Report

A useful report includes:

- Client name, version, and platform
- NaviRouter version
- Fake logger or real LAN/VPN test
- Actions performed
- Methods observed
- What worked
- What failed or behaved unexpectedly
- Whether the result is reproducible

Source inspection alone does not mark a client compatible. We need observed runtime behavior.

## Alpha Exit Criteria

NaviRouter can move beyond public alpha when:

- At least one additional client is fully verified beyond Arpeggi.
- No credential leaks or high-impact proxy failures remain open.
- A community user can follow the Docker and testing documentation without private maintainer context.
- Compatibility claims are backed by reproducible runtime evidence.

## Copy-Ready Community Invitation

> **NaviRouter v0.1.2 Public Alpha — AI-forward Navidrome + AudioMuse testing**
>
> NaviRouter sits in front of Navidrome as a Subsonic/OpenSubsonic router and uses AudioMuse sonic similarity when a client asks for radio or similar songs. Arpeggi is working; we need community evidence for Amperfy, Symfonium, Play:Sub, Narjo, and other clients.
>
> This is an intentionally AI-forward open-source project. A human maintainer directs and releases the work, while AI coding agents help plan, implement, test, document, and review it. We are being explicit about that because part of the alpha is testing whether this workflow produces software the community can understand and verify.
>
> Please test only on a trusted LAN/VPN. Start with the included fake client logger so you can capture endpoint behavior without exposing a real library or credentials. Reports should include client/version/platform, actions tested, observed Subsonic methods, and sanitized results. Never post passwords, tokens, salts, cookies, private URLs, or full diagnostic dumps.
>
> Project: <https://github.com/potseeslc/navirouter>
>
> Testing guide: <https://github.com/potseeslc/navirouter/blob/main/docs/public-alpha.md>
