export async function communicationRequest(path: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(path, { ...options, cache: "no-store", headers: { "content-type": "application/json", ...options.headers } });
  const envelope = await response.json();
  if (!response.ok || envelope.success !== true) throw new Error(envelope.error?.code ?? "Communication request failed");
  return envelope.data;
}

/*
 * Shared inbox identity confirmation (W0031, D25 W31-1 A).
 *
 * The badge, both inbox tabs, the selected detail and the notification source page all poll every
 * 15 s and each used to confirm `/api/account/me` before and after its own read. They now share:
 *   - reads: one confirmation per poll cycle. Concurrent reads join one request; a successful result
 *     is reused for INBOX_ACTOR_REUSE_MS (shorter than the 15 s cycle, so the next cycle asks again).
 *   - writes: `readContactMessageActorForWrite` is a barrier. It never reuses a result and never joins
 *     a request that started before it was called; only write confirmations issued in the same batch
 *     (same task, before the request is dispatched) share one request.
 * Every invalidation bumps `generation`. A request may write the reusable result only when it
 * completes in the generation it started in and still has a waiting (not cancelled) consumer, so a
 * late answer from before an account switch, or one nobody waits for, is never remembered.
 * Failures are never remembered either; they invalidate.
 */
export const INBOX_ACTOR_REUSE_MS = 10_000;

export interface InboxActorFailure {
  ok: boolean;
  status: number;
  envelope?: { success?: unknown; error?: { code?: string } } | null;
  parseError?: unknown;
}
export type InboxActorOutcome = { actor: string } | { failure: InboxActorFailure };

interface ActorRequest {
  generation: number;
  consumers: number;
  settled: boolean;
  abandoned: boolean;
  /** Write batches accept joiners only until the request is dispatched. */
  open: boolean;
  controller: AbortController;
  promise: Promise<InboxActorOutcome>;
}

let generation = 0;
let reusable: { actor: string; issuedAt: number } | null = null;
let readRequest: ActorRequest | null = null;
let writeBatch: ActorRequest | null = null;

/** Forget any reusable identity; requests already in flight can no longer be joined or cached. */
export function invalidateInboxActorConfirmation(): void {
  generation += 1;
  reusable = null;
  readRequest = null;
  writeBatch = null;
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason instanceof Error ? signal.reason : new DOMException("This operation was aborted", "AbortError");
}

async function fetchActorOutcome(signal: AbortSignal): Promise<InboxActorOutcome> {
  const response = await fetch("/api/account/me", { signal, cache: "no-store", credentials: "same-origin", headers: { "content-type": "application/json" } });
  let envelope: InboxActorFailure["envelope"];
  try { envelope = await response.json(); }
  catch (parseError) { return { failure: { ok: response.ok, status: response.status, parseError } }; }
  const actor = (envelope as { data?: { account?: { id?: unknown } } } | null)?.data?.account?.id;
  if (response.ok && envelope?.success === true && typeof actor === "string" && actor.trim()) return { actor };
  return { failure: { ok: response.ok, status: response.status, envelope } };
}

function startActorRequest(write: boolean): ActorRequest {
  const request: ActorRequest = {
    generation, consumers: 0, settled: false, abandoned: false, open: write,
    controller: new AbortController(), promise: undefined as unknown as Promise<InboxActorOutcome>,
  };
  request.promise = (async () => {
    // Let write confirmations of the same batch join before the request goes out.
    if (write) await Promise.resolve();
    request.open = false;
    const issuedAt = Date.now();
    const outcome = await fetchActorOutcome(request.controller.signal);
    return { outcome, issuedAt };
  })().then(({ outcome, issuedAt }) => {
    request.settled = true;
    if ("actor" in outcome) {
      if (request.generation === generation && request.consumers > 0) reusable = { actor: outcome.actor, issuedAt };
    } else if (request.generation === generation) invalidateInboxActorConfirmation();
    return outcome;
  }, (error: unknown) => {
    request.settled = true;
    if (!request.abandoned && request.generation === generation) invalidateInboxActorConfirmation();
    throw error;
  }).finally(() => {
    if (readRequest === request) readRequest = null;
    if (writeBatch === request) writeBatch = null;
  });
  // Consumers attach their own handlers; this one only keeps an abandoned rejection from surfacing.
  request.promise.catch(() => undefined);
  return request;
}

function consume(request: ActorRequest, signal?: AbortSignal): Promise<InboxActorOutcome> {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  request.consumers += 1;
  return new Promise<InboxActorOutcome>((resolve, reject) => {
    let done = false;
    const onAbort = () => {
      if (done) return;
      done = true;
      request.consumers -= 1;
      if (request.consumers === 0 && !request.settled) {
        // Nobody waits any more: stop the request and let the next confirmation start a new one.
        request.abandoned = true;
        if (readRequest === request) readRequest = null;
        if (writeBatch === request) writeBatch = null;
        request.controller.abort();
      }
      reject(abortError(signal!));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    request.promise.then(outcome => {
      if (done) return;
      done = true; signal?.removeEventListener("abort", onAbort); resolve(outcome);
    }, error => {
      if (done) return;
      done = true; signal?.removeEventListener("abort", onAbort); reject(error);
    });
  });
}

/** Low-level shared confirmation; callers map failures to their own error types. */
export function confirmInboxActor(signal?: AbortSignal, { write = false }: { write?: boolean } = {}): Promise<InboxActorOutcome> {
  if (write) {
    if (!writeBatch?.open) writeBatch = startActorRequest(true);
    return consume(writeBatch, signal);
  }
  const now = Date.now();
  if (reusable && now >= reusable.issuedAt && now - reusable.issuedAt < INBOX_ACTOR_REUSE_MS) {
    if (signal?.aborted) return Promise.reject(abortError(signal));
    return Promise.resolve({ actor: reusable.actor });
  }
  readRequest ??= startActorRequest(false);
  return consume(readRequest, signal);
}

function actorOrThrow(outcome: InboxActorOutcome): string {
  if ("actor" in outcome) return outcome.actor;
  const { failure } = outcome;
  if (failure.parseError !== undefined) throw failure.parseError;
  if (!failure.ok || failure.envelope?.success !== true) throw new Error(failure.envelope?.error?.code ?? "Communication request failed");
  throw new Error("No account");
}

/** Poll-time identity: shared per cycle (see above). */
export async function readContactMessageActor(signal?: AbortSignal): Promise<string> {
  return actorOrThrow(await confirmInboxActor(signal));
}

/** Pre-write identity barrier: always a request issued after this call. */
export async function readContactMessageActorForWrite(signal?: AbortSignal): Promise<string> {
  return actorOrThrow(await confirmInboxActor(signal, { write: true }));
}
