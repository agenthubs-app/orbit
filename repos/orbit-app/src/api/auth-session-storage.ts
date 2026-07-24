import { normalizeOrbitApiBaseUrl } from "./base-url";

export interface KeyValueStorage {
  delete(key: string): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface AuthSessionStorage {
  clear(baseUrl: string): Promise<void>;
  key(baseUrl: string): string;
  legacyKey(baseUrl: string): string;
  read(baseUrl: string): Promise<string | null>;
  write(baseUrl: string, value: string): Promise<void>;
}

function secureKey(baseUrl: string): string {
  const normalized = normalizeOrbitApiBaseUrl(baseUrl);
  const encoded = Array.from(normalized)
    .map((character) => character.codePointAt(0)?.toString(16) ?? "")
    .join("-");

  return `orbit.authSession.${encoded}`;
}

function legacyKey(baseUrl: string): string {
  return `orbit.authCookieHeader.${encodeURIComponent(
    normalizeOrbitApiBaseUrl(baseUrl)
  )}`;
}

export function createAuthSessionStorage({
  legacy,
  secure
}: {
  legacy: KeyValueStorage;
  secure: KeyValueStorage;
}): AuthSessionStorage {
  return {
    async clear(baseUrl) {
      await Promise.all([
        secure.delete(secureKey(baseUrl)),
        legacy.delete(legacyKey(baseUrl))
      ]);
    },
    key: secureKey,
    legacyKey,
    async read(baseUrl) {
      const stored = await secure.get(secureKey(baseUrl));

      if (stored !== null) {
        return stored;
      }

      const legacyValue = await legacy.get(legacyKey(baseUrl));
      if (legacyValue === null) {
        return null;
      }

      await secure.set(secureKey(baseUrl), legacyValue);
      await legacy.delete(legacyKey(baseUrl));

      return legacyValue;
    },
    async write(baseUrl, value) {
      await secure.set(secureKey(baseUrl), value);
      await legacy.delete(legacyKey(baseUrl));
    }
  };
}
