# Source Attribution

NaviRouter should make AudioMuse-powered discovery visible without corrupting the user's music metadata.

## Decision

Use these attribution surfaces:

- NaviRouter dashboard: shows the last radio seed, source, returned count, library scope, and playback match status.
- Generated playlists: use visible names such as `AudioMuse Radio - Pregnant Pause`.
- Synced playlists from AudioMuse: use visible names chosen by AudioMuse or the sync caller, such as `AudioMuse Sync - Evening Drift`.
- API responses: NaviRouter-owned JSON endpoints return `source: "AudioMuse"` for playlist creation responses.
- Documentation: client compatibility notes explain whether a client can display attribution.

Do not use these attribution surfaces:

- Song `title`, `artist`, `album`, `genre`, or path prefixes.
- Fake albums, fake artists, or fake folders.
- Unofficial custom fields inside normal Subsonic song responses unless a client documents support for them.

## Why

Subsonic and OpenSubsonic clients share a common song response shape, but they do not define a portable source/badge field that clients are expected to render in queues. OpenSubsonic supports server-advertised extensions through `getOpenSubsonicExtensions`, and the current public extension list includes sonic similarity, but not a general per-song provenance badge.

That makes metadata mutation the tempting bad shortcut. NaviRouter avoids it because fake metadata would leak into search, cache keys, scrobbling, ratings, playlists, and user trust.

## Current Client Behavior

| Client | Radio Queue Attribution | Playlist Attribution | Notes |
| --- | --- | --- | --- |
| Arpeggi | Not visible in the queue | Visible through the playlist name | Radio calls `getSimilarSongs2`; dashboard confirms the queue came from AudioMuse. |
| Generic Subsonic clients | Not portable | Visible through the playlist name | Clients that display playlist names can show the AudioMuse label there. |
| OpenSubsonic clients | Not portable yet | Visible through the playlist name | A future documented provenance extension would be the right place for richer attribution. |
| Amperfy | To verify | Expected through the playlist name | Needs device testing. |
| Symfonium | To verify | Expected through the playlist name | Needs device testing. |
| Feishin | Not observed in tested surfaces | Expected through the playlist name | OpenSubsonic extension discovery confirmed; sonic endpoint UI use not observed in Feishin 1.14.0. |
| Play:Sub | To verify | Expected through the playlist name | Needs device testing. |
| Narjo | To verify | Expected through the playlist name | Needs device testing. |

## Future Extension Path

If a client documents a safe way to render non-library response metadata, NaviRouter can add a client profile for that client. Until then, attribution stays in NaviRouter-owned UI/API surfaces and user-visible playlist names.
