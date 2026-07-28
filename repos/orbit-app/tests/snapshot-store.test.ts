import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  clearSnapshots,
  readSnapshot,
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
  const snapshot = await readSnapshot<unknown>("http://localhost:3000", "/api/contacts");
  assert.equal(snapshot, null);
});

test("Web 端明确跳过原生 SQLite 快照层", () => {
  const storeSource = readFileSync(
    join(repoRoot, "src", "data", "snapshot-store.ts"),
    "utf8"
  );
  const webStoreSource = readFileSync(
    join(repoRoot, "src", "data", "snapshot-store.web.ts"),
    "utf8"
  );

  assert.match(
    storeSource,
    /if \(Platform\.OS === "web"\) \{\s*return null;/u
  );
  assert.match(webStoreSource, /return null;/u);
  assert.doesNotMatch(webStoreSource, /expo-sqlite|openDatabaseAsync/u);
});

test("SQLite 不可用时写入快照静默降级", async () => {
  await assert.doesNotReject(
    writeSnapshot("http://localhost:3000", "/api/contacts", {
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

test("快照按服务器加路径建键，换服务器不会读到上一台的数据", () => {
  const storeSource = readFileSync(
    join(repoRoot, "src", "data", "snapshot-store.ts"),
    "utf8"
  );

  assert.match(storeSource, /return `\$\{baseUrl\}\|\$\{path\}`/u);
  assert.match(storeSource, /snapshotKey\(baseUrl, path\)/u);
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
  assert.match(hookSource, /const snapshot = await readSnapshot<TData>\(baseUrl, path\)/u);
  assert.match(hookSource, /void writeSnapshot\(baseUrl, path, result\)/u);

  const snapshotIndex = hookSource.indexOf("readSnapshot<TData>(baseUrl, path)");
  const networkIndex = hookSource.indexOf("await client.get<TData>(path)");

  assert.notEqual(snapshotIndex, -1);
  assert.notEqual(networkIndex, -1);
  assert.ok(snapshotIndex < networkIndex);
});

test("网络失败但有快照时继续显示快照，不退回错误屏", () => {
  assert.match(
    hookSource,
    /if \(cached\) \{\s*\/\/[^\n]*\n\s*setState\(cached\);\s*return;/u
  );
});

test("下拉刷新失败且没有快照时保留当前内容", () => {
  assert.match(hookSource, /if \(!isRefresh\) \{\s*setState\(resultToRouteState\(result, isEmptyRef\.current\)\);/u);
});

test("登出与会话过期都清空本地快照", () => {
  const providerSource = readFileSync(
    join(repoRoot, "src", "api", "AuthSessionProvider.tsx"),
    "utf8"
  );

  const occurrences = providerSource.match(/clearSnapshots\(\)/gu) ?? [];
  assert.ok(
    occurrences.length >= 2,
    "主动登出和 401 过期两条路径都要清快照"
  );
});
