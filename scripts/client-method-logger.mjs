import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const host = process.env.NAVIROUTER_CLIENT_LOGGER_HOST || '0.0.0.0';
const port = Number(process.env.NAVIROUTER_CLIENT_LOGGER_PORT || 18100);

const song = {
  id: 'song-1',
  parent: 'album-1',
  isDir: false,
  title: 'Mock Track',
  album: 'Mock Album',
  artist: 'Mock Artist',
  coverArt: 'album-1',
  duration: 180,
  albumId: 'album-1',
  artistId: 'artist-1',
  type: 'music',
  contentType: 'audio/mpeg',
  suffix: 'mp3',
  bitRate: 320,
  size: 123456,
  created: '2026-01-01T00:00:00Z'
};

const album = {
  id: 'album-1',
  name: 'Mock Album',
  title: 'Mock Album',
  artist: 'Mock Artist',
  artistId: 'artist-1',
  songCount: 1,
  duration: 180,
  created: '2026-01-01T00:00:00Z',
  coverArt: 'album-1'
};

const artist = {
  id: 'artist-1',
  name: 'Mock Artist',
  albumCount: 1,
  coverArt: 'artist-1'
};

const user = {
  username: 'fake',
  email: 'fake@example.invalid',
  scrobblingEnabled: true,
  adminRole: false,
  settingsRole: true,
  downloadRole: true,
  uploadRole: false,
  playlistRole: true,
  coverArtRole: true,
  commentRole: false,
  podcastRole: false,
  streamRole: true,
  jukeboxRole: false,
  shareRole: false,
  videoConversionRole: false,
  avatarLastChanged: '2026-01-01T00:00:00Z',
  folder: [1, 2]
};

function createClientMethodLoggerServer({ logger = console.log } = {}) {
  const calls = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const params = mergedParams(url.searchParams, await bodyParams(req));
    const method = subsonicMethod(url.pathname);
    const call = {
      at: new Date().toISOString(),
      method,
      path: url.pathname,
      query: publicQuery(params)
    };
    calls.push(call);
    logCall(call, logger);

    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    res.setHeader('access-control-allow-headers', '*');
    if (req.method === 'OPTIONS') return res.end();

    if (url.pathname === '/' || url.pathname === '/calls') {
      return sendJson(res, {
        ok: true,
        calls,
        summary: callSummary(calls)
      });
    }

    if (url.pathname === '/reset') {
      calls.length = 0;
      return sendJson(res, { ok: true, calls: [] });
    }

    if (method === 'stream') {
      res.writeHead(200, { 'content-type': 'audio/mpeg' });
      return res.end(Buffer.alloc(2048));
    }

    if (method === 'getcoverart') {
      res.writeHead(200, { 'content-type': 'image/png' });
      return res.end(Buffer.from('iVBORw0KGgo=', 'base64'));
    }

    return sendSubsonic(res, params, responseFor(method));
  });
  return { server, calls };
}

function startClientMethodLogger({ host: listenHost = host, port: listenPort = port } = {}) {
  const { server } = createClientMethodLoggerServer();
  server.listen(listenPort, listenHost, () => {
    console.log(`NaviRouter client method logger listening on http://${listenHost}:${listenPort}`);
    console.log('Use fake credentials: username fake, password fake.');
    console.log('Inspect calls at /calls or reset with /reset.');
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startClientMethodLogger();
}

function responseFor(method) {
  if (method === 'ping') return {};
  if (method === 'getlicense') return { license: { valid: true, email: 'fake@example.invalid' } };
  if (method === 'getuser') return { user };
  if (method === 'getscanstatus') return { scanStatus: { scanning: false, count: 1 } };
  if (method === 'getopensubsonicextensions') {
    return {
      openSubsonicExtensions: [
        { name: 'sonicSimilarity', versions: [1] },
        { name: 'formPost', versions: [1] }
      ]
    };
  }
  if (method === 'getmusicfolders') {
    return {
      musicFolders: {
        musicFolder: [
          { id: '1', name: 'Music' },
          { id: '2', name: 'Live Music Archive' }
        ]
      }
    };
  }
  if (method === 'getartists') return { artists: { ignoredArticles: 'The', index: [{ name: 'M', artist: [artist] }] } };
  if (method === 'getartist') return { artist: { ...artist, album: [album] } };
  if (method === 'getalbum') return { album: { ...album, song: [song] } };
  if (method === 'getalbumlist') return { albumList: { album: [album] } };
  if (method === 'getalbumlist2') return { albumList2: { album: [album] } };
  if (method === 'getstarred') return { starred: { artist: [], album: [], song: [] } };
  if (method === 'getstarred2') return { starred2: { artist: [], album: [], song: [] } };
  if (method === 'getplaylists') return { playlists: { playlist: [] } };
  if (method === 'getgenres') return { genres: { genre: [{ value: 'Mock', songCount: 1, albumCount: 1 }] } };
  if (method === 'getindexes') return { indexes: { ignoredArticles: 'The', index: [{ name: 'M', artist: [artist] }] } };
  if (method === 'getmusicdirectory') return { directory: { id: 'album-1', name: 'Mock Album', child: [song] } };
  if (method === 'search2') return { searchResult2: { artist: [artist], album: [album], song: [song] } };
  if (method === 'search3') return { searchResult3: { artist: [artist], album: [album], song: [song] } };
  if (method === 'getrandomsongs') return { randomSongs: { song: [song] } };
  if (method === 'getsong') return { song };
  if (method === 'scrobble') return {};
  if (method === 'getsimilarsongs') return { similarSongs: { song: [song] } };
  if (method === 'getsimilarsongs2') return { similarSongs2: { song: [song] } };
  if (method === 'getsonicsimilartracks') return { sonicMatch: [{ entry: song, similarity: 0.91 }] };
  if (method === 'findsonicpath') return { sonicMatch: [{ entry: song, similarity: 1 }] };
  if (method === 'jukeboxcontrol') return { jukeboxStatus: { currentIndex: -1, playing: false, gain: 1, position: 0 } };
  return {};
}

function sendSubsonic(res, params, body) {
  const subsonic = {
    status: 'ok',
    version: '1.16.1',
    type: 'NaviRouterClientLogger',
    serverVersion: '0.0.0',
    openSubsonic: true,
    ...body
  };

  if (String(params.get('f') || '').toLowerCase() === 'json') {
    return sendJson(res, { 'subsonic-response': subsonic });
  }

  res.writeHead(200, {
    'content-type': 'application/xml; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(subsonicXml(subsonic));
}

function sendJson(res, body) {
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(JSON.stringify(body, null, 2));
}

function subsonicMethod(pathname) {
  if (!pathname.startsWith('/rest/')) return pathname.replace(/^\/+/, '').toLowerCase() || 'root';
  return pathname.split('/').pop().replace(/\.view$/, '').toLowerCase();
}

async function bodyParams(req) {
  if (req.method !== 'POST') return new URLSearchParams();
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_048_576) break;
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function mergedParams(urlParams, postParams) {
  const merged = new URLSearchParams(urlParams);
  for (const [key, value] of postParams.entries()) merged.set(key, value);
  return merged;
}

function publicQuery(params) {
  const result = {};
  for (const [key, value] of params.entries()) {
    result[key] = ['u', 'p', 't', 's'].includes(key.toLowerCase()) ? '[redacted]' : value;
  }
  return result;
}

function callSummary(calls) {
  return calls.reduce((summary, call) => {
    summary[call.method] = (summary[call.method] || 0) + 1;
    return summary;
  }, {});
}

function logCall(call, logger = console.log) {
  if (!logger) return;
  const query = Object.keys(call.query).length ? ` ${JSON.stringify(call.query)}` : '';
  logger(`${call.at} ${call.method}${query}`);
}

function subsonicXml(body) {
  const attrs = [
    ['xmlns', 'http://subsonic.org/restapi'],
    ['status', body.status],
    ['version', body.version],
    ['type', body.type],
    ['serverVersion', body.serverVersion],
    ['openSubsonic', body.openSubsonic ? 'true' : 'false']
  ].map(([key, value]) => `${key}="${xmlEscape(value)}"`).join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?><subsonic-response ${attrs}>${subsonicXmlBody(body)}</subsonic-response>`;
}

function subsonicXmlBody(body) {
  if (body.license) return `<license valid="${xmlEscape(body.license.valid)}" email="${xmlEscape(body.license.email || '')}"/>`;
  if (body.user) return `<user ${xmlAttrs(body.user)}/>`;
  if (body.scanStatus) return `<scanStatus ${xmlAttrs(body.scanStatus)}/>`;
  if (body.openSubsonicExtensions) {
    const extensions = body.openSubsonicExtensions.map((extension) => {
      const versions = (extension.versions || []).map((version) => `<version>${xmlEscape(version)}</version>`).join('');
      return `<openSubsonicExtension name="${xmlEscape(extension.name)}">${versions}</openSubsonicExtension>`;
    }).join('');
    return `<openSubsonicExtensions>${extensions}</openSubsonicExtensions>`;
  }
  if (body.musicFolders) {
    return `<musicFolders>${body.musicFolders.musicFolder.map((folder) => `<musicFolder ${xmlAttrs(folder)}/>`).join('')}</musicFolders>`;
  }
  if (body.artists) {
    return `<artists ignoredArticles="${xmlEscape(body.artists.ignoredArticles || '')}">${body.artists.index.map((index) => `<index name="${xmlEscape(index.name)}">${index.artist.map((item) => `<artist ${xmlAttrs(item)}/>`).join('')}</index>`).join('')}</artists>`;
  }
  if (body.artist) {
    const albums = (body.artist.album || []).map((item) => `<album ${xmlAttrs(item)}/>`).join('');
    return `<artist ${xmlAttrs({ ...body.artist, album: undefined })}>${albums}</artist>`;
  }
  if (body.album) {
    const songs = (body.album.song || []).map((item) => `<song ${xmlAttrs(item)}/>`).join('');
    return `<album ${xmlAttrs({ ...body.album, song: undefined })}>${songs}</album>`;
  }
  if (body.albumList) return `<albumList>${body.albumList.album.map((item) => `<album ${xmlAttrs(item)}/>`).join('')}</albumList>`;
  if (body.albumList2) return `<albumList2>${body.albumList2.album.map((item) => `<album ${xmlAttrs(item)}/>`).join('')}</albumList2>`;
  if (body.starred) return `<starred/>`;
  if (body.starred2) return `<starred2/>`;
  if (body.playlists) return `<playlists>${body.playlists.playlist.map((item) => `<playlist ${xmlAttrs(item)}/>`).join('')}</playlists>`;
  if (body.genres) return `<genres>${body.genres.genre.map((item) => `<genre songCount="${xmlEscape(item.songCount)}" albumCount="${xmlEscape(item.albumCount)}">${xmlEscape(item.value)}</genre>`).join('')}</genres>`;
  if (body.indexes) return `<indexes ignoredArticles="${xmlEscape(body.indexes.ignoredArticles || '')}">${body.indexes.index.map((index) => `<index name="${xmlEscape(index.name)}">${index.artist.map((item) => `<artist ${xmlAttrs(item)}/>`).join('')}</index>`).join('')}</indexes>`;
  if (body.directory) return `<directory ${xmlAttrs({ id: body.directory.id, name: body.directory.name })}>${body.directory.child.map((item) => `<child ${xmlAttrs(item)}/>`).join('')}</directory>`;
  if (body.searchResult2) return searchResultXml('searchResult2', body.searchResult2);
  if (body.searchResult3) return searchResultXml('searchResult3', body.searchResult3);
  if (body.randomSongs) return `<randomSongs>${body.randomSongs.song.map((item) => `<song ${xmlAttrs(item)}/>`).join('')}</randomSongs>`;
  if (body.song) return `<song ${xmlAttrs(body.song)}/>`;
  if (body.similarSongs) return `<similarSongs>${body.similarSongs.song.map((item) => `<song ${xmlAttrs(item)}/>`).join('')}</similarSongs>`;
  if (body.similarSongs2) return `<similarSongs2>${body.similarSongs2.song.map((item) => `<song ${xmlAttrs(item)}/>`).join('')}</similarSongs2>`;
  if (body.sonicMatch) return body.sonicMatch.map((match) => `<sonicMatch similarity="${xmlEscape(match.similarity)}"><entry ${xmlAttrs(match.entry)}/></sonicMatch>`).join('');
  if (body.jukeboxStatus) return `<jukeboxStatus ${xmlAttrs(body.jukeboxStatus)}/>`;
  return '';
}

function searchResultXml(key, result) {
  const artists = (result.artist || []).map((item) => `<artist ${xmlAttrs(item)}/>`).join('');
  const albums = (result.album || []).map((item) => `<album ${xmlAttrs(item)}/>`).join('');
  const songs = (result.song || []).map((item) => `<song ${xmlAttrs(item)}/>`).join('');
  return `<${key}>${artists}${albums}${songs}</${key}>`;
}

function xmlAttrs(object) {
  return Object.entries(object)
    .filter(([, value]) => value !== undefined && value !== null && !Array.isArray(value) && typeof value !== 'object')
    .map(([key, value]) => `${key}="${xmlEscape(value)}"`)
    .join(' ');
}

function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export {
  callSummary,
  createClientMethodLoggerServer,
  publicQuery,
  startClientMethodLogger,
  subsonicMethod,
  subsonicXml
};
