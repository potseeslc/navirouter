import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  loadCalls,
  recommendation,
  renderMarkdown,
  summarizeCalls
} from '../scripts/client-test-summary.mjs';

test('client test summary detects baseline, library scope, discovery, and similar endpoint evidence', () => {
  const summary = summarizeCalls([
    { method: 'ping', query: {} },
    { method: 'getOpenSubsonicExtensions', query: { c: 'Client' } },
    { method: 'getMusicFolders', query: {} },
    { method: 'getIndexes', query: { musicFolderId: '2' } },
    { method: 'getSimilarSongs2', query: { id: 'song-1' } },
    { method: 'calls', query: {} }
  ]);

  assert.equal(summary.baseline, true);
  assert.equal(summary.libraryScope, true);
  assert.equal(summary.openSubsonicDiscovery, true);
  assert.equal(summary.similarEndpoint, 'getsimilarsongs2');
  assert.deepEqual(summary.counts, {
    getopensubsonicextensions: 1,
    getmusicfolders: 1,
    getindexes: 1,
    getsimilarsongs2: 1,
    ping: 1
  });
});

test('client test summary keeps incomplete Amperfy captures unchecked', () => {
  const summary = summarizeCalls([
    { method: 'getAlbumList2', query: {} },
    { method: 'getMusicFolders', query: {} }
  ]);

  assert.deepEqual(recommendation('Amperfy', summary), [
    'Do not mark Amperfy complete yet; expected `getSimilarSongs2` was not observed.'
  ]);
});

test('client test summary accepts complete Amperfy evidence', () => {
  const summary = summarizeCalls([
    { method: 'getAlbumList2', query: {} },
    { method: 'getIndexes', query: { musicFolderId: '1' } },
    { method: 'getSimilarSongs2', query: { id: 'song-1' } }
  ]);

  assert.deepEqual(recommendation('Amperfy', summary), [
    'Amperfy roadmap evidence is sufficient if the observed UI path covered browse, library switch, and song/entity preview.'
  ]);
});

test('client test summary renders markdown evidence', () => {
  const markdown = renderMarkdown('Play:Sub', [
    { method: 'getAlbumList2', query: {} },
    { method: 'getSimilarSongs', query: { id: 'song-1' } }
  ]);

  assert.match(markdown, /^## Play:Sub Runtime Test/);
  assert.match(markdown, /Baseline browse evidence: yes/);
  assert.match(markdown, /Similar\/radio endpoint evidence: getsimilarsongs/);
  assert.match(markdown, /Play:Sub legacy similar-song evidence observed via `getSimilarSongs`/);
});

test('client test summary loads logger JSON from a file', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'navirouter-client-summary-'));
  const file = path.join(dir, 'calls.json');
  await writeFile(file, JSON.stringify({ calls: [{ method: 'getGenres', query: {} }] }), 'utf8');

  assert.deepEqual(await loadCalls(file), {
    calls: [{ method: 'getGenres', query: {} }]
  });
});
