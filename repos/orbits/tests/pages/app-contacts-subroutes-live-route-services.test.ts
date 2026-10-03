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

  // W0047：卡片资料仍只来自 viewModel.connections（按看板里的 id 取）。
  assert.match(pipelineSource, /viewModel\.connections\.map\(\(contact\) => \[contact\.id, toPerson\(contact\)\]\)/);
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

// W0055：旧 CRM 侧栏（orbit-crm-sidebar.tsx）已无页面引用并删除，只断言现行网络页壳。
test("contacts shell exposes one import hub entry without a duplicate scan-card destination", () => {
  const shellSource = source(
    "app/(app)/app/contacts/network-0918/network-shell.tsx",
  );

  // one nav entry (导入人脉) + one primary CTA, both to the import hub; no scan-card destination
  assert.equal((shellSource.match(/href: "\/app\/contacts\/new"/g) ?? []).length, 1);
  assert.equal((shellSource.match(/href="\/app\/contacts\/new"/g) ?? []).length, 1);
  assert.doesNotMatch(shellSource, /Scan card/);
});

