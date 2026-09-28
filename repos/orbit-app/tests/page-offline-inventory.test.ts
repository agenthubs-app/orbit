import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  PAGE_OFFLINE_INVENTORY,
  auditPageOfflineInventory,
  listRouteFiles,
  renderPageInventoryMarkdown,
} from '../scripts/page-offline-inventory';

const root = process.cwd();

// Sprint 0131 (SC-0131-01): every route under app/ has an offline owner. A new
// route that is not registered — or a registered route that no longer exists —
// fails this test, and the committed docs/offline/page-inventory.md must be the
// rendering of the registry (regenerate with `npx tsx scripts/page-offline-inventory.ts --write`).
test('every App route is registered with an offline classification and owner', async () => {
  const routes = await listRouteFiles(root);
  assert.ok(routes.length > 80, `expected the full route tree, got ${routes.length}`);
  assert.deepEqual(auditPageOfflineInventory(routes, PAGE_OFFLINE_INVENTORY), []);
});

test('an unregistered new route, a stale entry and an ownerless entry are all reported', () => {
  const routes = [...PAGE_OFFLINE_INVENTORY.map((entry) => entry.file), 'app/brand-new-page.tsx'].filter((file) => file !== 'app/today.tsx');
  const broken = [
    ...PAGE_OFFLINE_INVENTORY,
    { ...PAGE_OFFLINE_INVENTORY.find((entry) => entry.classification === 'online-only')!, file: 'app/no-reason.tsx', reason: '' },
    (({ sprint: _sprint, ...rest }) => ({ ...rest, file: 'app/no-sprint.tsx' }))(PAGE_OFFLINE_INVENTORY.find((entry) => entry.classification === 'local-first')!),
  ];
  const findings = auditPageOfflineInventory([...routes, 'app/no-reason.tsx', 'app/no-sprint.tsx'], broken);
  assert.ok(findings.includes('UNREGISTERED:app/brand-new-page.tsx'), findings.join('\n'));
  assert.ok(findings.includes('STALE:app/today.tsx'), findings.join('\n'));
  assert.ok(findings.includes('NO_REASON:app/no-reason.tsx'), findings.join('\n'));
  assert.ok(findings.includes('NO_SPRINT:app/no-sprint.tsx'), findings.join('\n'));
  const duplicated = auditPageOfflineInventory(routes.concat('app/today.tsx'), [...PAGE_OFFLINE_INVENTORY, PAGE_OFFLINE_INVENTORY.find((entry) => entry.file === 'app/today.tsx')!]);
  assert.ok(duplicated.includes('DUPLICATE:app/today.tsx'), duplicated.join('\n'));
});

test('the committed page inventory document is the rendering of the registry', async () => {
  const committed = await readFile(resolve(root, 'docs/offline/page-inventory.md'), 'utf8');
  assert.equal(committed, renderPageInventoryMarkdown(PAGE_OFFLINE_INVENTORY));
});

test('the pages the user named in 0131 are local-first, and online-only pages name a reason category', () => {
  const byFile = new Map(PAGE_OFFLINE_INVENTORY.map((entry) => [entry.file, entry]));
  for (const file of [
    'app/home.tsx', 'app/(app)/profile.tsx', 'app/profile/preview.tsx', 'app/profile/tags.tsx', 'app/agent.tsx', 'app/agent/actions.tsx',
    'app/contacts/all-actions.tsx', 'app/tasks.tsx', 'app/today.tsx', 'app/schedule/meetings/[id].tsx', 'app/(app)/events.tsx', 'app/home/events.tsx',
  ]) {
    const entry = byFile.get(file);
    assert.equal(entry?.classification, 'local-first', file);
    assert.equal(entry?.sprint, '0131', file);
  }
  for (const entry of PAGE_OFFLINE_INVENTORY.filter((candidate) => candidate.classification === 'online-only')) {
    assert.ok(entry.reasonCategory, entry.file);
  }
});
