/**
 * Sprint 0131: page copies (页面副本). Some pages the user wants offline are
 * computed by the server on every read — the own profile, the agent action
 * centre and ledger, the relationship follow-up and suggestion pages, Today,
 * a relationship's next step, a meeting's details, the public event catalogue
 * and the event recommendations. They have no rows a sync domain could send
 * incrementally, so the device keeps the last successful online read of each
 * (the "last seen" copy) and shows it with the 「截至」 notice when the server
 * cannot be reached.
 *
 * A copy is bound to the offline read lease, like a sync domain's rows:
 *   - it is stored under (workspace, authorization epoch) of the accepted lease,
 *     and every sync that accepts a lease drops copies of any other epoch
 *     (rotation) or all of them when the lease grants nothing (revocation);
 *   - it is readable only while that lease is accepted (≤ 7 days, same actor,
 *     same server), so an expired lease locks copies with the domains;
 *   - it lives in the identity's own local database (native: SQLCipher; browser:
 *     each value AES-GCM encrypted by the mirror's payload codec), which is
 *     deleted on sign-out, account switch and server switch.
 * Only the ids below exist; a browser stores only WEB_MIRROR_PAGE_COPY_IDS
 * (threat model section 2, 「页面副本」). A copy is never written from a failed
 * or non-2xx read, and never holds more than `maxBytes`.
 */
export interface PageCopyDefinition {
  id: string;
  /** The GET the copy is the last successful response of. */
  endpoint: string;
  /**
   * "single": one copy (optionally a few fixed variants such as a list mode).
   * "keyed": one copy per opened item; the most recently saved `maxVariants` are kept.
   */
  variants: "single" | "keyed";
  maxVariants: number;
  /** Serialized response bytes a copy may hold; a larger response is not kept. */
  maxBytes: number;
  /** Who can see it: "account" data is per actor; "platform" data (the public catalogue) is the same for everyone. */
  audience: "account" | "platform";
  description: string;
}

const KB = 1024;

export const PAGE_COPY_DEFINITIONS: readonly PageCopyDefinition[] = [
  { id: "self-profile", endpoint: "/api/profile", variants: "single", maxVariants: 1, maxBytes: 256 * KB, audience: "account", description: "The account's own profile (profile page, preview, tags)." },
  { id: "agent-actions", endpoint: "/api/agent/actions", variants: "single", maxVariants: 1, maxBytes: 256 * KB, audience: "account", description: "The agent action centre's current actions." },
  // Three ledger pages: the first page is what the ledger opens on, and two more cover a normal
  // week of agent activity (a page is 20 entries); older entries are history the user rarely needs offline.
  { id: "agent-ledger", endpoint: "/api/agent/ledger", variants: "single", maxVariants: 3, maxBytes: 256 * KB, audience: "account", description: "The All Actions ledger: the first three pages (variants page-1..page-3)." },
  { id: "relationship-tasks", endpoint: "/api/relationship-tasks/page", variants: "single", maxVariants: 2, maxBytes: 128 * KB, audience: "account", description: "The first relationship follow-up page per mode (open, completed)." },
  { id: "task-suggestions", endpoint: "/api/task-suggestions/page", variants: "single", maxVariants: 1, maxBytes: 128 * KB, audience: "account", description: "The first page of pending relationship task suggestions." },
  { id: "today-page", endpoint: "/api/today", variants: "single", maxVariants: 1, maxBytes: 256 * KB, audience: "account", description: "Today's first task page (taskMode=page) for the device's time zone." },
  { id: "today-summary", endpoint: "/api/today", variants: "single", maxVariants: 1, maxBytes: 128 * KB, audience: "account", description: "The Today summary block on the AI tab (taskMode=summary)." },
  { id: "relationship-lifecycle", endpoint: "/api/connections/:id/lifecycle", variants: "keyed", maxVariants: 20, maxBytes: 128 * KB, audience: "account", description: "A relationship's next-step page, per connection; the 20 most recently opened are kept." },
  { id: "meeting-details", endpoint: "/api/schedule-items/:id/meeting-details", variants: "keyed", maxVariants: 20, maxBytes: 128 * KB, audience: "account", description: "A meeting's details, per meeting; the 20 most recently opened are kept." },
  { id: "public-events", endpoint: "/api/events/public", variants: "single", maxVariants: 1, maxBytes: 512 * KB, audience: "platform", description: "The public event catalogue as last seen (platform data, stored per identity so one clearing rule applies)." },
  { id: "event-recommendations", endpoint: "/api/recommendations/events", variants: "single", maxVariants: 2, maxBytes: 256 * KB, audience: "account", description: "The account's event recommendations as last seen (variants: home card, events tab)." },
];

export type PageCopyId = (typeof PAGE_COPY_DEFINITIONS)[number]["id"];

export function findPageCopyDefinition(id: string): PageCopyDefinition | null {
  return PAGE_COPY_DEFINITIONS.find((definition) => definition.id === id) ?? null;
}

/** The last successful online read of a page, as the device keeps it. */
export interface PageCopy<TData = unknown> {
  data: TData;
  /** When the server answered (ISO). */
  syncedAt: string;
}

/** What a page may say about a copy it is showing. */
export interface PageCopyStatus {
  /** The copy on screen is from `lastSyncedAt`. */
  lastSyncedAt: string | null;
  /** The server could not be reached, or answered with an error, after the copy was shown. */
  offline: boolean;
  /** Why: no connection, or the server answered 5xx. */
  reason: "unreachable" | "unavailable" | null;
}

export const PAGE_COPY_VARIANT_MAX_LENGTH = 200;

export function assertPageCopyKey(id: string, variant: string): PageCopyDefinition {
  const definition = findPageCopyDefinition(id);
  if (!definition) throw new TypeError("page copy is not registered");
  if (typeof variant !== "string" || variant.length === 0 || variant.length > PAGE_COPY_VARIANT_MAX_LENGTH) throw new TypeError("page copy variant is invalid");
  return definition;
}
