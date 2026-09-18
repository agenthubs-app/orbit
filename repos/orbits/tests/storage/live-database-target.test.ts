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
