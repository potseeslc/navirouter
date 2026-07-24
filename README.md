# NaviRouter

NaviRouter is a smart Subsonic/OpenSubsonic router for Navidrome clients. Point a client such as Arpeggi, Amperfy, Symfonium, or Feishin at NaviRouter instead of Navidrome, and NaviRouter forwards normal Subsonic traffic while answering similar-song requests with AudioMuse-powered sonic similarity.

The goal is simple: keep using the music app you already like, but give its radio and similar-song buttons better ears.

```text
Subsonic client -> NaviRouter -> Navidrome
                            \-> AudioMuse
```

## Why This Exists

Navidrome has a great server and a healthy client ecosystem, but sonic discovery is still uneven across clients and often depends on server-side Last.fm-style similarity. AudioMuse can analyze a library and produce richer audio embeddings, but most Subsonic clients do not know how to use that data.

NaviRouter bridges that gap without asking every client to implement a custom AudioMuse integration.

## Current MVP

- Transparent `/rest/*` proxy to Navidrome.
- AudioMuse-backed `getSimilarSongs` and `getSimilarSongs2`.
- OpenSubsonic `getSonicSimilarTracks` support.
- OpenSubsonic `findSonicPath` support with bridge candidates ranked from both endpoint neighborhoods.
- `getOpenSubsonicExtensions` advertisement for sonic similarity.
- Pass-through fallback if AudioMuse is unavailable.
- JSON and XML Subsonic responses.
- Redacted request logging helpers.
- Router diagnostics for AudioMuse similarity fallback state.
- AudioMuse-to-Navidrome playlist sync endpoint for external AudioMuse UI/workflows.
- Small status console at `/`.
- LAN/VPN-first deployment posture.
- Docker healthcheck for container orchestration.

## Target Clients

NaviRouter should be useful to any Subsonic/OpenSubsonic client. Early compatibility targets:

- Arpeggi
- Amperfy
- Narjo
- Play:Sub
- Symfonium
- Feishin
- Generic Subsonic clients

Clients that do not call similar-song endpoints should still work through NaviRouter as normal Navidrome clients.

See [Client Compatibility](docs/client-compatibility.md) for the MVP testing checklist and early compatibility matrix.

## Configuration

Copy `.env.example` to `.env` and set:

- `NAVIDROME_URL`
- `AUDIOMUSE_URL`
- `NAVIDROME_DB_PATH` if you want library-scoped AudioMuse radio filtering
- `AUDIOMUSE_API_TOKEN` if your AudioMuse requires it
- `AUDIOMUSE_API_TOKEN_FILE` if you prefer mounting the AudioMuse token as a Docker secret
- `NAVIROUTER_ALLOWED_NAVIDROME_HOSTS` and `NAVIROUTER_ALLOWED_AUDIOMUSE_HOSTS`
- `NAVIROUTER_MAX_BODY_BYTES` if you need to adjust the Subsonic form POST limit
- `NAVIROUTER_SONG_CACHE_TTL_SECONDS` and `NAVIROUTER_SONG_CACHE_MAX` if you need to tune candidate-resolution caching
- `NAVIROUTER_RESOLVE_CONCURRENCY` if you need to tune parallel Navidrome song lookups for AudioMuse candidates
- `NAVIROUTER_WEBHOOK_URL` if you want generic webhook notifications for AudioMuse radio events

Then run:

```bash
npm test
npm start
```

In your music client, use the NaviRouter URL as the Subsonic server URL. Use your normal Navidrome username and password/token. NaviRouter forwards those credentials to Navidrome but does not log them.

### Multiple Navidrome Libraries

For clients that support Navidrome/Subsonic music folders, use the normal NaviRouter server URL:

```text
http://<navirouter-host>:8098
```

NaviRouter passes `getMusicFolders` and client-selected `musicFolderId` values through to Navidrome, so the client's built-in library switcher remains the primary experience.

If `NAVIDROME_DB_PATH` points at Navidrome's SQLite database, NaviRouter also uses it as a local read-only lookup to keep AudioMuse radio candidates inside the selected library when the client sends `musicFolderId`. Without that database path, scoped browsing still works and scoped radio falls back to Navidrome when NaviRouter cannot verify candidate library membership.

If NaviRouter runs on the host while Navidrome stores its database inside a Docker named volume, set:

```env
NAVIDROME_DB_PATH=/data/navidrome.db
NAVIDROME_DB_CONTAINER=navidrome
NAVIROUTER_DOCKER_CLI=/usr/local/bin/docker
```

That makes NaviRouter query the Navidrome container's SQLite database read-only for library IDs. Leave `NAVIDROME_DB_CONTAINER` empty when the database path is directly readable from the NaviRouter process.

For clients that do not provide a good library switcher, NaviRouter also supports fallback virtual library URLs:

```text
http://<navirouter-host>:8098/library/<musicFolderId>
```

For example:

```text
http://<navirouter-host>:8098/library/1  # Music Library
http://<navirouter-host>:8098/library/2  # Live Music Archive
```

NaviRouter maps those URLs back to `/rest/*`, returns only the selected folder from `getMusicFolders`, and injects `musicFolderId` into Navidrome browse/search calls that support it.

Useful local checks:

```bash
curl http://localhost:8098/api/health
curl http://localhost:8098/api/router/status
curl http://localhost:8098/api/version
curl "http://localhost:8098/rest/getOpenSubsonicExtensions.view?f=json"
```

During client testing, open the console at `http://localhost:8098/` or inspect `/api/router/status` to see which Subsonic methods the client is calling.

See [Dashboard And Terminal Examples](docs/dashboard-examples.md) for sanitized health, status, and config output.
Use [Client Method Logger](docs/client-method-logger.md) when you want to test a client against a fake Subsonic/OpenSubsonic server with fake credentials before connecting it to the real library.

### Webhook Notifications

NaviRouter can POST generic JSON webhook events when AudioMuse radio is generated, when a client actually streams a song from that generated queue, or when AudioMuse misses and NaviRouter falls back to Navidrome.

```env
NAVIROUTER_WEBHOOK_URL=https://example.test/navirouter/events
NAVIROUTER_WEBHOOK_EVENTS=radio.generated,radio.playback_confirmed,radio.fallback
NAVIROUTER_WEBHOOK_SECRET=change-me
NAVIROUTER_WEBHOOK_TIMEOUT_MS=3000
NAVIROUTER_WEBHOOK_QUEUE_MAX=100
NAVIROUTER_FALLBACK_RESPONSE_MAX_BYTES=1048576
NAVIROUTER_RADIO_CORRELATION_TTL_SECONDS=21600
```

Supported events:

- `radio.generated`: AudioMuse returned a queue to a Subsonic/OpenSubsonic client or router playlist endpoint.
- `radio.playback_confirmed`: an authenticated client requested a song from its AudioMuse queue and NaviRouter wrote audio bytes to that client. Radios are correlated by an opaque radio ID, authenticated Navidrome user, client identifier, and user agent when those values are available.
- `radio.fallback`: AudioMuse could not serve the seed and Navidrome returned a successful Subsonic response.

Every payload has a unique event `id`; radio events also share a stable `radio.id`. Webhook delivery is ordered, best-effort, and never blocks radio or playback. The pending queue is bounded by `NAVIROUTER_WEBHOOK_QUEUE_MAX`; dropped-event counts appear in router diagnostics. Radio-to-playback correlation expires after `NAVIROUTER_RADIO_CORRELATION_TTL_SECONDS`. Generic Subsonic clients do not provide a universal device identifier, so two identical client instances sharing one account can remain ambiguous if every available request characteristic is the same. If `NAVIROUTER_WEBHOOK_SECRET` or `NAVIROUTER_WEBHOOK_SECRET_FILE` is set, requests include:

```text
X-NaviRouter-Signature: sha256=<hmac-sha256-of-json-body>
```

Payloads do not include Subsonic passwords, tokens, salts, or AudioMuse bearer tokens. Recent delivery status appears under `router.webhooks` in `/api/router/status`.

### Save The Last AudioMuse Radio Queue

After a client triggers AudioMuse-backed radio, NaviRouter keeps the last returned queue in memory. You can save that queue as a timestamped Navidrome playlist:

```bash
curl -X POST "http://localhost:8098/api/router/last-radio/save-playlist" \
  -H "content-type: application/json" \
  -d '{"u":"<username>","p":"<password>"}'
```

Optional fields:

- `name`: explicit playlist name. If omitted, NaviRouter creates a name like `AudioMuse Radio - Pregnant Pause - 2026-07-18T20-13-58`.
- `playlistId`: update an existing Navidrome playlist instead of creating a new one.
- `mode`: `replace` or `append` when `playlistId` is provided. The default is `replace` with a `playlistId`, otherwise `create`.
- `t` and `s`: token/salt auth can be used instead of `p`.

Examples:

```bash
# Replace an existing playlist with the last AudioMuse radio queue.
curl -X POST "http://localhost:8098/api/router/last-radio/save-playlist" \
  -H "content-type: application/json" \
  -d '{"u":"<username>","p":"<password>","playlistId":"<playlist-id>","mode":"replace"}'

# Append the last AudioMuse radio queue to an existing playlist.
curl -X POST "http://localhost:8098/api/router/last-radio/save-playlist" \
  -H "content-type: application/json" \
  -d '{"u":"<username>","p":"<password>","playlistId":"<playlist-id>","mode":"append"}'
```

NaviRouter does not store these playlist-action credentials. They are forwarded to Navidrome for the single playlist creation request.

### Generate An AudioMuse Playlist From A Seed

For clients that browse and play through NaviRouter but do not call Subsonic similar-song APIs, the generated playlist endpoint can be used by scripts or external tools. It asks AudioMuse for radio candidates from a seed song, resolves them through Navidrome, and saves the result as a normal Navidrome playlist that any client can open.

```bash
curl -X POST "http://localhost:8098/api/router/radio-playlist" \
  -H "content-type: application/json" \
  -d '{"u":"<username>","p":"<password>","id":"<seed-song-id>","count":50}'
```

The endpoint accepts the same playlist options as the last-radio save endpoint: `name`, `playlistId`, and `mode` (`create`, `replace`, or `append`). Use `musicFolderId` when you want the generated playlist scoped to a Navidrome library.

### Optional AudioMuse Interop Sync

NaviRouter is not meant to replace AudioMuse's interactive UI or its native playlist export. AudioMuse already has rich discovery screens and can create playlists in configured media servers. Use AudioMuse directly when that works.

The sync endpoint exists for router-specific interop: tools that are pointed at NaviRouter, need NaviRouter's append/replace behavior, want router diagnostics/attribution, or need NaviRouter to enforce a selected Navidrome library scope while writing an ordered AudioMuse result set into Navidrome.

```bash
curl -X POST "http://localhost:8098/api/router/sync-playlist" \
  -H "content-type: application/json" \
  -d '{
    "u":"<username>",
    "p":"<password>",
    "name":"AudioMuse Sync - Evening Drift",
    "tracks":[
      {"item_id":"<song-id-1>"},
      {"item_id":"<song-id-2>"}
    ]
  }'
```

Accepted track inputs include `songId`, `songIds`, `trackId`, `trackIds`, `item_id`, `itemIds`, `tracks`, `songs`, `items`, or `candidates`. Object entries may use `songId`, `trackId`, `item_id`, `itemId`, or `id`. NaviRouter preserves order, removes duplicates, resolves each ID through Navidrome, and returns `skippedCount` for tracks it could not resolve. The endpoint accepts the same `name`, `playlistId`, and `mode` options as the other playlist endpoints, plus `musicFolderId` when a sync should be constrained to one Navidrome library.

The intended boundary is:

```text
Explore/export in AudioMuse when possible
Use NaviRouter only to adapt client requests or sync router-specific handoffs
Play in any Navidrome client
```

For an end-to-end smoke test, set `NAVIROUTER_SMOKE_USERNAME`, `NAVIROUTER_SMOKE_PASSWORD`, and one or two processed song IDs:

```bash
NAVIROUTER_SMOKE_SEED_ID=<song-id> NAVIROUTER_SMOKE_END_ID=<song-id> npm run smoke
```

The smoke test checks health, OpenSubsonic extension discovery, similar tracks, legacy similar songs, sonic path, and diagnostics. It prints result counts and song titles but does not print credentials.

See [Smoke Test](docs/smoke-test.md) for all supported smoke-test variables and the Docker `docker exec` form.

## Docker

Docker is the recommended community deployment path.

```bash
cp .env.example .env
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
```

For a typical homelab Docker network, set `NAVIDROME_URL` and `AUDIOMUSE_URL` to the service names reachable from the NaviRouter container, then include those hostnames in the allowlist variables.

Example:

```env
NAVIDROME_URL=http://navidrome:4533
AUDIOMUSE_URL=http://audiomuse:8000
NAVIROUTER_ALLOWED_NAVIDROME_HOSTS=navidrome:4533
NAVIROUTER_ALLOWED_AUDIOMUSE_HOSTS=audiomuse:8000
```

If Navidrome or AudioMuse run on the Docker host instead of the same compose network, use the host address reachable from the container and include that exact `host:port` in the matching allowlist.

## AudioMuse Index Requirement

AudioMuse must have built its audio similarity IVF index before NaviRouter can return sonic matches. If AudioMuse has processed embeddings but similar-track lookups report an empty search index, wait for AudioMuse's configured index rebuild threshold or rebuild the AudioMuse indexes from its own admin/task flow.

NaviRouter will keep ordinary Navidrome traffic working while AudioMuse similarity is unavailable. Check `/api/router/status` to see the last AudioMuse similarity result.

## Security Posture

V1 is intended for LAN/VPN use. Do not expose NaviRouter directly to the public internet. Put it behind HTTPS and additional authentication before remote exposure.

NaviRouter redacts sensitive Subsonic query parameters (`u`, `p`, `t`, `s`) and authorization headers from diagnostics. Upstream service hosts are allowlisted by default.

For AudioMuse bearer auth, prefer `AUDIOMUSE_API_TOKEN_FILE` with a mounted secret file when running in Docker. `AUDIOMUSE_API_TOKEN` still works for simple local setups, and it takes precedence when both are set.

Subsonic form POST bodies are capped by `NAVIROUTER_MAX_BODY_BYTES` to avoid unbounded buffering.

Resolved Navidrome song objects are cached briefly for AudioMuse candidate lookups. Cache entries are scoped by song ID plus a hash of the Subsonic auth parameters, so repeat radio calls get faster without sharing cached results across users. Set `NAVIROUTER_SONG_CACHE_TTL_SECONDS=0` or `NAVIROUTER_SONG_CACHE_MAX=0` to disable it. NaviRouter resolves AudioMuse candidates with bounded parallel Navidrome lookups; set `NAVIROUTER_RESOLVE_CONCURRENCY` lower for small systems or higher for fast LAN deployments.

## Community Roadmap

- Validate behavior against popular clients and document per-client notes.
- Solve source attribution so users can tell when a queue came from AudioMuse without corrupting song metadata.
- Continue improving `findSonicPath` bridge quality as richer AudioMuse path signals become available.
- Keep playlist writes as router/sync primitives for AudioMuse and scripts, not as a replacement interactive playlist UI.
- Add client profiles only when a real compatibility issue requires them.
- Add a hardened public-internet deployment guide after the LAN/VPN version is battle-tested.

See [Roadmap TODO](docs/roadmap-todo.md) for the working implementation checklist, [Dashboard And Terminal Examples](docs/dashboard-examples.md) for current diagnostic output, [Source Attribution](docs/source-attribution.md) for the AudioMuse badge policy, [AudioMuse Boundary](docs/audiomuse-boundary.md) for avoiding duplicate AudioMuse workflows, [Deployment Security](docs/deployment-security.md) for LAN/VPN and proxy guidance, [Release Strategy](docs/release-strategy.md) for version and mirror decisions, [Product Decisions](docs/product-decisions.md) for scope calls, and [Product Backlog](docs/product-backlog.md) for design problems that need product decisions before implementation.

## Contributing

Client reports and focused compatibility fixes are welcome. See [Contributing](CONTRIBUTING.md) and [Security Policy](SECURITY.md) before opening issues that include diagnostics.

Before tagging or sharing a build, run the [Release Checklist](docs/release-checklist.md).

## Project Status

This is an early project. The first useful milestone is a reliable router that can sit quietly in front of Navidrome and make similar-song radio better without breaking ordinary browsing, streaming, scrobbling, ratings, or playlists.
