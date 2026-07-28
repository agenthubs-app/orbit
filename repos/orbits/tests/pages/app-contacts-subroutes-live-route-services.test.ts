import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

const subroutes = [
  {
    marker: "app-contacts-pipeline-route",
    sourcePath: "app/(app)/app/contacts/pipeline/page.tsx",
  },
  {
    marker: "app-contacts-graph-route",
    sourcePath: "app/(app)/app/contacts/graph/page.tsx",
  },
  {
    marker: "app-contacts-intros-route",
    sourcePath: "app/(app)/app/contacts/intros/page.tsx",
  },
] as const;

for (const subroute of subroutes) {
  test(`${subroute.marker} uses the live contacts route service boundary`, async () => {
    const pageSource = source(subroute.sourcePath);

    assert.match(pageSource, /loadAppContactsRouteViewModel/);
    assert.match(pageSource, /contactsRouteToOrbitContactsViewModel/);
    assert.match(pageSource, /await auth\(\)/);
    assert.match(pageSource, /redirect\("\/app\/account\/login/);
    assert.match(pageSource, /session\.user\.id/);
    assert.doesNotMatch(pageSource, /getOrbitContactsViewModel/);
  });
}

test("contacts pipeline exposes only source-backed read behavior", () => {
  const pipelineSource = source(
    "app/(app)/app/contacts/orbit-real-cards-pipeline-view.tsx",
  );

  assert.match(pipelineSource, /Read-only grouping from follow-up signals/);
  assert.ok(
    pipelineSource.includes('href={`/app/contacts/${contact.id}`}'),
  );
  assert.doesNotMatch(pipelineSource, /AI Summit 2026/);
  assert.doesNotMatch(pipelineSource, /triageQueue|reminders|statusMap/);
  assert.doesNotMatch(
    pipelineSource,
    /Stage updated|Saved to their connection profile timeline/,
  );
  assert.doesNotMatch(
    pipelineSource,
    /Organize after-event contacts|One email each|Set reminder|Draft email/,
  );
});

test("contacts introductions use stored actor-scoped records, not contact-derived history", () => {
  const adapterSource = source(
    "app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-subroute-route-adapter.tsx",
  );
  const pageSource = source("app/(app)/app/contacts/intros/page.tsx");
  const componentSource = source(
    "app/(app)/app/contacts/orbit-real-contacts.tsx",
  );

  assert.match(adapterSource, /intros: \[\]/);
  assert.doesNotMatch(adapterSource, /payload\.contacts\.slice\(0, 6\)/);
  assert.match(pageSource, /createConfiguredContactIntroductionRepository/);
  assert.match(pageSource, /introductionRepository\.list\(session\.user\.id\)/);
  assert.match(componentSource, /\/api\/contacts\/introductions/);
  assert.match(componentSource, /statusBadge: introduction\.status/);
  assert.match(componentSource, /function IntroDetailModal/);
  assert.match(componentSource, /setSelectedIntroduction\(intro\)/);
  assert.match(componentSource, /查看详情/);
  assert.match(pageSource, /contactAId: introduction\.contactAId/);
  assert.match(pageSource, /createdAt: introduction\.createdAt/);
  assert.match(componentSource, /No contacts are available yet/);
  assert.match(componentSource, /No contacts match this search/);
  assert.match(componentSource, /href="\/app\/contacts\/new"/);
});

test("contacts sidebars expose one import hub entry without a duplicate scan-card destination", () => {
  const sharedSidebarSource = source(
    "app/(app)/app/contacts/orbit-crm-sidebar.tsx",
  );
  const contactsSource = source(
    "app/(app)/app/contacts/orbit-real-contacts.tsx",
  );

  assert.match(sharedSidebarSource, /Import hub/);
  assert.doesNotMatch(sharedSidebarSource, /Scan card/);
  assert.doesNotMatch(
    contactsSource.match(/function crmNavItems[\s\S]*?\n\}/)?.[0] ?? "",
    /Scan card/,
  );
});

test("contacts shared interactions do not fabricate actions or email delivery", () => {
  const interactionSource = source(
    "app/(app)/app/contacts/orbit-cards-interactions.tsx",
  );

  assert.match(interactionSource, /\.nc-basis\.is-open/);
  assert.doesNotMatch(
    interactionSource,
    /Email sent \(demo\)|邮件已发送|Done:|已执行：|Draft rewritten by AI|AI 重写|data-sheet="email"|nc-send|nc-rewrite/,
  );
  assert.doesNotMatch(
    interactionSource,
    /target\.closest<HTMLElement>\("\\.btn, button"\)|href"\) === "#"/,
  );
});
