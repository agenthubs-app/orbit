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
    "app/(app)/app/contacts/network-0918/network-pipeline.tsx",
  );

  assert.match(pipelineSource, /viewModel\.connections\.map\(toPerson\)/);
  assert.ok(pipelineSource.includes("href={p.href}"));
  assert.doesNotMatch(pipelineSource, /AI Summit 2026/);
  assert.doesNotMatch(pipelineSource, /triageQueue|statusMap|const reminders/);
  assert.doesNotMatch(
    pipelineSource,
    /Stage updated|Saved to their connection profile timeline/,
  );
  assert.doesNotMatch(
    pipelineSource,
    /Organize after-event contacts|One email each|Set reminder|Draft email/,
  );
  // 设计稿的「↗ +25%」mock 增幅无真实来源，不渲染（只允许出现在文件头注释里）。
  assert.doesNotMatch(pipelineSource, />[^<]*\+25%|"[^"]*\+25%"/);
});

test("contacts sidebars expose one import hub entry without a duplicate scan-card destination", () => {
  const sharedSidebarSource = source(
    "app/(app)/app/contacts/orbit-crm-sidebar.tsx",
  );
  const shellSource = source(
    "app/(app)/app/contacts/network-0918/network-shell.tsx",
  );

  assert.match(sharedSidebarSource, /Import hub/);
  assert.doesNotMatch(sharedSidebarSource, /Scan card/);
  // one nav entry (导入人脉) + one primary CTA, both to the import hub; no scan-card destination
  assert.equal((shellSource.match(/href: "\/app\/contacts\/new"/g) ?? []).length, 1);
  assert.equal((shellSource.match(/href="\/app\/contacts\/new"/g) ?? []).length, 1);
  assert.doesNotMatch(shellSource, /Scan card/);
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
