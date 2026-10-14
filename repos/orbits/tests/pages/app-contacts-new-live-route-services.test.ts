import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("/app/contacts/new renders 人脈を追加 (R12); ?method= / ?import= go to the R16 import pages; no preflight side effects", async () => {
  const pageSource = source("app/(app)/app/contacts/new/page.tsx");
  const importSource = source("app/(app)/app/contacts/new/import/page.tsx");
  const batchSource = source("app/(app)/app/contacts/new/import/[importId]/page.tsx");

  assert.match(pageSource, /await auth\(\)/);
  assert.match(pageSource, /session\?\.user\?\.id/);
  assert.match(pageSource, /redirect\("\/app\/account\/login\?next=/);
  assert.match(pageSource, /AddContactScreen/);
  assert.match(pageSource, /resolveAddContactRoute/);
  // R16：旧 NetworkImport 已删除；导入页只鉴权，批次数据由客户端拉取。
  assert.doesNotMatch(pageSource, /NetworkImport|LegacyNetworkImport/);
  for (const text of [importSource, batchSource]) assert.match(text, /await auth\(\)/);
  assert.doesNotMatch(pageSource, /data-orbit-real-page/);
  // R07: the page mounts no nav itself; Orbit2026Shell (layout) provides it.
  for (const text of [pageSource, importSource, batchSource]) {
    assert.doesNotMatch(text, /AccountTopNav|OrbitTopNav|PublicTopNav/);
    assert.doesNotMatch(text, /OrbitRealCardsImport/);
    // 页面加载不得触发任何 live 服务预检：只读配置可用性，批次数据由客户端按需拉取。
    assert.doesNotMatch(text, /getOrbitContactsViewModel/);
    assert.doesNotMatch(
      text,
      /loadAppContactsNewRouteViewModel|scanBusinessCard|scanQrCode|importEventAttendees|confirmManualContactDraft/,
    );
    assert.doesNotMatch(text, /listBatches|fetchBatchDetail|business-card-ingest-v2\/(repository|worker|configured)/);
  }
});

test("the scan pages only check sign-in and configuration; batch data is read on the client", () => {
  for (const path of ["app/(app)/app/contacts/new/scan/page.tsx", "app/(app)/app/contacts/new/scan/[batchId]/page.tsx"]) {
    const text = source(path);
    assert.match(text, /await auth\(\)/);
    assert.match(text, /redirect\(`?"?\/app\/account\/login\?/);
    assert.doesNotMatch(text, /listBatches|fetchBatchDetail|business-card-ingest-v2\/(repository|worker|configured)|data-orbit-real-page/);
  }
});
