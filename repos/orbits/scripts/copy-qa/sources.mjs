// Loaders that turn copy files into copy-qa entries `{ id, kind, ja, zh, en }`.
// Run under tsx (the sources are TypeScript): `node --import tsx scripts/copy-qa/cli.mjs`.
import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { kindOf } from "./kinds.mjs";

const importTs = (file) => import(pathToFileURL(file).href);

/** shared/copy/{ja,zh,en}.ts: `{ group: { key: text } }` per language. */
export async function loadSharedCopy(root) {
  const [{ ja }, { zh }, { en }] = await Promise.all(["ja", "zh", "en"].map((lang) => importTs(path.join(root, "shared/copy", `${lang}.ts`))));
  const entries = [];
  for (const [group, keys] of Object.entries(ja)) {
    for (const key of Object.keys(keys)) entries.push({ id: `shared.${group}.${key}`, kind: kindOf(group, key), ja: ja[group][key], zh: zh[group]?.[key], en: en[group]?.[key] });
  }
  return entries;
}

/** The App's kind patterns (src/i18n/copy-kinds.ts): first match wins, `*` = one key segment. */
export function appKindOf(patterns, key) {
  for (const [pattern, kind] of patterns) {
    const regex = new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^.]+")}$`);
    if (regex.test(key)) return kind;
  }
  return undefined;
}

/**
 * App dictionaries, one domain file per key prefix: src/i18n/<lang>/<domain>.ts.
 * Kinds come from src/i18n/copy-kinds.ts; a key without one is flagged `needsKind`.
 */
export async function loadAppDomains(appRoot, domains) {
  const { appCopyKinds } = await importTs(path.join(appRoot, "src/i18n/copy-kinds.ts"));
  const entries = [];
  for (const domain of domains) {
    const [ja, zh, en] = await Promise.all(["ja", "zh", "en"].map(async (lang) => (await importTs(path.join(appRoot, "src/i18n", lang, `${domain}.ts`)))[domain]));
    for (const key of Object.keys(ja)) {
      const kind = appKindOf(appCopyKinds, key);
      entries.push({ id: `app.${key}`, kind, needsKind: kind === undefined, ja: ja[key], zh: zh[key], en: en[key] });
    }
  }
  return entries;
}

/** Web redesign copy: app/(app)/app/orbit-2026/copy/<domain>.ts, each export `{ key: { ja, zh, en, kind? } }`. */
export async function loadWebCopy(root) {
  const dir = path.join(root, "app/(app)/app/orbit-2026/copy");
  const entries = [];
  let files = [];
  try {
    files = readdirSync(dir).filter((name) => name.endsWith(".ts") && name !== "index.ts");
  } catch {
    return entries;
  }
  for (const file of files) {
    const module = await importTs(path.join(dir, file));
    for (const [exportName, table] of Object.entries(module)) {
      if (!table || typeof table !== "object") continue;
      for (const [key, value] of Object.entries(table)) {
        if (value && typeof value === "object" && "ja" in value) entries.push({ id: `web.${file.replace(/\.ts$/, "")}.${exportName}.${key}`, kind: value.kind, ja: value.ja, zh: value.zh, en: value.en });
      }
    }
  }
  return entries;
}
