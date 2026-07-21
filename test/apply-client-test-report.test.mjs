import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  applyClientTestReport,
  clientNameFromReport,
  completionAllowed,
  reportEvidence,
  upsertClientSection
} from '../scripts/apply-client-test-report.mjs';

const completeAmperfyReport = `## Amperfy Runtime Test

Date: 2026-07-18
Source: NaviRouter live status

Observed calls:

\`\`\`text
getalbumlist2
getindexes
getsimilarsongs2
\`\`\`

Key evidence:

- Baseline browse evidence: yes.
- Library switch/scope evidence: yes.
- Similar/radio endpoint evidence: getsimilarsongs2.
- OpenSubsonic extension discovery: yes.
- AudioMuse queue proof: 99 songs from getsimilarsongs2.

Result:

- Amperfy roadmap evidence is sufficient if the observed UI path covered browse, library switch, and song/entity preview.

Raw method counts:

\`\`\`json
{
  "getalbumlist2": 1,
  "getindexes": 1,
  "getsimilarsongs2": 1
}
\`\`\`
`;

const incompleteAmperfyReport = completeAmperfyReport
  .replace('Library switch/scope evidence: yes.', 'Library switch/scope evidence: no.')
  .replace('Similar/radio endpoint evidence: getsimilarsongs2.', 'Similar/radio endpoint evidence: none observed.')
  .replace('Amperfy roadmap evidence is sufficient if the observed UI path covered browse, library switch, and song/entity preview.', 'Do not mark Amperfy complete yet; expected `getSimilarSongs2` was not observed.');

test('apply report extracts client names and evidence', () => {
  assert.equal(clientNameFromReport(completeAmperfyReport), 'Amperfy');
  assert.deepEqual(reportEvidence(completeAmperfyReport), {
    baseline: true,
    libraryScope: true,
    similarEndpoint: 'getsimilarsongs2',
    hasDoNotMark: false,
    raw: completeAmperfyReport
  });
});

test('apply report refuses incomplete client evidence', () => {
  const evidence = reportEvidence(incompleteAmperfyReport);
  const result = completionAllowed('Amperfy', evidence);
  assert.equal(result.ok, false);
  assert.match(result.reasons.join('\n'), /not to mark/i);
  assert.match(result.reasons.join('\n'), /library/i);
  assert.match(result.reasons.join('\n'), /getSimilarSongs2/i);
});

test('apply report upserts an existing source-inspection section', () => {
  const existing = '# Client Test Results\n\n## Amperfy Source Inspection\n\nOld source notes.\n\n## Remaining Client Test Queue\n\nLater.\n';
  const next = upsertClientSection(existing, 'Amperfy', completeAmperfyReport);
  assert.match(next, /## Amperfy Runtime Test/);
  assert.doesNotMatch(next, /Old source notes/);
  assert.match(next, /## Remaining Client Test Queue/);
});

test('apply report updates roadmap and results only when write is enabled', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'navirouter-apply-report-'));
  const roadmapPath = path.join(dir, 'roadmap.md');
  const resultsPath = path.join(dir, 'results.md');
  await writeFile(roadmapPath, [
    '- [ ] Amperfy: test browse, library switch, radio/similar behavior.',
    '- [ ] Amperfy: test browse, library switch, radio/similar behavior.'
  ].join('\n'), 'utf8');
  await writeFile(resultsPath, '# Client Test Results\n\n## Amperfy Source Inspection\n\nOld.\n', 'utf8');

  const dryRun = await applyClientTestReport({
    clientName: 'Amperfy',
    reportMarkdown: completeAmperfyReport,
    roadmapPath,
    resultsPath
  });
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.roadmapChanged, true);
  assert.equal(dryRun.resultsChanged, true);
  assert.match(await readFile(roadmapPath, 'utf8'), /\[ \] Amperfy/);

  const written = await applyClientTestReport({
    clientName: 'Amperfy',
    reportMarkdown: completeAmperfyReport,
    roadmapPath,
    resultsPath,
    write: true
  });
  assert.equal(written.ok, true);
  assert.doesNotMatch(await readFile(roadmapPath, 'utf8'), /\[ \] Amperfy/);
  assert.match(await readFile(resultsPath, 'utf8'), /## Amperfy Runtime Test/);
});

test('apply report does not change files when evidence is incomplete', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'navirouter-apply-incomplete-'));
  const roadmapPath = path.join(dir, 'roadmap.md');
  const resultsPath = path.join(dir, 'results.md');
  await writeFile(roadmapPath, '- [ ] Amperfy: test browse, library switch, radio/similar behavior.\n', 'utf8');
  await writeFile(resultsPath, '# Client Test Results\n', 'utf8');

  const result = await applyClientTestReport({
    clientName: 'Amperfy',
    reportMarkdown: incompleteAmperfyReport,
    roadmapPath,
    resultsPath,
    write: true
  });
  assert.equal(result.ok, false);
  assert.match(await readFile(roadmapPath, 'utf8'), /\[ \] Amperfy/);
  assert.doesNotMatch(await readFile(resultsPath, 'utf8'), /Amperfy Runtime Test/);
});
