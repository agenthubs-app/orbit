// Sign-up funnel (2026-11-25): which step, which client, which kind of source. Nothing personal, and no answer is waited for.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

import { normalizeOrbitApiBaseUrl } from "./base-url";
import type { SignupFunnelOpenedInput, SignupFunnelSource } from "./contract/signup-funnel";
import { ORBIT_API_ENDPOINTS } from "./endpoints";

const VISITOR_KEY = "orbit.signupFunnel.visitor.v1";
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;
let visitor: Promise<string | undefined> | null = null;

/** A random id kept on this device (not per account, not cleared on sign-out); undefined when it cannot be kept. */
export function signupVisitorId(): Promise<string | undefined> {
  visitor ??= (async () => {
    const stored = await AsyncStorage.getItem(VISITOR_KEY);
    if (stored && UUID.test(stored)) return stored;
    const created = Crypto.randomUUID();
    await AsyncStorage.setItem(VISITOR_KEY, created);
    return created;
  })().catch(() => { visitor = null; return undefined; });
  return visitor;
}

/** Same rule as Web: only the kind of place the person came from, never the address. */
export function signupSourceOf(next: string): SignupFunnelSource {
  let path = next;
  try { path = decodeURIComponent(next); } catch { /* judged as written */ }
  if (/(?:^|[=&?])\/i\//u.test(path)) return "invite";
  return /(?:^|[=&?])\/(?:app\/)?(?:e|events)\//u.test(path) ? "event" : "direct";
}

export async function reportRegisterOpened(baseUrl: string, source: SignupFunnelSource, fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    const visitorId = await signupVisitorId();
    const body: SignupFunnelOpenedInput = { name: "register_opened", client: "app", source, ...(visitorId ? { visitorId } : {}) };
    await fetchImpl(`${normalizeOrbitApiBaseUrl(baseUrl)}${ORBIT_API_ENDPOINTS.authSignupFunnel}`, {
      body: JSON.stringify(body), credentials: "omit", headers: { "Content-Type": "application/json" }, method: "POST",
    });
  } catch {
    // The funnel never gets in the way of signing up.
  }
}
