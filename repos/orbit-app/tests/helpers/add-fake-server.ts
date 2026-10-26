// R12 人脈を追加: an in-memory stand-in for the server routes the App add screens call — the v2
// card batch pipeline (create / upload / finalize / duplicates / confirm / manual-entry / skip /
// replace / retry), the event attribution candidates, the contact draft queue and
// `/api/contacts/manual/**`. It keeps the 人脈 it writes, so a test can compare the 完成
// numbers with how many people were really added. Behaviour follows the server's rules
// that the screens depend on: an identical match merges by itself, a similar one answers
// duplicate_review unless the person chose (mergeIntoContactId / allowDuplicate), a card
// confirmed twice is refused, and a batch whose cards are all settled is completed.
import type { IngestBatchContract, IngestContactCandidateContract, IngestItemContract } from "../../src/api/contract/business-card-batch";
import { batch as batchFixture, extraction, FUTURE, hex, T0 } from "./add-fixtures";

export type Call = { method: string; path: string; body: unknown; headers: Record<string, string> };
export type Reply = { status: number; body: unknown };

export interface Person { id: string; displayName: string; organization: string; role: string; email: string; phone: string; createdVia: string; merged: number }

type Reading = { kind: "read"; fields: Parameters<typeof extraction>[0]; issues?: { code: string; field: string; message: string }[] } | { kind: "fail"; code: "IMAGE_INVALID" | "OCR_PROVIDER_FAILED" };

const ok = (data: unknown, status = 200): Reply => ({ body: { data, success: true }, status });
const fail = (status: number, code: string, reason?: string): Reply => ({ body: { error: { code, message: reason ?? code, ...(reason ? { context: { reason } } : {}) }, success: false }, status });

export class FakeAddServer {
  readonly calls: Call[] = [];
  people: Person[] = [];
  batches = new Map<string, { batch: IngestBatchContract; items: IngestItemContract[] }>();
  /** seq → what reading that photo gives (by batch order). */
  readings: Reading[] = [];
  attribution: { events: { eventId: string; title: string; startsAt: string }[]; cards: Record<string, string | null> } | ((batchId: string) => { events: { eventId: string; title: string; startsAt: string }[]; cards: Record<string, string | null> }) = { cards: {}, events: [] };
  drafts: { id: string; displayName: string; organization: string; role: string; status: string; source: { label: string } }[] = [];
  events: { id: string; title: string; startsAt: string }[] = [];
  sample = false;
  /** Keeps the batch in ready_for_review after the last card (plan candidates not queued yet). */
  holdCompletion = false;
  /** R12 review m9: the duplicate lookup answers 500. */
  duplicatesFail = false;
  /** R12 review m7: uploads wait for this before answering (null = answer at once). */
  uploadGate: Promise<void> | null = null;
  /** Photo uploads answer 500 (the server cannot store the image). */
  uploadFail = false;
  undone: string[] = [];
  /** 元に戻す waits for this before answering (null = answer at once), like a slow network. */
  undoGate: Promise<void> | null = null;
  /** 元に戻す answers 409 UNDO_EXPIRED (the person was touched or 10 minutes passed). */
  undoExpired = false;
  private sequence = 0;

  constructor(people: Partial<Person>[] = []) {
    this.people = people.map((person, index) => ({ createdVia: "seed", displayName: "", email: "", id: `contact-seed-${index}`, merged: 0, organization: "", phone: "", role: "", ...person }));
  }

  writes(): string[] {
    return this.calls.filter((call) => call.method !== "GET").map((call) => `${call.method} ${call.path.split("?")[0]}`);
  }

  private next(prefix: string) { this.sequence += 1; return `${prefix}-${this.sequence}`; }

  private candidateFor(fields: { displayName: string; organization?: string; role?: string; email?: string; phone?: string }): IngestContactCandidateContract | null {
    const norm = (value: string | undefined) => (value ?? "").replace(/\s+/g, "").toLowerCase();
    const person = this.people.find((entry) => (norm(fields.email) && norm(entry.email) === norm(fields.email)) || norm(entry.displayName) === norm(fields.displayName));
    if (!person) return null;
    const sameEmail = Boolean(norm(fields.email)) && norm(fields.email) === norm(person.email);
    const identical = (["displayName", "organization", "role", "email", "phone"] as const).every((field) => norm(fields[field]) === norm(person[field]));
    return { address: "", contactId: person.id, displayName: person.displayName, email: person.email, identical, matchedOn: sameEmail ? ["email"] : person.organization && norm(person.organization) === norm(fields.organization) ? ["name_organization"] : ["name"], organization: person.organization, phone: person.phone, role: person.role };
  }

  /** The batch finished reading: each photo gets `readings[seq - 1]`. */
  completeReading(batchId: string) {
    const entry = this.batches.get(batchId)!;
    entry.items = entry.items.map((item) => {
      if (item.status !== "queued" && item.status !== "processing" && item.status !== "uploaded") return item;
      const reading = this.readings[item.seq - 1] ?? { fields: { name: `名刺 ${item.seq}` }, kind: "read" };
      return reading.kind === "read"
        ? { ...item, extraction: extraction(reading.fields), reviewIssues: (reading.issues ?? []) as IngestItemContract["reviewIssues"], status: "extracted" as const, version: item.version + 1 }
        : { ...item, errorCode: reading.code, errorStage: "ocr" as const, extraction: null, status: "terminal_failed" as const, version: item.version + 1 };
    });
    entry.batch = { ...entry.batch, status: "ready_for_review", version: entry.batch.version + 1 };
  }

  private reconcile(batchId: string) {
    const entry = this.batches.get(batchId)!;
    if (this.holdCompletion) return;
    if (entry.items.every((item) => ["confirmed", "skipped", "excluded"].includes(item.status))) entry.batch = { ...entry.batch, status: "completed", version: entry.batch.version + 1 };
  }

  async handle(call: Call): Promise<Reply | null> {
    this.calls.push(call);
    const path = call.path.split("?")[0]!;
    const query = call.path.split("?")[1] ?? "";
    const params = new URLSearchParams(query);
    const body = (call.body ?? {}) as Record<string, unknown>;
    const v2 = "/api/contact-drafts/business-card/batches/v2";
    let match: RegExpExecArray | null;

    // ── v2 batches ──
    if (call.method === "POST" && path === v2) {
      const manifest = body.manifest as { cardId: string; side: "front" | "back"; fileName: string; mimeType: string; rawSize: number; seq: number; clientDigest: string }[];
      const id = this.next("batch");
      const batch = batchFixture(id, "collecting", manifest.length, { finalizedAt: null, idempotencyKey: String(body.idempotencyKey), manifestFingerprint: hex(id), version: 1 });
      const items = manifest.map((entry) => ({
        attemptCount: 0, batchId: id, cardId: entry.cardId, clientDigest: entry.clientDigest, confirmedContactId: null, createdAt: T0, derivativeObjectKey: null, derivativeSize: null,
        errorCode: null, errorStage: null, extraction: null, extractionSchemaVersion: null, id: `${id}:item:${entry.seq}`, imageDigest: null, leaseExpiresAt: null, nextRetryAt: null,
        rawMimeType: entry.mimeType, rawSize: entry.rawSize, reviewIssues: [], seq: entry.seq, side: entry.side, sourceFileName: entry.fileName, status: "awaiting_upload" as const, updatedAt: T0, usage: null, version: 1,
      }));
      this.batches.set(id, { batch, items });
      return ok({ batch, items, reused: false }, 201);
    }
    if ((match = new RegExp(`^${v2}/([^/]+)/items/([^/]+)/content$`).exec(path)) && call.method === "PUT") {
      if (this.uploadGate) await this.uploadGate;
      if (this.uploadFail) return fail(500, "INTERNAL_ERROR", "STORAGE_DOWN");
      const entry = this.batches.get(decodeURIComponent(match[1]!))!;
      const index = entry.items.findIndex((item) => item.id === decodeURIComponent(match![2]!));
      const item = { ...entry.items[index]!, derivativeObjectKey: `d/${match[2]}`, derivativeSize: 900, imageDigest: entry.items[index]!.clientDigest, status: "uploaded" as const, version: entry.items[index]!.version + 1 };
      entry.items[index] = item;
      return ok({ alreadyUploaded: false, item });
    }
    if ((match = new RegExp(`^${v2}/([^/]+)/finalize$`).exec(path)) && call.method === "POST") {
      const entry = this.batches.get(decodeURIComponent(match[1]!))!;
      entry.items = entry.items.map((item) => ({ ...item, status: "queued" as const, version: item.version + 1 }));
      entry.batch = { ...entry.batch, finalizedAt: T0, status: "processing", version: entry.batch.version + 1 };
      return ok({ alreadyFinalized: false, batch: entry.batch });
    }
    if ((match = new RegExp(`^${v2}/([^/]+)/duplicates$`).exec(path)) && call.method === "POST") {
      if (this.duplicatesFail) return fail(500, "INTERNAL_ERROR", "LOOKUP_DOWN");
      const matches: Record<string, IngestContactCandidateContract | null> = {};
      for (const card of body.cards as { cardId: string; fields: { displayName: string; organization: string; role: string; email: string; phone: string } }[]) matches[card.cardId] = this.candidateFor(card.fields);
      return ok({ matches });
    }
    if ((match = new RegExp(`^${v2}/([^/]+)/items/([^/]+)/(confirm|manual-entry)$`).exec(path)) && call.method === "POST") {
      const entry = this.batches.get(decodeURIComponent(match[1]!))!;
      const target = entry.items.find((item) => item.id === decodeURIComponent(match![2]!))!;
      const card = entry.items.filter((item) => item.cardId === target.cardId);
      if (card.some((item) => item.status === "confirmed")) return fail(409, "CONFLICT", "ITEM_STATE_CONFLICT");
      const fields = { displayName: String(body.displayName ?? ""), email: String(body.email ?? ""), organization: String(body.organization ?? ""), phone: String(body.phone ?? ""), role: String(body.role ?? "") };
      let contactId: string;
      let merged = false;
      if (typeof body.mergeIntoContactId === "string") {
        contactId = body.mergeIntoContactId;
        merged = true;
        this.people.find((person) => person.id === contactId)!.merged += 1;
      } else {
        const candidate = body.allowDuplicate === true ? null : this.candidateFor(fields);
        if (candidate && !candidate.identical) return ok({ candidate, duplicateContactId: candidate.contactId, state: "duplicate_review" });
        if (candidate) {
          contactId = candidate.contactId;
          merged = true;
          this.people.find((person) => person.id === contactId)!.merged += 1;
        } else {
          contactId = this.next("contact-card");
          this.people.push({ ...fields, createdVia: "card", id: contactId, merged: 0 });
        }
      }
      // Like the server's batch detail (R12 review m4): each confirmed item says whether it was merged.
      const items = card.map((item) => ({ ...item, confirmedContactId: contactId, confirmedMerged: merged, status: "confirmed" as const, version: item.version + 1 }));
      entry.items = entry.items.map((item) => items.find((next) => next.id === item.id) ?? item);
      this.reconcile(entry.batch.id);
      return ok({ contactId, item: items.find((item) => item.id === target.id)!, items, merged, metEventId: typeof body.metEventId === "string" ? body.metEventId : null, replayed: false, state: "created" });
    }
    if ((match = new RegExp(`^${v2}/([^/]+)/items/([^/]+)/(skip|retry)$`).exec(path)) && call.method === "POST") {
      const entry = this.batches.get(decodeURIComponent(match[1]!))!;
      const target = entry.items.find((item) => item.id === decodeURIComponent(match![2]!))!;
      const status = match[3] === "skip" ? "skipped" as const : "queued" as const;
      entry.items = entry.items.map((item) => ((match![3] === "skip" ? item.cardId === target.cardId : item.id === target.id) ? { ...item, status, version: item.version + 1 } : item));
      if (status === "skipped") this.reconcile(entry.batch.id);
      return ok({ item: entry.items.find((item) => item.id === target.id) });
    }
    if ((match = new RegExp(`^${v2}/([^/]+)/items/([^/]+)/replace$`).exec(path)) && call.method === "POST") {
      const entry = this.batches.get(decodeURIComponent(match[1]!))!;
      const index = entry.items.findIndex((item) => item.id === decodeURIComponent(match![2]!));
      const item = { ...entry.items[index]!, errorCode: null, errorStage: null, extraction: null, status: "queued" as const, version: entry.items[index]!.version + 1 };
      entry.items[index] = item;
      entry.batch = { ...entry.batch, status: "processing" };
      return ok({ item });
    }
    if ((match = new RegExp(`^${v2}/([^/]+)$`).exec(path)) && call.method === "GET") {
      const entry = this.batches.get(decodeURIComponent(match[1]!));
      return entry ? ok({ batch: entry.batch, items: entry.items }) : fail(404, "NOT_FOUND");
    }
    if (path === "/api/agent/event-attribution/candidates") {
      const batchId = params.get("batchId") ?? "";
      return ok(typeof this.attribution === "function" ? this.attribution(batchId) : this.attribution);
    }

    // ── draft queue ──
    if (call.method === "GET" && path === "/api/contact-drafts") return ok({ drafts: this.drafts.map((draft) => ({ ...draft, confirmation: { state: draft.status === "confirmed" ? "confirmed" : "pending" }, createdAt: T0 })) });
    if ((match = /^\/api\/contact-drafts\/([^/]+)\/confirm$/.exec(path)) && call.method === "POST") {
      const draft = this.drafts.find((entry) => entry.id === decodeURIComponent(match![1]!));
      if (!draft) return fail(404, "NOT_FOUND");
      draft.status = "confirmed";
      const contactId = this.next("contact-draft");
      this.people.push({ createdVia: "draft", displayName: draft.displayName, email: "", id: contactId, merged: 0, organization: draft.organization, phone: "", role: draft.role });
      return ok({ confirmedDraft: { ...draft, contactId }, contactCandidate: { contactId, contactWriteExecuted: true }, state: "confirmed" });
    }
    // QA-C2: 破棄 is stored on the server; the queue stops listing the draft.
    if ((match = /^\/api\/contact-drafts\/([^/]+)\/discard$/.exec(path)) && call.method === "POST") {
      const draftId = decodeURIComponent(match[1]!);
      if (!this.drafts.some((entry) => entry.id === draftId)) return fail(404, "NOT_FOUND");
      this.drafts = this.drafts.filter((entry) => entry.id !== draftId);
      return ok({ draftId, discardedAt: T0, state: "discarded" });
    }
    if (call.method === "POST" && path === "/api/contact-drafts/event-attendees/import") {
      const added = [{ displayName: "参加者 一郎", id: this.next("draft"), organization: "CFO Night", role: "", source: { label: "CFO Night Tokyo" }, status: "pending_confirmation" }];
      this.drafts.push(...added);
      return ok({ contactDrafts: added });
    }
    if (call.method === "GET" && path === "/api/events") return ok({ events: this.events });
    // R26-06：手入力「出会った場所」候选读 /api/events/mine（过去 + 未来两次）；这里把 events 全放在 past。
    if (call.method === "GET" && path === "/api/events/mine") {
      const past = call.path.includes("range=past");
      const items = past ? this.events.map((event) => ({ eventId: event.id, startsAt: event.startsAt, status: "registered", title: event.title })) : [];
      return ok({ items, range: past ? "past" : "upcoming", upcomingCount: 0 });
    }

    // ── 手入力 ──
    if (call.method === "POST" && path === "/api/contacts/manual/duplicates") {
      const candidate = this.candidateFor(body as { displayName: string });
      return ok({ candidates: candidate ? [{ ...candidate, identical: false }] : [] });
    }
    if (call.method === "GET" && path === "/api/contacts/manual/organizations") {
      const q = params.get("q") ?? "";
      const counts = new Map<string, number>();
      for (const person of this.people) if (person.organization.startsWith(q)) counts.set(person.organization, (counts.get(person.organization) ?? 0) + 1);
      return ok({ organizations: [...counts].map(([name, contactCount]) => ({ contactCount, name })) });
    }
    if (call.method === "POST" && path === "/api/contacts/manual") {
      if (this.sample) return fail(403, "FORBIDDEN", "SAMPLE_READ_ONLY");
      const fields = { displayName: String(body.displayName), email: String(body.email ?? ""), organization: String(body.organization ?? ""), phone: String(body.phone ?? ""), role: String(body.role ?? "") };
      if (typeof body.mergeIntoContactId === "string") {
        const person = this.people.find((entry) => entry.id === body.mergeIntoContactId)!;
        const choices = (body.fieldChoices ?? {}) as Record<string, string>;
        for (const field of ["displayName", "organization", "role", "email", "phone"] as const) {
          if (fields[field] && (!person[field] || choices[field] === "incoming")) person[field] = fields[field];
        }
        person.merged += 1;
        return ok({ contactId: person.id, outcome: "merged" });
      }
      const candidate = body.allowDuplicate === true ? null : this.candidateFor(fields);
      if (candidate) return ok({ candidates: [{ ...candidate, identical: false }], outcome: "duplicate_review" });
      const contactId = this.next("contact-manual");
      this.people.push({ ...fields, createdVia: "manual_v2", id: contactId, merged: 0 });
      return ok({ contactId, outcome: "created", undoUntil: FUTURE });
    }
    if ((match = /^\/api\/contacts\/manual\/([^/]+)\/undo$/.exec(path)) && call.method === "POST") {
      const id = decodeURIComponent(match[1]!);
      if (this.undoGate) await this.undoGate;
      const index = this.people.findIndex((person) => person.id === id && person.createdVia === "manual_v2");
      if (index < 0 || this.undoExpired) return fail(409, "CONFLICT", "UNDO_EXPIRED");
      this.people.splice(index, 1);
      this.undone.push(id);
      return ok({ outcome: "undone" });
    }
    return null;
  }
}
