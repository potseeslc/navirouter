const routerUrl = serviceUrl(process.env.NAVIROUTER_SMOKE_URL || 'http://127.0.0.1:8098');
const username = process.env.NAVIROUTER_SMOKE_USERNAME || process.env.NAVIDROME_USERNAME || '';
const password = process.env.NAVIROUTER_SMOKE_PASSWORD || process.env.NAVIDROME_PASSWORD || '';
const token = process.env.NAVIROUTER_SMOKE_TOKEN || '';
const salt = process.env.NAVIROUTER_SMOKE_SALT || '';
const seedSongId = process.env.NAVIROUTER_SMOKE_SEED_ID || '';
const endSongId = process.env.NAVIROUTER_SMOKE_END_ID || '';
const clientName = process.env.NAVIROUTER_SMOKE_CLIENT || 'navirouter-smoke';

const results = [];

try {
  await checkJson('/api/health', 'Router health');
  await checkSubsonic('getOpenSubsonicExtensions', {}, 'OpenSubsonic extensions');
  if (seedSongId) {
    await checkSubsonic('getSonicSimilarTracks', { id: seedSongId, count: '5' }, 'Sonic similar tracks');
    await checkSubsonic('getSimilarSongs2', { id: seedSongId, count: '5' }, 'Legacy similar songs');
  } else {
    results.push({ name: 'Sonic endpoints', ok: null, detail: 'skipped; set NAVIROUTER_SMOKE_SEED_ID' });
  }
  if (seedSongId && endSongId) {
    await checkSubsonic('findSonicPath', { startSongId: seedSongId, endSongId, count: '5' }, 'Sonic path');
  } else {
    results.push({ name: 'Sonic path', ok: null, detail: 'skipped; set NAVIROUTER_SMOKE_SEED_ID and NAVIROUTER_SMOKE_END_ID' });
  }
  await checkJson('/api/router/status', 'Router diagnostics');
} catch (error) {
  results.push({ name: 'Smoke test', ok: false, detail: publicError(error) });
}

for (const result of results) {
  const mark = result.ok === true ? 'ok' : result.ok === false ? 'fail' : 'skip';
  console.log(`${mark.padEnd(4)} ${result.name}: ${result.detail}`);
}

if (results.some((result) => result.ok === false)) {
  process.exitCode = 1;
}

async function checkJson(pathname, name) {
  const response = await fetch(new URL(pathname, routerUrl));
  const body = await parseJson(response, name);
  if (!response.ok || body.ok === false) {
    results.push({ name, ok: false, detail: `HTTP ${response.status}` });
    return;
  }
  if (pathname === '/api/router/status') {
    const traffic = body.router?.subsonicTraffic;
    results.push({
      name,
      ok: true,
      detail: `${traffic?.total || 0} Subsonic calls observed`
    });
    return;
  }
  results.push({ name, ok: true, detail: 'healthy' });
}

async function checkSubsonic(method, additions, name) {
  const params = subsonicParams(additions);
  if (!params) {
    results.push({ name, ok: null, detail: 'skipped; set username/password or token/salt auth env vars' });
    return;
  }
  const response = await fetch(new URL(`/rest/${method}.view?${params}`, routerUrl));
  const body = await parseJson(response, name);
  const subsonic = body['subsonic-response'];
  if (!response.ok || subsonic?.status !== 'ok') {
    results.push({ name, ok: false, detail: `HTTP ${response.status}, Subsonic ${subsonic?.status || 'unknown'}` });
    return;
  }

  const songs = subsonic.similarSongs2?.song || subsonic.similarSongs?.song || [];
  const matches = subsonic.sonicMatch || [];
  const extensions = subsonic.openSubsonicExtensions || [];
  const firstTitle = matches[0]?.entry?.title || songs[0]?.title || extensions[0]?.name || 'ok';
  const count = matches.length || songs.length || extensions.length || 0;
  results.push({ name, ok: true, detail: `${count} result(s), first: ${firstTitle}` });
}

function subsonicParams(additions = {}) {
  if (!username) return null;
  const params = new URLSearchParams({
    u: username,
    v: '1.16.1',
    c: clientName,
    f: 'json',
    ...additions
  });
  if (token && salt) {
    params.set('t', token);
    params.set('s', salt);
  } else if (password) {
    params.set('p', password);
  } else {
    return null;
  }
  return params;
}

async function parseJson(response, label) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned non-JSON HTTP ${response.status}`);
  }
}

function serviceUrl(value) {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

function publicError(error) {
  return String(error?.message || error).replace(/([?&](?:u|p|t|s)=)[^&\s]+/gi, '$1[REDACTED]');
}
