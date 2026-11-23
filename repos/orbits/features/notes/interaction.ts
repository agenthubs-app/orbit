/**
 * The memo's interaction field (设计稿附录 E; agent-design AG05 reads it, AG06 writes it).
 * A stored value is used only when it is well formed and its actual contacts are linked to the memo.
 */
import type { NoteInteractionContract } from "../../shared/contract/notes";

const CHANNELS = ["phone", "meeting", "message", "email", "other"] as const;
const DIRECTIONS = ["incoming", "outgoing", "mutual"] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/u;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The interaction as stored on a memo, or null when absent or not well formed. */
export function readNoteInteraction(value: unknown, contactIds: readonly string[]): NoteInteractionContract | null {
  if (!isRecord(value)) return null;
  const actual = Array.isArray(value.actualContactIds) ? value.actualContactIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0) : [];
  if (!actual.length || actual.some((id) => !contactIds.includes(id))) return null;
  if (!(CHANNELS as readonly unknown[]).includes(value.channel) || !(DIRECTIONS as readonly unknown[]).includes(value.direction)) return null;
  const precision = value.precision === "instant" ? "instant" : value.precision === "day" ? "day" : null;
  if (!precision) return null;
  const occurredOn = typeof value.occurredOn === "string" && DAY.test(value.occurredOn) ? value.occurredOn : undefined;
  const occurredAt = typeof value.occurredAt === "string" && Number.isFinite(Date.parse(value.occurredAt)) ? value.occurredAt : undefined;
  if (precision === "day" ? !occurredOn : !occurredAt) return null;
  return {
    actualContactIds: [...new Set(actual)],
    channel: value.channel as NoteInteractionContract["channel"],
    direction: value.direction as NoteInteractionContract["direction"],
    precision,
    ...(occurredOn ? { occurredOn } : {}),
    ...(occurredAt ? { occurredAt } : {}),
  };
}
