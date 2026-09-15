import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

const root = new URL("../..", import.meta.url).pathname;
const require = createRequire(import.meta.url);

function harness(input: {
  canonicalId?: string;
  legacyId?: string;
  legacyDeleteSucceeds?: boolean;
} = {}) {
  const storage = new Map<string, string>();
  if (input.canonicalId) storage.set("orbit.pushDeviceId", input.canonicalId);
  if (input.legacyId) storage.set("orbit.notifications.device-id.v1", input.legacyId);
  const calls: string[] = [];
  const source = readFileSync(join(root, "src/notifications/push-device-session.ts"), "utf8");
  const code = transformSync(source, {
    format: "cjs",
    loader: "ts",
    target: "es2022",
  }).code;
  const module = { exports: {} as any };
  const nativeRequire = (id: string): any => {
    if (id === "expo-crypto") return { getRandomBytesAsync: async () => new Uint8Array([1, 2, 3, 4]) };
    if (id === "expo-secure-store") return {
      getItemAsync: async (key: string) => storage.get(key) ?? null,
      setItemAsync: async (key: string, value: string) => { storage.set(key, value); },
      deleteItemAsync: async (key: string) => { storage.delete(key); },
    };
    if (id === "@react-native-async-storage/async-storage") return {
      getItem: async (key: string) => storage.get(key) ?? null,
      removeItem: async (key: string) => { calls.push(`remove:${key}`); storage.delete(key); },
    };
    if (id.endsWith("/api/client")) return {};
    if (id.endsWith("/api/endpoints")) return {
      ORBIT_API_ENDPOINTS: { devicePushToken: "/api/devices/push-token" },
      pushTokenPath: (id: string) => `/api/devices/push-tokens/${id}`,
    };
    if (id.endsWith("/push-policy")) return {};
    return require(id);
  };
  runInNewContext("(function(require,module,exports){" + code + "\n})", { console })(nativeRequire, module, module.exports);
  const client = {
    async delete(path: string, options?: { body?: { deviceId?: string } }) {
      calls.push(`delete:${path}:${options?.body?.deviceId ?? ""}`);
      return { success: input.legacyDeleteSucceeds !== false };
    },
  };
  return { calls, client, exports: module.exports, storage };
}

test("first upgrade promotes the legacy installation id into SecureStore", async () => {
  const app = harness({ legacyId: "ios:legacy-installation" });
  assert.equal(await app.exports.readOrCreatePushDeviceId(), "ios:legacy-installation");
  assert.equal(app.storage.get("orbit.pushDeviceId"), "ios:legacy-installation");
  assert.equal(app.storage.get("orbit.notifications.device-id.v1"), "ios:legacy-installation");
});

test("legacy cleanup revokes only the old id and removes its retry marker", async () => {
  const app = harness({ canonicalId: "canonical-installation", legacyId: "ios:legacy-installation" });
  assert.equal(await app.exports.migrateLegacyPushDeviceRegistration(app.client), true);
  assert.deepEqual(app.calls, [
    "delete:/api/devices/push-token:ios:legacy-installation",
    "remove:orbit.notifications.device-id.v1",
  ]);
  assert.equal(app.storage.get("orbit.pushDeviceId"), "canonical-installation");
});

test("failed legacy cleanup retains the marker for a foreground retry", async () => {
  const app = harness({ canonicalId: "canonical-installation", legacyId: "ios:legacy-installation", legacyDeleteSucceeds: false });
  assert.equal(await app.exports.migrateLegacyPushDeviceRegistration(app.client), false);
  assert.equal(app.storage.get("orbit.notifications.device-id.v1"), "ios:legacy-installation");
  assert.equal(app.calls.some((call) => call.startsWith("remove:")), false);
});
