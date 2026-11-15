/**
 * The read side of the domain adapters (设计稿附录 B `read(scope, query)`; agent-design AG05).
 *
 * `Scope` comes from the server's authentication only (an account, the deployment's workspace and an
 * authorization epoch); a model never supplies it. Each read returns at most 10 records and a cursor
 * sealed to the scope and the filter; what was withheld or could not be read is said, never hidden.
 */
export type DomainKind = "contact" | "memo" | "todo" | "schedule" | "event";

export const DOMAIN_KINDS: readonly DomainKind[] = ["contact", "memo", "todo", "schedule", "event"];

export interface DomainScope {
  accountId: string;
  workspaceId: string;
  authorizationEpoch: string;
}

export interface DomainQuery {
  /** One record by its product id. */
  id?: string;
  /** Words to find (a name for contacts; title or body words for the others). */
  text?: string;
  contactId?: string;
  /** open / completed (to-dos); interaction (memos that record one); within (contact names inside the words). */
  status?: "open" | "completed" | "interaction" | "within";
  /** ISO instants, from inclusive, to exclusive. */
  from?: string;
  to?: string;
  order?: "newest" | "oldest";
  cursor?: string;
  limit?: number;
}

/** A record as the Agent may see it: whitelisted fields only (no e-mail, phone or other contact methods). */
export interface RecordView {
  /** Typed reference, as cited: "memo:note:…", "todo:task:…", "contact:contact:…", "event:…". */
  ref: string;
  kind: DomainKind;
  id: string;
  version: string;
  updatedAt: string;
  fields: Readonly<Record<string, unknown>>;
}

export interface DomainReadResult {
  items: RecordView[];
  nextCursor?: string;
  /** Matching rows in all (readable), when the source counts them. */
  total?: number;
  /** Matching rows that may not be read now (withdrawn permission); never returned. */
  withheld?: number;
  /** text_limit, byte_limit, withheld … as executeAiRead reports them. */
  partialReasons: readonly string[];
}

export interface DomainReader {
  read(kind: DomainKind, scope: DomainScope, query: DomainQuery): Promise<DomainReadResult>;
}

/** 设计稿附录 C `gaps[].reason` (the read-side values; conflict and budget are set elsewhere). */
export type ReadGapReason = "no_record" | "partial" | "unreadable" | "service_error";

export const refOf = (kind: DomainKind, id: string) => `${kind}:${id}`;

/** "memo:note:abc" → { kind: memo, id: note:abc }. */
export function parseRef(ref: string): { kind: DomainKind; id: string } | null {
  const at = ref.indexOf(":");
  if (at <= 0) return null;
  const kind = ref.slice(0, at);
  const id = ref.slice(at + 1);
  return (DOMAIN_KINDS as readonly string[]).includes(kind) && id ? { id, kind: kind as DomainKind } : null;
}
