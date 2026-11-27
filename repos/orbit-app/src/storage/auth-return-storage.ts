// Where the person was when they left the App to come back signed in: a password-reset mail or Google in the browser. The
// link back carries no address, so it is kept on this device. 2026-11-27 (Web 3d65fd5ab): a reset link lives 7 days, so the
// reset trip is kept 7 days under its own key; the Google trip keeps its half hour and its old key.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { isDefaultReturnHref, returnHref } from "../view-models/return-href";

export type AuthReturnTrip = "google" | "reset";
const KEY: Record<AuthReturnTrip, string> = { google: "orbit:auth-return:v1", reset: "orbit:auth-return:reset:v1" };
const TTL_MS: Record<AuthReturnTrip, number> = { google: 30 * 60 * 1000, reset: 7 * 24 * 60 * 60 * 1000 };

interface Adapter { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }

export function createAuthReturnStorage(adapter: Adapter = AsyncStorage, now: () => number = Date.now) {
  const readKey = async (key: string): Promise<string | null> => {
    try {
      const value = JSON.parse((await adapter.getItem(key)) ?? "null") as { href?: unknown; expiresAt?: unknown } | null;
      return value && typeof value.href === "string" && typeof value.expiresAt === "number" && value.expiresAt > now() ? returnHref(value.href) : null;
    } catch {
      return null;
    }
  };
  return {
    remember: async (next: string, trip: AuthReturnTrip = "google"): Promise<void> => {
      const href = returnHref(next);
      try {
        if (href && !isDefaultReturnHref(href)) await adapter.setItem(KEY[trip], JSON.stringify({ href, expiresAt: now() + TTL_MS[trip] }));
        else await adapter.removeItem(KEY[trip]);
      } catch {
        // Not kept: signing in then goes to the default page.
      }
    },
    // A reset asked for before the split was kept under the Google key (half an hour): still read it.
    read: async (trip: AuthReturnTrip = "google"): Promise<string | null> => (await readKey(KEY[trip])) ?? (trip === "reset" ? readKey(KEY.google) : null),
  };
}

export const authReturnStorage = createAuthReturnStorage();
