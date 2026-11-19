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

export function idInRanges(id: string, ranges: readonly IdRange[]): IdRange | null {
  const match = id.match(/^([A-Z]+)(\d+)$/u);
  if (!match) return null;
  const n = Number(match[2]);
  return ranges.find((range) => range.prefix === match[1] && n >= range.from && n <= range.to && match[2].length === range.width) ?? null;
}
