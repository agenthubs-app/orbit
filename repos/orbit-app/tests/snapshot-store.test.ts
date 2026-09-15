import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import * as webSnapshots from "../src/data/snapshot-store.web";
import {
  clearSnapshots,
  readSnapshot,
  retireSnapshot,
  snapshotKey,
  writeSnapshot
} from "../src/data/snapshot-store";

const repoRoot = new URL("..", import.meta.url).pathname;
const hookSource = readFileSync(
  join(repoRoot, "src", "hooks", "useApiResource.ts"),
  "utf8"
);

// Node 测试环境里没有 expo-sqlite 这个原生模块，正好覆盖「缓存不可用」这条路径：
// 缓存是优化不是依赖，任何一步失败都必须降级成空操作，而不是把请求带崩。

test("SQLite 不可用时读取快照返回空而不是抛错", async () => {
  const snapshot = await readSnapshot<unknown>(
    "http://localhost:3000",
    "actor-a",
    "/api/contacts"
  );
  assert.equal(snapshot, null);
});

test("Web 端明确跳过原生 SQLite 快照层", async () => {
  assert.equal(await webSnapshots.readSnapshot("https://example.test", "actor", "/api/notes"), null);
  await assert.doesNotReject(webSnapshots.clearSnapshots());
  await assert.doesNotReject(webSnapshots.retireSnapshot("https://example.test", "actor", "/api/notes?association=all&limit=20"));
});

test("域迁移只提供精确键退休，不扩大到共享集合或其他快照", async () => {
  await assert.doesNotReject(retireSnapshot("https://example.test", "actor", "/api/notes?association=all&limit=20"));
  const source = readFileSync(join(repoRoot, "src", "data", "snapshot-store.ts"), "utf8");
  const retirement = source.slice(source.indexOf("export async function retireSnapshot"), source.indexOf("// Explicit cache invalidation"));
  assert.match(retirement, /WHERE path = \?/u);
  assert.doesNotMatch(retirement, /LIKE|substr|\/api\/tasks|\/api\/schedule-items|activities|reminders/u);
});

test("SQLite 不可用时写入快照静默降级", async () => {
  await assert.doesNotReject(
    writeSnapshot("http://localhost:3000", "actor-a", "/api/contacts", {
      data: { contacts: [] },
      meta: { featureMode: null, privacy: null, runtimeBoundary: null },
      status: 200,
      success: true
    })
  );
});

test("SQLite 不可用时清除快照静默降级", async () => {
  await assert.doesNotReject(clearSnapshots());
});

test("快照按服务器、actor 与路径建键，换账号或服务器都不会串数据", () => {
  const storeSource = readFileSync(
    join(repoRoot, "src", "data", "snapshot-store.ts"),
    "utf8"
  );

  assert.notEqual(
    snapshotKey("http://localhost:3000", "actor-a", "/api/contacts"),
    snapshotKey("http://localhost:3000", "actor-b", "/api/contacts")
  );
  assert.notEqual(
    snapshotKey("http://localhost:3000", "actor-a", "/api/contacts"),
    snapshotKey("http://localhost:4000", "actor-a", "/api/contacts")
  );
  assert.match(storeSource, /snapshotKey\(baseUrl, actorId, path\)/u);
});

test("失败的响应不写快照", async () => {
  // 失败响应在拿到数据库句柄之前就被挡掉，所以这里断言的是那道前置判断。
  const storeSource = readFileSync(
    join(repoRoot, "src", "data", "snapshot-store.ts"),
    "utf8"
  );

  assert.match(
    storeSource,
    /export async function writeSnapshot[\s\S]{0,200}if \(!result\.success\) \{\s*return;/u
  );
});

test("取数先出快照，网络回来再覆盖", () => {
  assert.match(
    hookSource,
    /const snapshot = await readSnapshot<TData>\(baseUrl, actorId, path\)/u
  );
  assert.match(
    hookSource,
    /void writeSnapshot\(baseUrl, actorId, path, result\)/u
  );

  const snapshotIndex = hookSource.indexOf(
    "readSnapshot<TData>(baseUrl, actorId, path)"
  );
  const networkIndex = hookSource.indexOf("await client.get<TData>(path,");

  assert.notEqual(snapshotIndex, -1);
  assert.notEqual(networkIndex, -1);
  assert.ok(snapshotIndex < networkIndex);
});

test("未登录时不读取或写入私有快照", () => {
  assert.match(hookSource, /if \(!isRefresh && actorId && cachePolicy !== "network-only"\) \{/u);
  assert.match(
    hookSource,
    /if \(actorId && cachePolicy !== "network-only"\) \{\s*void writeSnapshot\(baseUrl, actorId, path, result\);/u
  );
});

test("网络失败但有快照时继续显示快照，不退回错误屏", () => {
  assert.match(
    hookSource,
    /if \(cached\) \{\s*\/\/[^\n]*\n\s*setState\(cached\);\s*return;/u
  );
});

test("下拉刷新失败且没有快照时保留当前内容", () => {
  assert.match(hookSource, /if \(!isRefresh \|\| cachePolicy === "network-only"\) \{\s*setState\(resultToRouteState\(result, isEmptyRef\.current\)\);/u);
});
