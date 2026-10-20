import { z } from "zod";

const timestamp = z.string().datetime({ offset: true });
const label = z.string().min(1).max(160);
const target = z.string().startsWith("/").max(512);
const unavailable = z.union([
  z.object({ status: z.literal("empty") }).strict(),
  z.object({ status: z.literal("unavailable") }).strict(),
]);
const card = <T extends z.ZodType>(display: T) => z.union([
  z.object({ status: z.literal("ready"), display }).strict(), unavailable,
]);

const widgetsSchema = z.object({
  today: card(z.object({ count: z.number().int().nonnegative(), rows: z.array(z.object({ title: label, href: target }).strict()).max(3) }).strict()),
  network: card(z.object({ total: z.number().int().nonnegative(), addedThisMonth: z.number().int().nonnegative().optional(),
    people: z.array(z.object({ id: label, name: label }).strict()).max(3) }).strict()),
  secretary: card(z.object({ count: z.number().int().nonnegative(), items: z.array(z.object({
    title: label, reason: label.optional(), kind: z.enum(["event_deadline", "event_prep", "event_pick"]), href: target,
  }).strict()).max(2) }).strict()),
  plan: card(z.object({ goal: label, total: z.number().finite(), talked: z.number().finite(), skipped: z.number().finite(),
    todayDelta: z.number().finite(), segments: z.array(z.object({ key: label, label, allocation: z.number().finite(),
      earned: z.number().finite(), overflow: z.number().finite(), skipped: z.boolean() }).strict()).max(12),
    chance: z.object({ label, points: z.number().finite(), href: target }).strict().optional(),
  }).strict()),
  event: card(z.object({ title: label, startsAt: timestamp, venue: label.optional(),
    meetCount: z.number().int().nonnegative().optional(), href: target }).strict()),
}).strict();

const snapshotSchema = z.object({
  schemaVersion: z.literal(1), scopeHash: z.string().regex(/^[a-f0-9]{64}$/u),
  generatedAt: timestamp, expiresAt: timestamp, lastUpdatedAt: timestamp,
  timeZone: z.string().min(1).max(100), layoutRevision: z.number().int().nonnegative(), widgets: widgetsSchema,
}).strict();

export type WidgetCards = z.infer<typeof widgetsSchema>;
export type WidgetSnapshot = z.infer<typeof snapshotSchema>;

function dayAt(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(date);
}

/** The app writes one bounded, credential-free projection; the extension only reads it. */
export function buildWidgetSnapshot(input: {
  scopeHash: string; timeZone: string; layoutRevision: number; now: Date;
  sourceExpiresAt?: string; widgets: WidgetCards;
}): WidgetSnapshot {
  const expiresAt = Math.min(input.now.getTime() + 30 * 60_000,
    input.sourceExpiresAt === undefined ? Infinity : Date.parse(input.sourceExpiresAt));
  if (!Number.isFinite(expiresAt) || expiresAt <= input.now.getTime()) throw new Error("Invalid widget source expiry");
  const generatedAt = input.now.toISOString();
  return snapshotSchema.parse({
    schemaVersion: 1, scopeHash: input.scopeHash, generatedAt, lastUpdatedAt: generatedAt,
    expiresAt: new Date(expiresAt).toISOString(), timeZone: input.timeZone,
    layoutRevision: input.layoutRevision, widgets: input.widgets,
  });
}

/** Invalid, stale, future and cross-account data all fail closed. */
export function readWidgetSnapshot(raw: unknown, activeScopeHash: string, now: Date): WidgetSnapshot | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw) as unknown; } catch { return null; }
  }
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success || parsed.data.scopeHash !== activeScopeHash) return null;
  const snapshot = parsed.data;
  try {
    const generated = Date.parse(snapshot.generatedAt), updated = Date.parse(snapshot.lastUpdatedAt), expires = Date.parse(snapshot.expiresAt);
    if (generated > now.getTime() || updated > now.getTime() || updated < generated ||
      expires <= now.getTime() || expires > generated + 30 * 60_000 ||
      dayAt(new Date(generated), snapshot.timeZone) !== dayAt(now, snapshot.timeZone)) return null;
  } catch { return null; }
  return snapshot;
}
