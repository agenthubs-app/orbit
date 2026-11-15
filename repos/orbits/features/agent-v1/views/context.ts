/**
 * The "context" read view (设计稿 §4 读取视图「我和他的上下文」; agent-design AG05): the records of the
 * account about one question — a person's notes, to-dos and schedule items, by words and dates — each
 * kind read through its adapter, newest first (to-dos soonest due first), page by page up to the limit,
 * with what was covered. Read only.
 */
import { readPages } from "../domains/registry";
import type { DomainReader, DomainScope, RecordView } from "../domains/types";

export type ContextKind = "memo" | "todo" | "schedule";

export interface ContextViewInput {
  contactId?: string;
  text?: string;
  from?: string;
  to?: string;
  status?: "open" | "completed";
  order?: "newest" | "oldest";
  kinds: readonly ContextKind[];
  maxPages: number;
}

export interface ContextKindResult {
  items: RecordView[];
  pagesRead: number;
  total: number | null;
  withheld: number;
  complete: boolean;
  partialReasons: string[];
  /** The read failed (executeAiRead code); the other kinds are still read. */
  failure?: string;
}

export type ContextView = Partial<Record<ContextKind, ContextKindResult>>;

export async function readContextView(reader: DomainReader, scope: DomainScope, input: ContextViewInput): Promise<ContextView> {
  const view: ContextView = {};
  for (const kind of input.kinds) {
    const query = {
      ...(input.contactId ? { contactId: input.contactId } : {}),
      ...(input.text ? { text: input.text } : {}),
      ...(input.from ? { from: input.from } : {}),
      ...(input.to ? { to: input.to } : {}),
      ...(input.order ? { order: input.order } : {}),
      ...(kind === "todo" && input.status ? { status: input.status } : {}),
    };
    try {
      view[kind] = await readPages(reader, kind, scope, query, input.maxPages);
    } catch (error) {
      view[kind] = { complete: false, failure: error instanceof Error ? error.message : String(error), items: [], pagesRead: 0, partialReasons: [], total: null, withheld: 0 };
    }
  }
  return view;
}
