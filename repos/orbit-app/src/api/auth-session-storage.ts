import { normalizeOrbitApiBaseUrl } from "./base-url";

export interface KeyValueStorage {
  delete(key: string): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface AuthSessionStorage {
  clear(baseUrl: string): Promise<void>;
  clearIfMatches(baseUrl: string, expectedValue: string): Promise<boolean>;
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
  // Compare-and-delete must share ordering with writes and legacy migration.
  let pending: Promise<unknown> = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
  }

  return {
    async clear(baseUrl) {
      await serialize(async () => {
        const deletions = [
          secure.delete(secureKey(baseUrl)),
          legacy.delete(legacyKey(baseUrl))
        ];
        try {
          await Promise.all(deletions);
        } catch (error) {
          // A rejected sibling must not release the queue ahead of a late delete.
          await Promise.allSettled(deletions);
          throw error;
        }
      });
    },
    clearIfMatches(baseUrl, expectedValue) {
      return serialize(async () => {
        const [stored, legacyValue] = await Promise.all([
          secure.get(secureKey(baseUrl)), legacy.get(legacyKey(baseUrl))
        ]);
        if (stored === expectedValue) await secure.delete(secureKey(baseUrl));
        if (legacyValue === expectedValue) await legacy.delete(legacyKey(baseUrl));
        return stored === expectedValue || legacyValue === expectedValue;
      });
    },
    key: secureKey,
    legacyKey,
    async read(baseUrl) {
      return serialize(async () => {
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
      });
    },
    async write(baseUrl, value) {
      await serialize(async () => {
        await secure.set(secureKey(baseUrl), value);
        await legacy.delete(legacyKey(baseUrl));
      });
    }
  };
}
