import { createHash, createHmac, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  recommendation as clientTestRecommendation,
  summarizeCalls as summarizeClientCalls
} from './scripts/client-test-summary.mjs';

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('.', import.meta.url));
const publicDir = resolve(root, 'public');
const appName = 'NaviRouter';
const appVersion = '0.1.2';
const subsonicApiVersion = '1.16.1';
const port = Number(process.env.PORT || 8098);
const navidromeUrl = serviceUrl(process.env.NAVIDROME_URL || 'http://127.0.0.1:4533', 'NAVIDROME_URL');
const audiomuseUrl = serviceUrl(process.env.AUDIOMUSE_URL || 'http://127.0.0.1:8000', 'AUDIOMUSE_URL');
const audiomuseToken = secretValue('AUDIOMUSE_API_TOKEN', 'AUDIOMUSE_API_TOKEN_FILE');
const maxBodyBytes = boundedCount(process.env.NAVIROUTER_MAX_BODY_BYTES, 1_048_576, 1_024, 10_485_760);
const songCacheTtlMs = boundedCount(process.env.NAVIROUTER_SONG_CACHE_TTL_SECONDS, 300, 0, 86_400) * 1000;
const songCacheMax = boundedCount(process.env.NAVIROUTER_SONG_CACHE_MAX, 5000, 0, 100_000);
const resolveConcurrency = boundedCount(process.env.NAVIROUTER_RESOLVE_CONCURRENCY, 8, 1, 32);
const navidromeAllowedHosts = allowedHosts('NAVIROUTER_ALLOWED_NAVIDROME_HOSTS', navidromeUrl.host);
const audiomuseAllowedHosts = allowedHosts('NAVIROUTER_ALLOWED_AUDIOMUSE_HOSTS', audiomuseUrl.host);
const interceptedMethods = new Set(['getsimilarsongs', 'getsimilarsongs2', 'getsonicsimilartracks', 'findsonicpath']);
const musicFolderScopedMethods = new Set(['getalbumlist', 'getalbumlist2', 'getartists', 'getindexes', 'getrandomsongs', 'getstarred', 'getstarred2', 'search2', 'search3']);
const recentRequestsLimit = boundedCount(process.env.NAVIROUTER_RECENT_REQUESTS_LIMIT, 25, 0, 200);
const recentPlaybackLimit = boundedCount(process.env.NAVIROUTER_RECENT_PLAYBACK_LIMIT, 50, 0, 200);
const navidromeDbPath = String(process.env.NAVIDROME_DB_PATH || '').trim();
const navidromeDbContainer = String(process.env.NAVIDROME_DB_CONTAINER || '').trim();
const dockerCliPath = String(process.env.NAVIROUTER_DOCKER_CLI || '/usr/local/bin/docker').trim();
const webhookUrl = String(process.env.NAVIROUTER_WEBHOOK_URL || '').trim();
const webhookSecret = secretValue('NAVIROUTER_WEBHOOK_SECRET', 'NAVIROUTER_WEBHOOK_SECRET_FILE');
const webhookTimeoutMs = boundedCount(process.env.NAVIROUTER_WEBHOOK_TIMEOUT_MS, 3000, 250, 30000);
const webhookEvents = configuredWebhookEvents(process.env.NAVIROUTER_WEBHOOK_EVENTS);
const webhookQueueLimit = boundedCount(process.env.NAVIROUTER_WEBHOOK_QUEUE_MAX, 100, 1, 1000);
const fallbackResponseMaxBytes = boundedCount(process.env.NAVIROUTER_FALLBACK_RESPONSE_MAX_BYTES, 1_048_576, 1024, 10_485_760);
const radioQueueHistoryLimit = 100;
const radioQueueMaxAgeMs = boundedCount(process.env.NAVIROUTER_RADIO_CORRELATION_TTL_SECONDS, 21_600, 60, 604_800) * 1000;
const subsonicTraffic = {
  total: 0,
  byMethod: {},
  recent: []
};
const playbackTraffic = {
  recent: []
};
const webhookTraffic = {
  enabled: Boolean(webhookUrl),
  urlConfigured: Boolean(webhookUrl),
  events: [...webhookEvents],
  queueMax: webhookQueueLimit,
  pending: 0,
  dropped: 0,
  recent: []
};
const songCache = new Map();
const songLibraryCache = new Map();
const songCacheStats = {
  hits: 0,
  misses: 0,
  writes: 0,
  evictions: 0
};
let lastAudioMuseSimilarity = {
  ok: null,
  checkedAt: null,
  status: null,
  errorCode: null,
  message: 'No AudioMuse similarity lookup has run yet.'
};
let lastRadioQueue = {
  ok: null,
  at: null,
  method: null,
  seedId: null,
  requestedLibraryId: null,
  scopeSource: null,
  returnedCount: 0,
  playbackConfirmedAt: null,
  playbackConfirmedSong: null,
  songs: []
};
let radioQueueHistory = [];
let webhookDeliveryQueue = [];
let webhookDeliveryActive = false;
let lastRadioFailure = {
  ok: null,
  at: null,
  method: null,
  seedId: null,
  seed: null,
  requestedLibraryId: null,
  scopeSource: null,
  status: null,
  errorCode: null,
  message: 'No failed AudioMuse radio attempt has been recorded.'
};

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8']
]);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/api/health') {
      return sendJson(res, await health());
    }

    if (url.pathname === '/api/router/status') {
      return sendJson(res, await routerStatus());
    }

    if (url.pathname === '/api/router/client-test-report') {
      return sendClientTestReport(res, url);
    }

    if (url.pathname === '/api/router/client-test-reset') {
      return sendClientTestReset(req, res);
    }

    if (url.pathname === '/api/router/last-radio/save-playlist') {
      return await saveLastRadioPlaylist(req, res, url);
    }

    if (url.pathname === '/api/router/radio-playlist') {
      return await saveGeneratedRadioPlaylist(req, res, url);
    }

    if (url.pathname === '/api/router/sync-playlist') {
      return await syncAudioMusePlaylist(req, res, url);
    }

    if (url.pathname === '/api/version') {
      return sendJson(res, versionInfo());
    }

    if (url.pathname === '/api/config') {
      return sendJson(res, {
        app: appName,
        version: appVersion,
        mode: 'lan-vpn',
        routes: {
          subsonic: '/rest',
          health: '/api/health',
          status: '/api/router/status',
          clientTestReport: '/api/router/client-test-report',
          clientTestReset: '/api/router/client-test-reset',
          version: '/api/version',
          saveLastRadioPlaylist: '/api/router/last-radio/save-playlist',
          saveGeneratedRadioPlaylist: '/api/router/radio-playlist',
          syncAudioMusePlaylist: '/api/router/sync-playlist'
        },
        upstreams: {
          navidrome: publicServiceUrl(navidromeUrl.href),
          audiomuse: publicServiceUrl(audiomuseUrl.href)
        },
        intercepts: [...interceptedMethods],
        webhooks: {
          enabled: Boolean(webhookUrl),
          events: [...webhookEvents],
          signature: webhookSecret ? 'hmac-sha256' : 'none',
          timeoutMs: webhookTimeoutMs,
          queueMax: webhookQueueLimit
        }
      });
    }

    const scopedPath = scopedSubsonicPath(url.pathname);
    if (scopedPath) {
      url.pathname = scopedPath.pathname;
      return await handleSubsonic(req, res, url, scopedPath.libraryId);
    }

    return serveStatic(res, url.pathname);
  } catch (error) {
    logRequestError(error);
    const format = requestedFormatFromUrl(req?.url || '') || 'json';
    return sendSubsonicError(res, format, error.status || 500, 0, publicError(error));
  }
});

if (process.env.NODE_ENV !== 'test') {
  assertAllowedServiceUrl(navidromeUrl, navidromeAllowedHosts, 'Navidrome');
  assertAllowedServiceUrl(audiomuseUrl, audiomuseAllowedHosts, 'AudioMuse');
  server.listen(port, '0.0.0.0', () => {
    console.log(`${appName} ${appVersion} listening on http://0.0.0.0:${port}`);
  });
  installGracefulShutdown(server);
}

function installGracefulShutdown(httpServer, runtime = process) {
  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${appName} received ${signal}; shutting down.`);
    httpServer.close((error) => {
      if (error) {
        console.error(`${appName} shutdown failed: ${redactText(error.message)}`);
        runtime.exitCode = 1;
        return;
      }
      console.log(`${appName} shutdown complete.`);
    });
  };

  runtime.once('SIGTERM', () => shutdown('SIGTERM'));
  runtime.once('SIGINT', () => shutdown('SIGINT'));
  return shutdown;
}

async function handleSubsonic(req, res, url, libraryId = null) {
  const bodyParams = await bodySearchParams(req);
  const params = mergedParams(url.searchParams, bodyParams);
  const method = subsonicMethod(url.pathname);
  applyLibraryScope(params, method, libraryId);
  const requestedLibraryId = selectedLibraryId(params, libraryId);
  const format = responseFormat(params);
  recordSubsonicRequest(method, params, libraryId, requestedLibraryId);

  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'HEAD') {
    return sendSubsonicError(res, format, 405, 0, 'Method Not Allowed');
  }

  if (method === 'getmusicfolders' && libraryId) {
    return sendSubsonicResponse(res, format, await scopedMusicFolders(params, libraryId));
  }

  if (method === 'getopensubsonicextensions') {
    return sendSubsonicResponse(res, format, openSubsonicExtensionsResponse());
  }

  if (interceptedMethods.has(method)) {
    const intercepted = await interceptSubsonicMethod(req, params, method, format, requestedLibraryId);
    if (intercepted?.routerFallback) {
      return proxyNavidrome(req, res, url, params, bodyParams, {
        radioFallback: intercepted.radioFailure
      });
    }
    if (intercepted) return sendSubsonicResponse(res, format, intercepted);
  }

  return proxyNavidrome(req, res, url, params, bodyParams);
}

async function interceptSubsonicMethod(req, params, method, format, libraryId = null) {
  if (method === 'getsonicsimilartracks') {
    return audioMuseSonicSimilarTracks(params, format, libraryId);
  }
  if (method === 'findsonicpath') {
    return audioMuseFindSonicPath(params, format, libraryId);
  }
  return audioMuseSimilarSongs(req, params, method, format, libraryId);
}

async function audioMuseSimilarSongs(req, params, method, format, libraryId = null) {
  const seedId = params.get('id');
  if (!seedId) return subsonicFailure(format, 10, 'Required parameter id is missing');

  const count = boundedCount(params.get('count'), 50, 1, 100);
  const radio = await resolveAudioMuseRadioSongs(seedId, count, params, libraryId);
  if (!radio) return null;
  if (radio.failed) {
    const radioFailure = await recordRadioFailure(method, seedId, params, radio.scope, radio);
    return { routerFallback: true, radioFailure };
  }

  recordRadioQueue(method, seedId, radio.scope.libraryId, radio.scope.source, radio.songs, params, req);
  const key = method === 'getsimilarsongs2' ? 'similarSongs2' : 'similarSongs';
  return {
    status: 'ok',
    version: subsonicApiVersion,
    type: appName,
    serverVersion: appVersion,
    openSubsonic: true,
    [key]: { song: radio.songs }
  };
}

async function resolveAudioMuseRadioSongs(seedId, count, params, libraryId = null) {
  const scope = await audioMuseLibraryScope(seedId, libraryId);
  if (scope.blocked) {
    return {
      failed: true,
      scope,
      status: null,
      errorCode: 'scope_blocked',
      message: 'AudioMuse radio seed is outside the selected Navidrome library scope.'
    };
  }
  const audioMuseCandidates = await fetchAudioMuseSimilar(seedId, count);
  if (!audioMuseCandidates) {
    const artistRadio = await resolveAudioMuseArtistRadioSongs(seedId, count, params, scope);
    if (artistRadio) return artistRadio;
    return {
      failed: true,
      scope,
      status: lastAudioMuseSimilarity.status,
      errorCode: lastAudioMuseSimilarity.errorCode,
      message: lastAudioMuseSimilarity.message
    };
  }

  const songs = await resolveCandidateSongs(audioMuseCandidates, params, {
    libraryId: scope.libraryId,
    excludedIds: new Set([seedId]),
    limit: count
  });

  if (songs.length === 0) {
    return {
      failed: true,
      scope,
      status: lastAudioMuseSimilarity.status,
      errorCode: 'no_resolved_candidates',
      message: 'AudioMuse returned candidates, but none could be resolved in Navidrome.'
    };
  }

  return { scope, songs };
}

async function resolveAudioMuseArtistRadioSongs(artistId, count, params, scope) {
  const artist = await fetchNavidromeArtist(artistId, params);
  if (!artist?.name) return null;

  const artistTracks = await fetchAudioMuseArtistTracks(artist.name);
  if (!artistTracks.length) {
    return {
      failed: true,
      scope: { ...scope, source: scope.source === 'global' ? 'artist' : scope.source },
      status: 404,
      errorCode: 'artist_tracks_missing',
      message: `AudioMuse does not have analyzed tracks for artist ${artist.name}.`
    };
  }

  const seedTracks = artistTracks.slice(0, Math.min(6, artistTracks.length));
  const similarLists = await Promise.all(seedTracks.map((track) => fetchAudioMuseSimilar(track.item_id, Math.max(10, Math.ceil(count / seedTracks.length) + 8))));
  const candidates = [];
  for (const track of artistTracks.slice(0, Math.min(count, 12))) {
    candidates.push({ item_id: track.item_id });
  }
  for (const list of similarLists) {
    if (!list) continue;
    candidates.push(...list);
  }

  const songs = await resolveCandidateSongs(candidates, params, {
    libraryId: scope.libraryId,
    limit: count
  });

  if (songs.length === 0) {
    return {
      failed: true,
      scope: { ...scope, source: scope.source === 'global' ? 'artist' : scope.source },
      status: 404,
      errorCode: 'artist_radio_unresolved',
      message: `AudioMuse found artist tracks for ${artist.name}, but NaviRouter could not resolve an Artist Radio queue.`
    };
  }

  return {
    scope: { ...scope, source: scope.source === 'global' ? 'artist' : scope.source },
    songs
  };
}

async function audioMuseSonicSimilarTracks(params, format, libraryId = null) {
  const seedId = params.get('id');
  if (!seedId) return subsonicFailure(format, 10, 'Required parameter id is missing');

  const count = boundedCount(params.get('count'), 10, 1, 100);
  const scope = await audioMuseLibraryScope(seedId, libraryId);
  if (scope.blocked) return null;
  const audioMuseCandidates = await fetchAudioMuseSimilar(seedId, count);
  if (!audioMuseCandidates) return null;

  const sonicMatch = await resolveCandidateSongs(audioMuseCandidates, params, {
    libraryId: scope.libraryId,
    excludedIds: new Set([seedId]),
    limit: count,
    map: ({ candidate, song }) => ({
      entry: song,
      similarity: similarityFromDistance(candidate?.distance)
    })
  });

  return {
    status: 'ok',
    version: subsonicApiVersion,
    type: appName,
    serverVersion: appVersion,
    openSubsonic: true,
    sonicMatch
  };
}

async function audioMuseFindSonicPath(params, format, libraryId = null) {
  const startSongId = params.get('startSongId');
  const endSongId = params.get('endSongId');
  if (!startSongId) return subsonicFailure(format, 10, 'Required parameter startSongId is missing');
  if (!endSongId) return subsonicFailure(format, 10, 'Required parameter endSongId is missing');

  const requestedCount = boundedCount(params.get('count'), 25, 1, 100);
  const pathCount = startSongId === endSongId ? 1 : Math.max(2, requestedCount);
  const [startSong, endSong] = await Promise.all([
    fetchNavidromeSong(startSongId, params),
    startSongId === endSongId ? Promise.resolve(null) : fetchNavidromeSong(endSongId, params)
  ]);

  if (!startSong || (startSongId !== endSongId && !endSong)) {
    return subsonicFailure(format, 70, 'Could not resolve sonic path endpoints');
  }
  const scope = await audioMuseLibraryScope(startSongId, libraryId);
  if (scope.blocked || !(await canUseAudioMuseForLibrary(endSongId, scope.libraryId))) return null;

  const bridgeLimit = Math.max(0, pathCount - 2);
  const [startCandidates, endCandidates] = bridgeLimit > 0
    ? await Promise.all([
        fetchAudioMuseSimilar(startSongId, bridgeLimit * 2),
        fetchAudioMuseSimilar(endSongId, bridgeLimit * 2)
      ])
    : [[], []];
  if (!startCandidates || !endCandidates) return null;

  const sonicMatch = [{ entry: startSong, similarity: 1 }];
  const seen = new Set([startSongId, endSongId]);
  const bridgeCandidates = rankedSonicBridgeCandidates(startCandidates, endCandidates, seen, bridgeLimit);
  const bridgeMatches = await resolveCandidateSongs(bridgeCandidates, params, {
    libraryId: scope.libraryId,
    excludedIds: seen,
    limit: pathCount - 2,
    map: ({ candidate, song }) => ({
      entry: song,
      similarity: candidate.similarity
    })
  });
  sonicMatch.push(...bridgeMatches);
  if (endSong) sonicMatch.push({ entry: endSong, similarity: 1 });

  return {
    status: 'ok',
    version: subsonicApiVersion,
    type: appName,
    serverVersion: appVersion,
    openSubsonic: true,
    sonicMatch
  };
}

function rankedSonicBridgeCandidates(startCandidates, endCandidates, excludedIds, limit) {
  const byId = new Map();
  let order = 0;

  for (const candidate of startCandidates) {
    const id = candidate?.item_id || candidate?.id;
    if (!id || excludedIds.has(id)) continue;
    const entry = byId.get(id) || { id, order: order += 1 };
    entry.startSimilarity = similarityFromDistance(candidate?.distance);
    byId.set(id, entry);
  }

  for (const candidate of endCandidates) {
    const id = candidate?.item_id || candidate?.id;
    if (!id || excludedIds.has(id)) continue;
    const entry = byId.get(id) || { id, order: order += 1 };
    entry.endSimilarity = similarityFromDistance(candidate?.distance);
    byId.set(id, entry);
  }

  return [...byId.values()]
    .map((candidate) => {
      const startSimilarity = candidate.startSimilarity ?? null;
      const endSimilarity = candidate.endSimilarity ?? null;
      const similarities = [startSimilarity, endSimilarity].filter((value) => value !== null);
      const bothSides = similarities.length === 2;
      const average = similarities.reduce((sum, value) => sum + value, 0) / similarities.length;
      return {
        id: candidate.id,
        order: candidate.order,
        score: bothSides ? average + 0.1 : average * 0.75,
        similarity: bothSides ? Math.min(startSimilarity, endSimilarity) : average
      };
    })
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .slice(0, limit);
}

async function fetchAudioMuseSimilar(itemId, count) {
  const url = new URL(serviceEndpoint(audiomuseUrl, '/api/similar_tracks'));
  url.searchParams.set('item_id', itemId);
  url.searchParams.set('n', String(count + 8));
  url.searchParams.set('eliminate_duplicates', 'true');
  url.searchParams.set('mood_similarity', 'true');

  try {
    const response = await fetch(url, {
      headers: audiomuseAuthHeaders(),
      signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) {
      await recordAudioMuseSimilarityFailure(response);
      console.warn(`AudioMuse similar lookup failed with ${response.status}; falling back to Navidrome.`);
      return null;
    }
    const payload = await response.json();
    const candidates = normalizeAudioMuseCandidates(payload);
    recordAudioMuseSimilaritySuccess(response.status, candidates.length);
    return candidates;
  } catch (error) {
    recordAudioMuseSimilarityError(error);
    console.warn(`AudioMuse similar lookup failed: ${redactText(error.message)}; falling back to Navidrome.`);
    return null;
  }
}

async function fetchNavidromeSong(id, clientParams) {
  const cacheKey = songCacheKey(id, clientParams);
  const cached = getCachedSong(cacheKey);
  if (cached) return cached;

  const url = navidromeEndpoint('/rest/getSong.view', withClientAuth(clientParams, { id, f: 'json' }));
  try {
    const response = await fetch(url, { headers: navidromeRequestHeaders({}), signal: AbortSignal.timeout(6000) });
    const parsed = await parseSubsonicJson(response);
    const song = parsed.song || null;
    if (song) setCachedSong(cacheKey, song);
    return song;
  } catch (error) {
    console.warn(`Could not resolve AudioMuse candidate ${redactId(id)} in Navidrome: ${redactText(error.message)}`);
    return null;
  }
}

async function fetchNavidromeArtist(id, clientParams) {
  const url = navidromeEndpoint('/rest/getArtist.view', withClientAuth(clientParams, { id, f: 'json' }));
  try {
    const response = await fetch(url, { headers: navidromeRequestHeaders({}), signal: AbortSignal.timeout(6000) });
    const parsed = await parseSubsonicJson(response);
    return parsed.artist || null;
  } catch (error) {
    console.warn(`Could not resolve Artist Radio seed ${redactId(id)} in Navidrome: ${redactText(error.message)}`);
    return null;
  }
}

async function fetchAudioMuseArtistTracks(artistName) {
  const url = new URL(serviceEndpoint(audiomuseUrl, '/api/artist_tracks'));
  url.searchParams.set('artist', artistName);

  try {
    const response = await fetch(url, {
      headers: audiomuseAuthHeaders(),
      signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) {
      console.warn(`AudioMuse artist track lookup failed with ${response.status} for ${redactText(artistName)}.`);
      return [];
    }
    const payload = await response.json();
    return Array.isArray(payload) ? payload.filter((track) => track?.item_id) : [];
  } catch (error) {
    console.warn(`AudioMuse artist track lookup failed for ${redactText(artistName)}: ${redactText(error.message)}`);
    return [];
  }
}

async function resolveCandidateSongs(candidates, params, options = {}) {
  const {
    libraryId = null,
    excludedIds = new Set(),
    limit = 50,
    map = ({ song }) => song
  } = options;
  const seen = new Set(excludedIds);
  const normalized = [];

  for (const candidate of candidates || []) {
    const id = candidateId(candidate);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push({ id, candidate });
  }

  const resolved = [];
  for (let offset = 0; offset < normalized.length && resolved.length < limit; offset += resolveConcurrency) {
    const batch = normalized.slice(offset, offset + resolveConcurrency);
    const batchResults = await mapWithConcurrency(batch, resolveConcurrency, async ({ id, candidate }) => {
      if (!(await candidateAllowedForLibrary(id, libraryId))) return null;
      const song = await fetchNavidromeSong(id, params);
      return song ? map({ id, candidate, song }) : null;
    });
    for (const item of batchResults) {
      if (item) resolved.push(item);
      if (resolved.length >= limit) break;
    }
  }

  return resolved;
}

function candidateId(candidate) {
  if (candidate === undefined || candidate === null) return '';
  if (typeof candidate === 'object') {
    return String(candidate.item_id || candidate.itemId || candidate.trackId || candidate.songId || candidate.id || '').trim();
  }
  return String(candidate).trim();
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let index = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }));
  return results;
}

async function saveLastRadioPlaylist(req, res, url) {
  if (req.method !== 'POST') return sendJson(res, { ok: false, error: 'Method Not Allowed' }, 405);
  if (!lastRadioQueue.ok || lastRadioQueue.songs.length === 0) {
    return sendJson(res, { ok: false, error: 'No AudioMuse radio queue is available yet.' }, 409);
  }

  try {
    const bodyParams = await apiRequestParams(req);
    const params = mergedParams(url.searchParams, bodyParams);
    const auth = withClientAuth(params, { f: 'json' });
    if (!auth.has('u') || (!auth.has('p') && (!auth.has('t') || !auth.has('s')))) {
      return sendJson(res, { ok: false, error: 'Navidrome auth is required.' }, 401);
    }

    const seedSong = await fetchNavidromeSong(lastRadioQueue.seedId, auth);
    const songIds = lastRadioQueue.songs.map((song) => song.id);
    const mode = playlistMode(params.get('mode'), params.get('playlistId'));
    const fallbackName = playlistName(seedSong?.title || lastRadioQueue.seedId, params.get('name'));
    const playlist = mode === 'create'
      ? await createNavidromePlaylist(fallbackName, songIds, auth)
      : await updateNavidromePlaylist(params.get('playlistId'), fallbackName, songIds, auth, mode);
    return sendJson(res, {
      ok: true,
      playlist: {
        name: fallbackName,
        id: playlist.playlist?.id || playlist.id || null,
        songCount: lastRadioQueue.songs.length,
        mode,
        source: 'AudioMuse',
        seed: publicSongSummary(seedSong || { id: lastRadioQueue.seedId })
      }
    });
  } catch (error) {
    console.warn(`Could not save AudioMuse radio playlist: ${redactText(error.message)}`);
    return sendJson(res, { ok: false, error: publicError(error) }, error.status || 500);
  }
}

async function saveGeneratedRadioPlaylist(req, res, url) {
  if (req.method !== 'POST') return sendJson(res, { ok: false, error: 'Method Not Allowed' }, 405);

  try {
    const bodyParams = await apiRequestParams(req);
    const params = mergedParams(url.searchParams, bodyParams);
    const auth = withClientAuth(params, { f: 'json' });
    if (!auth.has('u') || (!auth.has('p') && (!auth.has('t') || !auth.has('s')))) {
      return sendJson(res, { ok: false, error: 'Navidrome auth is required.' }, 401);
    }

    const seedId = params.get('seedId') || params.get('id');
    if (!seedId) return sendJson(res, { ok: false, error: 'seedId or id is required.' }, 400);

    const count = boundedCount(params.get('count'), 50, 1, 100);
    const requestedLibraryId = selectedLibraryId(params);
    const radio = await resolveAudioMuseRadioSongs(seedId, count, auth, requestedLibraryId);
    if (!radio) {
      return sendJson(res, { ok: false, error: 'AudioMuse radio generation is unavailable for that seed.' }, 502);
    }
    if (radio.failed) {
      await recordRadioFailure('generatedplaylist', seedId, auth, radio.scope, radio);
      return sendJson(res, { ok: false, error: radio.message || 'AudioMuse radio generation is unavailable for that seed.' }, radio.status || 502);
    }
    if (radio.songs.length === 0) {
      return sendJson(res, { ok: false, error: 'AudioMuse did not return any Navidrome-resolvable songs for that seed.' }, 409);
    }

    const seedSong = await fetchNavidromeSong(seedId, auth);
    const songIds = radio.songs.map((song) => song.id);
    const mode = playlistMode(params.get('mode'), params.get('playlistId'));
    const fallbackName = playlistName(seedSong?.title || seedId, params.get('name'));
    const playlist = mode === 'create'
      ? await createNavidromePlaylist(fallbackName, songIds, auth)
      : await updateNavidromePlaylist(params.get('playlistId'), fallbackName, songIds, auth, mode);

    recordRadioQueue('generatedplaylist', seedId, radio.scope.libraryId, radio.scope.source, radio.songs, auth, req);
    return sendJson(res, {
      ok: true,
      playlist: {
        name: fallbackName,
        id: playlist.playlist?.id || playlist.id || null,
        songCount: radio.songs.length,
        mode,
        source: 'AudioMuse',
        seed: publicSongSummary(seedSong || { id: seedId }),
        requestedLibraryId: radio.scope.libraryId,
        scopeSource: radio.scope.source
      }
    });
  } catch (error) {
    console.warn(`Could not save generated AudioMuse radio playlist: ${redactText(error.message)}`);
    return sendJson(res, { ok: false, error: publicError(error) }, error.status || 500);
  }
}

async function syncAudioMusePlaylist(req, res, url) {
  if (req.method !== 'POST') return sendJson(res, { ok: false, error: 'Method Not Allowed' }, 405);

  try {
    const { params: bodyParams, payload } = await apiRequestPayload(req);
    const params = mergedParams(url.searchParams, bodyParams);
    const auth = withClientAuth(params, { f: 'json' });
    if (!auth.has('u') || (!auth.has('p') && (!auth.has('t') || !auth.has('s')))) {
      return sendJson(res, { ok: false, error: 'Navidrome auth is required.' }, 401);
    }

    const requestedLibraryId = selectedLibraryId(params);
    const songIds = playlistSyncSongIds(params, payload);
    if (songIds.length === 0) {
      return sendJson(res, { ok: false, error: 'At least one songId, trackId, item_id, or track entry is required.' }, 400);
    }

    const candidates = songIds.map((id) => ({ id }));
    const songs = await resolveCandidateSongs(candidates, auth, {
      libraryId: requestedLibraryId,
      limit: 500
    });
    const skippedCount = songIds.length - songs.length;

    if (songs.length === 0) {
      return sendJson(res, { ok: false, error: 'No provided tracks could be resolved in Navidrome.' }, 409);
    }

    const mode = playlistMode(params.get('mode'), params.get('playlistId'));
    const fallbackName = syncPlaylistName(params.get('name'));
    const resolvedSongIds = songs.map((song) => song.id);
    const playlist = mode === 'create'
      ? await createNavidromePlaylist(fallbackName, resolvedSongIds, auth)
      : await updateNavidromePlaylist(params.get('playlistId'), fallbackName, resolvedSongIds, auth, mode);

    return sendJson(res, {
      ok: true,
      playlist: {
        name: fallbackName,
        id: playlist.playlist?.id || playlist.id || null,
        songCount: songs.length,
        skippedCount,
        mode,
        source: 'AudioMuse',
        requestedLibraryId
      }
    });
  } catch (error) {
    console.warn(`Could not sync AudioMuse playlist: ${redactText(error.message)}`);
    return sendJson(res, { ok: false, error: publicError(error) }, error.status || 500);
  }
}

async function createNavidromePlaylist(name, songIds, authParams) {
  const params = withClientAuth(authParams, { name, f: 'json' });
  for (const id of songIds) params.append('songId', id);
  const url = navidromeEndpointWithRepeatedParams('/rest/createPlaylist.view', params);
  const response = await fetch(url, {
    headers: navidromeRequestHeaders({}),
    signal: AbortSignal.timeout(15000)
  });
  return parseSubsonicJson(response);
}

async function updateNavidromePlaylist(playlistId, name, songIds, authParams, mode) {
  if (!playlistId) {
    const error = new Error('playlistId is required for append or replace mode.');
    error.status = 400;
    throw error;
  }

  if (mode === 'replace') {
    const existing = await fetchNavidromePlaylist(playlistId, authParams);
    const existingSongs = existing.playlist?.entry || [];
    const removeParams = withClientAuth(authParams, { playlistId, f: 'json' });
    for (let index = existingSongs.length - 1; index >= 0; index -= 1) {
      removeParams.append('songIndexToRemove', String(index));
    }
    if (name) removeParams.set('name', name);
    if (existingSongs.length > 0 || name) await callNavidromeUpdatePlaylist(removeParams);
  }

  const addParams = withClientAuth(authParams, { playlistId, f: 'json' });
  if (mode === 'append' && name) addParams.set('name', name);
  for (const id of songIds) addParams.append('songIdToAdd', id);
  const updated = await callNavidromeUpdatePlaylist(addParams);
  return updated.playlist ? updated : fetchNavidromePlaylist(playlistId, authParams);
}

async function fetchNavidromePlaylist(playlistId, authParams) {
  const params = withClientAuth(authParams, { id: playlistId, f: 'json' });
  const url = navidromeEndpoint('/rest/getPlaylist.view', params);
  const response = await fetch(url, {
    headers: navidromeRequestHeaders({}),
    signal: AbortSignal.timeout(15000)
  });
  return parseSubsonicJson(response);
}

async function callNavidromeUpdatePlaylist(params) {
  const url = navidromeEndpointWithRepeatedParams('/rest/updatePlaylist.view', params);
  const response = await fetch(url, {
    headers: navidromeRequestHeaders({}),
    signal: AbortSignal.timeout(15000)
  });
  return parseSubsonicJson(response);
}

function playlistMode(value, playlistId) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'append' || mode === 'replace') return mode;
  return playlistId ? 'replace' : 'create';
}

function playlistName(seedTitle, requestedName = '') {
  const explicit = String(requestedName || '').trim();
  if (explicit) return explicit.slice(0, 160);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `AudioMuse Radio - ${String(seedTitle || 'Unknown Seed').slice(0, 80)} - ${stamp}`;
}

function syncPlaylistName(requestedName = '') {
  const explicit = String(requestedName || '').trim();
  if (explicit) return explicit.slice(0, 160);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `AudioMuse Sync - ${stamp}`;
}

function playlistSyncSongIds(params, payload = null) {
  const ids = [];
  const pushId = (value) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      for (const item of value) pushId(item);
      return;
    }
    if (typeof value === 'object') {
      pushId(value.songId || value.trackId || value.item_id || value.itemId || value.id);
      return;
    }
    const text = String(value).trim();
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        pushId(JSON.parse(text));
        return;
      } catch {
        return;
      }
    }
    for (const part of text.split(',')) {
      const id = part.trim();
      if (id) ids.push(id);
    }
  };

  for (const key of ['songId', 'songIds', 'trackId', 'trackIds', 'item_id', 'itemIds']) {
    for (const value of params.getAll(key)) pushId(value);
  }

  if (payload && typeof payload === 'object') {
    for (const key of ['songId', 'songIds', 'trackId', 'trackIds', 'item_id', 'itemIds', 'tracks', 'songs', 'items', 'candidates']) {
      pushId(payload[key]);
    }
  }

  return [...new Set(ids)].slice(0, 500);
}

async function proxyNavidrome(req, res, originalUrl, params, bodyParams, options = {}) {
  const pathname = originalUrl.pathname.replace(/^\/rest\//, '/rest/');
  const method = subsonicMethod(pathname);
  const playbackEvent = recordPlaybackRequest(method, params, req);
  const upstreamUrl = navidromeEndpoint(pathname, params);
  const headers = navidromeRequestHeaders(req);
  const init = {
    method: req.method,
    headers,
    signal: AbortSignal.timeout(120000)
  };

  if (req.method === 'POST') {
    init.headers = {
      ...headers,
      'content-type': 'application/x-www-form-urlencoded'
    };
    init.body = bodyParams.toString();
  }

  const response = await fetch(upstreamUrl, init);
  recordPlaybackResponse(playbackEvent, response, req);
  if (options.radioFallback) {
    const body = await readBoundedResponseBody(response, fallbackResponseMaxBytes);
    const accepted = response.ok && subsonicResponseSucceeded(
      body,
      response.headers.get('content-type')
    );
    if (accepted) {
      emitRouterEvent('radio.fallback', {
        radioFailure: options.radioFallback,
        fallback: {
          service: 'Navidrome',
          status: response.status
        }
      });
    }
    res.writeHead(response.status, responseHeaders(response));
    finishPlaybackResponse(playbackEvent, true);
    return res.end(body);
  }

  res.writeHead(response.status, responseHeaders(response));
  if (req.method === 'HEAD') {
    finishPlaybackResponse(playbackEvent, true);
    return res.end();
  }
  if (!response.body) {
    finishPlaybackResponse(playbackEvent, true);
    return res.end();
  }

  const upstreamStream = Readable.fromWeb(response.body);
  let clientClosed = false;
  const onClientClose = () => {
    if (res.writableEnded) return;
    clientClosed = true;
    finishPlaybackResponse(playbackEvent, false, 'Client closed stream before completion');
    upstreamStream.destroy();
  };
  res.once('close', onClientClose);
  res.once('finish', () => finishPlaybackResponse(playbackEvent, true));

  try {
    for await (const chunk of upstreamStream) {
      if (clientClosed || res.destroyed) break;
      const canContinue = res.write(chunk, (error) => {
        if (!error && !clientClosed && !res.destroyed) countPlaybackBytes(playbackEvent, chunk);
      });
      if (!canContinue) await waitForResponseDrain(res);
    }
    if (!clientClosed && !res.writableEnded) res.end();
  } catch (error) {
    if (clientClosed) return;
    finishPlaybackResponse(playbackEvent, false, publicError(error));
    console.error(`Navidrome stream failed: ${publicError(error)}`);
    if (!res.destroyed) res.destroy(error);
  } finally {
    res.off('close', onClientClose);
  }
}

function waitForResponseDrain(res) {
  return new Promise((resolve, reject) => {
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error('Client closed stream before completion'));
    };
    const cleanup = () => {
      res.off('drain', onDrain);
      res.off('close', onClose);
    };
    res.once('drain', onDrain);
    res.once('close', onClose);
  });
}

function navidromeEndpoint(pathname, params) {
  const url = new URL(serviceEndpoint(navidromeUrl, pathname));
  for (const [key, value] of params.entries()) {
    url.searchParams.set(key, value);
  }
  return url.href;
}

function navidromeEndpointWithRepeatedParams(pathname, params) {
  const url = new URL(serviceEndpoint(navidromeUrl, pathname));
  for (const [key, value] of params.entries()) {
    url.searchParams.append(key, value);
  }
  return url.href;
}

function withClientAuth(clientParams, additions = {}) {
  const next = new URLSearchParams();
  for (const key of ['u', 'p', 't', 's', 'v', 'c']) {
    const value = clientParams.get(key);
    if (value) next.set(key, value);
  }
  for (const [key, value] of Object.entries(additions)) {
    if (value !== undefined && value !== null) next.set(key, String(value));
  }
  if (!next.has('v')) next.set('v', subsonicApiVersion);
  if (!next.has('c')) next.set('c', appName);
  return next;
}

function navidromeRequestHeaders(req) {
  const headers = {};
  const range = req.headers?.range;
  if (range) headers.Range = range;
  const authorization = req.headers?.authorization;
  if (authorization) headers.Authorization = authorization;
  return headers;
}

async function parseSubsonicJson(response) {
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    const error = new Error('Navidrome returned non-JSON while resolving song');
    error.status = 502;
    throw error;
  }
  const subsonic = payload['subsonic-response'];
  if (!response.ok || !subsonic || subsonic.status === 'failed') {
    const error = new Error('Navidrome song resolution failed');
    error.status = 502;
    throw error;
  }
  return subsonic;
}

function sendSubsonicResponse(res, format, body, status = 200) {
  if (format === 'xml') {
    res.writeHead(status, {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    });
    return res.end(subsonicXml(body));
  }

  return sendJson(res, { 'subsonic-response': body }, status);
}

function sendSubsonicError(res, format, status, code, message) {
  return sendSubsonicResponse(res, format, {
    status: 'failed',
    version: subsonicApiVersion,
    type: appName,
    serverVersion: appVersion,
    openSubsonic: true,
    error: {
      code,
      message
    }
  }, status);
}

function subsonicFailure(format, code, message) {
  return {
    status: 'failed',
    version: subsonicApiVersion,
    type: appName,
    serverVersion: appVersion,
    openSubsonic: true,
    error: { code, message },
    _format: format
  };
}

function openSubsonicExtensionsResponse() {
  return {
    status: 'ok',
    version: subsonicApiVersion,
    type: appName,
    serverVersion: appVersion,
    openSubsonic: true,
    openSubsonicExtensions: [
      { name: 'sonicSimilarity', versions: [1] },
      { name: 'formPost', versions: [1] }
    ]
  };
}

function subsonicXml(body) {
  const attrs = [
    ['xmlns', 'http://subsonic.org/restapi'],
    ['status', body.status],
    ['version', body.version || subsonicApiVersion],
    ['type', body.type || appName],
    ['serverVersion', body.serverVersion || appVersion],
    ['openSubsonic', body.openSubsonic ? 'true' : 'false']
  ].map(([key, value]) => `${key}="${xmlEscape(value)}"`).join(' ');

  if (body.status === 'failed') {
    return `<?xml version="1.0" encoding="UTF-8"?><subsonic-response ${attrs}><error code="${xmlEscape(body.error?.code || 0)}" message="${xmlEscape(body.error?.message || 'Request failed')}"/></subsonic-response>`;
  }

  if (body.openSubsonicExtensions) {
    const extensions = body.openSubsonicExtensions.map((extension) => {
      const versions = (extension.versions || []).map((version) => `<version>${xmlEscape(version)}</version>`).join('');
      return `<openSubsonicExtension name="${xmlEscape(extension.name)}">${versions}</openSubsonicExtension>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?><subsonic-response ${attrs}><openSubsonicExtensions>${extensions}</openSubsonicExtensions></subsonic-response>`;
  }

  if (body.musicFolders) {
    const folders = body.musicFolders.musicFolder || [];
    const folderXml = folders.map((folder) => `<musicFolder id="${xmlEscape(folder.id)}" name="${xmlEscape(folder.name)}"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?><subsonic-response ${attrs}><musicFolders>${folderXml}</musicFolders></subsonic-response>`;
  }

  if (body.sonicMatch) {
    const matches = body.sonicMatch.map((match) => {
      const similarity = Number.isFinite(match.similarity) ? match.similarity : 0;
      return `<sonicMatch similarity="${xmlEscape(similarity)}"><entry ${songAttributes(match.entry || {})}/></sonicMatch>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?><subsonic-response ${attrs}>${matches}</subsonic-response>`;
  }

  const collectionKey = body.similarSongs2 ? 'similarSongs2' : 'similarSongs';
  const songs = body[collectionKey]?.song || [];
  const songXml = songs.map((song) => `<song ${songAttributes(song)}/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><subsonic-response ${attrs}><${collectionKey}>${songXml}</${collectionKey}></subsonic-response>`;
}

function similarityFromDistance(distance) {
  const numeric = Number(distance);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, 1 - numeric));
}

function songAttributes(song) {
  const fields = ['id', 'parent', 'isDir', 'title', 'album', 'artist', 'track', 'year', 'genre', 'coverArt', 'size', 'contentType', 'suffix', 'duration', 'bitRate', 'path', 'albumId', 'artistId', 'type', 'created'];
  return fields
    .filter((field) => song[field] !== undefined && song[field] !== null)
    .map((field) => `${field}="${xmlEscape(song[field])}"`)
    .join(' ');
}

function responseFormat(params) {
  return String(params.get('f') || '').toLowerCase() === 'json' ? 'json' : 'xml';
}

function requestedFormatFromUrl(value) {
  try {
    return responseFormat(new URL(value, 'http://localhost').searchParams);
  } catch {
    return 'json';
  }
}

async function bodySearchParams(req) {
  if (req.method !== 'POST') return new URLSearchParams();
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error('Request body is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  return new URLSearchParams(body);
}

async function apiRequestParams(req) {
  return (await apiRequestPayload(req)).params;
}

async function apiRequestPayload(req) {
  if (req.method !== 'POST') return { params: new URLSearchParams(), payload: null };
  const body = await readRequestBody(req);
  const params = new URLSearchParams();
  if (!body) return { params, payload: null };

  const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const payload = JSON.parse(body);
    for (const [key, value] of Object.entries(payload || {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) params.append(key, typeof item === 'object' ? JSON.stringify(item) : String(item));
      } else if (typeof value === 'object') {
        params.set(key, JSON.stringify(value));
      } else {
        params.set(key, String(value));
      }
    }
    return { params, payload };
  }

  return { params: new URLSearchParams(body), payload: null };
}

async function readRequestBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error('Request body is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function mergedParams(urlParams, bodyParams) {
  const merged = new URLSearchParams(urlParams);
  for (const [key, value] of bodyParams.entries()) merged.set(key, value);
  return merged;
}

function subsonicMethod(pathname) {
  return pathname
    .split('/')
    .pop()
    .replace(/\.view$/i, '')
    .toLowerCase();
}

function scopedSubsonicPath(pathname) {
  if (pathname.startsWith('/rest/')) return { pathname, libraryId: null };
  const match = pathname.match(/^\/library\/([^/]+)(\/rest\/.*)$/i);
  if (!match) return null;
  const libraryId = decodeURIComponent(match[1]).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(libraryId)) {
    const error = new Error('Invalid library id');
    error.status = 400;
    throw error;
  }
  return { pathname: match[2], libraryId };
}

function applyLibraryScope(params, method, libraryId) {
  if (!libraryId) return;
  if (musicFolderScopedMethods.has(method)) params.set('musicFolderId', libraryId);
}

function selectedLibraryId(params, libraryId = null) {
  return libraryId || params.get('musicFolderId') || null;
}

function boundedCount(value, fallback, min, max) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeAudioMuseCandidates(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.similar_tracks)) return payload.similar_tracks;
  if (Array.isArray(payload?.similarTracks)) return payload.similarTracks;
  if (Array.isArray(payload?.tracks)) return payload.tracks;
  return [];
}

function recordSubsonicRequest(method, params, libraryId = null, requestedLibraryId = selectedLibraryId(params, libraryId)) {
  const client = String(params.get('c') || 'unknown').slice(0, 80);
  subsonicTraffic.total += 1;
  subsonicTraffic.byMethod[method] = (subsonicTraffic.byMethod[method] || 0) + 1;
  if (recentRequestsLimit <= 0) return;
  subsonicTraffic.recent.unshift({
    method,
    client,
    libraryId,
    requestedLibraryId,
    musicFolderId: params.get('musicFolderId') || null,
    auth: authShape(params),
    intercepted: interceptedMethods.has(method) || method === 'getopensubsonicextensions',
    at: new Date().toISOString()
  });
  subsonicTraffic.recent.length = Math.min(subsonicTraffic.recent.length, recentRequestsLimit);
}

function recordRadioQueue(method, seedId, requestedLibraryId, scopeSource, songs, params = new URLSearchParams(), req = null) {
  const queue = {
    id: randomUUID(),
    ok: true,
    at: new Date().toISOString(),
    method,
    seedId,
    requestedLibraryId,
    scopeSource,
    returnedCount: songs.length,
    playbackConfirmedAt: null,
    playbackConfirmedSong: null,
    songs: songs.map(publicSongSummary)
  };
  lastRadioQueue = queue;
  radioQueueHistory.unshift({
    queue,
    correlation: requestCorrelation(params, req)
  });
  radioQueueHistory.length = Math.min(radioQueueHistory.length, radioQueueHistoryLimit);
  emitRouterEvent('radio.generated', {
    radio: publicRadioSummary(queue),
    songs: queue.songs.slice(0, 20)
  });
  return queue;
}

async function recordRadioFailure(method, seedId, params, scope = {}, failure = {}) {
  const seedSong = await fetchNavidromeSong(seedId, params);
  lastRadioFailure = {
    ok: false,
    at: new Date().toISOString(),
    method,
    seedId,
    seed: publicSongSummary(seedSong || { id: seedId }),
    requestedLibraryId: scope?.libraryId || null,
    scopeSource: scope?.source || null,
    status: failure.status ?? null,
    errorCode: failure.errorCode ?? null,
    message: failure.message || 'AudioMuse radio lookup failed and NaviRouter fell back to Navidrome.'
  };
  return lastRadioFailure;
}

function recordPlaybackRequest(method, params, req = null) {
  if (!['stream', 'getsong', 'scrobble'].includes(method)) return null;
  const id = params.get('id');
  if (!id) return null;
  const correlation = requestCorrelation(params, req);
  const now = Date.now();
  radioQueueHistory = radioQueueHistory.filter((entry) => radioQueueIsFresh(entry.queue, now));
  const radioEntry = radioQueueHistory.find((entry) => (
    sameRequestCorrelation(entry.correlation, correlation)
    && entry.queue.songs.some((song) => song.id === id)
  ));
  const radioQueue = radioEntry?.queue || null;
  const event = {
    method,
    id,
    inLastRadioQueue: Boolean(radioQueue),
    radioQueueId: radioQueue?.id || null,
    at: new Date().toISOString(),
    responseStatus: null,
    responseContentType: null,
    responseContentLength: null,
    responseContentRange: null,
    rangeRequest: null,
    bytesSent: 0,
    completed: null,
    durationMs: null,
    error: null
  };
  if (recentPlaybackLimit > 0) {
    playbackTraffic.recent.unshift(event);
    playbackTraffic.recent.length = Math.min(playbackTraffic.recent.length, recentPlaybackLimit);
  }
  return event;
}

function recordPlaybackResponse(event, response, req) {
  if (!event) return;
  event.responseStatus = response.status;
  event.responseContentType = response.headers.get('content-type') || null;
  event.responseContentLength = response.headers.get('content-length') || null;
  event.responseContentRange = response.headers.get('content-range') || null;
  event.rangeRequest = req.headers.range || null;
}

function countPlaybackBytes(event, chunk) {
  if (!event) return;
  event.bytesSent += Buffer.byteLength(chunk);
  maybeConfirmRadioPlayback(event);
}

function finishPlaybackResponse(event, completed, error = null) {
  if (!event || event.completed !== null) return;
  event.completed = completed;
  event.durationMs = Date.now() - Date.parse(event.at);
  event.error = error;
}

function maybeConfirmRadioPlayback(event) {
  if (!event || event.method !== 'stream' || !event.radioQueueId || event.bytesSent <= 0) return;
  if (event.responseStatus < 200 || event.responseStatus >= 300) return;
  if (!isAudioResponse(event.responseContentType)) return;

  const radioQueue = radioQueueHistory.find((entry) => entry.queue.id === event.radioQueueId)?.queue;
  if (!radioQueue || radioQueue.playbackConfirmedAt) return;

  const song = radioQueue.songs.find((item) => item.id === event.id) || { id: event.id };
  radioQueue.playbackConfirmedAt = new Date().toISOString();
  radioQueue.playbackConfirmedSong = publicSongSummary(song);
  if (lastRadioQueue.id === radioQueue.id) lastRadioQueue = radioQueue;
  emitRouterEvent('radio.playback_confirmed', {
    radio: publicRadioSummary(radioQueue),
    playback: {
      id: event.id,
      song: radioQueue.playbackConfirmedSong,
      responseStatus: event.responseStatus,
      responseContentType: event.responseContentType,
      bytesSent: event.bytesSent,
      rangeRequest: event.rangeRequest
    }
  });
}

function publicRadioSummary(queue = lastRadioQueue) {
  return {
    id: queue.id || null,
    source: 'AudioMuse',
    method: queue.method,
    seedId: queue.seedId,
    requestedLibraryId: queue.requestedLibraryId,
    scopeSource: queue.scopeSource,
    returnedCount: queue.returnedCount,
    at: queue.at,
    playbackConfirmedAt: queue.playbackConfirmedAt,
    playbackConfirmedSong: queue.playbackConfirmedSong
  };
}

function requestCorrelation(params, req = null) {
  const username = String(params?.get?.('u') || '');
  const userAgent = String(req?.headers?.['user-agent'] || '');
  return {
    usernameFingerprint: username ? createHash('sha256').update(username).digest('hex').slice(0, 16) : null,
    client: String(params?.get?.('c') || '').slice(0, 80),
    userAgentFingerprint: userAgent ? createHash('sha256').update(userAgent).digest('hex').slice(0, 16) : null
  };
}

function sameRequestCorrelation(left, right) {
  if (!left?.usernameFingerprint || left.usernameFingerprint !== right?.usernameFingerprint) return false;
  if ((left.client || right?.client) && left.client !== right.client) return false;
  if ((left.userAgentFingerprint || right?.userAgentFingerprint)
      && left.userAgentFingerprint !== right.userAgentFingerprint) return false;
  return true;
}

function radioQueueIsFresh(queue, now = Date.now(), maxAgeMs = radioQueueMaxAgeMs) {
  const createdAt = Date.parse(queue?.at || '');
  return Number.isFinite(createdAt) && now - createdAt <= maxAgeMs;
}

function isAudioResponse(contentType) {
  const normalized = String(contentType || '').split(';', 1)[0].trim().toLowerCase();
  return normalized.startsWith('audio/')
    || normalized === 'application/octet-stream'
    || normalized === 'binary/octet-stream';
}

function subsonicResponseSucceeded(body, contentType = '') {
  const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '');
  const normalizedType = String(contentType || '').toLowerCase();
  if (normalizedType.includes('json') || text.trimStart().startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      return parsed?.['subsonic-response']?.status === 'ok';
    } catch {
      return false;
    }
  }

  const status = text.match(/<subsonic-response\b[^>]*\bstatus=["']([^"']+)["']/i)?.[1];
  return String(status || '').toLowerCase() === 'ok';
}

async function readBoundedResponseBody(response, maxBytes) {
  const declaredLength = Number.parseInt(response.headers.get('content-length') || '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    void response.body?.cancel().catch(() => {});
    const error = new Error(`Navidrome fallback response exceeded ${maxBytes} bytes`);
    error.status = 502;
    throw error;
  }

  if (!response.body) return Buffer.alloc(0);
  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) {
        await reader.cancel();
        const error = new Error(`Navidrome fallback response exceeded ${maxBytes} bytes`);
        error.status = 502;
        throw error;
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

function publicSongSummary(song) {
  return {
    id: song.id,
    title: song.title || '',
    artist: song.artist || song.displayArtist || '',
    album: song.album || ''
  };
}

function authShape(params) {
  const username = String(params.get('u') || '');
  const password = String(params.get('p') || '');
  const token = String(params.get('t') || '');
  const salt = String(params.get('s') || '');
  return {
    usernamePresent: username.length > 0,
    usernameLength: username.length,
    usernameFingerprint: username ? createHash('sha256').update(username).digest('hex').slice(0, 10) : null,
    passwordPresent: password.length > 0,
    passwordLength: password.length,
    tokenPresent: token.length > 0,
    saltPresent: salt.length > 0,
    tokenSaltPairPresent: token.length > 0 && salt.length > 0
  };
}

async function scopedMusicFolders(params, libraryId) {
  const folders = await fetchMusicFolders(params);
  const folder = folders.find((item) => String(item.id) === String(libraryId));
  return {
    status: 'ok',
    version: subsonicApiVersion,
    type: appName,
    serverVersion: appVersion,
    openSubsonic: true,
    musicFolders: {
      musicFolder: folder ? [folder] : [{ id: libraryId, name: `Library ${libraryId}` }]
    }
  };
}

async function fetchMusicFolders(clientParams) {
  const url = navidromeEndpoint('/rest/getMusicFolders.view', withClientAuth(clientParams, { f: 'json' }));
  try {
    const response = await fetch(url, { headers: navidromeRequestHeaders({}), signal: AbortSignal.timeout(6000) });
    const parsed = await parseSubsonicJson(response);
    const folders = parsed.musicFolders?.musicFolder || [];
    return Array.isArray(folders) ? folders : [folders];
  } catch (error) {
    console.warn(`Could not resolve Navidrome music folders: ${redactText(error.message)}`);
    return [];
  }
}

async function canUseAudioMuseForLibrary(songId, libraryId) {
  if (!libraryId) return true;
  const songLibraryId = await navidromeSongLibraryId(songId);
  return songLibraryId !== null && String(songLibraryId) === String(libraryId);
}

async function audioMuseLibraryScope(seedId, requestedLibraryId) {
  if (requestedLibraryId) {
    return {
      libraryId: requestedLibraryId,
      source: 'client',
      blocked: !(await canUseAudioMuseForLibrary(seedId, requestedLibraryId))
    };
  }

  const inferredLibraryId = await navidromeSongLibraryId(seedId);
  if (inferredLibraryId) {
    return {
      libraryId: inferredLibraryId,
      source: 'seed',
      blocked: false
    };
  }

  return {
    libraryId: null,
    source: 'global',
    blocked: false
  };
}

async function candidateAllowedForLibrary(songId, libraryId) {
  if (!libraryId) return true;
  const songLibraryId = await navidromeSongLibraryId(songId);
  return songLibraryId !== null && String(songLibraryId) === String(libraryId);
}

async function navidromeSongLibraryId(songId) {
  if (!navidromeDbPath) return null;
  const cacheKey = String(songId);
  if (songLibraryCache.has(cacheKey)) return songLibraryCache.get(cacheKey);
  if (!/^[A-Za-z0-9_-]+$/.test(cacheKey)) return null;

  try {
    const sql = `select library_id from media_file where id='${cacheKey.replaceAll("'", "''")}' limit 1;`;
    const { stdout } = await readNavidromeSqlite(sql);
    const value = stdout.trim() || null;
    songLibraryCache.set(cacheKey, value);
    return value;
  } catch (error) {
    console.warn(`Could not resolve song library for ${redactId(songId)}: ${redactText(error.message)}`);
    songLibraryCache.set(cacheKey, null);
    return null;
  }
}

async function readNavidromeSqlite(sql) {
  if (navidromeDbContainer) {
    return execFileAsync(dockerCliPath, ['exec', navidromeDbContainer, 'sqlite3', '-readonly', navidromeDbPath, sql], { timeout: 3000 });
  }
  return execFileAsync('sqlite3', ['-readonly', navidromeDbPath, sql], { timeout: 2000 });
}

function songCacheKey(id, params) {
  const authScope = ['u', 'p', 't', 's']
    .map((key) => `${key}=${params.get(key) || ''}`)
    .join('&');
  return createHash('sha256').update(`${authScope}&id=${id}`).digest('hex');
}

function getCachedSong(key, now = Date.now()) {
  if (songCacheTtlMs <= 0 || songCacheMax <= 0) return null;
  const item = songCache.get(key);
  if (!item) {
    songCacheStats.misses += 1;
    return null;
  }
  if (item.expiresAt <= now) {
    songCache.delete(key);
    songCacheStats.evictions += 1;
    songCacheStats.misses += 1;
    return null;
  }
  songCache.delete(key);
  songCache.set(key, item);
  songCacheStats.hits += 1;
  return structuredClone(item.song);
}

function setCachedSong(key, song, now = Date.now()) {
  if (songCacheTtlMs <= 0 || songCacheMax <= 0 || !song) return;
  songCache.set(key, {
    song: structuredClone(song),
    expiresAt: now + songCacheTtlMs
  });
  songCacheStats.writes += 1;
  while (songCache.size > songCacheMax) {
    const oldest = songCache.keys().next().value;
    songCache.delete(oldest);
    songCacheStats.evictions += 1;
  }
}

function songCacheStatus() {
  return {
    enabled: songCacheTtlMs > 0 && songCacheMax > 0,
    size: songCache.size,
    max: songCacheMax,
    ttlSeconds: Math.round(songCacheTtlMs / 1000),
    ...songCacheStats
  };
}

function configuredWebhookEvents(value) {
  const defaults = ['radio.generated', 'radio.playback_confirmed', 'radio.fallback'];
  const raw = String(value || '').trim();
  const events = raw ? raw.split(',') : defaults;
  return new Set(events.map((event) => event.trim()).filter(Boolean));
}

function emitRouterEvent(event, data = {}) {
  if (!webhookUrl || !webhookEvents.has(event)) return;
  const payload = {
    id: randomUUID(),
    event,
    at: new Date().toISOString(),
    router: versionInfo(),
    ...data
  };
  if (webhookDeliveryQueue.length >= webhookQueueLimit) {
    webhookTraffic.dropped += 1;
    recordWebhookDelivery(event, {
      payloadId: payload.id,
      ok: false,
      dropped: true,
      error: 'Webhook queue is full'
    });
    return;
  }
  webhookDeliveryQueue.push(payload);
  webhookTraffic.pending = webhookDeliveryQueue.length;
  void drainWebhookDeliveryQueue();
}

async function drainWebhookDeliveryQueue() {
  if (webhookDeliveryActive) return;
  webhookDeliveryActive = true;
  try {
    while (webhookDeliveryQueue.length > 0) {
      const payload = webhookDeliveryQueue.shift();
      webhookTraffic.pending = webhookDeliveryQueue.length;
      await deliverWebhookEvent(payload);
    }
  } finally {
    webhookDeliveryActive = false;
    webhookTraffic.pending = webhookDeliveryQueue.length;
    if (webhookDeliveryQueue.length > 0) void drainWebhookDeliveryQueue();
  }
}

async function deliverWebhookEvent(payload) {
  const body = JSON.stringify(payload);
  const headers = {
    'content-type': 'application/json',
    'user-agent': `${appName}/${appVersion}`
  };
  if (webhookSecret) {
    headers['x-navirouter-signature'] = `sha256=${createHmac('sha256', webhookSecret).update(body).digest('hex')}`;
  }

  const started = Date.now();
  const responseController = new AbortController();
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.any([responseController.signal, AbortSignal.timeout(webhookTimeoutMs)])
    });
    await discardWebhookResponse(response);
    recordWebhookDelivery(payload.event, {
      payloadId: payload.id,
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - started
    });
    if (!response.ok) {
      console.warn(`NaviRouter webhook ${payload.event} returned HTTP ${response.status}.`);
    }
  } catch (error) {
    recordWebhookDelivery(payload.event, {
      payloadId: payload.id,
      ok: false,
      status: null,
      latencyMs: Date.now() - started,
      error: redactText(error.message)
    });
    console.warn(`NaviRouter webhook ${payload.event} failed: ${redactText(error.message)}`);
  } finally {
    responseController.abort();
  }
}

async function discardWebhookResponse(response) {
  try {
    await response.body?.cancel();
  } catch {
    // Delivery status is based on the webhook response headers.
  }
}

function recordWebhookDelivery(event, result) {
  webhookTraffic.recent.unshift({
    event,
    at: new Date().toISOString(),
    ...result
  });
  webhookTraffic.recent.length = Math.min(webhookTraffic.recent.length, 25);
}

async function health() {
  const [navidrome, audiomuse] = await Promise.all([
    checkService('navidrome', serviceEndpoint(navidromeUrl, '/app/')),
    checkService('audiomuse', serviceEndpoint(audiomuseUrl, '/api/health'), null, audiomuseAuthHeaders())
  ]);
  return {
    ok: navidrome.ok && audiomuse.ok,
    app: versionInfo(),
    checkedAt: new Date().toISOString(),
    intercepts: [...interceptedMethods],
    router: {
      audioMuseSimilarity: lastAudioMuseSimilarity,
      lastRadioQueue,
      lastRadioFailure,
      playbackTraffic,
      subsonicTraffic,
      songCache: songCacheStatus(),
      webhooks: webhookTraffic
    },
    services: { navidrome, audiomuse }
  };
}

function versionInfo() {
  return {
    name: appName,
    version: appVersion,
    subsonicApiVersion,
    node: process.version
  };
}

async function routerStatus() {
  const status = await health();
  return {
    ...status,
    guidance: {
      clientUrl: '/rest',
      dockerRecommended: true,
      deployment: 'LAN/VPN only for v1'
    }
  };
}

function sendClientTestReport(res, url) {
  const clientName = String(url.searchParams.get('client') || 'Client').slice(0, 80);
  const report = clientTestReport(clientName);
  if (String(url.searchParams.get('format') || '').toLowerCase() === 'markdown') {
    res.writeHead(200, {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    });
    res.end(report.markdown);
    return;
  }
  return sendJson(res, report);
}

function sendClientTestReset(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, { ok: false, error: 'Method Not Allowed' }, 405);
  }
  resetClientTestDiagnostics();
  return sendJson(res, {
    ok: true,
    resetAt: new Date().toISOString(),
    cleared: ['subsonicTraffic', 'playbackTraffic', 'lastRadioQueue', 'lastRadioFailure', 'audioMuseSimilarity', 'webhookTraffic']
  });
}

function resetClientTestDiagnostics() {
  subsonicTraffic.total = 0;
  subsonicTraffic.byMethod = {};
  subsonicTraffic.recent = [];
  playbackTraffic.recent = [];
  lastAudioMuseSimilarity = {
    ok: null,
    checkedAt: null,
    status: null,
    errorCode: null,
    message: 'No AudioMuse similarity lookup has run yet.'
  };
  lastRadioQueue = {
    ok: null,
    at: null,
    method: null,
    seedId: null,
    requestedLibraryId: null,
    scopeSource: null,
    returnedCount: 0,
    playbackConfirmedAt: null,
    playbackConfirmedSong: null,
    songs: []
  };
  radioQueueHistory = [];
  lastRadioFailure = {
    ok: null,
    at: null,
    method: null,
    seedId: null,
    seed: null,
    requestedLibraryId: null,
    scopeSource: null,
    status: null,
    errorCode: null,
    message: 'No failed AudioMuse radio attempt has been recorded.'
  };
  webhookTraffic.recent = [];
  webhookTraffic.dropped = 0;
}

function clientTestReport(clientName = 'Client') {
  const calls = liveClientTestCalls(clientName);
  const summary = summarizeClientCalls(calls);
  const recommendations = clientTestRecommendation(clientName, summary);
  return {
    ok: calls.length > 0,
    client: clientName,
    generatedAt: new Date().toISOString(),
    source: 'NaviRouter live status',
    calls,
    summary,
    recommendations,
    radio: {
      ok: lastRadioQueue.ok,
      method: lastRadioQueue.method,
      seedId: lastRadioQueue.seedId,
      requestedLibraryId: lastRadioQueue.requestedLibraryId,
      scopeSource: lastRadioQueue.scopeSource,
      returnedCount: lastRadioQueue.returnedCount,
      at: lastRadioQueue.at
    },
    radioFailure: lastRadioFailure,
    playback: {
      recent: playbackTraffic.recent
    },
    markdown: renderLiveClientTestMarkdown(clientName, calls, summary, recommendations)
  };
}

function liveClientTestCalls(clientName = '') {
  const normalizedClient = String(clientName || '').trim().toLowerCase();
  const calls = subsonicTraffic.recent
    .filter((call) => !normalizedClient || normalizedClient === 'client' || String(call.client || '').toLowerCase().includes(normalizedClient))
    .map((call) => ({
      at: call.at,
      method: call.method,
      client: call.client,
      intercepted: call.intercepted,
      query: {
        ...(call.musicFolderId ? { musicFolderId: call.musicFolderId } : {})
      }
    }));
  return calls.reverse();
}

function renderLiveClientTestMarkdown(clientName, calls, summary, recommendations) {
  const lines = [];
  lines.push(`## ${clientName} Runtime Test`);
  lines.push('');
  lines.push(`Date: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('Source: NaviRouter live status');
  lines.push('');
  lines.push('Observed calls:');
  lines.push('');
  lines.push('```text');
  for (const method of summary.methods) lines.push(method);
  lines.push('```');
  lines.push('');
  lines.push('Key evidence:');
  lines.push('');
  lines.push(`- Baseline browse evidence: ${summary.baseline ? 'yes' : 'no'}.`);
  lines.push(`- Library switch/scope evidence: ${summary.libraryScope ? 'yes' : 'no'}.`);
  lines.push(`- Similar/radio endpoint evidence: ${summary.similarEndpoint || 'none observed'}.`);
  lines.push(`- OpenSubsonic extension discovery: ${summary.openSubsonicDiscovery ? 'yes' : 'no'}.`);
  lines.push(`- AudioMuse queue proof: ${lastRadioQueue.ok ? `${lastRadioQueue.returnedCount} songs from ${lastRadioQueue.method}` : 'none observed'}.`);
  if (lastRadioFailure.ok === false) {
    const seed = lastRadioFailure.seed || {};
    const seedLabel = [seed.title, seed.artist].filter(Boolean).join(' by ') || lastRadioFailure.seedId || 'unknown seed';
    lines.push(`- Last AudioMuse fallback: ${seedLabel} failed with ${lastRadioFailure.status || 'unknown status'} (${lastRadioFailure.message}).`);
  }
  lines.push('');
  lines.push('Result:');
  lines.push('');
  for (const result of recommendations) lines.push(`- ${result}`);
  lines.push('');
  lines.push('Raw method counts:');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(summary.counts, null, 2));
  lines.push('```');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function checkService(name, target, params = null, headers = {}) {
  const started = Date.now();
  try {
    const url = new URL(target);
    if (params) {
      for (const [key, value] of params.entries()) url.searchParams.set(key, value);
    }
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    return {
      name,
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - started
    };
  } catch (error) {
    return {
      name,
      ok: false,
      error: 'unreachable',
      latencyMs: Date.now() - started
    };
  }
}

async function serveStatic(res, pathname) {
  const file = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (file.includes('..') || file.includes('\0')) {
    return sendJson(res, { ok: false, error: 'Not found' }, 404);
  }
  try {
    const absolute = resolve(publicDir, file);
    const contents = await readFile(absolute);
    res.writeHead(200, {
      'content-type': mimeTypes.get(extname(absolute)) || 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    });
    res.end(contents);
  } catch {
    sendJson(res, { ok: false, error: 'Not found' }, 404);
  }
}

function responseHeaders(response) {
  const headers = {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  };
  for (const name of ['content-type', 'content-length', 'accept-ranges', 'content-range']) {
    const value = response.headers.get(name);
    if (value) headers[name] = value;
  }
  return headers;
}

function sendJson(res, body, status = 200) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(JSON.stringify(body));
}

function serviceUrl(value, name = 'service URL') {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${name} must use http or https`);
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

function serviceEndpoint(baseUrl, pathname) {
  const url = new URL(baseUrl.href);
  url.pathname = `${url.pathname.replace(/\/+$/, '')}${pathname}`;
  return url.href;
}

function allowedHosts(envName, fallbackHost) {
  const hosts = new Set([normalizedHost(fallbackHost)]);
  String(process.env[envName] || '')
    .split(',')
    .map(normalizedHost)
    .filter(Boolean)
    .forEach((host) => hosts.add(host));
  return hosts;
}

function assertAllowedServiceUrl(url, hosts, label) {
  const host = normalizedHost(url.host);
  if (hosts.has(host)) return;
  throw new Error(`${label} URL host is not allowed`);
}

function normalizedHost(host) {
  const trimmed = String(host || '').trim().toLowerCase();
  if (!trimmed || trimmed.includes('*') || trimmed.startsWith('0.0.0.0')) return '';
  return trimmed;
}

function audiomuseAuthHeaders() {
  return audiomuseToken ? { Authorization: `Bearer ${audiomuseToken}` } : {};
}

function secretValue(envName, fileEnvName) {
  const direct = String(process.env[envName] || '').trim();
  if (direct) return direct;
  const filePath = String(process.env[fileEnvName] || '').trim();
  if (!filePath) return '';
  try {
    return readFileSync(filePath, 'utf8').trim();
  } catch (error) {
    throw new Error(`${fileEnvName} could not be read: ${error.code || error.message}`);
  }
}

function publicServiceUrl(value) {
  return value
    .replace('http://navidrome:4533', process.env.PUBLIC_NAVIDROME_URL || 'http://navidrome:4533')
    .replace('http://audiomuse-ai-flask-app:8000', process.env.PUBLIC_AUDIOMUSE_URL || 'http://audiomuse-ai-flask-app:8000');
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function redactText(value) {
  return String(value)
    .replace(/([?&](?:u|p|t|s)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/(authorization:\s*)(bearer|basic)\s+[^\s]+/gi, '$1$2 [REDACTED]');
}

function redactId(id) {
  return createHash('sha256').update(String(id)).digest('hex').slice(0, 10);
}

function publicError(error) {
  if (error.status && error.status < 500) return error.message;
  return 'NaviRouter request failed';
}

function logRequestError(error) {
  if (error.status && error.status < 500) {
    console.warn(`NaviRouter rejected request with ${error.status}: ${redactText(error.message)}`);
    return;
  }
  console.error(`NaviRouter request failed: ${redactText(error.stack || error.message)}`);
}

async function recordAudioMuseSimilarityFailure(response) {
  let errorCode = null;
  let message = `AudioMuse similarity lookup failed with HTTP ${response.status}.`;
  try {
    const payload = await response.clone().json();
    errorCode = payload.error_code ?? payload.errorCode ?? null;
    message = payload.error_message || payload.error || message;
  } catch {
    // Keep generic message when AudioMuse does not return JSON.
  }
  lastAudioMuseSimilarity = {
    ok: false,
    checkedAt: new Date().toISOString(),
    status: response.status,
    errorCode,
    message
  };
}

function recordAudioMuseSimilaritySuccess(status, resultCount) {
  lastAudioMuseSimilarity = {
    ok: true,
    checkedAt: new Date().toISOString(),
    status,
    errorCode: null,
    message: `AudioMuse returned ${resultCount} candidate tracks.`
  };
}

function recordAudioMuseSimilarityError(error) {
  lastAudioMuseSimilarity = {
    ok: false,
    checkedAt: new Date().toISOString(),
    status: null,
    errorCode: null,
    message: redactText(error.message || 'AudioMuse similarity lookup failed.')
  };
}

export {
  server,
  boundedCount,
  clientTestReport,
  configuredWebhookEvents,
  discardWebhookResponse,
  installGracefulShutdown,
  isAudioResponse,
  mergedParams,
  navidromeRequestHeaders,
  normalizeAudioMuseCandidates,
  publicRadioSummary,
  recordSubsonicRequest,
  resetClientTestDiagnostics,
  redactText,
  responseFormat,
  serviceEndpoint,
  serviceUrl,
  secretValue,
  scopedSubsonicPath,
  songCacheKey,
  songCacheStatus,
  songAttributes,
  subsonicMethod,
  subsonicResponseSucceeded,
  subsonicXml,
  similarityFromDistance,
  openSubsonicExtensionsResponse,
  recordAudioMuseSimilaritySuccess,
  radioQueueIsFresh,
  readBoundedResponseBody,
  sameRequestCorrelation,
  versionInfo,
  xmlEscape
};
