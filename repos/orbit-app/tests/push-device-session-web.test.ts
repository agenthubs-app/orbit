import assert from "node:assert/strict";
import test from "node:test";

import {
  isPushNotificationsOptedIn,
  onPushNotificationsOptInChanged,
  readOrCreatePushDeviceId,
  revokeRegisteredPushDevice,
  setPushNotificationsOptIn,
} from "../src/notifications/push-device-session.web";

function installLocalStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  return values;
}

test.afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

test("web push preferences use browser storage without native SecureStore", async () => {
  installLocalStorage();
  let changes = 0;
  const unsubscribe = onPushNotificationsOptInChanged(() => { changes += 1; });

  assert.equal(await isPushNotificationsOptedIn(), false);
  await setPushNotificationsOptIn(true);
  assert.equal(await isPushNotificationsOptedIn(), true);
  await setPushNotificationsOptIn(false);
  assert.equal(await isPushNotificationsOptedIn(), false);
  assert.equal(changes, 2);
  unsubscribe();
});

test("web device identity is stable and revocation remains local when no token exists", async () => {
  installLocalStorage();
  const first = await readOrCreatePushDeviceId();
  const second = await readOrCreatePushDeviceId();
  let deletes = 0;
  const revoked = await revokeRegisteredPushDevice({
    client: { delete: async () => { deletes += 1; return { success: true }; } } as never,
  });

  assert.match(first, /^[a-f0-9]{32}$/u);
  assert.equal(second, first);
  assert.equal(revoked, true);
  assert.equal(deletes, 0);
});
