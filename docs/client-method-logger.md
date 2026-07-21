# Client Method Logger

Use the client method logger when a mobile or desktop app needs compatibility testing but you do not want to connect it to the real music library yet.

The logger is a tiny fake Subsonic/OpenSubsonic server. It returns one mock artist, one mock album, one mock track, two music folders, and the NaviRouter sonic endpoints. It records every method the client calls and redacts auth parameters.

It supports:

- GET query parameters.
- POST form parameters.
- JSON responses when the client sends `f=json`.
- XML responses when the client omits `f=json`.

## Start

```bash
npm run client:logger
```

Defaults:

```text
URL: http://<this-mac-ip>:18100
Username: fake
Password: fake
```

Optional port:

```bash
NAVIROUTER_CLIENT_LOGGER_PORT=18101 npm run client:logger
```

## Inspect

Open:

```text
http://<this-mac-ip>:18100/calls
```

Reset the captured calls:

```text
http://<this-mac-ip>:18100/reset
```

The logger records method names and non-secret query parameters. `u`, `p`, `t`, and `s` are always shown as `[redacted]`.

Quick local checks:

```bash
curl -fsS "http://127.0.0.1:18100/rest/ping.view?u=fake&p=fake&v=1.16.1&c=test"
curl -fsS "http://127.0.0.1:18100/rest/getOpenSubsonicExtensions.view?u=fake&p=fake&v=1.16.1&c=test&f=json"
curl -fsS -X POST "http://127.0.0.1:18100/rest/getMusicFolders.view" \
  -H "content-type: application/x-www-form-urlencoded" \
  -d "u=fake&p=fake&v=1.16.1&c=test&f=json"
```

## Summarize A Capture

After exercising a client, summarize the observed methods into markdown that can be pasted into `docs/client-test-results.md`:

```bash
NAVIROUTER_CLIENT_NAME=Amperfy npm run client:summary -- http://127.0.0.1:18100/calls
```

To save a capture first:

```bash
curl -fsS http://127.0.0.1:18100/calls > /tmp/amperfy-calls.json
NAVIROUTER_CLIENT_NAME=Amperfy npm run client:summary -- /tmp/amperfy-calls.json
```

The summary is conservative. If browse/playback, library-scope, or expected similar-song evidence is missing for a roadmap client, it tells you not to mark that client complete yet.

## What To Capture

For each client:

1. Add the logger as a Subsonic/OpenSubsonic server.
2. Browse home, albums, artists, genres, folders, and playlists.
3. Switch music folders or libraries if the client offers that UI.
4. Trigger radio, similar songs, mix, station, Auto DJ, or any discovery feature.
5. Inspect `/calls`.
6. Record whether the client called:

```text
getMusicFolders
getIndexes with musicFolderId
getSimilarSongs
getSimilarSongs2
getSonicSimilarTracks
findSonicPath
getOpenSubsonicExtensions
```

## Roadmap Rule

Do not mark a client compatibility item complete until the observed method list is added to `docs/client-test-results.md`.

Expected client-specific checks:

| Client | Key Evidence |
| --- | --- |
| Amperfy | Runtime calls for library switch plus `getSimilarSongs2` from a song/entity preview. |
| Symfonium | Runtime calls showing browse, library switch, and any radio/similar endpoint it uses. |
| Play:Sub | Runtime calls showing baseline browse/playback and whether legacy similar uses `getSimilarSongs`. |
| Narjo | Runtime calls showing baseline Subsonic/Navidrome compatibility and any radio/similar endpoint it uses. |
