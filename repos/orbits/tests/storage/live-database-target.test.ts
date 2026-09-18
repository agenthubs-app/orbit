import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveLiveDatabaseConnectionConfig,
  resolveLiveDatabaseTarget,
} from "../../shared/storage/live-database-config";

const CLOUD = "postgresql://cloud.invalid/neondb";
const LOCAL = "postgresql://localhost:5432/orbit_events";

test("未设置 ORBIT_DATABASE_TARGET 时解析路径与切换前一致", () => {
  const config = resolveLiveDatabaseConnectionConfig({
    ORBIT_EVENT_DATABASE_URL: CLOUD,
    ORBIT_LOCAL_DATABASE_URL: LOCAL,
    ORBIT_WORKSPACE_ID: "workspace:orbit-dev",
  });

  assert.deepEqual(config, {
    connectionString: CLOUD,
    workspaceId: "workspace:orbit-dev",
    target: "cloud",
  });
});

test("空值和无法识别的值按 cloud 处理，不会误切本地", () => {
  for (const value of ["", "  ", "LOCALHOST", "true", "1", "remote"]) {
    assert.equal(
      resolveLiveDatabaseTarget({ ORBIT_DATABASE_TARGET: value }),
      "cloud",
      `ORBIT_DATABASE_TARGET=${JSON.stringify(value)} 不应切到本地`,
    );
  }
});

test("显式 local 使用本机连接串，忽略云端变量", () => {
  const config = resolveLiveDatabaseConnectionConfig({
    ORBIT_DATABASE_TARGET: " Local ",
    ORBIT_EVENT_DATABASE_URL: CLOUD,
    ORBIT_LOCAL_DATABASE_URL: LOCAL,
    ORBIT_WORKSPACE_ID: "workspace:orbit-dev",
  });

  assert.deepEqual(config, {
    connectionString: LOCAL,
    workspaceId: "workspace:orbit-dev",
    target: "local",
  });
});

test("local 可以单独指定 workspace，不影响云端配置", () => {
  const config = resolveLiveDatabaseConnectionConfig({
    ORBIT_DATABASE_TARGET: "local",
    ORBIT_LOCAL_DATABASE_URL: LOCAL,
    ORBIT_LOCAL_WORKSPACE_ID: "workspace:orbit-local",
    ORBIT_WORKSPACE_ID: "workspace:orbit-dev",
  });

  assert.equal(config?.workspaceId, "workspace:orbit-local");
});

test("local 缺少本机连接串时返回 null，不回退到云端", () => {
  assert.equal(
    resolveLiveDatabaseConnectionConfig({
      ORBIT_DATABASE_TARGET: "local",
      ORBIT_EVENT_DATABASE_URL: CLOUD,
      ORBIT_LIVE_DATABASE_URL: CLOUD,
      ORBIT_DATABASE_URL: CLOUD,
    }),
    null,
  );
});

test("cloud 保留 EVENT → LIVE → DATABASE 的既有回退顺序", () => {
  assert.equal(
    resolveLiveDatabaseConnectionConfig({ ORBIT_LIVE_DATABASE_URL: CLOUD })
      ?.connectionString,
    CLOUD,
  );
  assert.equal(
    resolveLiveDatabaseConnectionConfig({ ORBIT_DATABASE_URL: CLOUD })
      ?.connectionString,
    CLOUD,
  );
  assert.equal(
    resolveLiveDatabaseConnectionConfig({}),
    null,
  );
});

// —— Sprint 0067：生产库围栏与本地切换开关的嵌套关系 ——
// 围栏在外、开关在内：开关不得成为绕过已钉死生产目标的通道。

const PROD_HOST = "ep-blue-forest-azwt71sw-pooler.c-3.ap-southeast-1.aws.neon.tech";
const PROD_URL = `postgresql://u:p@${PROD_HOST}/neondb`;
const PROD_WS = "workspace:orbit-small-staging-20260917";

test("组合①：生产 + 已钉死 + 主机与 workspace 匹配 → 正常解析", () => {
  const config = resolveLiveDatabaseConnectionConfig({
    VERCEL_ENV: "production",
    ORBIT_EXPECTED_DATABASE_HOST: PROD_HOST,
    ORBIT_EXPECTED_WORKSPACE_ID: PROD_WS,
    ORBIT_EVENT_DATABASE_URL: PROD_URL,
    ORBIT_WORKSPACE_ID: PROD_WS,
  });

  assert.deepEqual(config, {
    connectionString: PROD_URL,
    workspaceId: PROD_WS,
    target: "cloud",
  });
});

test("组合②：生产但未钉死 → 拒绝启动，不回退到任何默认库", () => {
  for (const partial of [
    {},
    { ORBIT_EXPECTED_DATABASE_HOST: PROD_HOST },
    { ORBIT_EXPECTED_WORKSPACE_ID: PROD_WS },
  ]) {
    assert.throws(
      () => resolveLiveDatabaseConnectionConfig({
        VERCEL_ENV: "production",
        ORBIT_EVENT_DATABASE_URL: PROD_URL,
        ORBIT_WORKSPACE_ID: PROD_WS,
        ...partial,
      }),
      /Production database target must be explicitly pinned/,
      `未钉死组合 ${JSON.stringify(partial)} 必须拒绝`,
    );
  }
});

test("组合③：已钉死但实际主机不匹配 → 拒绝，且不泄露连接串", () => {
  assert.throws(
    () => resolveLiveDatabaseConnectionConfig({
      VERCEL_ENV: "production",
      ORBIT_EXPECTED_DATABASE_HOST: PROD_HOST,
      ORBIT_EXPECTED_WORKSPACE_ID: PROD_WS,
      ORBIT_EVENT_DATABASE_URL: "postgresql://u:secret@wrong.invalid/neondb",
      ORBIT_WORKSPACE_ID: PROD_WS,
    }),
    (error: Error) => /does not match the approved environment/.test(error.message)
      && !/secret|wrong\.invalid/.test(error.message),
  );
});

test("组合④：非生产 + target=local → 用本机连接串，围栏不介入", () => {
  const config = resolveLiveDatabaseConnectionConfig({
    ORBIT_DATABASE_TARGET: "local",
    ORBIT_LOCAL_DATABASE_URL: LOCAL,
    ORBIT_EVENT_DATABASE_URL: PROD_URL,
    ORBIT_WORKSPACE_ID: "workspace:orbit-dev",
  });

  assert.equal(config?.connectionString, LOCAL);
  assert.equal(config?.target, "local");
});

test("开关不能绕过已钉死的生产目标：target=local 仍被主机校验拦住", () => {
  assert.throws(
    () => resolveLiveDatabaseConnectionConfig({
      ORBIT_DATABASE_TARGET: "local",
      ORBIT_LOCAL_DATABASE_URL: LOCAL,
      ORBIT_EXPECTED_DATABASE_HOST: PROD_HOST,
      ORBIT_EXPECTED_WORKSPACE_ID: PROD_WS,
      ORBIT_WORKSPACE_ID: PROD_WS,
    }),
    /does not match the approved environment/,
  );
});

test("ORBIT_LOCAL_WORKSPACE_ID 也不能绕过已钉死的 workspace", () => {
  assert.throws(
    () => resolveLiveDatabaseConnectionConfig({
      ORBIT_DATABASE_TARGET: "local",
      ORBIT_LOCAL_DATABASE_URL: `postgresql://u:p@${PROD_HOST}/neondb`,
      ORBIT_LOCAL_WORKSPACE_ID: "workspace:somewhere-else",
      ORBIT_EXPECTED_DATABASE_HOST: PROD_HOST,
      ORBIT_EXPECTED_WORKSPACE_ID: PROD_WS,
      ORBIT_WORKSPACE_ID: PROD_WS,
    }),
    /does not match the approved environment/,
  );
});

test("钉死了主机却没有连接串 → 明确报缺失，不静默返回 null", () => {
  assert.throws(
    () => resolveLiveDatabaseConnectionConfig({
      ORBIT_EXPECTED_DATABASE_HOST: PROD_HOST,
    }),
    /Production database connection is missing/,
  );
});
