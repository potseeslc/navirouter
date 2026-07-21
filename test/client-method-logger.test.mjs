import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import {
  createClientMethodLoggerServer,
  publicQuery,
  subsonicMethod,
  subsonicXml
} from '../scripts/client-method-logger.mjs';

test('client method logger normalizes Subsonic paths', () => {
  assert.equal(subsonicMethod('/rest/getSimilarSongs2.view'), 'getsimilarsongs2');
  assert.equal(subsonicMethod('/rest/ping'), 'ping');
  assert.equal(subsonicMethod('/calls'), 'calls');
  assert.equal(subsonicMethod('/'), 'root');
});

test('client method logger redacts auth parameters', () => {
  assert.deepEqual(publicQuery(new URLSearchParams('u=alice&p=secret&t=token&s=salt&c=test')), {
    u: '[redacted]',
    p: '[redacted]',
    t: '[redacted]',
    s: '[redacted]',
    c: 'test'
  });
});

test('client method logger renders XML when f=json is omitted', () => {
  const xml = subsonicXml({
    status: 'ok',
    version: '1.16.1',
    type: 'NaviRouterClientLogger',
    serverVersion: '0.0.0',
    openSubsonic: true,
    musicFolders: {
      musicFolder: [
        { id: '1', name: 'Music & More' },
        { id: '2', name: 'Live Music Archive' }
      ]
    }
  });

  assert.match(xml, /^<\?xml version="1.0"/);
  assert.match(xml, /<musicFolder id="1" name="Music &amp; More"\/>/);
  assert.match(xml, /openSubsonic="true"/);
});

test('client method logger supports JSON, XML, POST, calls, and reset', async () => {
  const { server } = createClientMethodLoggerServer({ logger: null });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const xmlResponse = await fetch(`${base}/rest/ping.view?u=fake&p=fake&v=1.16.1&c=test`);
    assert.equal(xmlResponse.status, 200);
    assert.match(xmlResponse.headers.get('content-type'), /application\/xml/);
    assert.match(await xmlResponse.text(), /status="ok"/);

    const extensionsResponse = await fetch(`${base}/rest/getOpenSubsonicExtensions.view?u=fake&p=fake&v=1.16.1&c=test&f=json`);
    assert.equal(extensionsResponse.status, 200);
    const extensions = await extensionsResponse.json();
    assert.equal(extensions['subsonic-response'].openSubsonicExtensions[0].name, 'sonicSimilarity');

    const foldersResponse = await fetch(`${base}/rest/getMusicFolders.view`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'u=fake&p=fake&v=1.16.1&c=test&f=json'
    });
    assert.equal(foldersResponse.status, 200);
    const folders = await foldersResponse.json();
    assert.equal(folders['subsonic-response'].musicFolders.musicFolder.length, 2);

    const callsResponse = await fetch(`${base}/calls`);
    assert.equal(callsResponse.status, 200);
    const calls = await callsResponse.json();
    assert.deepEqual(calls.summary, {
      ping: 1,
      getopensubsonicextensions: 1,
      getmusicfolders: 1,
      calls: 1
    });
    assert.equal(calls.calls[0].query.u, '[redacted]');
    assert.equal(calls.calls[0].query.p, '[redacted]');
    assert.equal(calls.calls[2].query.f, 'json');

    const resetResponse = await fetch(`${base}/reset`);
    assert.equal(resetResponse.status, 200);
    const reset = await resetResponse.json();
    assert.equal(reset.calls.length, 0);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
