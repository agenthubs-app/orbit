/**
 * Runtime-combination helpers shared by the follow-up sort checks and the contact search
 * runtime check (W0034). A combination is verified only as a (Node side, PG side) pair that
 * passed the PG differential tests together; nothing here widens a check by itself.
 *
 * Node side is keyed on what JS ordering/case mapping actually depends on:
 * ICU version, Unicode version and the process default collator locale. The Node patch
 * (and major) version is deliberately not part of the key (D35/W34-3).
 */

export type SortRuntimeEvent = "sort_runtime_unverified" | "contact_search_runtime_unsupported";
export type SortRuntimeCheck = "lifecycle_pages" | "lifecycle_home" | "relationship_task_page" | "contact_search";

export interface NodeSortRuntime {
  node: string | null;
  icu: string | null;
  unicode: string | null;
  cldr: string | null;
  collatorLocale: string | null;
}

/** Injected versions (tests) or process versions; unknown values never pass a check. */
export type NodeSortRuntimeInput = { readonly [K in keyof NodeSortRuntime]?: unknown };

export interface NodeSortRuntimeKey {
  icu: string;
  unicode: string;
  collatorLocale: string;
}

/** The exact, closed set of fields a rejection log line carries. */
export const SORT_RUNTIME_LOG_FIELDS = [
  "event", "check", "node", "icu", "unicode", "cldr", "collatorLocale",
  "server_version_num", "server_encoding", "catalog", "actual", "provider", "deterministic",
] as const;

export interface PgSortRuntimeLogInput {
  server_version_num?: unknown;
  server_encoding?: unknown;
  catalog?: unknown;
  actual?: unknown;
  provider?: unknown;
  deterministic?: unknown;
}

let cachedCollatorLocale: string | null | undefined;

function processCollatorLocale(): string | null {
  if (cachedCollatorLocale === undefined) {
    try {
      cachedCollatorLocale = new Intl.Collator().resolvedOptions().locale;
    } catch {
      cachedCollatorLocale = null;
    }
  }
  return cachedCollatorLocale;
}

export function currentNodeSortRuntime(): NodeSortRuntime {
  return {
    node: process.versions.node ?? null,
    icu: process.versions.icu ?? null,
    unicode: process.versions.unicode ?? null,
    cldr: process.versions.cldr ?? null,
    collatorLocale: processCollatorLocale(),
  };
}

function field(source: unknown, key: string): unknown {
  if (!source || typeof source !== "object") return undefined;
  try {
    return (source as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

export function nodeSortRuntimeMatches(expected: NodeSortRuntimeKey, actual: NodeSortRuntimeInput | null | undefined): boolean {
  return field(actual, "icu") === expected.icu &&
    field(actual, "unicode") === expected.unicode &&
    field(actual, "collatorLocale") === expected.collatorLocale;
}

/** "160015" -> 16. Anything that is not a plain PG >= 10 server_version_num is rejected. */
export function pgMajorVersion(serverVersionNum: unknown): number | null {
  if (typeof serverVersionNum !== "string" || !/^[1-9][0-9]{5}$/.test(serverVersionNum)) return null;
  return Math.floor(Number(serverVersionNum) / 10_000);
}

const MAX_LOGGED_TUPLES = 32;
const loggedTuples = new Set<string>();

function logText(value: unknown): string | null {
  return typeof value === "string" ? value.slice(0, 64) : null;
}

function logBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/**
 * Best-effort structured warning for a rejected runtime combination. Builds the object only
 * from explicitly chosen version fields (never rows, errors, actors, queries or SQL), logs a
 * tuple at most once per process, and never throws: the caller's error code must not change.
 */
export function logSortRuntimeRejection(
  event: SortRuntimeEvent,
  check: SortRuntimeCheck,
  node: NodeSortRuntimeInput | null | undefined,
  pg: PgSortRuntimeLogInput | null | undefined,
): void {
  try {
    const entry = {
      event: logText(event),
      check: logText(check),
      node: logText(field(node, "node")),
      icu: logText(field(node, "icu")),
      unicode: logText(field(node, "unicode")),
      cldr: logText(field(node, "cldr")),
      collatorLocale: logText(field(node, "collatorLocale")),
      server_version_num: logText(field(pg, "server_version_num")),
      server_encoding: logText(field(pg, "server_encoding")),
      catalog: logText(field(pg, "catalog")),
      actual: logText(field(pg, "actual")),
      provider: logText(field(pg, "provider")),
      deterministic: logBoolean(field(pg, "deterministic")),
    };
    const { check: _check, ...tuple } = entry;
    const key = JSON.stringify(tuple);
    if (loggedTuples.has(key) || loggedTuples.size >= MAX_LOGGED_TUPLES) return;
    loggedTuples.add(key);
    console.warn(JSON.stringify(entry));
  } catch {
    // Logging is diagnostic only; the rejection itself is reported by the caller.
  }
}

export function resetSortRuntimeRejectionLogForTest(): void {
  loggedTuples.clear();
}
