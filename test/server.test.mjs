import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { EventEmitter, once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { join } from 'node:path';
import test from 'node:test';
import { tmpdir } from 'node:os';

process.env.NODE_ENV = 'test';
process.env.AUDIOMUSE_API_TOKEN = 'test-audiomuse-token';

async function waitFor(predicate, label, timeoutMs = 2000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Timed out waiting for ${label}`);
}

const {
  server: unitServer,
  boundedCount,
  configuredWebhookEvents,
  discardWebhookResponse,
  installGracefulShutdown,
  isAudioResponse,
  mergedParams,
  navidromeRequestHeaders,
  normalizeAudioMuseCandidates,
  recordSubsonicRequest,
  redactText,
  responseFormat,
  recordAudioMuseSimilaritySuccess,
  radioQueueIsFresh,
  readBoundedResponseBody,
  sameRequestCorrelation,
  secretValue,
  serviceEndpoint,
  serviceUrl,
  similarityFromDistance,
  scopedSubsonicPath,
  songCacheKey,
  songCacheStatus,
  songAttributes,
  subsonicMethod,
  subsonicResponseSucceeded,
  subsonicXml,
  versionInfo,
  xmlEscape
} = await import(`../server.mjs?unit=${Date.now()}`);

test('installGracefulShutdown closes once when a termination signal arrives', () => {
  const runtime = new EventEmitter();
  let closeCalls = 0;
  const httpServer = {
    close(callback) {
      closeCalls += 1;
      callback();
    }
  };

  installGracefulShutdown(httpServer, runtime);
  runtime.emit('SIGTERM');
  runtime.emit('SIGINT');

  assert.equal(closeCalls, 1);
  assert.equal(runtime.exitCode, undefined);
});

test('installGracefulShutdown marks a failed close as an error', () => {
  const runtime = new EventEmitter();
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    installGracefulShutdown({
      close(callback) {
        callback(new Error('close failed'));
      }
    }, runtime);
    runtime.emit('SIGTERM');
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(runtime.exitCode, 1);
});

test('serviceUrl rejects non-http upstreams', () => {
  assert.throws(() => serviceUrl('file:///etc/passwd', 'BAD_URL'), /http or https/);
});

test('serviceEndpoint preserves path prefixes', () => {
  const base = serviceUrl('https://example.test/navidrome/');
  assert.equal(serviceEndpoint(base, '/rest/ping.view'), 'https://example.test/navidrome/rest/ping.view');
});

test('versionInfo exposes app and protocol versions', () => {
  assert.deepEqual(Object.keys(versionInfo()).sort(), ['name', 'node', 'subsonicApiVersion', 'version'].sort());
  assert.equal(versionInfo().name, 'NaviRouter');
  assert.equal(versionInfo().version, '0.1.2');
});

test('subsonicMethod normalizes .view suffixes', () => {
  assert.equal(subsonicMethod('/rest/getSimilarSongs.view'), 'getsimilarsongs');
  assert.equal(subsonicMethod('/rest/getSimilarSongs2'), 'getsimilarsongs2');
});

test('scopedSubsonicPath recognizes virtual library server URLs', () => {
  assert.deepEqual(scopedSubsonicPath('/rest/ping.view'), {
    pathname: '/rest/ping.view',
    libraryId: null
  });
  assert.deepEqual(scopedSubsonicPath('/library/2/rest/search3.view'), {
    pathname: '/rest/search3.view',
    libraryId: '2'
  });
  assert.equal(scopedSubsonicPath('/api/health'), null);
  assert.throws(() => scopedSubsonicPath('/library/../rest/ping.view'), /Invalid library id/);
});

test('responseFormat defaults to xml and honors json', () => {
  assert.equal(responseFormat(new URLSearchParams()), 'xml');
  assert.equal(responseFormat(new URLSearchParams('f=json')), 'json');
});

test('mergedParams lets POST body override query params', () => {
  const merged = mergedParams(new URLSearchParams('id=a&count=10'), new URLSearchParams('count=3&f=json'));
  assert.equal(merged.get('id'), 'a');
  assert.equal(merged.get('count'), '3');
  assert.equal(merged.get('f'), 'json');
});

test('boundedCount clamps count values', () => {
  assert.equal(boundedCount('', 50, 1, 100), 50);
  assert.equal(boundedCount('0', 50, 1, 100), 1);
  assert.equal(boundedCount('250', 50, 1, 100), 100);
  assert.equal(boundedCount('42', 50, 1, 100), 42);
});

test('configuredWebhookEvents defaults to radio notification events', () => {
  assert.deepEqual([...configuredWebhookEvents('')], ['radio.generated', 'radio.playback_confirmed', 'radio.fallback']);
  assert.deepEqual([...configuredWebhookEvents('radio.generated, radio.fallback')], ['radio.generated', 'radio.fallback']);
});

test('discardWebhookResponse cancels ignored webhook response bodies', async () => {
  let cancelled = false;
  await discardWebhookResponse({
    body: {
      async cancel() {
        cancelled = true;
      }
    }
  });
  assert.equal(cancelled, true);
});

test('isAudioResponse accepts media streams and rejects Subsonic error payloads', () => {
  assert.equal(isAudioResponse('audio/flac'), true);
  assert.equal(isAudioResponse('application/octet-stream; charset=binary'), true);
  assert.equal(isAudioResponse('application/json'), false);
  assert.equal(isAudioResponse('text/xml; charset=utf-8'), false);
});

test('subsonicResponseSucceeded validates JSON and XML response envelopes', () => {
  assert.equal(subsonicResponseSucceeded(
    JSON.stringify({ 'subsonic-response': { status: 'ok' } }),
    'application/json'
  ), true);
  assert.equal(subsonicResponseSucceeded(
    JSON.stringify({ 'subsonic-response': { status: 'failed', error: { code: 40 } } }),
    'application/json'
  ), false);
  assert.equal(subsonicResponseSucceeded(
    '<?xml version="1.0"?><subsonic-response status="ok" version="1.16.1"></subsonic-response>',
    'text/xml'
  ), true);
  assert.equal(subsonicResponseSucceeded(
    '<?xml version="1.0"?><subsonic-response status="failed"><error code="40"/></subsonic-response>',
    'text/xml'
  ), false);
});

test('readBoundedResponseBody rejects oversized declared and streamed bodies', async () => {
  const accepted = await readBoundedResponseBody(new Response('small'), 5);
  assert.equal(accepted.toString('utf8'), 'small');
  await assert.rejects(
    readBoundedResponseBody(new Response('too large'), 4),
    /exceeded 4 bytes/
  );
  const chunked = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('123'));
      controller.enqueue(new TextEncoder().encode('456'));
      controller.close();
    }
  }));
  await assert.rejects(readBoundedResponseBody(chunked, 5), /exceeded 5 bytes/);
});

test('request correlation requires every available client discriminator to match', () => {
  const base = {
    usernameFingerprint: 'user',
    client: 'apogee',
    userAgentFingerprint: 'agent'
  };
  assert.equal(sameRequestCorrelation(base, { ...base }), true);
  assert.equal(sameRequestCorrelation(base, { ...base, client: '' }), false);
  assert.equal(sameRequestCorrelation(base, { ...base, userAgentFingerprint: null }), false);
  assert.equal(sameRequestCorrelation(base, { ...base, client: 'other' }), false);
});

test('radio queue correlation expires stale queues', () => {
  const now = Date.parse('2026-07-23T12:00:00.000Z');
  assert.equal(radioQueueIsFresh({ at: '2026-07-23T11:59:00.000Z' }, now, 60_000), true);
  assert.equal(radioQueueIsFresh({ at: '2026-07-23T11:58:59.999Z' }, now, 60_000), false);
  assert.equal(radioQueueIsFresh({ at: 'invalid' }, now, 60_000), false);
});

test('secretValue reads direct env before secret file fallback', () => {
  const dir = mkdtempSync(join(tmpdir(), 'navirouter-'));
  const secretPath = join(dir, 'audiomuse-token');
  writeFileSync(secretPath, 'file-token\n');
  process.env.TEST_DIRECT_TOKEN = 'direct-token';
  process.env.TEST_DIRECT_TOKEN_FILE = secretPath;
  try {
    assert.equal(secretValue('TEST_DIRECT_TOKEN', 'TEST_DIRECT_TOKEN_FILE'), 'direct-token');
    delete process.env.TEST_DIRECT_TOKEN;
    assert.equal(secretValue('TEST_DIRECT_TOKEN', 'TEST_DIRECT_TOKEN_FILE'), 'file-token');
    process.env.TEST_DIRECT_TOKEN_FILE = join(dir, 'missing');
    assert.throws(() => secretValue('TEST_DIRECT_TOKEN', 'TEST_DIRECT_TOKEN_FILE'), /could not be read/);
  } finally {
    delete process.env.TEST_DIRECT_TOKEN;
    delete process.env.TEST_DIRECT_TOKEN_FILE;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('normalizeAudioMuseCandidates accepts array and wrapped response shapes', () => {
  assert.deepEqual(normalizeAudioMuseCandidates([{ item_id: 'a' }]), [{ item_id: 'a' }]);
  assert.deepEqual(normalizeAudioMuseCandidates({ similar_tracks: [{ item_id: 'b' }] }), [{ item_id: 'b' }]);
  assert.deepEqual(normalizeAudioMuseCandidates({ similarTracks: [{ item_id: 'c' }] }), [{ item_id: 'c' }]);
  assert.deepEqual(normalizeAudioMuseCandidates({ tracks: [{ item_id: 'd' }] }), [{ item_id: 'd' }]);
  assert.deepEqual(normalizeAudioMuseCandidates({ nope: [] }), []);
});

test('songCacheKey scopes cached songs by auth values without exposing secrets', () => {
  const alice = songCacheKey('song-1', new URLSearchParams('u=alice&p=secret'));
  const bob = songCacheKey('song-1', new URLSearchParams('u=bob&p=secret'));
  assert.notEqual(alice, bob);
  assert.doesNotMatch(alice, /alice|secret|song-1/);
  assert.equal(songCacheStatus().enabled, true);
});

test('navidromeRequestHeaders forwards only media-safe headers', () => {
  assert.deepEqual(navidromeRequestHeaders({ headers: { range: 'bytes=1-20', cookie: 'secret=1' } }), {
    Range: 'bytes=1-20'
  });
});

test('redactText removes Subsonic secrets and bearer credentials', () => {
  const redacted = redactText('GET /rest/ping.view?u=me&p=password&t=token&s=salt Authorization: Bearer abc123');
  assert.match(redacted, /u=\[REDACTED\]/);
  assert.match(redacted, /p=\[REDACTED\]/);
  assert.match(redacted, /t=\[REDACTED\]/);
  assert.match(redacted, /s=\[REDACTED\]/);
  assert.match(redacted, /Bearer \[REDACTED\]/i);
  assert.doesNotMatch(redacted, /password|abc123/);
});

test('xmlEscape protects XML attributes', () => {
  assert.equal(xmlEscape('A&B "C" <D>'), 'A&amp;B &quot;C&quot; &lt;D&gt;');
});

test('songAttributes serializes safe Subsonic child fields', () => {
  const attrs = songAttributes({
    id: 'song-1',
    title: 'A&B',
    artist: 'Artist',
    ignored: 'nope'
  });
  assert.match(attrs, /id="song-1"/);
  assert.match(attrs, /title="A&amp;B"/);
  assert.doesNotMatch(attrs, /ignored/);
});

test('subsonicXml renders similarSongs2 response', () => {
  const xml = subsonicXml({
    status: 'ok',
    version: '1.16.1',
    type: 'NaviRouter',
    serverVersion: '0.1.1',
    openSubsonic: true,
    similarSongs2: {
      song: [{ id: 's1', title: 'One', artist: 'A' }]
    }
  });
  assert.match(xml, /<similarSongs2>/);
  assert.match(xml, /<song id="s1" title="One" artist="A"\/>/);
});

test('subsonicXml renders music folder responses', () => {
  const xml = subsonicXml({
    status: 'ok',
    version: '1.16.1',
    type: 'NaviRouter',
    serverVersion: '0.1.1',
    openSubsonic: true,
    musicFolders: {
      musicFolder: [{ id: '2', name: 'Live Music Archive' }]
    }
  });
  assert.match(xml, /<musicFolders>/);
  assert.match(xml, /<musicFolder id="2" name="Live Music Archive"\/>/);
});

test('similarityFromDistance clamps AudioMuse distances', () => {
  assert.equal(similarityFromDistance(0), 1);
  assert.equal(similarityFromDistance(0.25), 0.75);
  assert.equal(similarityFromDistance(2), 0);
  assert.equal(similarityFromDistance('bad'), 0);
});

test('router advertises OpenSubsonic sonic similarity extensions', async () => {
  const { server } = await import(`../server.mjs?extensions=${Date.now()}`);
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/rest/getOpenSubsonicExtensions.view?f=json`);
    assert.equal(response.status, 200);
    const body = await response.json();
    const extensions = body['subsonic-response'].openSubsonicExtensions;
    assert.deepEqual(extensions.find((extension) => extension.name === 'sonicSimilarity').versions, [1]);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('router exposes version and config metadata', async () => {
  const { server } = await import(`../server.mjs?metadata=${Date.now()}`);
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const versionResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/version`);
    assert.equal(versionResponse.status, 200);
    const version = await versionResponse.json();
    assert.equal(version.name, 'NaviRouter');
    assert.equal(version.version, '0.1.2');

    const configResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/config`);
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json();
    assert.equal(config.version, '0.1.2');
    assert.equal(config.routes.version, '/api/version');
    assert.equal(config.routes.syncAudioMusePlaylist, '/api/router/sync-playlist');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('health exposes redacted AudioMuse similarity diagnostics', async () => {
  recordAudioMuseSimilaritySuccess(200, 3);
  recordSubsonicRequest('getsimilarsongs2', new URLSearchParams('c=test-client&u=alice&p=secret'));
  await new Promise((resolve) => unitServer.listen(0, resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${unitServer.address().port}/api/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.app.version, '0.1.2');
    assert.equal(body.router.audioMuseSimilarity.ok, true);
    assert.equal(body.router.audioMuseSimilarity.status, 200);
    assert.match(body.router.audioMuseSimilarity.message, /3 candidate/);
    assert.equal(body.router.subsonicTraffic.byMethod.getsimilarsongs2, 1);
    assert.equal(body.router.subsonicTraffic.recent[0].client, 'test-client');
    assert.equal(body.router.subsonicTraffic.recent[0].intercepted, true);
    assert.doesNotMatch(JSON.stringify(body.router.subsonicTraffic), /alice|secret/);
    assert.equal(body.router.songCache.enabled, true);
    assert.equal(typeof body.router.songCache.size, 'number');
  } finally {
    unitServer.close();
    await once(unitServer, 'close');
  }
});

test('router exposes markdown client test reports from live traffic', async () => {
  const module = await import(`../server.mjs?client-report=${Date.now()}`);
  module.recordSubsonicRequest('getalbumlist2', new URLSearchParams('c=Amperfy&u=alice&p=secret'));
  module.recordSubsonicRequest('getindexes', new URLSearchParams('c=Amperfy&u=alice&t=tok&s=salt&musicFolderId=2'));
  module.recordSubsonicRequest('getsimilarsongs2', new URLSearchParams('c=Amperfy&u=alice&t=tok&s=salt&id=seed'));

  await new Promise((resolve) => module.server.listen(0, resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${module.server.address().port}/api/router/client-test-report?client=Amperfy`);
    assert.equal(response.status, 200);
    const report = await response.json();
    assert.equal(report.client, 'Amperfy');
    assert.equal(report.summary.baseline, true);
    assert.equal(report.summary.libraryScope, true);
    assert.equal(report.summary.similarEndpoint, 'getsimilarsongs2');
    assert.match(report.markdown, /Amperfy roadmap evidence is sufficient/);
    assert.doesNotMatch(JSON.stringify(report), /alice|secret|tok|salt/);

    const markdownResponse = await fetch(`http://127.0.0.1:${module.server.address().port}/api/router/client-test-report?client=Amperfy&format=markdown`);
    assert.equal(markdownResponse.status, 200);
    assert.match(markdownResponse.headers.get('content-type'), /text\/markdown/);
    assert.match(await markdownResponse.text(), /^## Amperfy Runtime Test/);
  } finally {
    module.server.close();
    await once(module.server, 'close');
  }
});

test('client test reset clears live diagnostic evidence only through POST', async () => {
  const module = await import(`../server.mjs?client-reset=${Date.now()}`);
  module.recordSubsonicRequest('getalbumlist2', new URLSearchParams('c=Symfonium&u=alice&p=secret'));
  module.recordSubsonicRequest('getsimilarsongs', new URLSearchParams('c=Symfonium&id=seed'));

  await new Promise((resolve) => module.server.listen(0, resolve));
  try {
    const blocked = await fetch(`http://127.0.0.1:${module.server.address().port}/api/router/client-test-reset`);
    assert.equal(blocked.status, 405);

    const reset = await fetch(`http://127.0.0.1:${module.server.address().port}/api/router/client-test-reset`, {
      method: 'POST'
    });
    assert.equal(reset.status, 200);
    const resetBody = await reset.json();
    assert.equal(resetBody.ok, true);
    assert.deepEqual(resetBody.cleared, ['subsonicTraffic', 'playbackTraffic', 'lastRadioQueue', 'lastRadioFailure', 'audioMuseSimilarity', 'webhookTraffic']);

    const report = module.clientTestReport('Symfonium');
    assert.equal(report.ok, false);
    assert.equal(report.summary.baseline, false);
    assert.deepEqual(report.summary.counts, {});
  } finally {
    module.server.close();
    await once(module.server, 'close');
  }
});

test('router rejects oversized Subsonic form POST bodies', async () => {
  process.env.NAVIROUTER_MAX_BODY_BYTES = '1024';
  process.env.NAVIDROME_URL = 'http://127.0.0.1:4533';
  process.env.AUDIOMUSE_URL = 'http://127.0.0.1:8000';

  const { server } = await import(`../server.mjs?body-limit=${Date.now()}`);
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/rest/ping.view?f=json`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `u=alice&p=${'x'.repeat(2048)}`
    });
    assert.equal(response.status, 413);
    const body = await response.json();
    assert.equal(body['subsonic-response'].status, 'failed');
    assert.match(body['subsonic-response'].error.message, /too large/);
  } finally {
    server.close();
    await once(server, 'close');
    delete process.env.NAVIROUTER_MAX_BODY_BYTES;
  }
});

test('virtual library URL injects musicFolderId into scoped Navidrome calls', async () => {
  const seen = [];
  const navidrome = createServer((req, res) => {
    const url = new URL(req.url, 'http://navidrome.test');
    seen.push({
      pathname: url.pathname,
      musicFolderId: url.searchParams.get('musicFolderId')
    });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      'subsonic-response': {
        status: 'ok',
        albumList2: { album: [] }
      }
    }));
  });

  const audiomuse = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  });

  await Promise.all([
    new Promise((resolve) => navidrome.listen(0, resolve)),
    new Promise((resolve) => audiomuse.listen(0, resolve))
  ]);

  const navidromePort = navidrome.address().port;
  const audiomusePort = audiomuse.address().port;
  process.env.NAVIDROME_URL = `http://127.0.0.1:${navidromePort}`;
  process.env.AUDIOMUSE_URL = `http://127.0.0.1:${audiomusePort}`;
  process.env.NAVIROUTER_ALLOWED_NAVIDROME_HOSTS = `127.0.0.1:${navidromePort}`;
  process.env.NAVIROUTER_ALLOWED_AUDIOMUSE_HOSTS = `127.0.0.1:${audiomusePort}`;

  const { server } = await import(`../server.mjs?library-scope=${Date.now()}`);
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/library/2/rest/getAlbumList2.view?type=newest&size=5&f=json&u=alice&p=secret`);
    assert.equal(response.status, 200);
    assert.equal(seen[0].pathname, '/rest/getAlbumList2.view');
    assert.equal(seen[0].musicFolderId, '2');
  } finally {
    server.close();
    navidrome.close();
    audiomuse.close();
    await Promise.all([once(server, 'close'), once(navidrome, 'close'), once(audiomuse, 'close')]);
  }
});

test('router intercepts getSimilarSongs2 and returns Navidrome song objects', async () => {
  let getSongRequests = 0;
  let createdPlaylist = null;
  const updatePlaylistCalls = [];
  const navidrome = createServer((req, res) => {
    const url = new URL(req.url, 'http://navidrome.test');
    if (url.pathname.endsWith('/getSong.view')) {
      assert.equal(url.searchParams.get('u'), 'alice');
      getSongRequests += 1;
      const id = url.searchParams.get('id');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          song: { id, title: `Song ${id}`, artist: 'Artist', isDir: false }
        }
      }));
      return;
    }
    if (url.pathname.endsWith('/createPlaylist.view')) {
      createdPlaylist = {
        name: url.searchParams.get('name'),
        songIds: url.searchParams.getAll('songId'),
        username: url.searchParams.get('u')
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          playlist: { id: 'playlist-1', name: createdPlaylist.name }
        }
      }));
      return;
    }
    if (url.pathname.endsWith('/getPlaylist.view')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          playlist: {
            id: url.searchParams.get('id'),
            name: 'Existing Playlist',
            entry: [{ id: 'old-1' }, { id: 'old-2' }]
          }
        }
      }));
      return;
    }
    if (url.pathname.endsWith('/updatePlaylist.view')) {
      updatePlaylistCalls.push({
        playlistId: url.searchParams.get('playlistId'),
        name: url.searchParams.get('name'),
        songIndexToRemove: url.searchParams.getAll('songIndexToRemove'),
        songIdToAdd: url.searchParams.getAll('songIdToAdd')
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          playlist: { id: url.searchParams.get('playlistId'), name: url.searchParams.get('name') || 'Existing Playlist' }
        }
      }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
  });

  const audiomuse = createServer((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer test-audiomuse-token');
    const url = new URL(req.url, 'http://audiomuse.test');
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    assert.equal(url.pathname, '/api/similar_tracks');
    assert.equal(url.searchParams.get('item_id'), 'seed');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([{ item_id: 'candidate-1' }, { item_id: 'candidate-2' }]));
  });

  await Promise.all([
    new Promise((resolve) => navidrome.listen(0, resolve)),
    new Promise((resolve) => audiomuse.listen(0, resolve))
  ]);

  const navidromePort = navidrome.address().port;
  const audiomusePort = audiomuse.address().port;
  process.env.NAVIDROME_URL = `http://127.0.0.1:${navidromePort}`;
  process.env.AUDIOMUSE_URL = `http://127.0.0.1:${audiomusePort}`;
  process.env.NAVIROUTER_ALLOWED_NAVIDROME_HOSTS = `127.0.0.1:${navidromePort}`;
  process.env.NAVIROUTER_ALLOWED_AUDIOMUSE_HOSTS = `127.0.0.1:${audiomusePort}`;

  const { server } = await import(`../server.mjs?integration=${Date.now()}`);
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/rest/getSimilarSongs2.view?id=seed&count=2&f=json&u=alice&t=tok&s=salt`);
    assert.equal(response.status, 200);
    const body = await response.json();
    const subsonic = body['subsonic-response'];
    assert.equal(subsonic.status, 'ok');
    assert.equal(subsonic.similarSongs2.song.length, 2);
    assert.equal(subsonic.similarSongs2.song[0].id, 'candidate-1');
    const streamResponse = await fetch(`http://127.0.0.1:${server.address().port}/rest/stream.view?id=candidate-1&f=json&u=alice&t=tok&s=salt`);
    assert.equal(streamResponse.status, 200);
    const statusResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/router/status`);
    const status = await statusResponse.json();
    assert.equal(status.router.lastRadioQueue.seedId, 'seed');
    assert.equal(status.router.lastRadioQueue.returnedCount, 2);
    assert.equal(status.router.playbackTraffic.recent[0].id, 'candidate-1');
    assert.equal(status.router.playbackTraffic.recent[0].inLastRadioQueue, true);
    const secondResponse = await fetch(`http://127.0.0.1:${server.address().port}/rest/getSimilarSongs2.view?id=seed&count=2&f=json&u=alice&t=tok&s=salt`);
    assert.equal(secondResponse.status, 200);
    assert.equal(getSongRequests, 2);
    const playlistResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/router/last-radio/save-playlist`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ u: 'alice', t: 'tok', s: 'salt', name: 'AudioMuse Radio - Seed' })
    });
    assert.equal(playlistResponse.status, 200);
    const playlistBody = await playlistResponse.json();
    assert.equal(playlistBody.ok, true);
    assert.equal(playlistBody.playlist.id, 'playlist-1');
    assert.equal(createdPlaylist.name, 'AudioMuse Radio - Seed');
    assert.deepEqual(createdPlaylist.songIds, ['candidate-1', 'candidate-2']);
    assert.equal(createdPlaylist.username, 'alice');
    const replaceResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/router/last-radio/save-playlist`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ u: 'alice', t: 'tok', s: 'salt', playlistId: 'playlist-1', mode: 'replace', name: 'AudioMuse Radio - Seed Replace' })
    });
    assert.equal(replaceResponse.status, 200);
    const replaceBody = await replaceResponse.json();
    assert.equal(replaceBody.ok, true);
    assert.equal(replaceBody.playlist.id, 'playlist-1');
    assert.equal(replaceBody.playlist.mode, 'replace');
    assert.deepEqual(updatePlaylistCalls[0], {
      playlistId: 'playlist-1',
      name: 'AudioMuse Radio - Seed Replace',
      songIndexToRemove: ['1', '0'],
      songIdToAdd: []
    });
    assert.deepEqual(updatePlaylistCalls[1], {
      playlistId: 'playlist-1',
      name: null,
      songIndexToRemove: [],
      songIdToAdd: ['candidate-1', 'candidate-2']
    });
    const appendResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/router/last-radio/save-playlist`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ u: 'alice', t: 'tok', s: 'salt', playlistId: 'playlist-2', mode: 'append', name: 'AudioMuse Radio - Seed Append' })
    });
    assert.equal(appendResponse.status, 200);
    const appendBody = await appendResponse.json();
    assert.equal(appendBody.ok, true);
    assert.equal(appendBody.playlist.id, 'playlist-2');
    assert.equal(appendBody.playlist.mode, 'append');
    assert.deepEqual(updatePlaylistCalls[2], {
      playlistId: 'playlist-2',
      name: 'AudioMuse Radio - Seed Append',
      songIndexToRemove: [],
      songIdToAdd: ['candidate-1', 'candidate-2']
    });
    const invalidResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/router/last-radio/save-playlist`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ u: 'alice', t: 'tok', s: 'salt', mode: 'append' })
    });
    assert.equal(invalidResponse.status, 400);
    const invalidBody = await invalidResponse.json();
    assert.equal(invalidBody.ok, false);
    assert.match(invalidBody.error, /playlistId is required/);
    const generatedResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/router/radio-playlist`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ u: 'alice', t: 'tok', s: 'salt', id: 'seed', count: 2, name: 'AudioMuse Generated - Seed' })
    });
    assert.equal(generatedResponse.status, 200);
    const generatedBody = await generatedResponse.json();
    assert.equal(generatedBody.ok, true);
    assert.equal(generatedBody.playlist.id, 'playlist-1');
    assert.equal(generatedBody.playlist.mode, 'create');
    assert.equal(generatedBody.playlist.source, 'AudioMuse');
    assert.equal(generatedBody.playlist.songCount, 2);
    assert.equal(createdPlaylist.name, 'AudioMuse Generated - Seed');
    assert.deepEqual(createdPlaylist.songIds, ['candidate-1', 'candidate-2']);
    const generatedStatusResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/router/status`);
    const generatedStatus = await generatedStatusResponse.json();
    assert.equal(generatedStatus.router.lastRadioQueue.method, 'generatedplaylist');
    assert.equal(generatedStatus.router.lastRadioQueue.seedId, 'seed');
    assert.equal(generatedStatus.router.lastRadioQueue.returnedCount, 2);
    const syncResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/router/sync-playlist`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        u: 'alice',
        t: 'tok',
        s: 'salt',
        name: 'AudioMuse Sync - Chosen In AudioMuse',
        tracks: [{ item_id: 'candidate-2' }, { id: 'candidate-1' }, { id: 'candidate-1' }]
      })
    });
    assert.equal(syncResponse.status, 200);
    const syncBody = await syncResponse.json();
    assert.equal(syncBody.ok, true);
    assert.equal(syncBody.playlist.id, 'playlist-1');
    assert.equal(syncBody.playlist.mode, 'create');
    assert.equal(syncBody.playlist.source, 'AudioMuse');
    assert.equal(syncBody.playlist.songCount, 2);
    assert.equal(syncBody.playlist.skippedCount, 0);
    assert.equal(createdPlaylist.name, 'AudioMuse Sync - Chosen In AudioMuse');
    assert.deepEqual(createdPlaylist.songIds, ['candidate-2', 'candidate-1']);
    const syncStatusResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/router/status`);
    const syncStatus = await syncStatusResponse.json();
    assert.equal(syncStatus.router.lastRadioQueue.method, 'generatedplaylist');
    assert.equal(syncStatus.router.lastRadioQueue.seedId, 'seed');
    assert.equal(syncStatus.router.lastRadioQueue.returnedCount, 2);
  } finally {
    server.close();
    navidrome.close();
    audiomuse.close();
    await Promise.all([once(server, 'close'), once(navidrome, 'close'), once(audiomuse, 'close')]);
  }
});

test('router sends signed webhook events for AudioMuse radio generation and playback confirmation', async () => {
  const webhookSecret = 'test-webhook-secret';
  const webhookEvents = [];
  let streamBodySent = false;
  let streamRequestCount = 0;
  const navidrome = createServer((req, res) => {
    const url = new URL(req.url, 'http://navidrome.test');
    if (url.pathname.endsWith('/getSong.view')) {
      const id = url.searchParams.get('id');
      const songs = {
        seed: { id: 'seed', title: 'Seed Song', artist: 'Seed Artist', album: 'Seed Album', isDir: false },
        'candidate-1': { id: 'candidate-1', title: 'Candidate One', artist: 'Candidate Artist', album: 'Candidate Album', isDir: false }
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          song: songs[id] || { id, title: `Song ${id}`, artist: 'Artist', isDir: false }
        }
      }));
      return;
    }
    if (url.pathname.endsWith('/stream.view')) {
      streamRequestCount += 1;
      res.writeHead(200, {
        'content-type': 'audio/flac',
        'content-length': '4'
      });
      res.flushHeaders();
      setTimeout(() => {
        streamBodySent = true;
        res.end('data');
      }, 100);
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
  });

  const audiomuse = createServer((req, res) => {
    const url = new URL(req.url, 'http://audiomuse.test');
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([{ item_id: 'candidate-1' }]));
  });

  const webhook = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    const expected = `sha256=${createHmac('sha256', webhookSecret).update(body).digest('hex')}`;
    webhookEvents.push({
      signature: req.headers['x-navirouter-signature'],
      streamBodySent,
      payload: JSON.parse(body)
    });
    assert.equal(req.method, 'POST');
    assert.equal(req.headers['content-type'], 'application/json');
    assert.equal(req.headers['x-navirouter-signature'], expected);
    res.writeHead(204);
    res.end();
  });

  await Promise.all([
    new Promise((resolve) => navidrome.listen(0, resolve)),
    new Promise((resolve) => audiomuse.listen(0, resolve)),
    new Promise((resolve) => webhook.listen(0, resolve))
  ]);

  const navidromePort = navidrome.address().port;
  const audiomusePort = audiomuse.address().port;
  const webhookPort = webhook.address().port;
  process.env.NAVIDROME_URL = `http://127.0.0.1:${navidromePort}`;
  process.env.AUDIOMUSE_URL = `http://127.0.0.1:${audiomusePort}`;
  process.env.NAVIROUTER_ALLOWED_NAVIDROME_HOSTS = `127.0.0.1:${navidromePort}`;
  process.env.NAVIROUTER_ALLOWED_AUDIOMUSE_HOSTS = `127.0.0.1:${audiomusePort}`;
  process.env.NAVIROUTER_WEBHOOK_URL = `http://127.0.0.1:${webhookPort}/events`;
  process.env.NAVIROUTER_WEBHOOK_SECRET = webhookSecret;
  process.env.NAVIROUTER_WEBHOOK_EVENTS = 'radio.generated,radio.playback_confirmed,radio.fallback';
  process.env.NAVIROUTER_RECENT_PLAYBACK_LIMIT = '0';

  const { server } = await import(`../server.mjs?webhook=${Date.now()}`);
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const radioResponse = await fetch(`http://127.0.0.1:${server.address().port}/rest/getSimilarSongs2.view?id=seed&count=1&f=json&u=alice&t=tok&s=salt&c=client-a`);
    assert.equal(radioResponse.status, 200);
    await waitFor(() => webhookEvents.some((item) => item.payload.event === 'radio.generated'), 'radio.generated webhook');

    const secondRadioResponse = await fetch(`http://127.0.0.1:${server.address().port}/rest/getSimilarSongs2.view?id=second-seed&count=1&f=json&u=alice&t=tok&s=salt&c=client-b`);
    assert.equal(secondRadioResponse.status, 200);
    await waitFor(
      () => webhookEvents.filter((item) => item.payload.event === 'radio.generated').length === 2,
      'second radio.generated webhook'
    );

    const streamResponse = await fetch(`http://127.0.0.1:${server.address().port}/rest/stream.view?id=candidate-1&f=json&u=alice&t=tok&s=salt&c=client-a`);
    assert.equal(streamResponse.status, 200);
    await streamResponse.arrayBuffer();
    await waitFor(() => webhookEvents.some((item) => item.payload.event === 'radio.playback_confirmed'), 'radio.playback_confirmed webhook');

    const generatedEvents = webhookEvents.filter((item) => item.payload.event === 'radio.generated');
    const generated = generatedEvents[0].payload;
    assert.equal(generated.radio.source, 'AudioMuse');
    assert.equal(generated.radio.seedId, 'seed');
    assert.equal(generated.radio.returnedCount, 1);
    assert.equal(generated.songs[0].title, 'Candidate One');
    assert.ok(generated.id);
    assert.ok(generated.radio.id);

    const confirmedDelivery = webhookEvents.find((item) => item.payload.event === 'radio.playback_confirmed');
    const confirmed = confirmedDelivery.payload;
    assert.equal(confirmedDelivery.streamBodySent, true);
    assert.equal(confirmed.playback.song.id, 'candidate-1');
    assert.equal(confirmed.playback.song.title, 'Candidate One');
    assert.equal(confirmed.playback.bytesSent, 4);
    assert.equal(confirmed.radio.id, generated.radio.id);
    assert.equal(confirmed.radio.seedId, 'seed');
    assert.equal(confirmed.radio.playbackConfirmedSong.id, 'candidate-1');

    const disconnectRadioResponse = await fetch(`http://127.0.0.1:${server.address().port}/rest/getSimilarSongs2.view?id=disconnect-seed&count=1&f=json&u=alice&t=tok&s=salt&c=client-c`);
    assert.equal(disconnectRadioResponse.status, 200);
    await waitFor(
      () => webhookEvents.filter((item) => item.payload.event === 'radio.generated').length === 3,
      'disconnect test radio.generated webhook'
    );
    const disconnectedRequest = httpRequest(
      `http://127.0.0.1:${server.address().port}/rest/stream.view?id=candidate-1&f=json&u=alice&t=tok&s=salt&c=client-c`
    );
    disconnectedRequest.on('error', () => {});
    disconnectedRequest.end();
    await waitFor(() => streamRequestCount === 2, 'disconnect test upstream request');
    const disconnected = new Promise((resolve) => disconnectedRequest.once('close', resolve));
    disconnectedRequest.destroy();
    await disconnected;
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(webhookEvents.filter((item) => item.payload.event === 'radio.playback_confirmed').length, 1);

    assert.deepEqual(webhookEvents.map((item) => item.payload.event), [
      'radio.generated',
      'radio.generated',
      'radio.playback_confirmed',
      'radio.generated'
    ]);

    const statusResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/router/status`);
    const status = await statusResponse.json();
    assert.equal(status.router.webhooks.enabled, true);
    assert.equal(status.router.webhooks.recent.length, 4);
    assert.equal(status.router.lastRadioQueue.seedId, 'disconnect-seed');
    assert.equal(status.router.lastRadioQueue.playbackConfirmedSong, null);
    assert.deepEqual(status.router.playbackTraffic.recent, []);
  } finally {
    server.close();
    navidrome.close();
    audiomuse.close();
    webhook.close();
    await Promise.all([once(server, 'close'), once(navidrome, 'close'), once(audiomuse, 'close'), once(webhook, 'close')]);
    delete process.env.NAVIROUTER_WEBHOOK_URL;
    delete process.env.NAVIROUTER_WEBHOOK_SECRET;
    delete process.env.NAVIROUTER_WEBHOOK_EVENTS;
    delete process.env.NAVIROUTER_RECENT_PLAYBACK_LIMIT;
  }
});

test('native musicFolderId scopes AudioMuse similar-song candidates', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'navirouter-library-db-'));
  const dbPath = join(dir, 'navidrome.db');
  execFileSync('sqlite3', [dbPath, `
    create table media_file (id text primary key, library_id integer);
    insert into media_file (id, library_id) values ('seed', 2), ('candidate-1', 2), ('candidate-2', 1);
  `]);

  const navidrome = createServer((req, res) => {
    const url = new URL(req.url, 'http://navidrome.test');
    if (url.pathname.endsWith('/getSong.view')) {
      const id = url.searchParams.get('id');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          song: { id, title: `Song ${id}`, artist: 'Artist', isDir: false }
        }
      }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
  });

  const audiomuse = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([{ item_id: 'candidate-1' }, { item_id: 'candidate-2' }]));
  });

  await Promise.all([
    new Promise((resolve) => navidrome.listen(0, resolve)),
    new Promise((resolve) => audiomuse.listen(0, resolve))
  ]);

  const navidromePort = navidrome.address().port;
  const audiomusePort = audiomuse.address().port;
  process.env.NAVIDROME_URL = `http://127.0.0.1:${navidromePort}`;
  process.env.AUDIOMUSE_URL = `http://127.0.0.1:${audiomusePort}`;
  process.env.NAVIROUTER_ALLOWED_NAVIDROME_HOSTS = `127.0.0.1:${navidromePort}`;
  process.env.NAVIROUTER_ALLOWED_AUDIOMUSE_HOSTS = `127.0.0.1:${audiomusePort}`;
  process.env.NAVIDROME_DB_PATH = dbPath;

  const { server } = await import(`../server.mjs?native-library-scope=${Date.now()}`);
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/rest/getSimilarSongs2.view?id=seed&count=2&f=json&u=alice&t=tok&s=salt&musicFolderId=2`);
    assert.equal(response.status, 200);
    const body = await response.json();
    const songs = body['subsonic-response'].similarSongs2.song;
    assert.deepEqual(songs.map((song) => song.id), ['candidate-1']);
  } finally {
    server.close();
    navidrome.close();
    audiomuse.close();
    await Promise.all([once(server, 'close'), once(navidrome, 'close'), once(audiomuse, 'close')]);
    delete process.env.NAVIDROME_DB_PATH;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('webhook delivery drops new events when its pending queue is full', async () => {
  const webhookEvents = [];
  let releaseFirstDelivery;
  const navidrome = createServer((req, res) => {
    const url = new URL(req.url, 'http://navidrome.test');
    const id = url.searchParams.get('id');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      'subsonic-response': {
        status: 'ok',
        song: { id, title: `Song ${id}`, artist: 'Artist', isDir: false }
      }
    }));
  });
  const audiomuse = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([{ item_id: 'candidate-1' }]));
  });
  const webhook = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    webhookEvents.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (webhookEvents.length === 1) {
      releaseFirstDelivery = () => {
        res.writeHead(204);
        res.end();
      };
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ignored');
  });

  await Promise.all([
    new Promise((resolve) => navidrome.listen(0, resolve)),
    new Promise((resolve) => audiomuse.listen(0, resolve)),
    new Promise((resolve) => webhook.listen(0, resolve))
  ]);

  const navidromePort = navidrome.address().port;
  const audiomusePort = audiomuse.address().port;
  const webhookPort = webhook.address().port;
  process.env.NAVIDROME_URL = `http://127.0.0.1:${navidromePort}`;
  process.env.AUDIOMUSE_URL = `http://127.0.0.1:${audiomusePort}`;
  process.env.NAVIROUTER_ALLOWED_NAVIDROME_HOSTS = `127.0.0.1:${navidromePort}`;
  process.env.NAVIROUTER_ALLOWED_AUDIOMUSE_HOSTS = `127.0.0.1:${audiomusePort}`;
  process.env.NAVIROUTER_WEBHOOK_URL = `http://127.0.0.1:${webhookPort}/events`;
  process.env.NAVIROUTER_WEBHOOK_EVENTS = 'radio.generated';
  process.env.NAVIROUTER_WEBHOOK_QUEUE_MAX = '1';

  const { server } = await import(`../server.mjs?webhook-saturation=${Date.now()}`);
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const radio = (seed) => fetch(`${baseUrl}/rest/getSimilarSongs2.view?id=${seed}&count=1&f=json&u=alice&t=tok&s=salt&c=client-a`);

    assert.equal((await radio('seed-1')).status, 200);
    await waitFor(() => webhookEvents.length === 1, 'first in-flight webhook');
    assert.equal((await radio('seed-2')).status, 200);
    assert.equal((await radio('seed-3')).status, 200);

    let status = await (await fetch(`${baseUrl}/api/router/status`)).json();
    assert.equal(status.router.webhooks.pending, 1);
    assert.equal(status.router.webhooks.dropped, 1);
    assert.equal(webhookEvents.length, 1);

    releaseFirstDelivery();
    releaseFirstDelivery = null;
    await waitFor(() => webhookEvents.length === 2, 'queued webhook delivery');
    status = await (await fetch(`${baseUrl}/api/router/status`)).json();
    assert.equal(status.router.webhooks.pending, 0);
    assert.equal(status.router.webhooks.dropped, 1);
    assert.deepEqual(webhookEvents.map((event) => event.radio.seedId), ['seed-1', 'seed-2']);
  } finally {
    if (releaseFirstDelivery) releaseFirstDelivery();
    server.close();
    navidrome.close();
    audiomuse.close();
    webhook.close();
    await Promise.all([once(server, 'close'), once(navidrome, 'close'), once(audiomuse, 'close'), once(webhook, 'close')]);
    delete process.env.NAVIROUTER_WEBHOOK_URL;
    delete process.env.NAVIROUTER_WEBHOOK_EVENTS;
    delete process.env.NAVIROUTER_WEBHOOK_QUEUE_MAX;
  }
});

test('router records failed AudioMuse radio seed diagnostics before fallback', async () => {
  const webhookEvents = [];
  const navidrome = createServer((req, res) => {
    const url = new URL(req.url, 'http://navidrome.test');
    if (url.pathname.endsWith('/getSong.view')) {
      const id = url.searchParams.get('id');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          song: { id, title: 'Artist Radio Seed', artist: 'Cole Chaney', album: 'Seed Album', isDir: false }
        }
      }));
      return;
    }
    if (
      url.pathname.endsWith('/getSimilarSongs2.view')
      && url.searchParams.get('id') === 'failed-fallback-seed'
    ) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'failed',
          error: { code: 40, message: 'Wrong username or password' }
        }
      }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
  });

  const audiomuse = createServer((req, res) => {
    const url = new URL(req.url, 'http://audiomuse.test');
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    assert.equal(url.pathname, '/api/similar_tracks');
    assert.ok(['artist-radio-seed', 'failed-fallback-seed'].includes(url.searchParams.get('item_id')));
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Target track not found in index or no similar tracks found.' }));
  });
  const webhook = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    webhookEvents.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    res.writeHead(204);
    res.end();
  });

  await Promise.all([
    new Promise((resolve) => navidrome.listen(0, resolve)),
    new Promise((resolve) => audiomuse.listen(0, resolve)),
    new Promise((resolve) => webhook.listen(0, resolve))
  ]);

  const navidromePort = navidrome.address().port;
  const audiomusePort = audiomuse.address().port;
  const webhookPort = webhook.address().port;
  process.env.NAVIDROME_URL = `http://127.0.0.1:${navidromePort}`;
  process.env.AUDIOMUSE_URL = `http://127.0.0.1:${audiomusePort}`;
  process.env.NAVIROUTER_ALLOWED_NAVIDROME_HOSTS = `127.0.0.1:${navidromePort}`;
  process.env.NAVIROUTER_ALLOWED_AUDIOMUSE_HOSTS = `127.0.0.1:${audiomusePort}`;
  process.env.NAVIROUTER_WEBHOOK_URL = `http://127.0.0.1:${webhookPort}/events`;
  process.env.NAVIROUTER_WEBHOOK_EVENTS = 'radio.fallback';

  const { server } = await import(`../server.mjs?radio-failure=${Date.now()}`);
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/rest/getSimilarSongs2.view?id=artist-radio-seed&count=2&f=json&u=alice&t=tok&s=salt`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body['subsonic-response'].status, 'ok');
    await waitFor(() => webhookEvents.length === 1, 'radio.fallback webhook');
    assert.equal(webhookEvents[0].event, 'radio.fallback');
    assert.equal(webhookEvents[0].radioFailure.seedId, 'artist-radio-seed');
    assert.equal(webhookEvents[0].fallback.service, 'Navidrome');
    assert.equal(webhookEvents[0].fallback.status, 200);

    const failedFallbackResponse = await fetch(`http://127.0.0.1:${server.address().port}/rest/getSimilarSongs2.view?id=failed-fallback-seed&count=2&f=json&u=alice&t=tok&s=salt`);
    assert.equal(failedFallbackResponse.status, 200);
    const failedFallbackBody = await failedFallbackResponse.json();
    assert.equal(failedFallbackBody['subsonic-response'].status, 'failed');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(webhookEvents.length, 1);

    const generatedResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/router/radio-playlist`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'artist-radio-seed', u: 'alice', t: 'tok', s: 'salt' })
    });
    assert.equal(generatedResponse.status, 404);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(webhookEvents.length, 1);

    const statusResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/router/status`);
    const status = await statusResponse.json();
    assert.equal(status.router.lastRadioQueue.ok, null);
    assert.equal(status.router.lastRadioFailure.ok, false);
    assert.equal(status.router.lastRadioFailure.seedId, 'artist-radio-seed');
    assert.equal(status.router.lastRadioFailure.seed.title, 'Artist Radio Seed');
    assert.equal(status.router.lastRadioFailure.seed.artist, 'Cole Chaney');
    assert.equal(status.router.lastRadioFailure.status, 404);
    assert.match(status.router.lastRadioFailure.message, /Target track not found/);
  } finally {
    server.close();
    navidrome.close();
    audiomuse.close();
    webhook.close();
    await Promise.all([once(server, 'close'), once(navidrome, 'close'), once(audiomuse, 'close'), once(webhook, 'close')]);
    delete process.env.NAVIROUTER_WEBHOOK_URL;
    delete process.env.NAVIROUTER_WEBHOOK_EVENTS;
  }
});

test('router adapts artist id radio seeds into AudioMuse-backed queues', async () => {
  const navidrome = createServer((req, res) => {
    const url = new URL(req.url, 'http://navidrome.test');
    if (url.pathname.endsWith('/getArtist.view')) {
      assert.equal(url.searchParams.get('id'), 'artist-seed');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          artist: { id: 'artist-seed', name: 'Zach Bryan' }
        }
      }));
      return;
    }
    if (url.pathname.endsWith('/getSong.view')) {
      const id = url.searchParams.get('id');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          song: { id, title: `Song ${id}`, artist: id.startsWith('artist-track') ? 'Zach Bryan' : 'Neighbor Artist', isDir: false }
        }
      }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
  });

  const audiomuse = createServer((req, res) => {
    const url = new URL(req.url, 'http://audiomuse.test');
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (url.pathname === '/api/artist_tracks') {
      assert.equal(url.searchParams.get('artist'), 'Zach Bryan');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify([
        { item_id: 'artist-track-1', title: 'Artist Track 1', author: 'Zach Bryan' },
        { item_id: 'artist-track-2', title: 'Artist Track 2', author: 'Zach Bryan' }
      ]));
      return;
    }
    assert.equal(url.pathname, '/api/similar_tracks');
    const itemId = url.searchParams.get('item_id');
    if (itemId === 'artist-seed') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Target track not found in index or no similar tracks found.' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([{ item_id: `candidate-for-${itemId}` }]));
  });

  await Promise.all([
    new Promise((resolve) => navidrome.listen(0, resolve)),
    new Promise((resolve) => audiomuse.listen(0, resolve))
  ]);

  const navidromePort = navidrome.address().port;
  const audiomusePort = audiomuse.address().port;
  process.env.NAVIDROME_URL = `http://127.0.0.1:${navidromePort}`;
  process.env.AUDIOMUSE_URL = `http://127.0.0.1:${audiomusePort}`;
  process.env.NAVIROUTER_ALLOWED_NAVIDROME_HOSTS = `127.0.0.1:${navidromePort}`;
  process.env.NAVIROUTER_ALLOWED_AUDIOMUSE_HOSTS = `127.0.0.1:${audiomusePort}`;

  const { server } = await import(`../server.mjs?artist-radio=${Date.now()}`);
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/rest/getSimilarSongs2.view?id=artist-seed&count=3&f=json&u=alice&t=tok&s=salt`);
    assert.equal(response.status, 200);
    const body = await response.json();
    const songs = body['subsonic-response'].similarSongs2.song;
    assert.deepEqual(songs.map((song) => song.id), ['artist-track-1', 'artist-track-2', 'candidate-for-artist-track-1']);

    const statusResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/router/status`);
    const status = await statusResponse.json();
    assert.equal(status.router.lastRadioQueue.ok, true);
    assert.equal(status.router.lastRadioQueue.seedId, 'artist-seed');
    assert.equal(status.router.lastRadioQueue.scopeSource, 'artist');
    assert.equal(status.router.lastRadioQueue.returnedCount, 3);
  } finally {
    server.close();
    navidrome.close();
    audiomuse.close();
    await Promise.all([once(server, 'close'), once(navidrome, 'close'), once(audiomuse, 'close')]);
  }
});

test('unscoped AudioMuse radio infers library from seed track when Navidrome DB is configured', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'navirouter-inferred-library-db-'));
  const dbPath = join(dir, 'navidrome.db');
  execFileSync('sqlite3', [dbPath, `
    create table media_file (id text primary key, library_id integer);
    insert into media_file (id, library_id) values ('seed', 2), ('candidate-1', 2), ('candidate-2', 1);
  `]);

  const navidrome = createServer((req, res) => {
    const url = new URL(req.url, 'http://navidrome.test');
    if (url.pathname.endsWith('/getSong.view')) {
      const id = url.searchParams.get('id');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          song: { id, title: `Song ${id}`, artist: 'Artist', isDir: false }
        }
      }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
  });

  const audiomuse = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([{ item_id: 'candidate-1' }, { item_id: 'candidate-2' }]));
  });

  await Promise.all([
    new Promise((resolve) => navidrome.listen(0, resolve)),
    new Promise((resolve) => audiomuse.listen(0, resolve))
  ]);

  const navidromePort = navidrome.address().port;
  const audiomusePort = audiomuse.address().port;
  process.env.NAVIDROME_URL = `http://127.0.0.1:${navidromePort}`;
  process.env.AUDIOMUSE_URL = `http://127.0.0.1:${audiomusePort}`;
  process.env.NAVIROUTER_ALLOWED_NAVIDROME_HOSTS = `127.0.0.1:${navidromePort}`;
  process.env.NAVIROUTER_ALLOWED_AUDIOMUSE_HOSTS = `127.0.0.1:${audiomusePort}`;
  process.env.NAVIDROME_DB_PATH = dbPath;

  const { server } = await import(`../server.mjs?inferred-library-scope=${Date.now()}`);
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/rest/getSimilarSongs2.view?id=seed&count=2&f=json&u=alice&t=tok&s=salt`);
    assert.equal(response.status, 200);
    const body = await response.json();
    const songs = body['subsonic-response'].similarSongs2.song;
    assert.deepEqual(songs.map((song) => song.id), ['candidate-1']);
    const statusResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/router/status`);
    const status = await statusResponse.json();
    assert.equal(status.router.lastRadioQueue.requestedLibraryId, '2');
    assert.equal(status.router.lastRadioQueue.scopeSource, 'seed');
  } finally {
    server.close();
    navidrome.close();
    audiomuse.close();
    await Promise.all([once(server, 'close'), once(navidrome, 'close'), once(audiomuse, 'close')]);
    delete process.env.NAVIDROME_DB_PATH;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('router intercepts getSonicSimilarTracks and returns sonicMatch results', async () => {
  const navidrome = createServer((req, res) => {
    const url = new URL(req.url, 'http://navidrome.test');
    if (url.pathname.endsWith('/getSong.view')) {
      const id = url.searchParams.get('id');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          song: { id, title: `Song ${id}`, artist: 'Artist', isDir: false }
        }
      }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
  });

  const audiomuse = createServer((req, res) => {
    const url = new URL(req.url, 'http://audiomuse.test');
    assert.equal(url.pathname, '/api/similar_tracks');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([{ item_id: 'candidate-1', distance: 0.2 }]));
  });

  await Promise.all([
    new Promise((resolve) => navidrome.listen(0, resolve)),
    new Promise((resolve) => audiomuse.listen(0, resolve))
  ]);

  const navidromePort = navidrome.address().port;
  const audiomusePort = audiomuse.address().port;
  process.env.NAVIDROME_URL = `http://127.0.0.1:${navidromePort}`;
  process.env.AUDIOMUSE_URL = `http://127.0.0.1:${audiomusePort}`;
  process.env.NAVIROUTER_ALLOWED_NAVIDROME_HOSTS = `127.0.0.1:${navidromePort}`;
  process.env.NAVIROUTER_ALLOWED_AUDIOMUSE_HOSTS = `127.0.0.1:${audiomusePort}`;

  const { server } = await import(`../server.mjs?sonic=${Date.now()}`);
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/rest/getSonicSimilarTracks.view?id=seed&count=1&f=json&u=alice&t=tok&s=salt`);
    assert.equal(response.status, 200);
    const body = await response.json();
    const subsonic = body['subsonic-response'];
    assert.equal(subsonic.status, 'ok');
    assert.equal(subsonic.sonicMatch.length, 1);
    assert.equal(subsonic.sonicMatch[0].entry.id, 'candidate-1');
    assert.equal(subsonic.sonicMatch[0].similarity, 0.8);
  } finally {
    server.close();
    navidrome.close();
    audiomuse.close();
    await Promise.all([once(server, 'close'), once(navidrome, 'close'), once(audiomuse, 'close')]);
  }
});

test('router intercepts findSonicPath and returns ordered start bridge end results', async () => {
  const audioMuseLookups = [];
  const navidrome = createServer((req, res) => {
    const url = new URL(req.url, 'http://navidrome.test');
    if (url.pathname.endsWith('/getSong.view')) {
      const id = url.searchParams.get('id');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          song: { id, title: `Song ${id}`, artist: 'Artist', isDir: false }
        }
      }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
  });

  const audiomuse = createServer((req, res) => {
    const url = new URL(req.url, 'http://audiomuse.test');
    assert.equal(url.pathname, '/api/similar_tracks');
    const itemId = url.searchParams.get('item_id');
    audioMuseLookups.push(itemId);
    const candidates = itemId === 'end'
      ? [
          { item_id: 'end', distance: 0 },
          { item_id: 'bridge', distance: 0.2 },
          { item_id: 'end-only', distance: 0.05 }
        ]
      : [
          { item_id: 'start', distance: 0 },
          { item_id: 'bridge', distance: 0.35 },
          { item_id: 'start-only', distance: 0.05 },
          { item_id: 'end', distance: 0.1 }
        ];
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(candidates));
  });

  await Promise.all([
    new Promise((resolve) => navidrome.listen(0, resolve)),
    new Promise((resolve) => audiomuse.listen(0, resolve))
  ]);

  const navidromePort = navidrome.address().port;
  const audiomusePort = audiomuse.address().port;
  process.env.NAVIDROME_URL = `http://127.0.0.1:${navidromePort}`;
  process.env.AUDIOMUSE_URL = `http://127.0.0.1:${audiomusePort}`;
  process.env.NAVIROUTER_ALLOWED_NAVIDROME_HOSTS = `127.0.0.1:${navidromePort}`;
  process.env.NAVIROUTER_ALLOWED_AUDIOMUSE_HOSTS = `127.0.0.1:${audiomusePort}`;

  const { server } = await import(`../server.mjs?path=${Date.now()}`);
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/rest/findSonicPath.view?startSongId=start&endSongId=end&count=3&f=json&u=alice&t=tok&s=salt`);
    assert.equal(response.status, 200);
    const body = await response.json();
    const subsonic = body['subsonic-response'];
    assert.equal(subsonic.status, 'ok');
    assert.deepEqual(subsonic.sonicMatch.map((match) => match.entry.id), ['start', 'bridge', 'end']);
    assert.equal(subsonic.sonicMatch[0].similarity, 1);
    assert.equal(subsonic.sonicMatch[1].similarity, 0.65);
    assert.equal(subsonic.sonicMatch[2].similarity, 1);
    assert.deepEqual(audioMuseLookups.sort(), ['end', 'start']);
  } finally {
    server.close();
    navidrome.close();
    audiomuse.close();
    await Promise.all([once(server, 'close'), once(navidrome, 'close'), once(audiomuse, 'close')]);
  }
});
