# Dashboard And Terminal Examples

Use the dashboard at:

```text
http://<navirouter-host>:8098/
```

The dashboard shows the same read-only state exposed by these JSON endpoints. The examples below are sanitized command-line checks from a local NaviRouter instance.

## Health

```bash
curl -fsS http://localhost:8098/api/health | jq '{
  ok,
  app,
  services,
  intercepts,
  router: {
    audioMuseSimilarity: .router.audioMuseSimilarity,
    lastRadioQueue: .router.lastRadioQueue,
    songCache: .router.songCache
  }
}'
```

Example shape:

```json
{
  "ok": true,
  "app": {
    "name": "NaviRouter",
    "version": "0.1.1",
    "subsonicApiVersion": "1.16.1",
    "node": "v25.9.0"
  },
  "services": {
    "navidrome": {
      "name": "navidrome",
      "ok": true,
      "status": 200,
      "latencyMs": 3
    },
    "audiomuse": {
      "name": "audiomuse",
      "ok": true,
      "status": 200,
      "latencyMs": 2
    }
  },
  "intercepts": [
    "getsimilarsongs",
    "getsimilarsongs2",
    "getsonicsimilartracks",
    "findsonicpath"
  ],
  "router": {
    "audioMuseSimilarity": {
      "ok": null,
      "checkedAt": null,
      "status": null,
      "errorCode": null,
      "message": "No AudioMuse similarity lookup has run yet."
    },
    "lastRadioQueue": {
      "ok": null,
      "at": null,
      "method": null,
      "seedId": null,
      "requestedLibraryId": null,
      "scopeSource": null,
      "returnedCount": 0,
      "songs": []
    },
    "songCache": {
      "enabled": true,
      "size": 0,
      "max": 5000,
      "ttlSeconds": 300,
      "hits": 0,
      "misses": 0,
      "writes": 0,
      "evictions": 0
    }
  }
}
```

## Router Status

```bash
curl -fsS http://localhost:8098/api/router/status | jq '{
  app,
  router: {
    totalRequests: .router.subsonicTraffic.total,
    recentMethods: .router.subsonicTraffic.recent,
    lastRadioQueue: .router.lastRadioQueue,
    playbackTraffic: .router.playbackTraffic
  }
}'
```

Use this while testing a client. If the client triggers radio through NaviRouter, recent methods should show `getsimilarsongs`, `getsimilarsongs2`, `getsonicsimilartracks`, or `findsonicpath`, and `lastRadioQueue.source` is visible in the dashboard.

## Config

```bash
curl -fsS http://localhost:8098/api/config | jq '{app, version, mode, routes, upstreams, intercepts}'
```

Example shape:

```json
{
  "app": "NaviRouter",
  "version": "0.1.1",
  "mode": "lan-vpn",
  "routes": {
    "subsonic": "/rest",
    "health": "/api/health",
    "status": "/api/router/status",
    "clientTestReport": "/api/router/client-test-report",
    "clientTestReset": "/api/router/client-test-reset",
    "version": "/api/version",
    "saveLastRadioPlaylist": "/api/router/last-radio/save-playlist",
    "saveGeneratedRadioPlaylist": "/api/router/radio-playlist",
    "syncAudioMusePlaylist": "/api/router/sync-playlist"
  },
  "upstreams": {
    "navidrome": "http://127.0.0.1:4533/",
    "audiomuse": "http://127.0.0.1:8000/"
  },
  "intercepts": [
    "getsimilarsongs",
    "getsimilarsongs2",
    "getsonicsimilartracks",
    "findsonicpath"
  ]
}
```

## Client Test Report

Use this after testing a real app against the live NaviRouter URL. It summarizes the redacted recent methods into the same evidence shape used by the fake client logger:

```bash
curl -fsS -X POST "http://localhost:8098/api/router/client-test-reset"
```

Then exercise the client and export the report:

```bash
curl -fsS "http://localhost:8098/api/router/client-test-report?client=Amperfy&format=markdown"
```

Paste the markdown into `docs/client-test-results.md` before marking a roadmap client complete. Change `client` to `Symfonium`, `Play:Sub`, or `Narjo` for those tests. The reset endpoint clears only NaviRouter's diagnostic/test buffers; it does not change music, playlists, upstream settings, or caches.

To let NaviRouter update the docs after reviewing a complete report:

```bash
npm run client:apply -- --client Amperfy --report /tmp/amperfy-report.md
npm run client:apply -- --client Amperfy --report /tmp/amperfy-report.md --write
```

The first command is a dry run. The second updates `docs/client-test-results.md` and both matching checklist entries in `docs/roadmap-todo.md`, but only when required evidence is present.
