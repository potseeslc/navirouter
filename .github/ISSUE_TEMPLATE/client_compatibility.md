---
name: Client compatibility
about: Report how a Subsonic/OpenSubsonic client behaves with NaviRouter
title: "[Client]: "
labels: client-compatibility
assignees: ""
---

## Client

- App name:
- App version:
- Platform:
- Auth type: password or token/salt

## What Worked

- [ ] Login
- [ ] Browse artists/albums
- [ ] Browse playlists
- [ ] Library/music folder switching
- [ ] Streaming
- [ ] Seeking
- [ ] Scrobbling
- [ ] Ratings/starred tracks
- [ ] Radio/similar songs

## Similarity Methods Observed

Check `/api/router/status` or use `npm run client:logger`.

- [ ] `getSimilarSongs`
- [ ] `getSimilarSongs2`
- [ ] `getSonicSimilarTracks`
- [ ] `findSonicPath`
- [ ] None observed

## Notes

Paste sanitized method logs or observations.

Do not include passwords, tokens, salts, cookies, bearer headers, private URLs, or full private network details.
