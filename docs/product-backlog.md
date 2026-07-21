# Product Backlog

These are known product problems that are not blockers for the first working router, but matter for a polished community release.

## Source Attribution In Clients

Users should be able to tell when a radio queue, similar-song list, or generated discovery flow came from AudioMuse through NaviRouter.

Constraints:

- Standard Subsonic song responses do not define a portable "source" or "powered by" field that clients are expected to render.
- Adding fake prefixes to title, artist, album, or genre would pollute metadata and could affect search, cache behavior, scrobbling, and user trust.
- Unknown custom fields may be ignored by clients such as Arpeggi, Amperfy, Symfonium, or Play:Sub.

Possible directions:

- Expose clear attribution in NaviRouter's own status console: last radio seed, source, returned count, and playback match status.
- Add optional playlist export with attribution in the playlist name, such as `AudioMuse Radio - Pregnant Pause`.
- Explore client-specific extension points only when a target client has a documented, safe way to render extra metadata.
- Document client behavior in the compatibility matrix so users know where attribution can and cannot appear.

Preferred posture for now:

- Do not alter library metadata.
- Treat attribution as a UI/compatibility problem, not a metadata hack.
