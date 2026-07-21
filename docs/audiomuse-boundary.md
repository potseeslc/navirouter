# AudioMuse Boundary

NaviRouter should avoid duplicating AudioMuse-AI features.

## AudioMuse Owns

AudioMuse-AI already provides the interactive discovery surface:

- Clustering and automatic playlist generation.
- Instant playlists from text prompts.
- Music map exploration.
- Similar-song playlists.
- Song paths.
- Sonic fingerprint playlists.
- Song alchemy.
- CLAP/text search and lyrics search.
- Native media-server playlist creation.

The NaviRouter dashboard should not rebuild those workflows.

## NaviRouter Owns

NaviRouter should stay focused on router-specific work:

- Proxy normal Subsonic/OpenSubsonic traffic to Navidrome.
- Intercept client radio/similar calls and answer them with AudioMuse similarity.
- Preserve Navidrome library switching and scope where clients provide or imply it.
- Provide diagnostics that prove whether a client queue came from AudioMuse.
- Offer narrow playlist handoff APIs only when they add router-specific behavior, such as append/replace, library-scope enforcement, or compatibility through the NaviRouter URL.

## Redundancy Rule

Before adding a new NaviRouter feature, check whether AudioMuse already exposes it in its UI or API. If AudioMuse already owns the interactive workflow, NaviRouter should either document the existing AudioMuse path or add only the smallest adapter needed for existing Navidrome/Subsonic clients.
