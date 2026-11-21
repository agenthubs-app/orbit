/**
 * agent-design AG14 (设计稿 §6 "忘掉"; 附录 E "删除标记"): what forgetting an entry leaves behind and what it switches off.
 *
 * Deleting an entry (service.remove) drops its words, keeps a mark — the entry's id, kind, the tasks it applied to and
 * the message it came from — and moves the scope's memory version on. From these, code decides:
 *
 * 1. `isForgottenSource()` — the message an entry was proposed from is never a source again: the same old sentence
 *    ("记住……") does not bring the entry back, however the request reaches the agent again. Only a new message in
 *    which the user says it again can lead to a new proposal.
 * 2. `staleMemoryUses()` — an earlier answer of a conversation that used an entry which has since been changed or
 *    deleted was written from an older memory version. A resumed conversation does not hand such an answer back to the
 *    model: its personal context is built again from the entries as they are now.
 *
 * Nothing here holds an entry's words.
 */
import type { AgentMemory, AgentMemoryDeletionMark } from "./contract";

/** How a conversation entry names the message it came from. */
export function memorySourceRef(requestId: string): string {
  return `request:${requestId}`;
}

/** The request ids whose message a deleted entry was proposed from. */
export function forgottenSourceRequests(marks: readonly Pick<AgentMemoryDeletionMark, "sourceMessageRef">[]): Set<string> {
  const out = new Set<string>();
  for (const mark of marks) {
    const ref = mark.sourceMessageRef;
    if (ref && ref.startsWith("request:") && ref.length > "request:".length) out.add(ref.slice("request:".length));
  }
  return out;
}

/** True when an entry made from this message was deleted: the message is not used to propose it again. */
export function isForgottenSource(marks: readonly Pick<AgentMemoryDeletionMark, "sourceMessageRef">[], sourceMessageRef: string): boolean {
  return marks.some((mark) => mark.sourceMessageRef === sourceMessageRef);
}

/** One earlier answer of a conversation and the entries (by id and revision) it used. */
export interface MemoryUse {
  requestId: string;
  memories: { memoryId: string; revision: number }[];
}

/**
 * The requests whose answer used an entry that is no longer what it was then: deleted, changed (another revision), or
 * gone. Their answers are left out of the context a resumed conversation gives the model.
 */
export function staleMemoryUses(uses: readonly MemoryUse[], current: readonly Pick<AgentMemory, "memoryId" | "revision" | "status">[]): Set<string> {
  const now = new Map(current.map((memory) => [memory.memoryId, memory]));
  const stale = new Set<string>();
  for (const use of uses) {
    for (const used of use.memories) {
      const memory = now.get(used.memoryId);
      if (!memory || memory.status !== "active" || memory.revision !== used.revision) {
        stale.add(use.requestId);
        break;
      }
    }
  }
  return stale;
}

/** At most this many answers' uses are kept per conversation (the context window is ten messages). */
export const MEMORY_USE_LIMIT = 20;

/** Adds this request's use to a conversation's list (latest last), without growing past the limit. */
export function rememberMemoryUse(uses: readonly MemoryUse[] | undefined, use: MemoryUse): MemoryUse[] {
  const kept = (uses ?? []).filter((item) => item.requestId !== use.requestId);
  return use.memories.length ? [...kept, use].slice(-MEMORY_USE_LIMIT) : kept.slice(-MEMORY_USE_LIMIT);
}
