# Client Compatibility

NaviRouter v0.1.2 is a public alpha. Community reports should follow the safe, AI-forward [Public Alpha Testing](public-alpha.md) workflow and use the GitHub client compatibility issue template.

NaviRouter should work as a normal Subsonic/OpenSubsonic server URL for clients that already support Navidrome. The key MVP question is whether a client calls one of the similar-song endpoints that NaviRouter can enrich with AudioMuse.

Use this server URL shape in clients:

```text
http://<navirouter-host>:8098
```

Use the same username and password/token you use for Navidrome.

For controlled tests without touching the real library, run the [Client Method Logger](client-method-logger.md) and connect the client with fake credentials.

## What To Test

1. Add NaviRouter as a new Subsonic server in the client.
2. Browse albums, artists, playlists, and folders.
3. Play, pause, seek, and stream several tracks.
4. Trigger the client's radio, mix, similar songs, or station feature.
5. Open `http://<navirouter-host>:8098/` and check Recent.
6. Confirm whether the client called `getSimilarSongs`, `getSimilarSongs2`, `getSonicSimilarTracks`, or `findSonicPath`.

If the client never calls a similar-song endpoint, ordinary playback can still work through NaviRouter, but the client will not benefit from AudioMuse similarity yet.

## Early Matrix

| Client | Expected Baseline | Similarity Path | MVP Status |
| --- | --- | --- | --- |
| Arpeggi | Subsonic/OpenSubsonic URL | `getSimilarSongs2` via Radio | Confirmed |
| Amperfy | Subsonic URL | To verify | Target |
| Symfonium | Subsonic URL | To verify | Target |
| Feishin | OpenSubsonic URL | Extension discovery confirmed; sonic endpoint use not observed | Partial |
| Play:Sub | Subsonic URL | To verify | Target |
| Generic Subsonic | `/rest/*` proxy | `getSimilarSongs` / `getSimilarSongs2` | Supported |
| OpenSubsonic | `/rest/*` proxy | `getSonicSimilarTracks` / `findSonicPath` | Supported |

## Confirmed Notes

### Arpeggi

- Server URL: `http://<navirouter-host>:8098`
- Normal browsing, cover art, streaming, and scrobbling work through NaviRouter.
- Navidrome's built-in library switcher works through the normal single NaviRouter server URL.
- Radio calls `getSimilarSongs2`.
- NaviRouter intercepts that call, requests AudioMuse similarity, resolves candidates back to Navidrome song objects, and returns a normal `similarSongs2` response.
- Arpeggi's visible Continuous Queue has been verified against `/api/router/status` to match the last AudioMuse-generated radio response.
- Arpeggi does not reliably send `musicFolderId` with Radio requests. When `NAVIDROME_DB_PATH` is configured, NaviRouter infers the radio library from the seed track and filters AudioMuse candidates to that library.
- Arpeggi does not currently show a portable AudioMuse source badge in the queue. Use NaviRouter's dashboard for live attribution, or save/generate a playlist with an `AudioMuse Radio - ...` name when attribution needs to be visible inside the client.

### Feishin

- Tested Feishin 1.14.0 against a local fake OpenSubsonic server with fake credentials.
- Baseline login and home loading worked against the mock server.
- Feishin called `getOpenSubsonicExtensions`, which confirms OpenSubsonic extension discovery.
- During login, home loading, and Auto DJ settings interaction, Feishin did not call `getSonicSimilarTracks`, `findSonicPath`, `getSimilarSongs`, or `getSimilarSongs2`.
- Current result: usable as a normal OpenSubsonic client through NaviRouter, but AudioMuse discovery should be exposed through generated playlists unless/until Feishin adds sonic similarity UI support.

See [Client Test Results](client-test-results.md) for the captured method list.

### Amperfy

- Runtime testing is still pending.
- Source inspection shows Amperfy calls `getOpenSubsonicExtensions`, supports `getMusicFolders` / scoped `getIndexes(musicFolderId:)`, and uses `getSimilarSongs2` for similar-song previews.
- Expected real-device test path: connect Amperfy to NaviRouter, switch libraries, open a song/entity preview that exposes similar songs, and confirm NaviRouter logs `getSimilarSongs2`.

## Attribution

Standard Subsonic song responses do not provide a portable source badge that clients consistently render. NaviRouter therefore does not modify song title, artist, album, or genre fields to advertise AudioMuse. See [Source Attribution](source-attribution.md) for the current policy and per-client attribution table.

## Diagnostics

`/api/router/status` exposes:

- Upstream health for Navidrome and AudioMuse.
- Last AudioMuse similarity lookup status.
- Last AudioMuse radio queue with seed, selected library scope, returned songs, and recent playback match status.
- Total proxied Subsonic requests.
- Request counts by Subsonic method.
- Recent method/client pairs without user credentials.

Sensitive Subsonic auth parameters are not included in diagnostics.
