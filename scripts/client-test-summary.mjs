import { pathToFileURL } from 'node:url';

async function loadCalls(value) {
  if (/^https?:\/\//i.test(value)) {
    const response = await fetch(value);
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${value}`);
    return response.json();
  }

  const { readFile } = await import('node:fs/promises');
  return JSON.parse(await readFile(value, 'utf8'));
}

async function main(argv = process.argv, env = process.env) {
  const source = argv[2] || env.NAVIROUTER_CLIENT_LOGGER_CALLS_URL || 'http://127.0.0.1:18100/calls';
  const client = env.NAVIROUTER_CLIENT_NAME || argv[3] || 'Client';
  const payload = await loadCalls(source);
  const calls = Array.isArray(payload) ? payload : payload.calls || [];
  if (!Array.isArray(calls) || calls.length === 0) {
    throw new Error('No calls found. Run a client against the logger first, then inspect /calls.');
  }
  return renderMarkdown(client, calls);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(await main());
  } catch (error) {
    console.error(`Could not summarize client calls: ${error.message}`);
    process.exitCode = 1;
  }
}

function renderMarkdown(clientName, calls) {
  const summary = summarizeCalls(calls);
  const lines = [];
  lines.push(`## ${clientName} Runtime Test`);
  lines.push('');
  lines.push(`Date: ${new Date().toISOString().slice(0, 10)}`);
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
  lines.push('');
  lines.push('Result:');
  lines.push('');
  for (const result of recommendation(clientName, summary)) lines.push(`- ${result}`);
  lines.push('');
  lines.push('Raw method counts:');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(summary.counts, null, 2));
  lines.push('```');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function summarizeCalls(calls) {
  const normalized = calls.map((call) => ({
    method: String(call.method || '').toLowerCase(),
    query: call.query || {}
  })).filter((call) => call.method && !['calls', 'reset', 'root'].includes(call.method));
  const counts = {};
  for (const call of normalized) counts[call.method] = (counts[call.method] || 0) + 1;
  const methods = Object.keys(counts).sort();
  const baselineMethods = new Set([
    'getalbum',
    'getalbumlist',
    'getalbumlist2',
    'getartist',
    'getartists',
    'getcoverart',
    'getgenres',
    'getindexes',
    'getmusicdirectory',
    'getplaylists',
    'search2',
    'search3',
    'stream'
  ]);
  const similarMethods = ['getsimilarsongs2', 'getsimilarsongs', 'getsonicsimilartracks', 'findsonicpath'];
  return {
    baseline: normalized.some((call) => baselineMethods.has(call.method)),
    counts,
    libraryScope: normalized.some((call) => call.method === 'getmusicfolders' || call.query.musicFolderId),
    methods,
    openSubsonicDiscovery: normalized.some((call) => call.method === 'getopensubsonicextensions'),
    similarEndpoint: similarMethods.find((method) => normalized.some((call) => call.method === method)) || null
  };
}

function recommendation(clientName, summary) {
  const name = clientName.toLowerCase();
  const results = [];
  if (!summary.baseline) {
    results.push('Do not mark complete yet; no browse/playback baseline was observed.');
    return results;
  }

  if (name.includes('amperfy')) {
    if (!summary.libraryScope) results.push('Do not mark Amperfy complete yet; library switch/scope evidence is missing.');
    if (summary.similarEndpoint !== 'getsimilarsongs2') results.push('Do not mark Amperfy complete yet; expected `getSimilarSongs2` was not observed.');
    if (results.length === 0) results.push('Amperfy roadmap evidence is sufficient if the observed UI path covered browse, library switch, and song/entity preview.');
    return results;
  }

  if (name.includes('symfonium')) {
    if (!summary.libraryScope) results.push('Do not mark Symfonium complete yet; library switch/scope evidence is missing.');
    results.push(summary.similarEndpoint
      ? `Symfonium radio/similar evidence observed via \`${summary.similarEndpoint}\`.`
      : 'Symfonium browse can be documented, but radio/similar behavior was not observed.');
    return results;
  }

  if (name.includes('play:sub') || name.includes('playsub')) {
    results.push(summary.similarEndpoint === 'getsimilarsongs'
      ? 'Play:Sub legacy similar-song evidence observed via `getSimilarSongs`.'
      : 'Play:Sub baseline can be documented, but legacy `getSimilarSongs` was not observed.');
    return results;
  }

  if (name.includes('narjo')) {
    results.push(summary.similarEndpoint
      ? `Narjo baseline and discovery evidence observed via \`${summary.similarEndpoint}\`.`
      : 'Narjo baseline can be documented; no radio/similar endpoint was observed.');
    return results;
  }

  results.push('Review the observed calls against the roadmap before marking this client complete.');
  return results;
}

export {
  loadCalls,
  main,
  recommendation,
  renderMarkdown,
  summarizeCalls
};
