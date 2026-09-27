import type { OrbitLanguagePreferenceContract } from "./contract/account-language-preference";
import type { KeyValueStorage } from "./auth-session-storage";
import { normalizeOrbitApiBaseUrl } from "./base-url";
import type { MobileAuthResult, MobileAuthUser } from "./mobile-auth";

// Offline cold start (0127, user decision 2026-09-27):
// - The last identity the server validated online is trusted for at most 30 days.
// - Only an explicit server answer counts as a rejection: 401/403, or an Auth.js
//   session response without a user (revoked, disabled account, password changed).
//   Network errors, timeouts, 5xx, 404 and non-JSON answers are "unreachable".
// - The record holds no cookie; it lives in SecureStore next to the session
//   (native) or next to the mirror keys in IndexedDB (browser, secure context only).

export const OFFLINE_IDENTITY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface OfflineIdentityRecord {
  version: 1;
  baseUrl: string;
  accountId: string;
  user: MobileAuthUser;
  /** Epoch ms of the last successful online validation (session + account/me). */
  validatedAt: number;
}

export type SessionCheck = "valid" | "rejected" | "unreachable";

export function classifySessionCheck(result: MobileAuthResult<unknown>): SessionCheck {
  if (result.success) return "valid";
  const { code, status } = result.error;
  if (status === 401 || status === 403) return "rejected";
  if (code === "ORBIT_APP_AUTH_SESSION_INVALID" && status >= 200 && status < 300) return "rejected";
  return "unreachable";
}

export function classifyAccountCheck(result: { success: boolean; status?: number }): SessionCheck {
  if (result.success) return "valid";
  return result.status === 401 || result.status === 403 ? "rejected" : "unreachable";
}

export function trustedOfflineIdentity(input: {
  record: OfflineIdentityRecord | null;
  baseUrl: string;
  now: number;
}): OfflineIdentityRecord | null {
  const { record, now } = input;
  if (!record || !Number.isSafeInteger(now)) return null;
  if (normalizeOrbitApiBaseUrl(record.baseUrl) !== normalizeOrbitApiBaseUrl(input.baseUrl)) return null;
  const age = now - record.validatedAt;
  return age >= 0 && age <= OFFLINE_IDENTITY_MAX_AGE_MS ? record : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRecord(raw: string | null): OfflineIdentityRecord | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.user)) return null;
    const { baseUrl, accountId, validatedAt, user } = value;
    if (typeof baseUrl !== "string" || typeof accountId !== "string" || !accountId.trim()) return null;
    if (typeof validatedAt !== "number" || !Number.isSafeInteger(validatedAt)) return null;
    if (typeof user.id !== "string" || !user.id || typeof user.email !== "string" || typeof user.name !== "string") return null;
    return { version: 1, baseUrl, accountId, validatedAt, user: { id: user.id, email: user.email, name: user.name } };
  } catch {
    return null;
  }
}

function parseLanguage(raw: string | null, actorId: string): OrbitLanguagePreferenceContract | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.actorId !== actorId || !isRecord(value.preference)) return null;
    const { mode, language, updatedAt } = value.preference;
    const updated = typeof updatedAt === "string" ? updatedAt : null;
    if (mode === "system") return { mode, language: null, updatedAt: updated };
    if (mode === "manual" && updated && (language === "zh" || language === "en" || language === "ja")) return { mode, language, updatedAt: updated };
    return null;
  } catch {
    return null;
  }
}

export interface OfflineIdentityStorage {
  clear(baseUrl: string): Promise<void>;
  key(baseUrl: string): string;
  read(baseUrl: string): Promise<OfflineIdentityRecord | null>;
  readLanguage(baseUrl: string, actorId: string): Promise<OrbitLanguagePreferenceContract | null>;
  write(record: OfflineIdentityRecord): Promise<void>;
  writeLanguage(baseUrl: string, actorId: string, preference: OrbitLanguagePreferenceContract): Promise<void>;
}

function encoded(baseUrl: string): string {
  return Array.from(normalizeOrbitApiBaseUrl(baseUrl))
    .map(character => character.codePointAt(0)?.toString(16) ?? "")
    .join("-");
}

export function createOfflineIdentityStorage(secure: KeyValueStorage): OfflineIdentityStorage {
  const identityKey = (baseUrl: string) => `orbit.offlineIdentity.${encoded(baseUrl)}`;
  const languageKey = (baseUrl: string) => `orbit.offlineLanguage.${encoded(baseUrl)}`;
  return {
    async clear(baseUrl) {
      await Promise.all([secure.delete(identityKey(baseUrl)), secure.delete(languageKey(baseUrl))]);
    },
    key: identityKey,
    async read(baseUrl) {
      const record = parseRecord(await secure.get(identityKey(baseUrl)));
      return record && normalizeOrbitApiBaseUrl(record.baseUrl) === normalizeOrbitApiBaseUrl(baseUrl) ? record : null;
    },
    async readLanguage(baseUrl, actorId) {
      return parseLanguage(await secure.get(languageKey(baseUrl)), actorId);
    },
    async write(record) {
      await secure.set(identityKey(record.baseUrl), JSON.stringify({ ...record, baseUrl: normalizeOrbitApiBaseUrl(record.baseUrl) }));
    },
    async writeLanguage(baseUrl, actorId, preference) {
      await secure.set(languageKey(baseUrl), JSON.stringify({ actorId, preference }));
    },
  };
}

/**
 * Erase one (server, actor) mirror and its key through the lifecycle's own purge
 * (the account-switch path, with its crash-safe pending-cleanup marker), even when
 * a cold start has not opened that scope yet.
 */
export async function purgeSyncScope(
  lifecycle: { setScope(scope: { baseUrl: string; actorId: string } | null): Promise<boolean> },
  scope: { baseUrl: string; actorId: string },
): Promise<boolean> {
  if (!(await lifecycle.setScope(scope))) return false;
  return lifecycle.setScope(null);
}
