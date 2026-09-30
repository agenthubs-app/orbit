import { createInboxSummaryGetHandler } from "../../app/api/inbox/summary/handler";
import {
  createConversationDraftGetHandler,
  createConversationGetHandler,
  createEligibilityGetHandler,
} from "../../app/api/relationship-communication/handler";
import { createRelationshipPageGetHandler } from "../../app/api/relationship-communication/read-handler";
import { createRelationshipUnreadSummaryGetHandler } from "../../app/api/relationship-communication/unread-summary/handler";
import { createRelationshipBoundedReader } from "../../features/relationship-communication/bounded-reader";
import type { RelationshipCommunicationService } from "../../features/relationship-communication/service";
import { readRelationshipUnreadSummary } from "../../features/relationship-communication/unread-summary";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";

/**
 * Sprint 0109: one fixed relationship-messaging scenario whose route responses
 * were captured from the pre-0109 code (the universal-table collections) into
 * tests/fixtures/relationship-message-parity.golden.json. The parity test seeds
 * the captured legacy rows, runs the message-table migration and replays the
 * same requests through the same route handlers; every response must match.
 */
export const PARITY_WORKSPACE = "workspace:relationship-parity";
export const PARITY_CURSOR_SECRET = "relationship-parity-cursor-secret-0109-xxxxxxxx";
export const PARITY_CONTACTS = { b: "contact:parity-b", d: "contact:parity-d", e: "contact:parity-e" } as const;

export type ParityActor = { id: string; accountId: string; name: string; email: string; workspaceId: string };
const actor = (key: string, name: string): ParityActor => ({
  id: `account:parity-${key}`, accountId: `account:parity-${key}`, name, email: `parity-${key}@example.test`, workspaceId: PARITY_WORKSPACE,
});
export const PARITY_ACTORS = { a: actor("a", "Parity A"), b: actor("b", "Parity B"), c: actor("c", "Parity C"), d: actor("d", "Parity D"), e: actor("e", "Parity E") } as const;

/** Contacts are owned by A only; everyone else resolves no contact. */
export async function resolveParityContact(contactId: string, accountId: string) {
  if (accountId !== PARITY_ACTORS.a.id) return null;
  const key = Object.entries(PARITY_CONTACTS).find(([, id]) => id === contactId)?.[0] as keyof typeof PARITY_CONTACTS | undefined;
  if (!key) return null;
  const remote = PARITY_ACTORS[key];
  return { contactId, displayName: remote.name, organization: "Orbit Parity", recipientEmail: remote.email };
}

export interface ParityContext {
  client: LiveRecordSqlClient;
  createService: (actor: ParityActor) => RelationshipCommunicationService;
  conversations: { ab: string; ad: string; ae: string };
}

export type ParityResponse = { status: number; body: unknown };

const NOW = "2026-09-28T00:00:00.000Z";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, ["asOf", "refreshedAt"].includes(key) ? "<now>" : normalize(inner)]));
  }
  return value;
}

async function read(response: Response): Promise<ParityResponse> {
  return { status: response.status, body: normalize(await response.json()) };
}

/** Every read route the App and the web call, for every actor, in a fixed order. */
export async function runParityRequests(context: ParityContext): Promise<Record<string, ParityResponse>> {
  const out: Record<string, ParityResponse> = {};
  const reader = (who: ParityActor) => createRelationshipBoundedReader({ client: context.client, workspaceId: PARITY_WORKSPACE, actorId: who.id, cursorSecret: PARITY_CURSOR_SECRET, now: () => NOW });
  const pages = (kind: "conversations" | "messages", who: ParityActor) => createRelationshipPageGetHandler(kind, { resolveActor: async () => who, service: () => reader(who) });
  const summaries = async (who: ParityActor, query = "") => read(await pages("conversations", who)(new Request(`https://orbit.example/api/relationship-communication/conversation-summaries${query}`)));
  const messages = async (who: ParityActor, id: string, query = "") => read(await pages("messages", who)(
    new Request(`https://orbit.example/api/relationship-communication/conversations/${encodeURIComponent(id)}/messages${query}`), { params: Promise.resolve({ id }) }));
  const unread = async (who: ParityActor) => read(await createRelationshipUnreadSummaryGetHandler({
    resolveActor: async () => who, read: (actorId) => readRelationshipUnreadSummary({ client: context.client, workspaceId: PARITY_WORKSPACE, actorId, now: () => NOW }),
  })());
  const inbox = async (who: ParityActor) => read(await createInboxSummaryGetHandler({
    resolveActor: async () => who, typedEnabled: () => true, readTyped: async () => 0, now: () => NOW,
    readMessages: async (a) => (await readRelationshipUnreadSummary({ client: context.client, workspaceId: PARITY_WORKSPACE, actorId: a.accountId ?? a.id })).unreadTotal,
  })());
  const serviceDeps = (who: ParityActor) => ({ resolveActor: async () => who, createService: () => context.createService(who) });
  const conversation = async (who: ParityActor, id: string) => read(await createConversationGetHandler(serviceDeps(who))(
    new Request(`https://orbit.example/api/relationship-communication/conversations/${encodeURIComponent(id)}`), { params: Promise.resolve({ id }) }));
  const eligibility = async (who: ParityActor, contactId: string) => read(await createEligibilityGetHandler(serviceDeps(who))(
    new Request(`https://orbit.example/api/relationship-communication/eligibility?contactId=${encodeURIComponent(contactId)}`)));
  const draft = async (who: ParityActor, id: string) => read(await createConversationDraftGetHandler(serviceDeps(who))(
    new Request(`https://orbit.example/api/relationship-communication/conversations/${encodeURIComponent(id)}/draft`), { params: Promise.resolve({ id }) }));

  const { a, b, c, d, e } = PARITY_ACTORS;
  const { ab, ad, ae } = context.conversations;
  for (const who of [a, b, c, d, e]) {
    out[`summaries:${who.id}`] = await summaries(who);
    out[`unread:${who.id}`] = await unread(who);
    out[`inbox:${who.id}`] = await inbox(who);
  }
  // A has two visible conversations: walk them one per page with the opaque cursor.
  const firstPage = await summaries(a, "?limit=1");
  out["summaries:a:limit1:page1"] = firstPage;
  const cursor = (firstPage.body as { data?: { nextCursor?: string | null } }).data?.nextCursor;
  out["summaries:a:limit1:page2"] = await summaries(a, `?limit=1&cursor=${encodeURIComponent(cursor ?? "")}`);
  out["summaries:a:one-conversation"] = await summaries(a, `?conversationId=${encodeURIComponent(ad)}`);
  out["summaries:b:cursor-from-a"] = await summaries(b, `?limit=1&cursor=${encodeURIComponent(cursor ?? "")}`);
  // B pages the A–B history backwards two at a time, then asks for anything newer than the newest.
  const older1 = await messages(b, ab, "?limit=2");
  out["messages:b:ab:page1"] = older1;
  const olderCursor = (older1.body as { data?: { nextCursor?: string | null } }).data?.nextCursor;
  const older2 = await messages(b, ab, `?limit=2&cursor=${encodeURIComponent(olderCursor ?? "")}`);
  out["messages:b:ab:page2"] = older2;
  const olderCursor2 = (older2.body as { data?: { nextCursor?: string | null } }).data?.nextCursor;
  out["messages:b:ab:page3"] = await messages(b, ab, `?limit=2&cursor=${encodeURIComponent(olderCursor2 ?? "")}`);
  const newest = (older1.body as { data?: { newestCursor?: string | null } }).data?.newestCursor;
  out["messages:b:ab:newer"] = await messages(b, ab, `?direction=newer&cursor=${encodeURIComponent(newest ?? "")}`);
  out["messages:b:ab:newer-from-page2"] = await messages(b, ab, `?direction=newer&limit=2&cursor=${encodeURIComponent((older2.body as { data?: { newestCursor?: string | null } }).data?.newestCursor ?? "")}`);
  out["messages:a:ab:all"] = await messages(a, ab);
  out["messages:d:ad:all"] = await messages(d, ad);
  out["messages:c:ab:outsider"] = await messages(c, ab);
  out["messages:e:ae:revoked"] = await messages(e, ae);
  out["messages:a:ae:revoked"] = await messages(a, ae);
  out["messages:b:ab:bad-cursor"] = await messages(b, ab, "?cursor=not-a-cursor");
  out["messages:b:ab:cursor-for-other-conversation"] = await messages(b, ad, `?limit=2&cursor=${encodeURIComponent(olderCursor ?? "")}`);
  for (const [who, id, label] of [[a, ab, "a:ab"], [b, ab, "b:ab"], [d, ad, "d:ad"], [c, ab, "c:ab"], [e, ae, "e:ae"], [a, ae, "a:ae"]] as const) {
    out[`conversation:${label}`] = await conversation(who, id);
  }
  out["conversation:a:unknown"] = await conversation(a, "relationship-conversation:unknown");
  for (const [key, contactId] of Object.entries(PARITY_CONTACTS)) out[`eligibility:a:${key}`] = await eligibility(a, contactId);
  out["eligibility:b:b"] = await eligibility(b, PARITY_CONTACTS.b);
  out["draft:b:ab"] = await draft(b, ab);
  out["draft:a:ab"] = await draft(a, ab);
  out["draft:c:ab"] = await draft(c, ab);
  out["draft:e:ae"] = await draft(e, ae);
  return out;
}
