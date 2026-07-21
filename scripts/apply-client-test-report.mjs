import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const CLIENTS = new Map([
  ['amperfy', {
    label: 'Amperfy',
    roadmapPattern: /^- \[ \] Amperfy: test browse, library switch, radio\/similar behavior\.$/gm,
    roadmapDone: '- [x] Amperfy: test browse, library switch, radio/similar behavior.'
  }],
  ['symfonium', {
    label: 'Symfonium',
    roadmapPattern: /^- \[ \] Symfonium: test browse, library switch, radio\/similar behavior\.$/gm,
    roadmapDone: '- [x] Symfonium: test browse, library switch, radio/similar behavior.'
  }],
  ['play:sub', {
    label: 'Play:Sub',
    aliases: ['playsub'],
    roadmapPattern: /^- \[ \] Play:Sub: test legacy `getSimilarSongs` behavior\.$/gm,
    roadmapDone: '- [x] Play:Sub: test legacy `getSimilarSongs` behavior.'
  }],
  ['narjo', {
    label: 'Narjo',
    roadmapPattern: /^- \[ \] Narjo: test baseline Subsonic compatibility\.$/gm,
    roadmapDone: '- [x] Narjo: test baseline Subsonic compatibility.'
  }]
]);

async function main(argv = process.argv) {
  const args = parseArgs(argv.slice(2));
  if (!args.report) {
    throw new Error('Usage: npm run client:apply -- --client Amperfy --report /tmp/amperfy.md [--write]');
  }
  const reportMarkdown = await readFile(args.report, 'utf8');
  const result = await applyClientTestReport({
    clientName: args.client || clientNameFromReport(reportMarkdown),
    reportMarkdown,
    write: args.write,
    roadmapPath: args.roadmapPath,
    resultsPath: args.resultsPath
  });
  return renderApplyResult(result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(await main());
  } catch (error) {
    console.error(`Could not apply client test report: ${error.message}`);
    process.exitCode = 1;
  }
}

async function applyClientTestReport({
  clientName,
  reportMarkdown,
  write = false,
  roadmapPath = 'docs/roadmap-todo.md',
  resultsPath = 'docs/client-test-results.md'
}) {
  const client = clientConfig(clientName);
  const evidence = reportEvidence(reportMarkdown);
  const allowed = completionAllowed(client.label, evidence);
  if (!allowed.ok) {
    return {
      ok: false,
      write,
      client: client.label,
      reasons: allowed.reasons,
      roadmapChanged: false,
      resultsChanged: false
    };
  }

  const [roadmap, results] = await Promise.all([
    readFile(roadmapPath, 'utf8'),
    readFile(resultsPath, 'utf8')
  ]);
  const nextRoadmap = roadmap.replace(client.roadmapPattern, client.roadmapDone);
  const section = normalizedReportSection(client.label, reportMarkdown);
  const nextResults = upsertClientSection(results, client.label, section);
  const roadmapChanged = nextRoadmap !== roadmap;
  const resultsChanged = nextResults !== results;

  if (write) {
    await Promise.all([
      roadmapChanged ? writeFile(roadmapPath, nextRoadmap, 'utf8') : Promise.resolve(),
      resultsChanged ? writeFile(resultsPath, nextResults, 'utf8') : Promise.resolve()
    ]);
  }

  return {
    ok: true,
    write,
    client: client.label,
    reasons: [],
    roadmapChanged,
    resultsChanged
  };
}

function parseArgs(args) {
  const result = {
    client: '',
    report: '',
    roadmapPath: 'docs/roadmap-todo.md',
    resultsPath: 'docs/client-test-results.md',
    write: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--write') result.write = true;
    else if (arg === '--client') result.client = args[++index] || '';
    else if (arg === '--report') result.report = args[++index] || '';
    else if (arg === '--roadmap') result.roadmapPath = args[++index] || result.roadmapPath;
    else if (arg === '--results') result.resultsPath = args[++index] || result.resultsPath;
    else if (!result.report) result.report = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

function clientConfig(name) {
  const normalized = normalizeClientName(name);
  for (const [key, config] of CLIENTS.entries()) {
    if (normalized === key || (config.aliases || []).includes(normalized)) return config;
  }
  throw new Error(`Unsupported client: ${name || 'unknown'}`);
}

function normalizeClientName(name) {
  return String(name || '').trim().toLowerCase();
}

function clientNameFromReport(markdown) {
  const match = String(markdown || '').match(/^##\s+(.+?)\s+Runtime Test/m);
  return match?.[1] || '';
}

function reportEvidence(markdown) {
  return {
    baseline: /Baseline browse evidence:\s+yes\./i.test(markdown),
    libraryScope: /Library switch\/scope evidence:\s+yes\./i.test(markdown),
    similarEndpoint: (markdown.match(/Similar\/radio endpoint evidence:\s+([^\n.]+)/i)?.[1] || '').trim().toLowerCase(),
    hasDoNotMark: /do not mark .*complete yet|do not mark complete yet/i.test(markdown),
    raw: markdown
  };
}

function completionAllowed(clientName, evidence) {
  const reasons = [];
  if (evidence.hasDoNotMark) reasons.push('Report explicitly says not to mark this client complete.');
  if (!evidence.baseline) reasons.push('Baseline browse/playback evidence is missing.');

  const normalized = normalizeClientName(clientName);
  if (normalized === 'amperfy') {
    if (!evidence.libraryScope) reasons.push('Amperfy library switch/scope evidence is missing.');
    if (evidence.similarEndpoint !== 'getsimilarsongs2') reasons.push('Amperfy expected getSimilarSongs2 evidence is missing.');
  } else if (normalized === 'symfonium') {
    if (!evidence.libraryScope) reasons.push('Symfonium library switch/scope evidence is missing.');
  } else if (normalized === 'play:sub') {
    if (evidence.similarEndpoint !== 'getsimilarsongs') reasons.push('Play:Sub legacy getSimilarSongs evidence is missing.');
  }

  return { ok: reasons.length === 0, reasons };
}

function normalizedReportSection(clientName, reportMarkdown) {
  const body = String(reportMarkdown || '').trim();
  if (!body) throw new Error('Report markdown is empty.');
  return body.replace(/^##\s+.+?\s+Runtime Test/m, `## ${clientName} Runtime Test`);
}

function upsertClientSection(results, clientName, section) {
  const escaped = escapeRegExp(clientName);
  const runtimePattern = new RegExp(`\\n## ${escaped} Runtime Test\\n[\\s\\S]*?(?=\\n## |\\n$)`);
  const sourcePattern = new RegExp(`\\n## ${escaped} Source Inspection\\n[\\s\\S]*?(?=\\n## |\\n$)`);
  const replacement = `\n${section}\n`;
  if (runtimePattern.test(results)) return results.replace(runtimePattern, replacement);
  if (sourcePattern.test(results)) return results.replace(sourcePattern, replacement);
  return `${results.trimEnd()}\n\n${section}\n`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderApplyResult(result) {
  const mode = result.write ? 'write' : 'dry-run';
  const lines = [];
  lines.push(`${result.ok ? 'OK' : 'NOT APPLIED'} (${mode}): ${result.client}`);
  if (result.ok) {
    lines.push(`- Roadmap changed: ${result.roadmapChanged ? 'yes' : 'no'}`);
    lines.push(`- Results changed: ${result.resultsChanged ? 'yes' : 'no'}`);
    if (!result.write) lines.push('- Re-run with --write to update files.');
  } else {
    for (const reason of result.reasons) lines.push(`- ${reason}`);
  }
  return `${lines.join('\n')}\n`;
}

export {
  applyClientTestReport,
  clientNameFromReport,
  completionAllowed,
  reportEvidence,
  renderApplyResult,
  upsertClientSection
};
