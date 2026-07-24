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
- NaviRouter version/commit:
- Auth type: password or token/salt
- Test type: fake client logger or real LAN/VPN deployment

## Test Environment

- [ ] NaviRouter stayed on a trusted LAN/VPN.
- [ ] I reviewed the report for private URLs and library metadata.
- [ ] I removed usernames, passwords, tokens, salts, cookies, and bearer headers.

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

## Evidence

How did you collect the evidence?

- [ ] NaviRouter client method logger (`/calls`)
- [ ] NaviRouter live dashboard or `/api/router/status`
- [ ] Client UI observation
- [ ] Other sanitized evidence explained below

Paste the **summarized/redacted method list**, not a full diagnostic dump:

```text
client:
methods:
library or music-folder behavior:
radio or similarity result:
```

## Problems or Unexpected Behavior

- Action attempted:
- Expected result:
- Actual result:
- Is it reproducible?

## AI-Forward Project Feedback

NaviRouter is built through human-directed collaboration with AI coding agents. Optional feedback:

- Were the setup and safety instructions clear?
- Was the evidence workflow understandable?
- Did any AI-authored documentation or behavior seem ambiguous or difficult to verify?

## Additional Notes

Add any other sanitized observations that would help reproduce the result.

Do not include passwords, tokens, salts, cookies, bearer headers, private URLs, or full private network details.
