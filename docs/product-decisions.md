# Product Decisions

## Router Before Player

Decision: keep NaviRouter focused on being a smart router for existing Navidrome/Subsonic clients.

Why:

- Arpeggi already proves the best version of the idea: keep the client the user likes, but improve its radio queue with AudioMuse.
- A full web player would compete with mature clients and reopen the scope problems that made the earlier NaviMuse direction drift.
- AudioMuse already owns the interactive discovery UI. NaviRouter should adapt client requests and sync AudioMuse results into Navidrome, not become a second discovery workbench.
- The dashboard should remain a control room: health, attribution, queue proof, diagnostics, client testing, and router API visibility.

Revisit this only if multiple good clients cannot expose the value of AudioMuse even through radio, AudioMuse-owned synced playlists, and OpenSubsonic endpoints.

## AudioMuse Owns Interactive Discovery

Decision: use NaviRouter as the handoff layer from AudioMuse to Navidrome, not as the place where users design discovery sessions.

Why:

- Users should be able to explore, tweak, and approve discovery results in AudioMuse's own UI.
- NaviRouter should only add router-specific behavior that AudioMuse's native export does not cover for a given workflow: client request adaptation, append/replace compatibility, diagnostics/attribution, or library-scope enforcement.
- This keeps generated playlists useful for clients that do not call similar-song APIs without turning NaviRouter into a competing app.

See [AudioMuse Boundary](audiomuse-boundary.md) before adding discovery features to NaviRouter.

## Setup Wizard

Decision: defer a setup wizard until the environment story is stable across more users.

Current setup should remain explicit `.env` plus Docker examples because NaviRouter handles credentials and upstream service URLs. A wizard would be useful later if repeated community installs show the same failure patterns around:

- Navidrome URL and allowlist setup.
- AudioMuse URL, token, and index readiness.
- Docker secret mounting.
- Navidrome database access for library-scope inference.

Until then, keep the dashboard read-only and avoid storing Navidrome usernames, passwords, or API tokens in browser storage.

## Client Profiles

Decision: do not add client-specific profiles until real compatibility testing proves a client needs one.

Profiles are useful only when a client has a documented quirk that NaviRouter can safely adapt to without weakening security or changing library metadata. The current default profile is the standard Subsonic/OpenSubsonic behavior.
