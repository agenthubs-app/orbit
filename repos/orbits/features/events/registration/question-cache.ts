import { createHash, randomUUID } from "node:crypto";

import type { EventRecord } from "../event-crud-and-import/contract";
import type { EventOperationsPostgresRuntime } from "../event-operations/storage/postgres-client";
import type { EventRegistrationQuestionSet } from "./contract";
import { candidatesFor, generateEventRegistrationQuestions } from "./question-generator";

/**
 * Sprint 0128: generated registration questions are platform data scoped to
 * one event (not to a reader). For an event without a published question set,
 * the model runs at most once per (event, language, question-relevant content);
 * every other read, from any account or server instance, gets the stored set.
 *
 * Single flight: the table's primary key is the claim. A reader inserts a
 * `generating` row (or takes over a failed row whose backoff ended, or a claim
 * whose lease expired), calls the model outside any transaction, then fills the
 * row only while it still holds the claim. Other readers poll the row. Failures
 * are recorded as `failed` with an exponential `retry_after`; they never become
 * cached questions, and readers inside the window get deterministic questions.
 */

// Bump when the generator's prompt or parsing changes, so old sets are not reused.
const GENERATOR_VERSION = 1;
const CLAIM_LEASE_MS = 45_000; // model request timeout is 20s
const WAIT_BUDGET_MS = 25_000;
const POLL_MIN_MS = 100;
const POLL_MAX_MS = 1_000;
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 60 * 60_000;

const TABLE = "event_ops_registration_question_cache";

export type RegistrationQuestionLanguage = "en" | "zh";

/** Digest of exactly the event fields the generator sends to the model or uses in candidates. */
export function registrationQuestionContentDigest(event: EventRecord, language: RegistrationQuestionLanguage): string {
  return createHash("sha256").update(JSON.stringify({
    description: event.description ?? null,
    generatorVersion: GENERATOR_VERSION,
    language,
    relationshipContext: event.relationshipContext ?? null,
    title: event.title,
    venue: event.venue ?? null,
  })).digest("hex");
}

function questionSetHashFor(input: { contentDigest: string; eventId: string; language: string; questions: EventRegistrationQuestionSet["questions"] }): string {
  return createHash("sha256").update(JSON.stringify([input.eventId, input.language, input.contentDigest, input.questions])).digest("hex");
}

export function registrationQuestionBackoffMs(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1), BACKOFF_MAX_MS);
}

interface CacheRow {
  claim_expired: boolean;
  generated_at: Date | string | null;
  question_set: StoredQuestionSet | null;
  question_set_hash: string | null;
  retry_open: boolean;
  state: "failed" | "generating" | "ready";
}

interface StoredQuestionSet {
  provenance: EventRegistrationQuestionSet["provenance"];
  questions: EventRegistrationQuestionSet["questions"];
}

function deterministic(event: EventRecord, language: RegistrationQuestionLanguage, fallbackReason: string): EventRegistrationQuestionSet {
  return {
    provenance: {
      aiProviderRequested: false,
      externalNetworkRequested: false,
      fallbackReason,
      generationMethod: "deterministic-fallback",
      model: null,
      provider: null,
    },
    questions: candidatesFor(event, language).map((candidate) => ({ ...candidate })),
  };
}

function fromRow(row: CacheRow, requested: boolean): EventRegistrationQuestionSet {
  const stored = row.question_set!;
  return {
    provenance: {
      ...stored.provenance,
      aiProviderRequested: requested,
      externalNetworkRequested: requested,
    },
    questionSetHash: row.question_set_hash!,
    questions: stored.questions,
  };
}

export interface RegistrationQuestionCacheOptions {
  generate?: typeof generateEventRegistrationQuestions;
  sleep?: (ms: number) => Promise<void>;
  waitBudgetMs?: number;
}

export interface RegistrationQuestionCache {
  /** Stored or freshly generated questions; deterministic when generation is unavailable. */
  resolve(event: EventRecord, language: RegistrationQuestionLanguage): Promise<EventRegistrationQuestionSet>;
  /** True when this event has ever had a ready generated set with this identity. */
  hasQuestionSet(eventId: string, questionSetHash: string): Promise<boolean>;
}

export function createPostgresRegistrationQuestionCache(
  runtime: EventOperationsPostgresRuntime,
  options: RegistrationQuestionCacheOptions = {},
): RegistrationQuestionCache {
  const { client, workspaceId } = runtime;
  const generate = options.generate ?? generateEventRegistrationQuestions;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const waitBudgetMs = options.waitBudgetMs ?? WAIT_BUDGET_MS;

  async function readRow(key: readonly unknown[]): Promise<CacheRow | null> {
    const result = await client.query<CacheRow>(
      `select state, question_set, question_set_hash, generated_at,
              (claim_expires_at is not null and claim_expires_at <= now()) as claim_expired,
              (retry_after is not null and retry_after <= now()) as retry_open
         from ${TABLE}
        where workspace_id = $1 and event_id = $2 and language = $3 and content_digest = $4`,
      key,
    );
    return result.rows[0] ?? null;
  }

  async function claim(key: readonly unknown[], token: string): Promise<boolean> {
    const result = await client.query<{ claim_token: string }>(
      `insert into ${TABLE} as cache
         (workspace_id, event_id, language, content_digest, state, claim_token, claim_expires_at, attempt_count, created_at, updated_at)
       values ($1, $2, $3, $4, 'generating', $5, now() + make_interval(secs => $6::double precision / 1000), 1, now(), now())
       on conflict (workspace_id, event_id, language, content_digest) do update
         set state = 'generating',
             claim_token = excluded.claim_token,
             claim_expires_at = excluded.claim_expires_at,
             attempt_count = cache.attempt_count + 1,
             updated_at = now()
       where (cache.state = 'failed' and cache.retry_after <= now())
          or (cache.state = 'generating' and cache.claim_expires_at <= now())
       returning claim_token`,
      [...key, token, CLAIM_LEASE_MS],
    );
    return result.rows[0]?.claim_token === token;
  }

  async function fill(key: readonly unknown[], token: string, set: EventRegistrationQuestionSet, hash: string): Promise<boolean> {
    const stored: StoredQuestionSet = { provenance: set.provenance, questions: set.questions };
    const result = await client.query(
      `update ${TABLE}
          set state = 'ready', question_set = $6::jsonb, question_set_hash = $7,
              provider = $8, model = $9, generated_at = now(),
              claim_token = null, claim_expires_at = null, retry_after = null, last_error_code = null,
              updated_at = now()
        where workspace_id = $1 and event_id = $2 and language = $3 and content_digest = $4
          and state = 'generating' and claim_token = $5`,
      [...key, token, JSON.stringify(stored), hash, set.provenance.provider, set.provenance.model],
    );
    return result.rowCount === 1;
  }

  async function fail(key: readonly unknown[], token: string, code: string): Promise<number | null> {
    const result = await client.query<{ attempt_count: number }>(
      `update ${TABLE}
          set state = 'failed', claim_token = null, claim_expires_at = null,
              retry_after = now() + make_interval(secs => least($7::double precision * power(2, greatest(attempt_count - 1, 0)), $8::double precision) / 1000),
              last_error_code = $6, updated_at = now()
        where workspace_id = $1 and event_id = $2 and language = $3 and content_digest = $4
          and state = 'generating' and claim_token = $5
        returning attempt_count`,
      [...key, token, code, BACKOFF_BASE_MS, BACKOFF_MAX_MS],
    );
    return result.rows[0]?.attempt_count ?? null;
  }

  async function generateAsOwner(event: EventRecord, language: RegistrationQuestionLanguage, key: readonly unknown[], token: string, contentDigest: string): Promise<EventRegistrationQuestionSet> {
    let set: EventRegistrationQuestionSet;
    try {
      set = await generate({ event, language, publishedQuestionSet: null });
    } catch {
      set = deterministic(event, language, "MODEL_REQUEST_FAILED");
    }
    const logBase = { eventId: event.id, language, provider: set.provenance.provider, model: set.provenance.model };
    if (set.provenance.generationMethod === "orbit-agent-model-customized") {
      const hash = questionSetHashFor({ contentDigest, eventId: event.id, language, questions: set.questions });
      if (await fill(key, token, set, hash)) {
        console.info(JSON.stringify({ event: "registration_questions_generated", ...logBase }));
        return { ...set, questionSetHash: hash };
      }
      // The lease expired and another reader took over; serve whatever is stored.
      const row = await readRow(key);
      return row?.state === "ready" ? fromRow(row, true) : set;
    }
    const code = set.provenance.fallbackReason ?? "MODEL_REQUEST_FAILED";
    const attempt = await fail(key, token, code);
    console.warn(JSON.stringify({
      event: "registration_questions_generation_failed",
      ...logBase,
      code,
      attempt,
      retryAfterMs: attempt === null ? null : registrationQuestionBackoffMs(attempt),
    }));
    return set;
  }

  return {
    async resolve(event, language) {
      const contentDigest = registrationQuestionContentDigest(event, language);
      const key = [workspaceId, event.id, language, contentDigest] as const;
      const deadline = Date.now() + waitBudgetMs;
      let pollMs = POLL_MIN_MS;
      for (;;) {
        const row = await readRow(key);
        if (row?.state === "ready") return fromRow(row, false);
        if (row?.state === "failed" && !row.retry_open) return deterministic(event, language, "MODEL_BACKOFF");
        const claimable = !row || (row.state === "failed" && row.retry_open) || (row.state === "generating" && row.claim_expired);
        if (claimable) {
          const token = randomUUID();
          if (await claim(key, token)) return generateAsOwner(event, language, key, token, contentDigest);
        }
        if (Date.now() >= deadline) return deterministic(event, language, "GENERATION_IN_PROGRESS");
        await sleep(pollMs);
        pollMs = Math.min(pollMs * 2, POLL_MAX_MS);
      }
    },

    async hasQuestionSet(eventId, questionSetHash) {
      const result = await client.query(
        `select 1 from ${TABLE}
          where workspace_id = $1 and event_id = $2 and question_set_hash = $3 and state = 'ready'`,
        [workspaceId, eventId, questionSetHash],
      );
      return result.rowCount > 0;
    },
  };
}
