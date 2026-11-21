import fs from "node:fs";
import path from "node:path";
import { WORLD_DIR } from "./paths";
import { readYamlFile } from "./yaml";

/** Fixture section name → record kind. */
export const SECTION_KINDS = {
  contacts: "contact",
  memos: "memo",
  todos: "todo",
  formal_followups: "followup",
  schedule: "schedule",
  private_events: "private_event",
  attendance: "attendance",
  platform_events: "platform_event",
  my_events: "my_event",
  memory: "memory",
  rules: "rule",
  connections: "connection",
  cards: "card",
  push_devices: "push_device",
  conversations: "conversation",
} as const;

export type RecordKind = (typeof SECTION_KINDS)[keyof typeof SECTION_KINDS];

export interface FixtureRecord {
  kind: RecordKind;
  /** Fixture id (C17, RM05 …). my_events use `my:<eventId>`. */
  id: string;
  /** Account label (A, B, R, L) or `platform` for platform events. */
  account: string;
  data: Record<string, unknown>;
  origin: "anchor" | "bulk" | "patch";
}

export interface PatchDefinition {
  summary?: string;
  add?: Record<string, unknown[]>;
  add_B?: Record<string, unknown[]>;
  set?: Record<string, unknown[]>;
  settings?: Record<string, unknown>;
  generate?: Record<string, Record<string, unknown>>;
  /** The main account's data is exactly these sections (every section left out is empty), not the world's. */
  replace?: Record<string, unknown[]>;
  /** Account B's data is exactly these sections. */
  replace_B?: Record<string, unknown[]>;
  /** The platform events are exactly these. */
  replace_platform_events?: unknown[];
  /** Web replays the patch adds to the world's `web_replay` (a case names them in settings.web_replay). */
  web_replay?: Record<string, ReplayDefinition>;
}

/** Every key a patch may have; any other key is an error (case checker) and fails the case (runner). */
export const PATCH_KEYS: readonly string[] = ["summary", "add", "add_B", "set", "settings", "generate", "replace", "replace_B", "replace_platform_events", "web_replay"];

/** The keys that replace part of the world wholesale; a world with such a patch is seeded as its own snapshot. */
export const REPLACING_PATCH_KEYS: readonly string[] = ["replace", "replace_B", "replace_platform_events"];

export function isReplacingPatch(patch: PatchDefinition | null | undefined): boolean {
  return Boolean(patch) && REPLACING_PATCH_KEYS.some((key) => (patch as Record<string, unknown>)[key] !== undefined);
}

/** Problems with one patch's shape ([] when it is well formed). */
export function patchProblems(patch: unknown): string[] {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return ["a patch must be a mapping"];
  const problems: string[] = [];
  const value = patch as Record<string, unknown>;
  for (const key of Object.keys(value)) if (!PATCH_KEYS.includes(key)) problems.push(`unknown patch key "${key}"`);
  for (const key of ["add", "add_B", "replace", "replace_B"]) {
    const sections = value[key];
    if (sections === undefined) continue;
    if (!sections || typeof sections !== "object" || Array.isArray(sections)) {
      problems.push(`${key} must be a mapping of sections`);
      continue;
    }
    for (const [section, items] of Object.entries(sections as Record<string, unknown>)) {
      if (!(section in SECTION_KINDS) || section === "platform_events") problems.push(`${key}.${section} is not a section an account holds`);
      else if (!Array.isArray(items)) problems.push(`${key}.${section} must be a list`);
      else items.forEach((item, index) => {
        const record = item as Record<string, unknown> | null;
        const id = section === "my_events" ? record?.eventId : record?.id;
        if (!record || typeof record !== "object" || typeof id !== "string" || !id) problems.push(`${key}.${section}[${index}] needs ${section === "my_events" ? "an eventId" : "an id"}`);
      });
    }
  }
  if (value.replace_platform_events !== undefined) {
    if (!Array.isArray(value.replace_platform_events)) problems.push("replace_platform_events must be a list");
    else value.replace_platform_events.forEach((item, index) => {
      if (!item || typeof item !== "object" || typeof (item as Record<string, unknown>).id !== "string") problems.push(`replace_platform_events[${index}] needs an id`);
    });
  }
  if (value.web_replay !== undefined) {
    if (!value.web_replay || typeof value.web_replay !== "object" || Array.isArray(value.web_replay)) problems.push("web_replay must be a mapping of replay names");
    else for (const [name, replay] of Object.entries(value.web_replay as Record<string, unknown>)) {
      const item = replay as Partial<ReplayDefinition> | null;
      if (!item || (item.kind !== "search" && item.kind !== "fetch")) problems.push(`web_replay.${name}: kind must be search or fetch`);
      else if (item.kind === "fetch" && typeof item.url !== "string") problems.push(`web_replay.${name}: a fetch replay needs a url`);
      else if (item.kind === "search" && (typeof item.match !== "string" || (item.behavior === undefined && !Array.isArray(item.results)))) problems.push(`web_replay.${name}: a search replay needs a match and results`);
    }
  }
  return problems;
}

export interface ReplayDefinition {
  kind: "search" | "fetch";
  match?: string;
  url?: string;
  title?: string;
  text?: string;
  updated?: string;
  behavior?: string;
  results?: { title: string; url: string; snippet?: string }[];
}

export interface IdRange {
  prefix: string;
  from: number;
  to: number;
  width: number;
  kind: RecordKind;
  account: string;
}

export interface WorldFixture {
  version: string;
  file: string;
  raw: Record<string, any>;
  clock: string;
  timezone: string;
  /** The account the world is about (A for base-v1, R, L). */
  mainAccount: string;
  accounts: Record<string, { name: string; workspace: string; locale: string; role?: string }>;
  anchors: FixtureRecord[];
  patches: Record<string, PatchDefinition>;
  webReplay: Record<string, ReplayDefinition>;
  bulkRanges: IdRange[];
  scale?: Record<string, any>;
  bulk?: Record<string, any>;
}

export const WORLD_FILES = { "base-v1": "base-v1.yaml", "regular-v1": "regular-v1.yaml", "large-v1": "large-v1.yaml" } as const;
export type WorldName = keyof typeof WORLD_FILES;

function recordsFromSections(sections: Record<string, unknown> | undefined, account: string, origin: FixtureRecord["origin"]): FixtureRecord[] {
  const out: FixtureRecord[] = [];
  if (!sections || typeof sections !== "object") return out;
  for (const [section, value] of Object.entries(sections)) {
    const kind = SECTION_KINDS[section as keyof typeof SECTION_KINDS];
    if (!kind || !Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const data = item as Record<string, unknown>;
      const id = kind === "my_event" ? `my:${String(data.eventId)}` : String(data.id);
      out.push({ account: kind === "platform_event" ? "platform" : account, data, id, kind, origin });
    }
  }
  return out;
}

/** "RC1001 到 RC1285" → a range; anything else → null. */
export function parseIdRange(text: unknown, kind: RecordKind, account: string): IdRange | null {
  if (typeof text !== "string") return null;
  const match = text.match(/^([A-Z]+)(\d+)\s*到\s*([A-Z]+)(\d+)$/u);
  if (!match || match[1] !== match[3]) return null;
  return { account, from: Number(match[2]), kind, prefix: match[1], to: Number(match[4]), width: match[2].length };
}

const BULK_SECTION_KINDS: Record<string, RecordKind> = {
  contacts: "contact",
  memos: "memo",
  schedule: "schedule",
  private_events: "private_event",
  platform_events: "platform_event",
  memory: "memory",
  conversations: "conversation",
};

function bulkRanges(bulk: Record<string, any> | undefined, account: string): IdRange[] {
  if (!bulk) return [];
  const ranges: IdRange[] = [];
  for (const [section, kind] of Object.entries(BULK_SECTION_KINDS)) {
    const range = parseIdRange(bulk[section]?.ids, kind, kind === "platform_event" ? "platform" : account);
    if (range) ranges.push(range);
  }
  const plain = parseIdRange(bulk.todos?.plain?.ids, "todo", account);
  if (plain) ranges.push(plain);
  const followups = parseIdRange(bulk.todos?.formal_followups?.ids, "followup", account);
  if (followups) ranges.push(followups);
  return ranges;
}

export function loadWorld(name: string, dir = WORLD_DIR): WorldFixture {
  const fileName = WORLD_FILES[name as WorldName];
  if (!fileName) throw new Error(`Unknown world ${name}`);
  const file = path.join(dir, fileName);
  const raw = readYamlFile<Record<string, any>>(file);
  const accounts = raw.accounts ?? {};
  const anchors: FixtureRecord[] = [];
  let mainAccount = "A";
  if (raw.account_A) {
    anchors.push(...recordsFromSections(raw.account_A, "A", "anchor"));
    anchors.push(...recordsFromSections(raw.account_B, "B", "anchor"));
    anchors.push(...recordsFromSections({ platform_events: raw.platform_events }, "platform", "anchor"));
  } else {
    mainAccount = Object.keys(accounts).find((label) => label !== "B") ?? "R";
    const { account_B: accountB, ...mine } = raw.anchors ?? {};
    anchors.push(...recordsFromSections(mine, mainAccount, "anchor"));
    anchors.push(...recordsFromSections(accountB, "B", "anchor"));
    anchors.push(...recordsFromSections({ conversations: raw.conversations }, mainAccount, "anchor"));
  }
  const generatedPatchRanges: IdRange[] = [];
  for (const patch of Object.values((raw.patches ?? {}) as Record<string, PatchDefinition>)) {
    for (const [section, rule] of Object.entries(patch.generate ?? {})) {
      const kind = SECTION_KINDS[section as keyof typeof SECTION_KINDS];
      const idFrom = String(rule.idFrom ?? "");
      const match = idFrom.match(/^([A-Z]+)(\d+)$/u);
      if (kind && match) {
        const from = Number(match[2]);
        generatedPatchRanges.push({ account: mainAccount, from, kind, prefix: match[1], to: from + Number(rule.count ?? 0) - 1, width: match[2].length });
      }
    }
  }
  return {
    accounts,
    anchors,
    bulk: raw.bulk,
    bulkRanges: [...bulkRanges(raw.bulk, mainAccount), ...generatedPatchRanges],
    clock: String(raw.clock ?? ""),
    file,
    mainAccount,
    patches: raw.patches ?? {},
    raw,
    scale: raw.scale,
    timezone: String(raw.timezone ?? "Asia/Tokyo"),
    version: String(raw.version ?? name),
    webReplay: raw.web_replay ?? {},
  };
}

export function listWorldNames(dir = WORLD_DIR): string[] {
  return Object.entries(WORLD_FILES)
    .filter(([, file]) => fs.existsSync(path.join(dir, file)))
    .map(([name]) => name);
}

/** Records a patch adds (account A unless `add_B`). */
export function patchRecords(patch: PatchDefinition, mainAccount: string): FixtureRecord[] {
  return [
    ...recordsFromSections(patch.add as Record<string, unknown>, mainAccount, "patch"),
    ...recordsFromSections(patch.add_B as Record<string, unknown>, "B", "patch"),
  ];
}

/**
 * A replacing patch applied to a world's records: the main account's records (with `replace`), account B's (with
 * `replace_B`) and the platform events (with `replace_platform_events`) are dropped — anchors and generated ones alike
 * — and the patch's lists take their place. Everything not replaced stays as it is. Without a replacing key, the
 * records come back unchanged.
 */
export function replaceRecords(records: readonly FixtureRecord[], patch: PatchDefinition, mainAccount: string): FixtureRecord[] {
  const dropped = (record: FixtureRecord) =>
    (patch.replace !== undefined && record.account === mainAccount) ||
    (patch.replace_B !== undefined && record.account === "B") ||
    (patch.replace_platform_events !== undefined && record.kind === "platform_event");
  return [
    ...records.filter((record) => !dropped(record)),
    ...recordsFromSections(patch.replace as Record<string, unknown>, mainAccount, "patch"),
    ...recordsFromSections(patch.replace_B as Record<string, unknown>, "B", "patch"),
    ...recordsFromSections({ platform_events: patch.replace_platform_events }, "platform", "patch"),
  ];
}

/**
 * The world a case runs on, as the checks see it: a replacing patch's records in place of the ones it replaces
 * (bulk id ranges of a replaced account are dropped too), and every patch's `web_replay` added to the world's.
 */
export function worldWithPatches(world: WorldFixture, patches: readonly PatchDefinition[]): WorldFixture {
  let anchors = world.anchors;
  let bulkRanges = world.bulkRanges;
  const webReplay = { ...world.webReplay };
  for (const patch of patches) {
    if (isReplacingPatch(patch)) {
      anchors = replaceRecords(anchors, patch, world.mainAccount);
      bulkRanges = bulkRanges.filter((range) => !((patch.replace !== undefined && range.account === world.mainAccount) || (patch.replace_B !== undefined && range.account === "B") || (patch.replace_platform_events !== undefined && range.kind === "platform_event")));
    }
    Object.assign(webReplay, patch.web_replay ?? {});
  }
  return { ...world, anchors, bulkRanges, webReplay };
}

/** The snapshot a case restores: the world's own, or `<world>+<patch>` for a case with a replacing patch. */
export function snapshotKey(world: string, replacingPatch: string | null): string {
  return replacingPatch ? `${world}+${replacingPatch}` : world;
}

export function idInRanges(id: string, ranges: readonly IdRange[]): IdRange | null {
  const match = id.match(/^([A-Z]+)(\d+)$/u);
  if (!match) return null;
  const n = Number(match[2]);
  return ranges.find((range) => range.prefix === match[1] && n >= range.from && n <= range.to && match[2].length === range.width) ?? null;
}
