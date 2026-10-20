import { offlineIdentityStorage } from "../../api/offline-identity-storage";
import { syncLifecycle } from "../../data/sync/sync-lifecycle";
import { clearProfileEditSession } from "../../data/profile-edit-session";
import { clearKioskDevice } from "../host/kiosk-store";
import { clearAccountRightsSyncScope } from "./local-cleanup";

/** Discard unsent writes deliberately before the normal sign-out lifecycle can
 * move them into its recovery vault. A failed erasure stays visible to the UI. */
export async function clearNativeAccountRightsData(scope: { baseUrl: string; actorId: string }): Promise<boolean> {
  try {
    const cleared = await clearAccountRightsSyncScope({
      setScope: value => syncLifecycle.setScope(value),
      withDatabase: (value, operation) => syncLifecycle.withDatabase(value, database =>
        database.transaction(async () => { await operation({ run: sql => database.run(sql) }); })),
    }, scope);
    if (!cleared) return false;
    await offlineIdentityStorage.clear(scope.baseUrl);
    clearProfileEditSession({ actorId: scope.actorId, apiOrigin: scope.baseUrl });
    await clearKioskDevice();
    return true;
  } catch { return false; }
}

export async function discardNativeAccountRightsWrites(scope: { baseUrl: string; actorId: string }): Promise<boolean> {
  try {
    return clearAccountRightsSyncScope({
      setScope: value => syncLifecycle.setScope(value),
      withDatabase: (value, operation) => syncLifecycle.withDatabase(value, database =>
        database.transaction(async () => { await operation({ run: sql => database.run(sql) }); })),
    }, scope, { close: false });
  } catch { return false; }
}
