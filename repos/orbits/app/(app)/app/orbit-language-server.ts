import { cookies, headers } from "next/headers";

import { normalizeOrbitLanguage, type OrbitLanguage } from "./orbit-language-core";
import { readPrototypeScriptAsset } from "./orbit-reference-styles";

const I18N_SCRIPT_UUID = "3fb21a06-dad4-41b9-bec9-3ec6c3d10e46";
const CJK = /[一-鿿　-〿＀-￯]/;

let cachedDict: Map<string, string> | null = null;
let cachedSortedKeys: string[] | null = null;

function decodeJsString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

/**
 * Extract the zh→en dictionary that ships inside the prototype's i18n runtime
 * script. We reuse it on the SERVER so view-model data renders in the right
 * language at first paint — no client-side DOM translation, no flash.
 */
function getOrbitDict(): Map<string, string> {
  if (cachedDict) return cachedDict;

  const script = readPrototypeScriptAsset(I18N_SCRIPT_UUID);
  const dict = new Map<string, string>();
  const pair = /"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;

  let match = pair.exec(script);
  while (match) {
    const key = decodeJsString(match[1]);
    const value = decodeJsString(match[2]);
    // Only keep dictionary entries (Chinese key → translation); skips code.
    if (key && value && CJK.test(key)) dict.set(key, value);
    match = pair.exec(script);
  }

  cachedDict = dict;
  cachedSortedKeys = [...dict.keys()].sort((a, b) => b.length - a.length);
  return dict;
}

function translateString(value: string, dict: Map<string, string>): string {
  if (!CJK.test(value)) return value;

  // Generic relative-time patterns (any number) the static dictionary misses.
  let out = value
    .replace(/(\d+)\s*分钟前/g, "$1 min ago")
    .replace(/(\d+)\s*小时前/g, "$1h ago")
    .replace(/(\d+)\s*天前/g, "$1d ago")
    .replace(/(\d+)\s*周前/g, "$1w ago")
    .replace(/刚刚/g, "just now");

  for (const key of cachedSortedKeys ?? []) {
    if (out.includes(key)) out = out.split(key).join(dict.get(key)!);
  }
  return out;
}

/**
 * Deep-localize a server-resolved view model. For `en`, every Chinese string in
 * display fields is translated via the prototype dictionary; logic fields (ids,
 * status keys, emails — all ASCII) are left untouched. Returns the input as-is
 * for `zh`. This replaces the legacy client-side DOM translator (FOUC source).
 */
export function localizeOrbitTree<T>(value: T, language: OrbitLanguage): T {
  if (language !== "en") return value;

  const dict = getOrbitDict();

  const walk = (node: unknown): unknown => {
    if (typeof node === "string") return translateString(node, dict);
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(node)) out[key] = walk(child);
      return out;
    }
    return node;
  };

  return walk(value) as T;
}

/**
 * Resolve the active language inside a Server Component, mirroring the logic in
 * the app layout (header set by the proxy, falling back to the persisted cookie).
 */
export async function getOrbitServerLanguage(): Promise<OrbitLanguage> {
  const requestHeaders = await headers();
  const cookieStore = await cookies();

  return normalizeOrbitLanguage(
    requestHeaders.get("x-orbit-lang") ?? cookieStore.get("orbit-lang")?.value,
  );
}

/** Build a `t({ en, zh })` translator bound to a resolved language. */
export function makeOrbitServerT(language: OrbitLanguage) {
  return (copy: { en: string; zh: string }) => copy[language];
}
