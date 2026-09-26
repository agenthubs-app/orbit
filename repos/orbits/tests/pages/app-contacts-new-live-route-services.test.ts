import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("/app/contacts/new renders the Network import screen without preflight side effects", async () => {
  const pageSource = source("app/(app)/app/contacts/new/page.tsx");

  assert.match(pageSource, /await auth\(\)/);
  assert.match(pageSource, /session\?\.user\?\.id/);
  assert.match(pageSource, /redirect\("\/app\/account\/login\?next=/);
  assert.match(pageSource, /NetworkImport/);
  assert.match(pageSource, /resolveBusinessCardCaptureAvailability/);
  assert.match(pageSource, /AccountTopNav active="cards"/);
  assert.doesNotMatch(pageSource, /OrbitRealCardsImport/);
  // 页面加载不得触发任何 live 服务预检：只读配置可用性，批次数据由客户端按需拉取。
  assert.doesNotMatch(pageSource, /getOrbitContactsViewModel/);
  assert.doesNotMatch(
    pageSource,
    /loadAppContactsNewRouteViewModel|scanBusinessCard|scanQrCode|importEventAttendees|confirmManualContactDraft/,
  );
  assert.doesNotMatch(pageSource, /listBatches|fetchBatchDetail|business-card-ingest-v2\/(repository|worker|configured)/);
});
