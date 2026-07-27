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
