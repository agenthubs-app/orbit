// Where the person was when they left the App to come back signed in: a password-reset mail or Google in the browser. The
// link back carries no address, so it is kept on this device for as long as a reset link lives (30 minutes; as Web).
import AsyncStorage from "@react-native-async-storage/async-storage";

import { isDefaultReturnHref, returnHref } from "../view-models/return-href";

const KEY = "orbit:auth-return:v1";
const TTL_MS = 30 * 60 * 1000;

interface Adapter { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }

export function createAuthReturnStorage(adapter: Adapter = AsyncStorage, now: () => number = Date.now) {
  return {
    remember: async (next: string): Promise<void> => {
      const href = returnHref(next);
      try {
        if (href && !isDefaultReturnHref(href)) await adapter.setItem(KEY, JSON.stringify({ href, expiresAt: now() + TTL_MS }));
        else await adapter.removeItem(KEY);
      } catch {
        // Not kept: signing in then goes to the default page.
      }
    },
    read: async (): Promise<string | null> => {
      try {
        const value = JSON.parse((await adapter.getItem(KEY)) ?? "null") as { href?: unknown; expiresAt?: unknown } | null;
        return value && typeof value.href === "string" && typeof value.expiresAt === "number" && value.expiresAt > now() ? returnHref(value.href) : null;
      } catch {
        return null;
      }
    },
  };
}

export const authReturnStorage = createAuthReturnStorage();
