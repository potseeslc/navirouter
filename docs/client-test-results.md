# Client Test Results

This file records hands-on compatibility evidence. Do not mark a client complete from expected support alone.

Use [Client Method Logger](client-method-logger.md) for controlled client tests with fake credentials. After a logger capture, run `npm run client:summary` to generate the standard evidence block for this file.

For real client tests against the live router, start with `POST /api/router/client-test-reset`, exercise the app, then use `/api/router/client-test-report?client=<name>&format=markdown` and paste the generated markdown here.

To apply a captured report safely:

```bash
curl -fsS "http://localhost:8098/api/router/client-test-report?client=Amperfy&format=markdown" > /tmp/amperfy-report.md
npm run client:apply -- --client Amperfy --report /tmp/amperfy-report.md
npm run client:apply -- --client Amperfy --report /tmp/amperfy-report.md --write
```

The apply command refuses to update `docs/roadmap-todo.md` when the report says not to mark the client complete or required evidence is missing.

## Feishin 1.14.0

Date: 2026-07-18

Test shape:

- Downloaded the official `Feishin-1.14.0-mac-arm64.zip` release.
- Launched the app from a temporary directory with a disposable Electron user-data profile.
- Connected it to a local fake OpenSubsonic server at `http://127.0.0.1:18100` using fake credentials only.
- The fake server advertised the `sonicSimilarity` and `formPost` OpenSubsonic extensions and logged all Subsonic method calls.

Observed calls:

```text
getUser
ping
getOpenSubsonicExtensions
jukeboxControl
getAlbumList2
getGenres
getPlaylists
getCoverArt
```

Result:

- Baseline OpenSubsonic login, extension discovery, album browsing, genre loading, playlist loading, and cover-art requests were observed.
- `getOpenSubsonicExtensions` was called with `c=Feishin`, `f=json`, and `v=1.13.0`.
- `getSonicSimilarTracks`, `findSonicPath`, `getSimilarSongs`, and `getSimilarSongs2` were not observed during login, home loading, or Auto DJ settings interaction.
- Current compatibility status: baseline compatible; OpenSubsonic extension discovery confirmed; sonic endpoint use not confirmed in Feishin 1.14.0.

Notes:

- The Feishin renderer appeared black in macOS screenshots, but the DOM rendered and was controlled through Chromium DevTools Protocol.
- Feishin upstream currently has an open feature request for OpenSubsonic `sonicSimilarity` support, so NaviRouter should not assume Feishin can consume sonic endpoints yet.

## Amperfy Source Inspection

Date: 2026-07-18

Test shape:

- Checked the current `BLeeEZ/amperfy` `master` branch.
- Did not run the app. The repository requires Xcode 26, and this Mac currently exposes Swift tooling but not `xcodebuild`.

Observed source paths:

```text
AmperfyKit/Api/Subsonic/SubsonicServerApi.swift
AmperfyKit/Api/Subsonic/SubsonicLibrarySyncer.swift
Amperfy/Screens/ViewController/EntityPreviewVC.swift
```

Useful findings for real-device testing:

- `requestOpenSubsonicExtensions()` calls `getOpenSubsonicExtensions`.
- `requestMusicFolders()` calls `getMusicFolders`.
- `requestIndexes(musicFolderId:)` passes `musicFolderId` to `getIndexes`.
- `requestSimilarSongs(id:count:)` calls `getSimilarSongs2`.
- `EntityPreviewVC` requests 99 similar songs for a selected song.

Result:

- Not runtime verified.
- Expected test path: connect Amperfy to NaviRouter, switch music folders/libraries, open a song/entity preview that exposes similar songs, then confirm NaviRouter sees `getSimilarSongs2`.

## Remaining Client Test Queue

Date: 2026-07-18

These clients still need real app/device testing. They are intentionally left unchecked in the roadmap.

| Client | Current Access | What To Verify |
| --- | --- | --- |
| Amperfy | Mac/iOS App Store app, or source build with Xcode 26 | Browse, library switch, song/entity preview, and `getSimilarSongs2` in NaviRouter diagnostics. |
| Symfonium | Android app | Browse, library switch, radio/similar behavior, and whether it sends OpenSubsonic or legacy similar calls. |
| Play:Sub | iOS app | Baseline browse/playback and whether any legacy similar-song path calls `getSimilarSongs`. |
| Narjo | iOS app | Baseline Subsonic/Navidrome compatibility through NaviRouter, plus any radio/similar surfaces if present. |

Do not mark these complete until the client has connected to the live NaviRouter URL or a controlled mock server and the observed Subsonic methods are recorded.
