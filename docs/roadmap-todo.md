# Roadmap TODO

This list rolls the original NaviRouter plan back into a practical sequence: prove the router, make it pleasant to use, then harden it for community adoption.

## Current Priority TODO

This is the refined working list from the original plan.

### 1. Finish The Router Core

- [x] Keep NaviRouter as a router, not a replacement player.
- [x] Proxy normal Navidrome/Subsonic traffic without breaking browsing, streaming, scrobbling, ratings, playlists, or cover art.
- [x] Use AudioMuse for client radio/similar-song calls.
- [x] Preserve Navidrome's native library switching through one NaviRouter server URL.
- [x] Infer radio library scope from the seed track when clients omit `musicFolderId`.
- [x] Finish and test playlist replace/append mode for saving an AudioMuse queue into an existing Navidrome playlist.
- [x] Add a seed-based generated playlist endpoint for clients that do not call similar-song APIs.

### 2. Make The Value Visible

- [x] Add the web dashboard as NaviRouter's control-room surface.
- [x] Show health, recent client methods, last AudioMuse queue, selected library scope, and queue/playback match diagnostics.
- [x] Show AudioMuse attribution in the NaviRouter dashboard.
- [x] Refresh dashboard screenshots or terminal examples for the public README.
- [x] Solve client-visible source attribution where possible without changing song title, artist, album, genre, or scrobble metadata.
- [x] Document which clients can and cannot display AudioMuse attribution.

### 3. Validate Top Clients

- [x] Arpeggi: confirm browse, stream, library switch, radio, queue match, and AudioMuse-backed behavior.
- [ ] Amperfy: test browse, library switch, radio/similar behavior.
- [ ] Symfonium: test browse, library switch, radio/similar behavior.
- [x] Feishin: test OpenSubsonic extension discovery and sonic endpoints.
- [ ] Play:Sub: test legacy `getSimilarSongs` behavior.
- [ ] Narjo: test baseline Subsonic compatibility.
- [x] Add client-specific profiles only when real testing proves a client needs one.

### 4. Community-Ready Packaging

- [x] Prepare the repo for public GitHub sharing.
- [x] Write the README for self-hosters, not just for us.
- [x] Add Docker deployment files.
- [x] Add contributing, security, release, smoke-test, and deployment-security docs.
- [x] Keep v1 LAN/VPN-first and document public-internet risk clearly.
- [x] Decide whether to mirror to GitHub for broader community discovery.
- [x] Tag the next release after the dashboard and Arpeggi-tested matrix are clean.

### 5. Later Product Work

- [x] Improve `findSonicPath` beyond the current basic bridge.
- [x] Explore richer AudioMuse discovery tools in the dashboard without turning NaviRouter into a full player.
- [x] Consider a tiny setup wizard only after the config/env story is stable.
- [x] Revisit a first-class web client only if the router approach cannot deliver enough value through existing clients.

## Phase 1: Router MVP

- [x] Proxy normal Subsonic/Navidrome traffic through NaviRouter.
- [x] Support Navidrome username/password and token/salt auth without logging secrets.
- [x] Intercept `getSimilarSongs` and `getSimilarSongs2`.
- [x] Return AudioMuse-powered similar-song results as normal Subsonic song objects.
- [x] Fall back to Navidrome when AudioMuse is unavailable or missing a track.
- [x] Support JSON and XML responses.
- [x] Advertise OpenSubsonic sonic similarity extensions.
- [x] Add `getSonicSimilarTracks`.
- [x] Add basic `findSonicPath`.
- [x] Add smoke tests and unit tests.
- [x] Run as a live service on the Mac mini.

## Phase 2: Arpeggi Proof

- [x] Connect Arpeggi to NaviRouter.
- [x] Confirm normal browsing, cover art, streaming, and scrobbling still work.
- [x] Confirm Arpeggi Radio calls `getSimilarSongs2`.
- [x] Confirm AudioMuse returns candidates for a processed track.
- [x] Confirm Arpeggi's visible Continuous Queue matches the AudioMuse-returned queue.
- [x] Confirm Navidrome library switching works through the normal single NaviRouter URL.
- [x] Add diagnostics that compare recent playback against the last AudioMuse radio queue.
- [x] Update the client compatibility matrix with the confirmed Arpeggi behavior.

## Phase 3: Web Interface

- [x] Replace the basic status console with a polished NaviRouter dashboard.
- [x] Show upstream health for Navidrome and AudioMuse.
- [x] Show the last radio seed, AudioMuse source, returned count, and selected library scope.
- [x] Show a queue match panel: streamed tracks vs. last AudioMuse radio response.
- [x] Show recent client methods by client name.
- [x] Show clear warnings for missing AudioMuse index, missing token, or unreachable upstreams.
- [x] Add a read-only configuration panel.
- [x] Keep the UI control-room focused, not a full music player.

## Phase 4: Source Attribution

- [x] Find a way for users to know a queue came from AudioMuse without corrupting song metadata.
- [x] Document which clients can display attribution and which cannot.
- [x] Explore client-specific extension points only where they are safe and documented.
- [x] Add attribution to NaviRouter's own web UI.
- [x] Avoid fake title/artist/album prefixes.

## Phase 5: Generated Playlist Mode

- [x] Add an API endpoint to save the last AudioMuse radio queue as a Navidrome playlist.
- [x] Use clear playlist names such as `AudioMuse Radio - Pregnant Pause`.
- [x] Support timestamped playlist creation.
- [x] Add tests for playlist creation behavior.
- [x] Add overwrite/update behavior after Navidrome playlist mutation semantics are tested.
- [x] Document this as the fallback for clients that do not call similar-song APIs.

## Phase 6: Client Compatibility

- [x] Arpeggi: initial proof complete.
- [ ] Amperfy: test browse, library switch, radio/similar behavior.
- [ ] Symfonium: test browse, library switch, radio/similar behavior.
- [x] Feishin: test OpenSubsonic extension discovery and sonic endpoints.
- [ ] Play:Sub: test legacy `getSimilarSongs` behavior.
- [ ] Narjo: test baseline Subsonic compatibility.
- [x] Add client profiles only when a real compatibility issue requires one.

## Phase 7: Library Scope

- [x] Pass native `getMusicFolders` through to clients.
- [x] Honor client-provided `musicFolderId` for browse/search calls.
- [x] Honor client-provided `musicFolderId` for AudioMuse radio when possible.
- [x] Add optional virtual library URLs for clients without a good library switcher.
- [x] Improve diagnostics to show when a client omits `musicFolderId` during radio.
- [x] Decide whether unscoped radio should remain global or infer scope from the seed track.
- [x] Infer AudioMuse radio scope from the seed track when the client omits `musicFolderId` and `NAVIDROME_DB_PATH` is configured.

## Phase 8: Security And Deployment

- [x] Redact Subsonic auth parameters and authorization headers.
- [x] Add upstream host allowlists.
- [x] Add request body limits.
- [x] Support AudioMuse token files.
- [x] Keep v1 LAN/VPN-first.
- [x] Add a hardened reverse-proxy deployment guide.
- [x] Add explicit public-internet risk documentation.
- [x] Add Docker secret examples.
- [x] Review diagnostics for public sharing safety.

## Phase 9: Quality And Release

- [x] Public GitHub-ready repo.
- [x] Community-focused README.
- [x] Contributing and security docs.
- [x] Release checklist.
- [x] Refresh screenshots or terminal examples for the new dashboard.
- [x] Tag the next release after the Arpeggi matrix update and dashboard pass.
- [x] Decide whether to mirror to GitHub for broader community visibility.
