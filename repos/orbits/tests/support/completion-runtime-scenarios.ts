import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import sharp from "sharp";
import { WORKSPACE_ID, PHASE_OUTPUTS, sendRuntimePhase, startRuntimeAppConsumer, stopRuntimeChild, type RuntimePhase, type CompletionRuntimeFixture } from "./completion-runtime-fixture";
import { runtimeFetch, startCompletionHttp } from "./completion-runtime-http";
import type { BusinessCardCloudOcrProvider, BusinessCardStructuredExtraction } from "../../features/acquisition/business-card-cloud-ocr";
import { aggregateBusinessCardNotes } from "../../features/acquisition/business-card-notes-aggregation";
import type { EventExperienceConfiguration } from "../../features/events/experience/contract";

export const EXPERIENCE_CONFIGURATION: EventExperienceConfiguration = {
  templateId: "default", coverAssetId: null, introduction: "Web runtime introduction", accentColor: "#236A71",
  questionSet: { track: "v1", questions: [
    { id: "target_attendees", intent: "target_attendees", participantProfileField: "targetAttendees", prompt: "Who would you like to meet?", options: ["Founders", "Operators"], required: true },
    { id: "value_offered", intent: "value_offered", participantProfileField: "valueOffered", prompt: "What can you offer?", options: ["Introductions", "Experience"], required: true },
  ] },
};

export function runtimeCheck(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

export const RUNTIME_EXTRACTION: BusinessCardStructuredExtraction = {
  fullName: "Runtime Card", nativeFullName: null, romanizedFullName: null,
  organization: "Runtime Laboratory", departments: ["Research"], title: "Engineer",
  emails: [{ label: "Work", value: "card@example.test" }],
  contactPoints: [{ type: "wechat", label: "Work channel", value: "runtime-card" }],
  website: null, addresses: [], certifications: [], detectedLanguages: ["en"],
};

export function deterministicRuntimeOcr(): BusinessCardCloudOcrProvider {
  return {
    providerName: "completion-runtime-injected", model: "deterministic-local-card-v1",
    async extract(input) {
      const metadata = await sharp(Buffer.from(input.imageBase64, "base64")).metadata();
      runtimeCheck(metadata.format === "jpeg" && metadata.width! > 0, "PROVIDER_BYTES_INVALID");
      return { extraction: structuredClone(RUNTIME_EXTRACTION), usage: { inputTokens: 0, outputTokens: 0, latencyMs: 0 } };
    },
  };
}

export async function runtimeJson(origin: string, path: string, cookie = "", method = "GET", body?: unknown, expected = 200): Promise<any> {
  const response = await runtimeFetch(origin, path, { method, headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await response.json().catch(() => { throw new Error(`HTTP_JSON_${response.status}_FAILED`); });
  const code = typeof value?.error?.code === "string" && /^[A-Z_]{1,40}$/.test(value.error.code) ? value.error.code : "NONE";
  const service = typeof value?.error?.context?.service === "string" && /^[a-z-]{1,40}$/.test(value.error.context.service) ? value.error.context.service.replaceAll("-", "_").toUpperCase() : "NONE";
  runtimeCheck(response.status === expected, `HTTP_${method}_${response.status}_EXPECTED_${expected}_${code}_${service}`);
  runtimeCheck(path === "/api/auth/session"
    ? value === null || typeof value?.user?.id === "string"
    : expected >= 400 ? value?.success === false : value?.success === true, "HTTP_ENVELOPE_INVALID");
  return value;
}

export async function credentialsRuntimeLogin(origin: string, email: string, password: string) {
  const csrf = await runtimeFetch(origin, "/api/auth/csrf");
  runtimeCheck(csrf.status === 200, `AUTH_CSRF_HTTP_${csrf.status}`);
  const value = await csrf.json();
  runtimeCheck(typeof value.csrfToken === "string", "AUTH_CSRF_MISSING");
  const jar = new Map<string, string>();
  for (const cookie of csrf.headers.getSetCookie()) { const pair = cookie.split(";", 1)[0]; jar.set(pair.split("=", 1)[0], pair); }
  const login = await runtimeFetch(origin, "/api/auth/callback/credentials", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: [...jar.values()].join("; "), "x-auth-return-redirect": "1" },
    body: new URLSearchParams({ csrfToken: value.csrfToken, email, password, callbackUrl: origin }),
  });
  runtimeCheck(login.status === 200 || login.status === 302, `AUTH_CREDENTIALS_${login.headers.has("x-orbit-fixture-boundary") ? "UPSTREAM" : "ADAPTER"}_${login.status}`);
  for (const cookie of login.headers.getSetCookie()) { const pair = cookie.split(";", 1)[0]; jar.set(pair.split("=", 1)[0], pair); }
  const cookie = [...jar.values()].join("; ");
  const session = await runtimeJson(origin, "/api/auth/session", cookie);
  runtimeCheck(typeof session?.user?.id === "string", "AUTH_SESSION_MISSING");
  return { cookie, userId: session.user.id as string };
}

export async function prepareRuntimeScenarios(fixture: CompletionRuntimeFixture) {
  const { createAuthUserService } = await import("../../features/auth/auth-user-service");
  const { createStorageAuthUserProvider } = await import("../../features/auth/storage/auth-user-live-record-provider");
  const { createStorageAuthAccountProvisioningProvider } = await import("../../features/auth/storage/auth-account-provisioning-provider");
  const auth = createAuthUserService({ provider: createStorageAuthUserProvider({ store: fixture.records.store, workspaceId: WORKSPACE_ID }), accountProvisioner: createStorageAuthAccountProvisioningProvider({ store: fixture.records.store, workspaceId: WORKSPACE_ID }) });
  const owner = { email: "owner@example.test", password: randomBytes(24).toString("base64url"), id: "", cookie: "" };
  const foreign = { email: "foreign@example.test", password: randomBytes(24).toString("base64url"), id: "", cookie: "" };
  for (const actor of [owner, foreign]) {
    const result = await auth.registerUser({ email: actor.email, password: actor.password, displayName: actor === owner ? "Runtime Owner" : "Runtime Foreign" });
    runtimeCheck(result.state === "success", "ACCOUNT_SETUP_FAILED"); actor.id = result.data.user.id;
  }
  const { createPasswordResetStore } = await import("../../features/auth/password-reset-store");
  const { createPasswordResetService, deliverPasswordResetMail } = await import("../../features/auth/password-reset-service");
  const { handlePasswordResetRequest } = await import("../../features/auth/password-reset-http");
  const { resolveAuthenticatedApiActorFromSession } = await import("../../app/api/_shared/authenticated-actor");
  const v2 = await import("../../app/api/contact-drafts/business-card/batches/v2/handlers");
  const { createBusinessCardIngestRepository } = await import("../../features/acquisition/business-card-ingest-v2/repository");
  const { createFilesystemDerivativeStore } = await import("../../features/acquisition/business-card-ingest-v2/derivative-store");
  const { createIngestV2Worker } = await import("../../features/acquisition/business-card-ingest-v2/worker");
  const { createBusinessCardBatchService } = await import("../../features/acquisition/business-card-batch-service");
  const { createBusinessCardBatchImageStore } = await import("../../features/acquisition/storage/business-card-batch-image-store");
  const { createBusinessCardBatchWorker } = await import("../../features/acquisition/business-card-batch-worker");
  const { createBusinessCardBatchCollectionHandlers } = await import("../../app/api/contact-drafts/business-card/batches/handler");
  const { createBusinessCardBatchDetailHandler } = await import("../../app/api/contact-drafts/business-card/batches/[id]/handler");
  const { createBusinessCardBatchFinishHandler } = await import("../../app/api/contact-drafts/business-card/batches/[id]/finish/handler");
  const { createBusinessCardBatchItemActionHandler } = await import("../../app/api/contact-drafts/business-card/batches/[id]/items/[itemId]/actions-shared");
  const { createBusinessCardBatchItemConfirmHandler } = await import("../../app/api/contact-drafts/business-card/batches/[id]/items/[itemId]/confirm/handler");
  const { createBusinessCardBatchItemImageHandler } = await import("../../app/api/contact-drafts/business-card/batches/[id]/items/[itemId]/image/handler");
  const resetStore = createPasswordResetStore(fixture.records.client, WORKSPACE_ID);
  const secret = process.env.AUTH_SECRET!;
  const resetService = createPasswordResetService(resetStore, secret);
  const delivery = new Map<string, string>();
  const mailer = { async send(email: string, url: string) { delivery.set(email, new URLSearchParams(new URL(url).hash.slice(1)).get("token")!); } };
  const provider = deterministicRuntimeOcr();
  const store = createFilesystemDerivativeStore({ rootDir: join(fixture.temp, "derivatives") });
  const repository = createBusinessCardIngestRepository({ pool: fixture.pool, workspaceId: WORKSPACE_ID });
  const runtime = { repository, store, workspaceId: WORKSPACE_ID, ready: Promise.resolve() };
  const notifications: string[] = [];
  const worker = createIngestV2Worker({ repository, store, provider, notify: async ({ batchId }) => { notifications.push(batchId); } });
  const imageStore = createBusinessCardBatchImageStore({ rootDir: join(fixture.temp, "legacy-images") });
  const legacy = createBusinessCardBatchService({ store: fixture.records.store, workspaceId: WORKSPACE_ID, imageStore });
  const legacyWorker = createBusinessCardBatchWorker({ service: legacy, imageStore, provider, notify: async ({ batchId }) => { notifications.push(batchId); } });
  let origin = "";
  const http = await startCompletionHttp(fixture, async (request, route) => {
    if (route.operation === "password") {
      return handlePasswordResetRequest(request, route.params[0] === "request" ? "request" : "reset", () => ({ secret, apiKey: undefined, from: undefined, smtp: null, origin, store: resetStore, service: resetService, mailer }), async () => { await deliverPasswordResetMail({ store: resetStore, secret, origin, mailer }); });
    }
    const resolveActor = async () => {
      const session = await runtimeJson(fixture.origin, "/api/auth/session", request.headers.get("cookie") ?? "");
      if (!session?.user?.id) return null;
      return resolveAuthenticatedApiActorFromSession({ userId: session.user.id, email: session.user.email, name: session.user.name });
    };
    const deps = { runtime, resolveActor, isOcrProviderConfigured: () => provider.providerName === "completion-runtime-injected" };
    const params = { id: route.params[0], itemId: route.params[1] };
    const context = { params: Promise.resolve(params) };
    switch (route.operation) {
      case "collection": { const handlers = v2.createIngestV2CollectionHandlers(deps); return request.method === "GET" ? handlers.GET() : handlers.POST(request); }
      case "detail": return v2.createIngestV2BatchDetailHandler(deps)(request, context);
      case "upload": return v2.createIngestV2UploadHandler(deps)(request, context);
      case "image": return v2.createIngestV2ImageHandler(deps)(request, context);
      case "batch-action": return (route.params[1] === "finalize" ? v2.createIngestV2FinalizeHandler : v2.createIngestV2CancelHandler)(deps)(request, context);
      case "item-action": {
        const handlers = { replace: v2.createIngestV2ReplaceHandler, exclude: v2.createIngestV2ExcludeHandler, confirm: v2.createIngestV2ConfirmHandler, "manual-entry": v2.createIngestV2ManualEntryHandler, skip: v2.createIngestV2SkipHandler, retry: v2.createIngestV2RetryHandler };
        return handlers[route.params[2] as keyof typeof handlers](deps)(request, context);
      }
      case "legacy-collection": { const handlers = createBusinessCardBatchCollectionHandlers(resolveActor, legacy); return request.method === "GET" ? handlers.GET() : handlers.POST(request); }
      case "legacy-detail": return createBusinessCardBatchDetailHandler(resolveActor, legacy)(request, context);
      case "legacy-finish": return createBusinessCardBatchFinishHandler(resolveActor, legacy)(request, context);
      case "legacy-image": return createBusinessCardBatchItemImageHandler(resolveActor, legacy, imageStore)(request, context);
      case "legacy-item-action": return route.params[2] === "confirm" ? createBusinessCardBatchItemConfirmHandler(resolveActor, legacy)(request, context) : createBusinessCardBatchItemActionHandler(route.params[2] as "skip" | "retry", resolveActor, legacy)(request, context);
      default: throw new Error("ROUTE_REJECTED");
    }
  });
  origin = http.origin;
  for (const actor of [owner, foreign]) {
    const login = await credentialsRuntimeLogin(origin, actor.email, actor.password);
    runtimeCheck(login.userId === actor.id, "AUTH_OWNER_MISMATCH"); actor.cookie = login.cookie;
  }
  const image = await sharp({ create: { width: 320, height: 180, channels: 3, background: { r: 240, g: 245, b: 250 } } }).png().toBuffer();
  const replacement = await sharp({ create: { width: 340, height: 190, channels: 3, background: { r: 200, g: 235, b: 225 } } }).png().toBuffer();
  return { fixture, origin, owner, foreign, auth, delivery, resetStore, resetService, secret, mailer, repository, store, worker, legacy, imageStore, legacyWorker, image, replacement, notifications };
}
export type RuntimeScenarios = Awaited<ReturnType<typeof prepareRuntimeScenarios>>;

export async function diagnoseRuntimeAuth(state: RuntimeScenarios) {
  const { owner, foreign, origin, fixture } = state;
  const mobile = await runtimeJson(origin, "/api/auth/mobile/credentials", "", "POST", { email: owner.email, password: owner.password });
  runtimeCheck(typeof mobile.data?.cookieHeader === "string" && mobile.data.user.id === owner.id, "MOBILE_CREDENTIALS_FAILED");
  const oldMobile = mobile.data.cookieHeader;
  const mobileSession = await runtimeJson(origin, "/api/auth/session", oldMobile);
  runtimeCheck(mobileSession.user?.id === owner.id, "MOBILE_SESSION_FAILED");
  await runtimeJson(origin, "/api/auth/password-reset/request", "", "POST", { email: "unknown@example.test" }, 202);
  runtimeCheck(state.delivery.size === 0, "UNKNOWN_MAIL_DELIVERED");
  await runtimeJson(origin, "/api/auth/password-reset/request", "", "POST", { email: foreign.email }, 202);
  const expiredToken = state.delivery.get(foreign.email)!;
  runtimeCheck(typeof expiredToken === "string", "RESET_CAPTURE_MISSING");
  // Named, ID-specific expired-token fault in the owned schema, not a fake clock.
  await fixture.pool.query("update orbit_records set payload=jsonb_set(payload,'{passwordReset,expiresAt}',to_jsonb((statement_timestamp()-interval '1 second')::text)) where workspace_id=$1 and collection_name='auth_users' and record_id=$2", [WORKSPACE_ID, `auth_user:${foreign.email}`]);
  const password = randomBytes(24).toString("base64url");
  await runtimeJson(origin, "/api/auth/password-reset/confirm", "", "POST", { token: expiredToken, password }, 400);
  await runtimeJson(origin, "/api/auth/password-reset/confirm", "", "POST", { token: randomBytes(32).toString("base64url"), password }, 400);
  await runtimeJson(origin, "/api/auth/password-reset/request", "", "POST", { email: owner.email }, 202);
  const token = state.delivery.get(owner.email)!;
  runtimeCheck(typeof token === "string", "RESET_CAPTURE_MISSING");
  await runtimeJson(origin, "/api/auth/password-reset/confirm", "", "POST", { token, password });
  await runtimeJson(origin, "/api/auth/password-reset/confirm", "", "POST", { token, password }, 400);
  const revoked = await runtimeJson(origin, "/api/auth/session", owner.cookie);
  const mobileRevoked = await runtimeJson(origin, "/api/auth/session", oldMobile);
  runtimeCheck(!revoked?.user && !mobileRevoked?.user, "OLD_SESSION_NOT_REVOKED");
  const oldCredentials = await state.auth.verifyCredentials({ email: owner.email, password: owner.password });
  runtimeCheck(oldCredentials.state !== "success", "OLD_PASSWORD_ACCEPTED");
  owner.password = password;
  owner.cookie = (await credentialsRuntimeLogin(origin, owner.email, password)).cookie;
  const row = await fixture.pool.query("select payload ? 'passwordReset' reset, payload ? 'passwordChangedAt' changed from orbit_records where workspace_id=$1 and collection_name='auth_users' and record_id=$2", [WORKSPACE_ID, `auth_user:${owner.email}`]);
  runtimeCheck(row.rowCount === 1 && row.rows[0].reset === false && row.rows[0].changed === true, "RESET_DB_FAILED");
  state.delivery.clear();
  return { case: "web-auth-recovery", assertions: 12, boundary: "real-next-authjs-credentials-session-and-mobile-credentials; injected-captured-mail", actorId: owner.id };
}

export async function prepareRuntimeEvent(state: RuntimeScenarios, eventId: string, deadlineMs = 20000) {
  const { buildEventCoreBackfillPlan, applyEventCoreBackfillPlan } = await import("../../features/events/core/backfill");
  const { createPostgresEventOperationsRepository } = await import("../../features/events/event-operations/storage/postgres-repository");
  const now = Date.now(); const at = (ms: number) => new Date(now + ms).toISOString();
  const plan = buildEventCoreBackfillPlan([{ eventId, title: "Runtime controlled event", description: "Owned synthetic verification", venue: "Local fixture", timezone: "Asia/Tokyo", startsAt: at(3600000), endsAt: at(7200000), organizerActorId: state.owner.id, lifecycleState: "published", source: "completion-runtime", sourcePayload: {} }], { schemaVersion: 1, migrationId: "completion-runtime-v1", resolutions: [] });
  await applyEventCoreBackfillPlan({ client: state.fixture.operations, workspaceId: WORKSPACE_ID, plan });
  const operations = createPostgresEventOperationsRepository({ client: state.fixture.operations, workspaceId: WORKSPACE_ID });
  await operations.saveConfiguration({ eventId, organizerActorId: state.owner.id, eventStartsAt: at(3600000), eventEndsAt: at(7200000), checkInOpensAt: at(3000000), profileEditDeadlineAt: at(deadlineMs), registrationCutoffAt: at(deadlineMs + 1000), resultsAvailableAt: at(1800000), roundOneStartsAt: at(3700000), roundTwoStartsAt: at(5500000), maxAttemptsPerTask: 3, recommendationCount: 4, shardSize: 6, tableSize: 6, updatedAt: at(0) });
  return { eventId, deadline: at(deadlineMs), operations };
}

export async function prepareRuntimeExperience(state: RuntimeScenarios) {
  const event = await prepareRuntimeEvent(state, "runtime-experience");
  const base = `/api/events/${event.eventId}/experience`;
  const { createPostgresEventAccessRepository } = await import("../../features/events/event-access/storage/postgres-repository");
  const access = await createPostgresEventAccessRepository({ client: state.fixture.operations, workspaceId: WORKSPACE_ID }).get({ eventId: event.eventId, subjectActorId: state.owner.id });
  runtimeCheck(access.owner === true, "EXPERIENCE_DB_ACCESS_FAILED");
  await runtimeJson(state.origin, base, state.owner.cookie, "GET", undefined, 404);
  const draft = await runtimeJson(state.origin, `${base}/draft`, state.owner.cookie, "PUT", { configuration: EXPERIENCE_CONFIGURATION, expectedRevision: null });
  runtimeCheck(draft.data.head.revision === 1 && draft.data.draft.version === 1, "EXPERIENCE_DRAFT_FAILED");
  await runtimeJson(state.origin, `${base}/preview`, state.owner.cookie, "POST", { configuration: { ...EXPERIENCE_CONFIGURATION, introduction: "Ephemeral preview" } });
  const preview = await runtimeJson(state.origin, base, state.owner.cookie);
  runtimeCheck(preview.data.head.revision === 1 && preview.data.draft.configuration.introduction === EXPERIENCE_CONFIGURATION.introduction, "EXPERIENCE_PREVIEW_PERSISTED");
  await runtimeJson(state.origin, `${base}/publish`, state.owner.cookie, "POST", { expectedRevision: 1 });
  await readRuntimeExperience(state, event.eventId, 2, "Web runtime introduction", event.deadline);
  return event;
}

export async function readRuntimeExperience(state: RuntimeScenarios, eventId: string, revision: number, introduction: string, deadline: string) {
  const read = await runtimeJson(state.origin, `/api/events/${eventId}/experience`, state.owner.cookie);
  runtimeCheck(read.data.head.revision === revision && read.data.published.configuration.introduction === introduction, "EXPERIENCE_HTTP_READBACK_FAILED");
  const rows = await state.fixture.pool.query("select h.revision, h.frozen_at, v.configuration from event_ops_experience_heads h join event_ops_experience_versions v on v.workspace_id=h.workspace_id and v.event_id=h.event_id and v.experience_version=h.published_version where h.workspace_id=$1 and h.event_id=$2", [WORKSPACE_ID, eventId]);
  runtimeCheck(rows.rowCount === 1 && Number(rows.rows[0].revision) === revision && rows.rows[0].configuration.introduction === introduction && rows.rows[0].frozen_at.toISOString() === deadline
    && rows.rows[0].configuration.questionSet.questions[0].prompt === EXPERIENCE_CONFIGURATION.questionSet.questions[0].prompt, "EXPERIENCE_DB_READBACK_FAILED");
}

export async function diagnoseRuntimeExperience(state: RuntimeScenarios) {
  const { eventId, deadline } = await prepareRuntimeExperience(state);
  const base = `/api/events/${eventId}/experience`;
  const call = (suffix: string, method = "GET", body?: unknown, expected = 200, cookie = state.owner.cookie) => runtimeJson(state.origin, base + suffix, cookie, method, body, expected);
  await call("/draft", "PUT", { configuration: EXPERIENCE_CONFIGURATION, expectedRevision: 1 }, 409);
  await call("", "GET", undefined, 403, state.foreign.cookie);
  await call("/draft", "PUT", { configuration: EXPERIENCE_CONFIGURATION, expectedRevision: 2 }, 403, state.foreign.cookie);
  await call("/publish", "POST", { expectedRevision: 2 }, 403, state.foreign.cookie);
  const delay = Date.parse(deadline) - Date.now() + 100;
  runtimeCheck(delay <= 21000, "FREEZE_WAIT_UNBOUNDED");
  if (delay > 0) await new Promise((done) => setTimeout(done, delay));
  const passage = await state.fixture.pool.query("select statement_timestamp() >= $1::timestamptz passed", [deadline]);
  runtimeCheck(passage.rows[0].passed === true, "FREEZE_DEADLINE_NOT_PASSED");
  const display = { ...EXPERIENCE_CONFIGURATION, introduction: "Web display after freeze" };
  const saved = await call("/draft", "PUT", { configuration: display, expectedRevision: 2 });
  runtimeCheck(saved.data.head.revision === 3, "EXPERIENCE_DISPLAY_DRAFT_FAILED");
  await call("/publish", "POST", { expectedRevision: 3 });
  const changed = structuredClone(display); changed.questionSet.questions = changed.questionSet.questions.map((q, i) => i === 0 ? { ...q, prompt: "Changed frozen question" } : q);
  await call("/draft", "PUT", { configuration: changed, expectedRevision: 4 }, 409);
  const rows = await state.fixture.pool.query("select h.revision, h.frozen_at, v.configuration from event_ops_experience_heads h join event_ops_experience_versions v on v.workspace_id=h.workspace_id and v.event_id=h.event_id and v.experience_version=h.published_version where h.workspace_id=$1 and h.event_id=$2", [WORKSPACE_ID, eventId]);
  runtimeCheck(rows.rowCount === 1 && Number(rows.rows[0].revision) === 4 && rows.rows[0].configuration.introduction === "Web display after freeze" && rows.rows[0].frozen_at.toISOString() === deadline, "EXPERIENCE_DB_FAILED");
  return { case: "web-experience", assertions: ["experience.canonical-owner-access", "experience.draft-preview-not-persisted", "experience.publish-revision", "experience.stale-rejected", "experience.foreign-read-write-denied", "experience.actual-deadline", "experience.frozen-display-publish", "experience.frozen-question-rejected", "experience.head-version-db"], boundary: "real-next-http-canonical-access-postgres-real-deadline", eventId, revision: 4 };
}

export async function createRuntimeCurrentBatch(state: RuntimeScenarios, key: string) {
  const base = "/api/contact-drafts/business-card/batches/v2";
  const digest = `sha256:${createHash("sha256").update(state.image).digest("hex")}`;
  const created = await runtimeJson(state.origin, base, state.owner.cookie, "POST", { idempotencyKey: key, manifest: [{ fileName: "runtime.png", mimeType: "image/png", rawSize: state.image.length, seq: 1, clientDigest: digest }] }, 201);
  const batchId = created.data.batch.id; const itemId = created.data.items[0].id;
  const uploaded = await runtimeFetch(state.origin, `${base}/${batchId}/items/${itemId}/content`, { method: "PUT", headers: { cookie: state.owner.cookie, "content-type": "image/png" }, body: new Uint8Array(state.image) });
  runtimeCheck(uploaded.status === 200, "CURRENT_UPLOAD_FAILED");
  return { batchId, itemId, digest, base: `${base}/${batchId}` };
}

export const RUNTIME_CARD_REVIEW = { displayName: "Runtime Card", organization: "Runtime Laboratory", role: "Engineer", email: "card@example.test", phone: "", notes: aggregateBusinessCardNotes(RUNTIME_EXTRACTION, { email: "card@example.test", phone: null }), relationshipContext: "Runtime HTTP card", allowDuplicate: false };

export async function prepareRuntimeTerminalBatch(state: RuntimeScenarios, key: string) {
  const batch = await createRuntimeCurrentBatch(state, key);
  await runtimeJson(state.origin, `${batch.base}/finalize`, state.owner.cookie, "POST");
  const claimed = await state.repository.claimItems({ limit: 1 });
  runtimeCheck(claimed.length === 1 && claimed[0].id === batch.itemId, "CURRENT_FAILURE_CLAIM_FAILED");
  const failed = await state.repository.submitFailure({ itemId: batch.itemId, leaseToken: claimed[0].leaseToken, expectedVersion: claimed[0].version, errorStage: "normalize", errorCode: "IMAGE_INVALID", retryDelayMs: 0 });
  runtimeCheck(failed.accepted, "CURRENT_FAILURE_SETUP_FAILED");
  const detail = await runtimeJson(state.origin, batch.base, state.owner.cookie);
  runtimeCheck(detail.data.items[0].status === "terminal_failed", "CURRENT_TERMINAL_READ_FAILED");
  return batch;
}

export async function diagnoseRuntimeCurrentEdges(state: RuntimeScenarios, contactId: string) {
  const duplicate = await createRuntimeCurrentBatch(state, "web-current-duplicate");
  await runtimeJson(state.origin, `${duplicate.base}/finalize`, state.owner.cookie, "POST");
  runtimeCheck((await state.worker.runOnce()).extracted === 1, "CURRENT_DUPLICATE_WORKER_FAILED");
  const duplicateReview = await runtimeJson(state.origin, `${duplicate.base}/items/${duplicate.itemId}/confirm`, state.owner.cookie, "POST", RUNTIME_CARD_REVIEW);
  runtimeCheck(duplicateReview.data.state === "duplicate_review" && duplicateReview.data.duplicateContactId === contactId, "CURRENT_DUPLICATE_CONSENT_MISSING");
  const beforeConsent = await state.repository.getBatch({ actorId: state.owner.id, batchId: duplicate.batchId });
  runtimeCheck(beforeConsent?.items[0].status === "extracted" && !beforeConsent.items[0].confirmedContactId, "CURRENT_DUPLICATE_WROTE_BEFORE_CONSENT");
  const consent = await runtimeJson(state.origin, `${duplicate.base}/items/${duplicate.itemId}/confirm`, state.owner.cookie, "POST", { ...RUNTIME_CARD_REVIEW, allowDuplicate: true });
  runtimeCheck(consent.data.state === "created" && consent.data.contactId !== contactId, "CURRENT_DUPLICATE_CONFIRM_FAILED");
  const duplicateRow = await state.fixture.records.store.getRecord({ workspaceId: WORKSPACE_ID, collectionName: "contacts", recordId: consent.data.contactId });
  runtimeCheck(duplicateRow?.userId === state.owner.id && duplicateRow.payload.notes === RUNTIME_CARD_REVIEW.notes, "CURRENT_DUPLICATE_CONTACT_DB_FAILED");

  const manual = await prepareRuntimeTerminalBatch(state, "web-current-manual");
  const entered = await runtimeJson(state.origin, `${manual.base}/items/${manual.itemId}/manual-entry`, state.owner.cookie, "POST", { ...RUNTIME_CARD_REVIEW, displayName: "Runtime Manual", email: "manual@example.test", allowDuplicate: true });
  runtimeCheck(entered.data.state === "created" && entered.data.item.status === "confirmed", "CURRENT_MANUAL_FAILED");
  const manualRow = await state.fixture.records.store.getRecord({ workspaceId: WORKSPACE_ID, collectionName: "contacts", recordId: entered.data.contactId });
  runtimeCheck(manualRow?.userId === state.owner.id && manualRow.payload.displayName === "Runtime Manual", "CURRENT_MANUAL_DB_FAILED");

  const retry = await prepareRuntimeTerminalBatch(state, "web-current-retry");
  const retried = await runtimeJson(state.origin, `${retry.base}/items/${retry.itemId}/retry`, state.owner.cookie, "POST");
  runtimeCheck(retried.data.item.status === "queued" && retried.data.item.attemptCount === 0, "CURRENT_RETRY_FAILED");
  const staleLease = (await state.repository.claimItems({ limit: 1 }))[0];
  runtimeCheck(staleLease?.id === retry.itemId, "CURRENT_LEASE_CLAIM_FAILED");
  // ID-specific lease-exhaustion fault; old worker output must not regain authority.
  await state.fixture.pool.query("update bc_ingest_items set attempt_count=3, lease_expires_at=statement_timestamp()-interval '1 second' where workspace_id=$1 and batch_id=$2 and id=$3", [WORKSPACE_ID, retry.batchId, retry.itemId]);
  const reaped = await state.repository.reapExhaustedLeases();
  runtimeCheck(reaped.reapedItemIds.includes(retry.itemId), "CURRENT_LEASE_REAP_FAILED");
  const late = await state.repository.submitFailure({ itemId: retry.itemId, leaseToken: staleLease.leaseToken, expectedVersion: staleLease.version, errorStage: "ocr", errorCode: "OCR_PROVIDER_FAILED", retryDelayMs: 0 });
  runtimeCheck(late.accepted === false, "CURRENT_STALE_LEASE_ACCEPTED");
  await runtimeJson(state.origin, `${retry.base}/items/${retry.itemId}/retry`, state.owner.cookie, "POST");
  runtimeCheck((await state.worker.runOnce()).extracted === 1, "CURRENT_RETRY_WORKER_FAILED");
  const skipped = await runtimeJson(state.origin, `${retry.base}/items/${retry.itemId}/skip`, state.owner.cookie, "POST");
  runtimeCheck(skipped.data.item.status === "skipped", "CURRENT_SKIP_FAILED");
  runtimeCheck((await state.repository.getBatch({ actorId: state.owner.id, batchId: retry.batchId }))?.items[0].status === "skipped", "CURRENT_SKIP_DB_FAILED");

  const excluded = await createRuntimeCurrentBatch(state, "web-current-excluded");
  const exclusion = await runtimeJson(state.origin, `${excluded.base}/items/${excluded.itemId}/exclude`, state.owner.cookie, "POST");
  runtimeCheck(exclusion.data.item.status === "excluded" && exclusion.data.item.derivativeObjectKey === null, "CURRENT_EXCLUDE_FAILED");
  await runtimeJson(state.origin, `${excluded.base}/cancel`, state.owner.cookie, "POST");
  runtimeCheck((await state.repository.getBatch({ actorId: state.owner.id, batchId: excluded.batchId }))?.batch.status === "cancelled", "CURRENT_CANCEL_DB_FAILED");

  const expired = await createRuntimeCurrentBatch(state, "web-current-expired");
  // ID-specific expiry fault. GET retains the terminal detail; mutation BATCH_GONE is 404.
  await state.fixture.pool.query("update bc_ingest_batches set expires_at=statement_timestamp()-interval '1 second' where workspace_id=$1 and id=$2", [WORKSPACE_ID, expired.batchId]);
  await runtimeJson(state.origin, `${expired.base}/finalize`, state.owner.cookie, "POST", undefined, 404);
  const expiry = await runtimeJson(state.origin, expired.base, state.owner.cookie);
  runtimeCheck(expiry.data.batch.status === "expired" && expiry.data.items[0].status === "excluded", "CURRENT_EXPIRY_FAILED");
  runtimeCheck((await state.repository.getBatch({ actorId: state.owner.id, batchId: expired.batchId }))?.batch.status === "expired", "CURRENT_EXPIRY_DB_FAILED");
  return ["current.duplicate-consent-db", "current.manual-entry-db", "current.retry-lease-reap-stale-rejection", "current.retry-process-skip-db", "current.exclude-cancel-db", "current.expiry-mutation-404-detail-db"];
}

export async function diagnoseRuntimeCurrent(state: RuntimeScenarios) {
  const { batchId, itemId, digest, base } = await createRuntimeCurrentBatch(state, "web-current-v1");
  const call = (suffix = "", method = "GET", body?: unknown, expected = 200, cookie = state.owner.cookie) => runtimeJson(state.origin, base + suffix, cookie, method, body, expected);
  const resume = await call();
  runtimeCheck(resume.data.items[0].clientDigest === digest && resume.data.items[0].status === "uploaded", "CURRENT_RESUME_FAILED");
  const bytes = await runtimeFetch(state.origin, `${base}/items/${itemId}/image`, { headers: { cookie: state.owner.cookie } });
  runtimeCheck(bytes.status === 200 && (await sharp(Buffer.from(await bytes.arrayBuffer())).metadata()).format === "jpeg", "CURRENT_DERIVATIVE_FAILED");
  await call("", "GET", undefined, 404, state.foreign.cookie);
  const version = resume.data.items[0].version;
  const replace = () => runtimeFetch(state.origin, `${base}/items/${itemId}/replace`, { method: "POST", headers: { cookie: state.owner.cookie, "content-type": "image/png", "if-match": String(version) }, body: new Uint8Array(state.replacement) });
  runtimeCheck((await replace()).status === 200, "CURRENT_REPLACE_FAILED");
  runtimeCheck((await replace()).status === 409, "CURRENT_REPLACE_CAS_FAILED");
  const replaced = await call();
  runtimeCheck(replaced.data.items[0].clientDigest === digest && replaced.data.items[0].imageDigest === `sha256:${createHash("sha256").update(state.replacement).digest("hex")}`, "CURRENT_REPLACEMENT_IDENTITIES_FAILED");
  await call("/finalize", "POST");
  const work = await state.worker.runOnce(); runtimeCheck(work.extracted === 1 && work.failed === 0, "CURRENT_WORKER_FAILED");
  const review = await call(); runtimeCheck(review.data.items[0].status === "extracted" && review.data.items[0].extraction.organization === "Runtime Laboratory", "CURRENT_REVIEW_FAILED");
  const confirmed = await call(`/items/${itemId}/confirm`, "POST", RUNTIME_CARD_REVIEW);
  runtimeCheck(confirmed.data.state === "created" && typeof confirmed.data.contactId === "string", "CURRENT_CONFIRM_FAILED");
  const row = await state.fixture.records.store.getRecord({ workspaceId: WORKSPACE_ID, collectionName: "contacts", recordId: confirmed.data.contactId });
  runtimeCheck(row?.userId === state.owner.id && row.payload.notes === RUNTIME_CARD_REVIEW.notes, "CURRENT_CONTACT_DB_FAILED");
  const edges = await diagnoseRuntimeCurrentEdges(state, confirmed.data.contactId);
  return { case: "web-current", assertions: ["current.upload-resume-manifest", "current.normalized-derivative", "current.foreign-populated-not-found", "current.replacement-cas-distinct-digests", "current.finalize-process-review", "current.confirm-contact-db", ...edges], boundary: "actual-http-bytes-pg-sharp-filesystem; injected-deterministic-ocr-and-notification", batchId, itemId, contactId: confirmed.data.contactId };
}

export async function createRuntimeLegacyBatch(state: RuntimeScenarios, two = false) {
  const form = new FormData(); form.append("files", new File([new Uint8Array(await sharp(state.image).jpeg().toBuffer())], "runtime.jpg", { type: "image/jpeg" }));
  if (two) form.append("files", new File([new Uint8Array(await sharp(state.replacement).jpeg().toBuffer())], "runtime-second.jpg", { type: "image/jpeg" }));
  const response = await runtimeFetch(state.origin, "/api/contact-drafts/business-card/batches", { method: "POST", headers: { cookie: state.owner.cookie }, body: form });
  runtimeCheck(response.status === 200, "LEGACY_CREATE_FAILED");
  const created = await response.json();
  runtimeCheck(created.success === true && created.data.rejectedFiles.length === 0 && created.data.acceptedFiles[0].itemCount === 1, "LEGACY_UPLOAD_FAILED");
  const batchId = created.data.batch.id;
  const detail = await runtimeJson(state.origin, `/api/contact-drafts/business-card/batches/${batchId}`, state.owner.cookie);
  runtimeCheck(detail.data.items.length === (two ? 2 : 1), "LEGACY_MANIFEST_FAILED");
  return { batchId: batchId as string, itemId: detail.data.items[0].id as string, otherItemId: two ? detail.data.items[1].id as string : undefined };
}

export async function prepareRuntimeLegacyFailure(state: RuntimeScenarios) {
  const retry = await createRuntimeLegacyBatch(state);
  const { BUSINESS_CARD_BATCH_ITEM_MAX_ATTEMPTS } = await import("../../features/acquisition/business-card-batch-contract");
  runtimeCheck(BUSINESS_CARD_BATCH_ITEM_MAX_ATTEMPTS <= 5, "LEGACY_ATTEMPT_BOUND_EXCEEDED");
  for (let attempt = 0; attempt < BUSINESS_CARD_BATCH_ITEM_MAX_ATTEMPTS; attempt++) {
    const claimed = await state.legacy.claimPendingItems({ workerId: "runtime-fault", now: new Date().toISOString(), limit: 1 });
    runtimeCheck(claimed.length === 1 && claimed[0].id === retry.itemId, "LEGACY_FAILURE_CLAIM_FAILED");
    await state.legacy.failItem({ batchId: retry.batchId, itemId: retry.itemId, workerId: "runtime-fault", now: new Date().toISOString(), errorCode: "OCR_PROVIDER_FAILED" });
  }
  runtimeCheck((await state.legacy.getBatch(state.owner.id, retry.batchId))?.items[0].status === "failed", "LEGACY_FAILURE_SETUP_FAILED");
  return retry;
}

export async function diagnoseRuntimeLegacy(state: RuntimeScenarios) {
  const { batchId, itemId } = await createRuntimeLegacyBatch(state);
  const result = await state.legacyWorker.runOnce({ workerId: "completion-runtime", now: new Date().toISOString() });
  runtimeCheck(result.completed === 1 && result.failed === 0, "LEGACY_WORKER_FAILED");
  const detail = await runtimeJson(state.origin, `/api/contact-drafts/business-card/batches/${batchId}`, state.owner.cookie);
  runtimeCheck(detail.data.items.length === 1 && detail.data.items[0].extraction.fullName === "Runtime Card", "LEGACY_DETAIL_FAILED");
  await runtimeJson(state.origin, `/api/contact-drafts/business-card/batches/${batchId}`, state.foreign.cookie, "GET", undefined, 404);
  const stored = await state.legacy.getBatch(state.owner.id, batchId);
  runtimeCheck(stored?.items[0].extraction?.organization === "Runtime Laboratory", "LEGACY_DB_FAILED");
  const base = `/api/contact-drafts/business-card/batches/${batchId}`;
  const image = await runtimeFetch(state.origin, `${base}/items/${itemId}/image`, { headers: { cookie: state.owner.cookie } });
  runtimeCheck(image.status === 200 && (await sharp(Buffer.from(await image.arrayBuffer())).metadata()).format === "jpeg", "LEGACY_IMAGE_FAILED");
  const confirmed = await runtimeJson(state.origin, `${base}/items/${itemId}/confirm`, state.owner.cookie, "POST", RUNTIME_CARD_REVIEW);
  runtimeCheck(confirmed.data.state === "created", "LEGACY_CONFIRM_FAILED");
  const contact = await state.fixture.records.store.getRecord({ workspaceId: WORKSPACE_ID, collectionName: "contacts", recordId: confirmed.data.contactId });
  runtimeCheck(contact?.userId === state.owner.id && contact.payload.notes === RUNTIME_CARD_REVIEW.notes, "LEGACY_CONTACT_DB_FAILED");
  await runtimeJson(state.origin, `${base}/finish`, state.owner.cookie, "POST");
  runtimeCheck((await state.legacy.getBatch(state.owner.id, batchId))?.batch.status === "completed", "LEGACY_FINISH_DB_FAILED");

  const second = await createRuntimeLegacyBatch(state, true);
  runtimeCheck((await state.legacyWorker.runOnce({ workerId: "completion-runtime", now: new Date().toISOString() })).completed === 2, "LEGACY_SECOND_WORKER_FAILED");
  const secondBase = `/api/contact-drafts/business-card/batches/${second.batchId}`;
  const duplicate = await runtimeJson(state.origin, `${secondBase}/items/${second.itemId}/confirm`, state.owner.cookie, "POST", RUNTIME_CARD_REVIEW);
  runtimeCheck(duplicate.data.state === "duplicate_review" && duplicate.data.duplicateContactId === confirmed.data.contactId, "LEGACY_DUPLICATE_CONSENT_FAILED");
  runtimeCheck((await state.legacy.getBatch(state.owner.id, second.batchId))?.items[0].status === "extracted", "LEGACY_DUPLICATE_PRECONSENT_WRITE");
  await runtimeJson(state.origin, `${secondBase}/items/${second.itemId}/confirm`, state.owner.cookie, "POST", { ...RUNTIME_CARD_REVIEW, allowDuplicate: true });
  await runtimeJson(state.origin, `${secondBase}/items/${second.otherItemId}/skip`, state.owner.cookie, "POST");
  await runtimeJson(state.origin, `${secondBase}/finish`, state.owner.cookie, "POST");
  const secondDb = await state.legacy.getBatch(state.owner.id, second.batchId);
  runtimeCheck(secondDb?.batch.status === "completed" && secondDb.items[0].status === "confirmed" && secondDb.items[1].status === "skipped" && secondDb.items.every((item) => item.imagePath === null), "LEGACY_REVIEW_DB_FAILED");

  const retry = await prepareRuntimeLegacyFailure(state);
  const retryBase = `/api/contact-drafts/business-card/batches/${retry.batchId}`;
  await runtimeJson(state.origin, `${retryBase}/items/${retry.itemId}/retry`, state.owner.cookie, "POST");
  runtimeCheck((await state.legacyWorker.runOnce({ workerId: "completion-runtime", now: new Date().toISOString() })).completed === 1, "LEGACY_RETRY_WORKER_FAILED");
  await runtimeJson(state.origin, `${retryBase}/items/${retry.itemId}/skip`, state.owner.cookie, "POST");
  await runtimeJson(state.origin, `${retryBase}/finish`, state.owner.cookie, "POST");
  runtimeCheck((await state.legacy.getBatch(state.owner.id, retry.batchId))?.items[0].status === "skipped", "LEGACY_RETRY_DB_FAILED");
  return { case: "web-legacy", assertions: ["legacy.multipart-normalized-image", "legacy.process-review-db", "legacy.foreign-populated-not-found", "legacy.confirm-contact-finish-db", "legacy.duplicate-consent-skip-finish-db", "legacy.failure-retry-process-skip-db"], boundary: "actual-multipart-http-pg-normalized-files; injected-deterministic-ocr-and-notification", batchId, itemId, contactId: confirmed.data.contactId };
}

export async function prepareRuntimeContacts(state: RuntimeScenarios) {
  const { createLiveBusinessCardContactWriteService } = await import("../../features/contacts/live-contact-write-service");
  const { createStorageBusinessCardContactWriteProvider } = await import("../../features/contacts/storage/contact-write-live-record-provider");
  const service = createLiveBusinessCardContactWriteService({ provider: createStorageBusinessCardContactWriteProvider({ store: state.fixture.records.store, workspaceId: WORKSPACE_ID }) });
  const created = await service.confirmBusinessCardContact({ actorId: state.owner.id, actorLabel: "Runtime Owner", confirmed: true, draftId: "runtime-contact", displayName: "Runtime Contact", organization: "Runtime Laboratory", role: "Engineer", email: "contact@example.test", phone: "", relationshipContext: "Owned runtime contact", evidenceIds: ["runtime-contact-evidence"], imageDigest: `sha256:${createHash("sha256").update(state.image).digest("hex")}` });
  runtimeCheck(created.success && created.data.state === "created", "CONTACT_SETUP_FAILED");
  const contactId = created.data.contactId;
  await runtimeJson(state.origin, `/api/contacts/${contactId}`, state.owner.cookie, "PATCH", { addTags: ["runtime-web"], note: "Web runtime note" });
  return { contactId };
}

export async function readRuntimeContacts(state: RuntimeScenarios, contactId: string, tag: string, note: string) {
  const read = await runtimeJson(state.origin, `/api/contacts/${contactId}`, state.owner.cookie);
  runtimeCheck(read.data.contact?.id === contactId && read.data.contact.tags.includes(tag)
    && read.data.contact.notes.some((item: { body: string }) => item.body === note), "CONTACT_HTTP_READBACK_FAILED");
  const { CONTACTS_LIVE_RECORD_COLLECTIONS } = await import("../../features/contacts/storage/contact-live-record-provider");
  const records = await state.fixture.records.store.listRecords({ workspaceId: WORKSPACE_ID, collectionName: CONTACTS_LIVE_RECORD_COLLECTIONS.detailStates, userId: state.owner.id, targetId: contactId });
  runtimeCheck(records.length === 1 && Array.isArray(records[0].payload.tags) && records[0].payload.tags.includes(tag)
    && Array.isArray(records[0].payload.notes) && records[0].payload.notes.some((item: any) => item.body === note), "CONTACT_DB_READBACK_FAILED");
}

export async function diagnoseRuntimeContacts(state: RuntimeScenarios) {
  const { contactId } = await prepareRuntimeContacts(state);
  await readRuntimeContacts(state, contactId, "runtime-web", "Web runtime note");
  await runtimeJson(state.origin, `/api/contacts/${contactId}`, state.foreign.cookie, "GET", undefined, 404);
  await runtimeJson(state.origin, `/api/contacts/${contactId}`, state.owner.cookie, "PATCH", { addTags: ["runtime-web-second"], note: "Second Web runtime note" });
  await readRuntimeContacts(state, contactId, "runtime-web-second", "Second Web runtime note");
  return { case: "web-contacts", boundary: "real-next-http-and-actor-owned-pg", contactId, assertions: ["contacts.web-write-refresh-db", "contacts.foreign-populated-not-found", "contacts.second-web-write-refresh-db"] };
}

export async function prepareRuntimeTask(state: RuntimeScenarios) {
  const { createConfiguredTaskService } = await import("../../features/tasks/service-factory");
  const created = await createConfiguredTaskService().create({ actorId: state.owner.id, title: "Runtime task", category: "work", idempotencyKey: "runtime-task-create", now: new Date().toISOString() });
  const taskId = created.task.id;
  const updated = await runtimeJson(state.origin, `/api/tasks/${taskId}`, state.owner.cookie, "PATCH", { action: "update", expectedUpdatedAt: created.task.updatedAt, idempotencyKey: "runtime-task-web-update", patch: { title: "Web runtime task", notes: "Web runtime task note" } });
  runtimeCheck(updated.data.task.title === "Web runtime task", "TASK_WEB_UPDATE_FAILED");
  return { taskId };
}

export async function readRuntimeTask(state: RuntimeScenarios, taskId: string, status: string) {
  const read = await runtimeJson(state.origin, `/api/tasks/${taskId}`, state.owner.cookie);
  runtimeCheck(read.data.task.id === taskId && read.data.task.title === "Web runtime task" && read.data.task.status === status, "TASK_HTTP_READBACK_FAILED");
  const { createTaskRepository } = await import("../../features/tasks/repository");
  const stored = await createTaskRepository({ store: state.fixture.records.store, workspaceId: WORKSPACE_ID }).get(state.owner.id, taskId);
  runtimeCheck(stored?.payload.task.status === status && stored.payload.task.title === "Web runtime task" && stored.payload.activities.some((item) => item.type === "updated"), "TASK_DB_READBACK_FAILED");
  if (status === "completed") runtimeCheck(stored.payload.activities.some((item) => item.type === "completed") && stored.payload.task.completedBy === state.owner.id, "TASK_COMPLETION_DB_FAILED");
}

export async function diagnoseRuntimeTasks(state: RuntimeScenarios) {
  const { taskId } = await prepareRuntimeTask(state);
  await readRuntimeTask(state, taskId, "open");
  await runtimeJson(state.origin, `/api/tasks/${taskId}`, state.foreign.cookie, "GET", undefined, 404);
  await runtimeJson(state.origin, `/api/tasks/${taskId}`, state.owner.cookie, "PATCH", { action: "complete", idempotencyKey: "runtime-task-web-complete" });
  await readRuntimeTask(state, taskId, "completed");
  await runtimeJson(state.origin, `/api/tasks/${taskId}`, state.owner.cookie, "PATCH", { action: "reopen", idempotencyKey: "runtime-task-web-reopen" });
  await readRuntimeTask(state, taskId, "open");
  return { case: "web-tasks", boundary: "real-next-http-and-actor-owned-pg-no-reminder-delivery", taskId, assertions: ["tasks.web-update-refresh-db", "tasks.foreign-populated-not-found", "tasks.complete-refresh-db", "tasks.reopen-refresh-db"] };
}

export async function prepareRuntimeConversation(state: RuntimeScenarios) {
  const sessionId = "runtime-conversation";
  const now = new Date().toISOString();
  const session = { id: sessionId, title: "Runtime history", customTitle: "Web runtime history", pinned: false, createdAt: now, updatedAt: now, panel: null, messages: [{ role: "user", text: "Runtime question" }, { role: "assistant", text: "Deterministic runtime answer" }] };
  const saved = await runtimeJson(state.origin, "/api/ai/conversations/sessions", state.owner.cookie, "POST", { session });
  runtimeCheck(saved.data.storage.persisted && saved.data.session.messages.length === 2, "CONVERSATION_WEB_WRITE_FAILED");
  return { sessionId, session };
}

export async function readRuntimeConversation(state: RuntimeScenarios, sessionId: string, title: string, count: number, pinned: boolean) {
  const base = "/api/ai/conversations/sessions";
  const detail = await runtimeJson(state.origin, `${base}/${sessionId}`, state.owner.cookie);
  const list = await runtimeJson(state.origin, base, state.owner.cookie);
  runtimeCheck(detail.data.session.id === sessionId && detail.data.session.customTitle === title && detail.data.session.messages.length === count && detail.data.session.pinned === pinned
    && list.data.sessions.some((item: any) => item.id === sessionId && item.customTitle === title), "CONVERSATION_HTTP_READBACK_FAILED");
  const { createStorageOrbitAgentChatSessionProvider, orbitAgentChatSessionActorWorkspaceId } = await import("../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider");
  const provider = createStorageOrbitAgentChatSessionProvider({ store: state.fixture.records.store, workspaceId: WORKSPACE_ID, actorId: state.owner.id });
  const stored = await provider.getSession(sessionId);
  runtimeCheck(stored?.messages.length === count && stored.customTitle === title && stored.pinned === pinned, "CONVERSATION_DB_READBACK_FAILED");
  const messages = await state.fixture.records.store.listRecords({ workspaceId: orbitAgentChatSessionActorWorkspaceId(WORKSPACE_ID, state.owner.id), collectionName: "orbit_agent_chat_messages", targetId: sessionId });
  runtimeCheck(messages.length === count && messages.some((row) => row.payload.text === "Deterministic runtime answer"), "CONVERSATION_MESSAGES_DB_FAILED");
}

export async function diagnoseRuntimeConversation(state: RuntimeScenarios) {
  const { sessionId, session } = await prepareRuntimeConversation(state);
  await readRuntimeConversation(state, sessionId, "Web runtime history", 2, false);
  await runtimeJson(state.origin, `/api/ai/conversations/sessions/${sessionId}`, state.foreign.cookie, "GET", undefined, 404);
  await runtimeJson(state.origin, "/api/ai/conversations/sessions", state.owner.cookie, "POST", { session: { ...session, customTitle: "Second Web runtime history", pinned: true, updatedAt: new Date().toISOString(), messages: [...session.messages, { role: "user", text: "Runtime continuation" }] } });
  await readRuntimeConversation(state, sessionId, "Second Web runtime history", 3, true);
  return { case: "web-conversation", boundary: "real-next-http-and-actor-scoped-pg-deterministic-messages-no-model", sessionId, assertions: ["conversation.web-persist-list-detail-db", "conversation.foreign-populated-not-found", "conversation.continuation-metadata-list-detail-db"] };
}

export async function prepareRuntimeRegistration(state: RuntimeScenarios) {
  const event = await prepareRuntimeEvent(state, "runtime-registration", 120000);
  await event.operations.activateCanonicalRegistrations(event.eventId, []);
  const base = `/api/events/${event.eventId}`;
  const registered = await runtimeJson(state.origin, `${base}/registration`, state.owner.cookie, "POST", { answers: { targetAttendees: "Web founders", valueOffered: "Web introductions" } });
  runtimeCheck(registered.data.status === "rsvped" && typeof registered.data.id === "string", "REGISTRATION_WEB_WRITE_FAILED");
  const configuration = await event.operations.getConfiguration(event.eventId);
  runtimeCheck(configuration, "OPERATIONS_CONFIGURATION_MISSING");
  await runtimeJson(state.origin, `${base}/operations/admin`, state.owner.cookie, "PUT", { ...configuration, recommendationCount: 5 });
  return { ...event, registrationId: registered.data.id as string };
}

export async function readRuntimeRegistration(state: RuntimeScenarios, eventId: string, registrationId: string, target: string, count: number, status = "rsvped") {
  const base = `/api/events/${eventId}`;
  const read = await runtimeJson(state.origin, `${base}/registration?questions=false`, state.owner.cookie);
  runtimeCheck(read.data.registration.id === registrationId && read.data.registration.status === status && read.data.registration.participantProfile.answers.targetAttendees === target
    && read.data.questionSet.provenance.aiProviderRequested === false, "REGISTRATION_HTTP_READBACK_FAILED");
  const admin = await runtimeJson(state.origin, `${base}/operations/admin`, state.owner.cookie);
  runtimeCheck(admin.data.configuration.recommendationCount === count, "OPERATIONS_HTTP_READBACK_FAILED");
  const rows = await state.fixture.pool.query("select h.status, h.membership_version, h.profile_version, p.profile_payload from event_ops_membership_heads h join event_ops_profile_versions p on p.workspace_id=h.workspace_id and p.event_id=h.event_id and p.participant_id=h.participant_id and p.profile_version=h.profile_version where h.workspace_id=$1 and h.event_id=$2 and h.actor_id=$3", [WORKSPACE_ID, eventId, state.owner.id]);
  runtimeCheck(rows.rowCount === 1 && rows.rows[0].status === status && rows.rows[0].profile_payload.registrationProfile.answers.targetAttendees === target && Number(rows.rows[0].profile_version) >= 1 && Number(rows.rows[0].membership_version) >= 1, "REGISTRATION_DB_READBACK_FAILED");
  const configurations = await state.fixture.pool.query("select h.configuration_version, c.recommendation_count from event_ops_configuration_heads h join event_ops_configurations c on c.workspace_id=h.workspace_id and c.event_id=h.event_id and c.configuration_version=h.configuration_version where h.workspace_id=$1 and h.event_id=$2", [WORKSPACE_ID, eventId]);
  runtimeCheck(configurations.rowCount === 1 && Number(configurations.rows[0].recommendation_count) === count && Number(configurations.rows[0].configuration_version) >= 2, "OPERATIONS_DB_READBACK_FAILED");
  return { membershipVersion: Number(rows.rows[0].membership_version), profileVersion: Number(rows.rows[0].profile_version), configurationVersion: Number(configurations.rows[0].configuration_version) };
}

export async function diagnoseRuntimeRegistration(state: RuntimeScenarios) {
  const { eventId, registrationId, operations } = await prepareRuntimeRegistration(state);
  const first = await readRuntimeRegistration(state, eventId, registrationId, "Web founders", 5);
  const base = `/api/events/${eventId}`;
  const foreign = await runtimeJson(state.origin, `${base}/registration?questions=false`, state.foreign.cookie);
  runtimeCheck(foreign.data.registration === null, "REGISTRATION_FOREIGN_LEAK");
  await runtimeJson(state.origin, `${base}/operations/admin`, state.foreign.cookie, "GET", undefined, 403);
  await runtimeJson(state.origin, `${base}/registration`, state.owner.cookie, "POST", { answers: { targetAttendees: "Second Web founders", valueOffered: "Second Web introductions" } });
  const config = await operations.getConfiguration(eventId);
  await runtimeJson(state.origin, `${base}/operations/admin`, state.owner.cookie, "PUT", { ...config, recommendationCount: 6 });
  const second = await readRuntimeRegistration(state, eventId, registrationId, "Second Web founders", 6);
  runtimeCheck(second.profileVersion === first.profileVersion + 1 && second.configurationVersion === first.configurationVersion + 1, "REGISTRATION_VERSIONS_NOT_ADVANCED");
  await runtimeJson(state.origin, `${base}/registration/cancel`, state.owner.cookie, "POST");
  const cancelled = await readRuntimeRegistration(state, eventId, registrationId, "Second Web founders", 6, "cancelled");
  runtimeCheck(cancelled.membershipVersion === second.membershipVersion + 1 && cancelled.profileVersion === second.profileVersion, "REGISTRATION_CANCEL_VERSIONS_FAILED");
  return { case: "web-registration-operations", boundary: "real-next-http-canonical-pg-no-model-no-generation", eventId, registrationId, assertions: ["registration.web-profile-refresh-db", "operations.web-config-refresh-db", "registration.foreign-isolation", "operations.foreign-denied", "registration.profile-version-advance", "operations.configuration-version-advance", "registration.cancel-membership-version"] };
}

export async function readRuntimeCurrentState(state: RuntimeScenarios, batchId: string, itemId: string, status: string) {
  const read = await runtimeJson(state.origin, `/api/contact-drafts/business-card/batches/v2/${batchId}`, state.owner.cookie);
  const item = read.data.items.find((entry: any) => entry.id === itemId);
  const stored = await state.repository.getBatch({ actorId: state.owner.id, batchId });
  const dbItem = stored?.items.find((entry) => entry.id === itemId);
  runtimeCheck(item?.status === status && dbItem?.status === status && dbItem.version === item.version && stored?.batch.id === batchId, "CURRENT_DIRECTIONAL_DB_FAILED");
  return item as { id: string; version: number; clientDigest: string; imageDigest: string; confirmedContactId: string | null };
}

export async function readRuntimeBatchContact(state: RuntimeScenarios, contactId: string, name = "Runtime Card", notes = RUNTIME_CARD_REVIEW.notes) {
  const read = await runtimeJson(state.origin, `/api/contacts/${contactId}`, state.owner.cookie);
  runtimeCheck(read.data.contact?.displayName === name, "BATCH_CONTACT_HTTP_READBACK_FAILED");
  const row = await state.fixture.records.store.getRecord({ workspaceId: WORKSPACE_ID, collectionName: "contacts", recordId: contactId });
  runtimeCheck(row?.userId === state.owner.id && row.payload.displayName === name && row.payload.notes === notes, "BATCH_CONTACT_DIRECTIONAL_DB_FAILED");
}

export async function runIntegratedRuntime(state: RuntimeScenarios) {
  let child = await startRuntimeAppConsumer(state.fixture);
  const results: Array<{ phase: RuntimePhase; observations: Record<string, string | number> }> = [];
  let request = 0;
  const invoke = async (phase: RuntimePhase, input: Record<string, string | number>, expected: Record<string, string | number> = {}) => {
    const result = await sendRuntimePhase(child, { version: 1, requestId: `runtime-${++request}`, phase, input });
    for (const [key, value] of Object.entries(expected)) runtimeCheck(result.observations[key] === value, "IPC_OBSERVATION_MISMATCH");
    results.push({ phase, observations: result.observations });
    console.info(JSON.stringify({ phase, pass: true, assertions: result.assertions, observations: result.observations }));
    return result.observations;
  };
  const open = () => invoke("auth.open", { origin: state.origin, email: state.owner.email, password: state.owner.password, foreignEmail: state.foreign.email, foreignPassword: state.foreign.password, actorId: state.owner.id }, { actorId: state.owner.id });
  const scalar = (result: Record<string, string | number>, key: string) => { runtimeCheck(typeof result[key] === "string", "IPC_ID_MISSING"); return result[key] as string; };
  console.info(JSON.stringify({ resource: "owned-app", pid: child.pid }));
  await open();
  await invoke("auth.request-reset", { email: state.owner.email }, { httpStatus: 202 });
  runtimeCheck(state.delivery.has(state.owner.email) && !state.delivery.has("unknown@example.test"), "APP_RESET_CAPTURE_FAILED");
  await runtimeJson(state.origin, "/api/auth/password-reset/request", "", "POST", { email: state.foreign.email }, 202);
  await state.fixture.pool.query("update orbit_records set payload=jsonb_set(payload,'{passwordReset,expiresAt}',to_jsonb((statement_timestamp()-interval '1 second')::text)) where workspace_id=$1 and collection_name='auth_users' and record_id=$2", [WORKSPACE_ID, `auth_user:${state.foreign.email}`]);
  let password = randomBytes(24).toString("base64url");
  await invoke("auth.reject-reset", { expiredToken: state.delivery.get(state.foreign.email)!, password }, { httpStatus: 400 });
  await invoke("auth.consume-reset", { token: state.delivery.get(state.owner.email)!, password }, { httpStatus: 200 });
  runtimeCheck(!(await runtimeJson(state.origin, "/api/auth/session", state.owner.cookie))?.user, "APP_RESET_WEB_SESSION_NOT_REVOKED");
  const consumed = await state.fixture.pool.query("select payload ? 'passwordReset' reset, payload ? 'passwordChangedAt' changed from orbit_records where workspace_id=$1 and collection_name='auth_users' and record_id=$2", [WORKSPACE_ID, `auth_user:${state.owner.email}`]);
  runtimeCheck(consumed.rowCount === 1 && consumed.rows[0].reset === false && consumed.rows[0].changed === true, "APP_RESET_DB_FAILED");
  await invoke("auth.verify-revocation", { password }, { actorId: state.owner.id });
  state.owner.password = password;
  state.owner.cookie = (await credentialsRuntimeLogin(state.origin, state.owner.email, password)).cookie;
  password = randomBytes(24).toString("base64url");
  await runtimeJson(state.origin, "/api/auth/password-reset/request", "", "POST", { email: state.owner.email }, 202);
  await runtimeJson(state.origin, "/api/auth/password-reset/confirm", "", "POST", { token: state.delivery.get(state.owner.email)!, password });
  await invoke("auth.after-web-reset", { password }, { actorId: state.owner.id });
  state.owner.password = password; password = ""; state.delivery.clear();
  state.owner.cookie = (await credentialsRuntimeLogin(state.origin, state.owner.email, state.owner.password)).cookie;

  const experience = await prepareRuntimeExperience(state);
  await invoke("experience.read-web", { eventId: experience.eventId, revision: 2 }, { revision: 2 });
  await invoke("experience.write-app", { eventId: experience.eventId, revision: 2 }, { revision: 4 });
  await readRuntimeExperience(state, experience.eventId, 4, "App runtime introduction", experience.deadline);
  const delay = Date.parse(experience.deadline) - Date.now() + 100;
  runtimeCheck(delay <= 21000, "FREEZE_WAIT_UNBOUNDED");
  if (delay > 0) await new Promise((done) => setTimeout(done, delay));
  runtimeCheck((await state.fixture.pool.query("select statement_timestamp() >= $1::timestamptz passed", [experience.deadline])).rows[0].passed, "FREEZE_DEADLINE_NOT_PASSED");
  await invoke("experience.frozen", { eventId: experience.eventId, revision: 4 }, { revision: 6 });
  await readRuntimeExperience(state, experience.eventId, 6, "App display after freeze", experience.deadline);

  const contact = await prepareRuntimeContacts(state);
  await readRuntimeContacts(state, contact.contactId, "runtime-web", "Web runtime note");
  await invoke("contacts.read-web", contact);
  await invoke("contacts.write-app", contact);
  await readRuntimeContacts(state, contact.contactId, "runtime-app", "App runtime note");
  const task = await prepareRuntimeTask(state);
  await readRuntimeTask(state, task.taskId, "open");
  await invoke("tasks.read-web", task, { status: "open" });
  await invoke("tasks.complete-app", task, { status: "completed" });
  await readRuntimeTask(state, task.taskId, "completed");
  await invoke("tasks.reopen-app", task, { status: "open" });
  await readRuntimeTask(state, task.taskId, "open");

  const registration = await prepareRuntimeRegistration(state);
  const registrationIds = { eventId: registration.eventId, registrationId: registration.registrationId };
  const first = await readRuntimeRegistration(state, registration.eventId, registration.registrationId, "Web founders", 5);
  await invoke("registration.read-web", registrationIds, { status: "rsvped" });
  await invoke("operations.read-web", { eventId: registration.eventId }, { recommendationCount: 5 });
  await invoke("registration.write-app", registrationIds, { status: "rsvped" });
  const changed = await readRuntimeRegistration(state, registration.eventId, registration.registrationId, "App founders", 5);
  runtimeCheck(changed.profileVersion === first.profileVersion + 1, "APP_REGISTRATION_VERSION_FAILED");
  await invoke("operations.write-app", { eventId: registration.eventId }, { recommendationCount: 6 });
  const configured = await readRuntimeRegistration(state, registration.eventId, registration.registrationId, "App founders", 6);
  runtimeCheck(configured.configurationVersion === first.configurationVersion + 1, "APP_OPERATIONS_VERSION_FAILED");
  await invoke("registration.cancel-app", registrationIds, { status: "cancelled" });
  const cancelled = await readRuntimeRegistration(state, registration.eventId, registration.registrationId, "App founders", 6, "cancelled");
  runtimeCheck(cancelled.membershipVersion === configured.membershipVersion + 1 && cancelled.profileVersion === configured.profileVersion, "APP_REGISTRATION_CANCEL_VERSION_FAILED");
  const conversation = await prepareRuntimeConversation(state);
  await readRuntimeConversation(state, conversation.sessionId, "Web runtime history", 2, false);
  await invoke("conversation.read-web", { sessionId: conversation.sessionId }, { messageCount: 2 });
  await invoke("conversation.write-app", { sessionId: conversation.sessionId }, { messageCount: 3 });
  await readRuntimeConversation(state, conversation.sessionId, "App runtime history", 3, true);

  const current = await createRuntimeCurrentBatch(state, "integrated-current-web");
  const uploaded = await readRuntimeCurrentState(state, current.batchId, current.itemId, "uploaded");
  await invoke("current.read-web", { batchId: current.batchId, itemId: current.itemId, revision: uploaded.version }, { revision: uploaded.version });
  await invoke("current.replace-web", { batchId: current.batchId, itemId: current.itemId, revision: uploaded.version, replacementBase64: state.replacement.toString("base64") }, { revision: uploaded.version + 1 });
  const replaced = await readRuntimeCurrentState(state, current.batchId, current.itemId, "uploaded");
  runtimeCheck(replaced.clientDigest === current.digest && replaced.imageDigest === `sha256:${createHash("sha256").update(state.replacement).digest("hex")}`, "APP_REPLACEMENT_IDENTITIES_FAILED");
  await runtimeJson(state.origin, `${current.base}/finalize`, state.owner.cookie, "POST");
  runtimeCheck((await state.worker.runOnce()).extracted === 1, "APP_CURRENT_WEB_PROCESS_FAILED");
  const confirmation = await invoke("current.confirm-web", { batchId: current.batchId, itemId: current.itemId }, { status: "confirmed" });
  const confirmed = await readRuntimeCurrentState(state, current.batchId, current.itemId, "confirmed");
  runtimeCheck(confirmed.confirmedContactId === confirmation.contactId, "APP_CURRENT_CONTACT_ID_FAILED");
  await readRuntimeBatchContact(state, scalar(confirmation, "contactId"));
  const appUpload = await invoke("current.upload-app", { imageBase64: state.image.toString("base64") });
  const appBatch = { batchId: scalar(appUpload, "batchId"), itemId: scalar(appUpload, "itemId") };
  const appUploaded = await readRuntimeCurrentState(state, appBatch.batchId, appBatch.itemId, "uploaded");
  runtimeCheck(appUploaded.clientDigest === current.digest && appUploaded.imageDigest === current.digest && appUpload.revision === appUploaded.version, "APP_UPLOAD_DIGEST_DB_FAILED");
  // Restart the actual App process; only fixture identities/bytes remain in Web memory.
  const previousPid = child.pid;
  await stopRuntimeChild(child); child = await startRuntimeAppConsumer(state.fixture);
  runtimeCheck(child.pid !== previousPid, "APP_RESTART_FAILED");
  console.info(JSON.stringify({ resource: "owned-app-restart", previousPid, pid: child.pid }));
  await open();
  await invoke("current.resume-app", { ...appBatch, revision: appUploaded.version, imageBase64: state.image.toString("base64") }, { revision: appUploaded.version });
  await readRuntimeCurrentState(state, appBatch.batchId, appBatch.itemId, "uploaded");
  await runtimeJson(state.origin, `/api/contact-drafts/business-card/batches/v2/${appBatch.batchId}/finalize`, state.owner.cookie, "POST");
  runtimeCheck((await state.worker.runOnce()).extracted === 1, "APP_CURRENT_PROCESS_FAILED");
  const review = await invoke("current.review-app", appBatch, { status: "confirmed" });
  const reviewed = await readRuntimeCurrentState(state, appBatch.batchId, appBatch.itemId, "confirmed");
  runtimeCheck(reviewed.confirmedContactId === review.contactId && review.contactId !== confirmation.contactId, "APP_DUPLICATE_CONFIRM_DB_FAILED");
  await readRuntimeBatchContact(state, scalar(review, "contactId"));
  const manual = await prepareRuntimeTerminalBatch(state, "integrated-current-manual");
  const entered = await invoke("current.manual-app", { batchId: manual.batchId, itemId: manual.itemId }, { status: "confirmed" });
  await readRuntimeCurrentState(state, manual.batchId, manual.itemId, "confirmed");
  await readRuntimeBatchContact(state, scalar(entered, "contactId"), "Runtime Manual", "Manual runtime note");
  const retry = await prepareRuntimeTerminalBatch(state, "integrated-current-retry");
  const retryIds = { batchId: retry.batchId, itemId: retry.itemId };
  await invoke("current.retry-app", retryIds, { status: "queued" });
  await readRuntimeCurrentState(state, retry.batchId, retry.itemId, "queued");
  const lease = (await state.repository.claimItems({ limit: 1 }))[0];
  runtimeCheck(lease?.id === retry.itemId, "APP_RETRY_LEASE_CLAIM_FAILED");
  await state.fixture.pool.query("update bc_ingest_items set attempt_count=3, lease_expires_at=statement_timestamp()-interval '1 second' where workspace_id=$1 and batch_id=$2 and id=$3", [WORKSPACE_ID, retry.batchId, retry.itemId]);
  runtimeCheck((await state.repository.reapExhaustedLeases()).reapedItemIds.includes(retry.itemId), "APP_LEASE_REAP_FAILED");
  runtimeCheck(!(await state.repository.submitFailure({ itemId: retry.itemId, leaseToken: lease.leaseToken, expectedVersion: lease.version, errorStage: "ocr", errorCode: "OCR_PROVIDER_FAILED", retryDelayMs: 0 })).accepted, "APP_STALE_LEASE_ACCEPTED");
  await invoke("current.retry-app", retryIds, { status: "queued" });
  runtimeCheck((await state.worker.runOnce()).extracted === 1, "APP_RETRY_PROCESS_FAILED");
  await invoke("current.skip-app", retryIds, { status: "skipped" });
  await readRuntimeCurrentState(state, retry.batchId, retry.itemId, "skipped");
  const cancel = await createRuntimeCurrentBatch(state, "integrated-current-cancel");
  await invoke("current.cancel-app", { batchId: cancel.batchId, itemId: cancel.itemId }, { status: "cancelled" });
  await readRuntimeCurrentState(state, cancel.batchId, cancel.itemId, "excluded");
  runtimeCheck((await state.repository.getBatch({ actorId: state.owner.id, batchId: cancel.batchId }))?.batch.status === "cancelled", "APP_CANCEL_DB_FAILED");
  const expired = await createRuntimeCurrentBatch(state, "integrated-current-expired");
  await state.fixture.pool.query("update bc_ingest_batches set expires_at=statement_timestamp()-interval '1 second' where workspace_id=$1 and id=$2", [WORKSPACE_ID, expired.batchId]);
  await invoke("current.expired-app", { batchId: expired.batchId }, { status: "expired", httpStatus: 404 });
  runtimeCheck((await state.repository.getBatch({ actorId: state.owner.id, batchId: expired.batchId }))?.batch.status === "expired", "APP_EXPIRY_DB_FAILED");

  const legacy = await createRuntimeLegacyBatch(state);
  runtimeCheck((await state.legacyWorker.runOnce({ workerId: "completion-runtime", now: new Date().toISOString() })).completed === 1, "APP_LEGACY_WEB_PROCESS_FAILED");
  await invoke("legacy.read-web", { batchId: legacy.batchId, itemId: legacy.itemId }, { status: "ready_for_review" });
  // The existing current-batch contact supplies the duplicate candidate.
  const legacyUploaded = await invoke("legacy.upload-app", { imageBase64: (await sharp(state.image).jpeg().toBuffer()).toString("base64"), replacementBase64: (await sharp(state.replacement).jpeg().toBuffer()).toString("base64") });
  const legacyIds = { batchId: scalar(legacyUploaded, "batchId"), itemId: scalar(legacyUploaded, "itemId"), otherItemId: scalar(legacyUploaded, "otherItemId") };
  const legacyPending = await runtimeJson(state.origin, `/api/contact-drafts/business-card/batches/${legacyIds.batchId}`, state.owner.cookie);
  runtimeCheck(legacyPending.data.items.length === 2 && legacyPending.data.items.every((item: any) => item.status === "pending"), "APP_LEGACY_UPLOAD_READ_FAILED");
  runtimeCheck((await state.legacyWorker.runOnce({ workerId: "completion-runtime", now: new Date().toISOString() })).completed === 2, "APP_LEGACY_PROCESS_FAILED");
  const legacyReview = await invoke("legacy.review-app", legacyIds, { status: "completed" });
  const legacyDb = await state.legacy.getBatch(state.owner.id, legacyIds.batchId);
  const legacyRead = await runtimeJson(state.origin, `/api/contact-drafts/business-card/batches/${legacyIds.batchId}`, state.owner.cookie);
  runtimeCheck(legacyRead.data.batch.status === "completed" && legacyDb?.batch.status === "completed" && legacyDb.items.some((item) => item.id === legacyIds.itemId && item.confirmedContactId === legacyReview.contactId)
    && legacyDb.items.some((item) => item.id === legacyIds.otherItemId && item.status === "skipped") && legacyDb.items.every((item) => item.imagePath === null), "APP_LEGACY_REVIEW_DB_FAILED");
  await readRuntimeBatchContact(state, scalar(legacyReview, "contactId"));
  await runtimeJson(state.origin, `/api/contact-drafts/business-card/batches/${legacy.batchId}/items/${legacy.itemId}/skip`, state.owner.cookie, "POST");
  await runtimeJson(state.origin, `/api/contact-drafts/business-card/batches/${legacy.batchId}/finish`, state.owner.cookie, "POST");
  const legacyRetry = await prepareRuntimeLegacyFailure(state);
  const legacyRetryIds = { batchId: legacyRetry.batchId, itemId: legacyRetry.itemId };
  await invoke("legacy.retry-app", legacyRetryIds, { status: "pending" });
  runtimeCheck((await state.legacy.getBatch(state.owner.id, legacyRetry.batchId))?.items[0].status === "pending", "APP_LEGACY_RETRY_DB_FAILED");
  runtimeCheck((await state.legacyWorker.runOnce({ workerId: "completion-runtime", now: new Date().toISOString() })).completed === 1, "APP_LEGACY_RETRY_PROCESS_FAILED");
  await invoke("legacy.skip-app", legacyRetryIds, { status: "completed" });
  const legacyFinished = await runtimeJson(state.origin, `/api/contact-drafts/business-card/batches/${legacyRetry.batchId}`, state.owner.cookie);
  runtimeCheck(legacyFinished.data.batch.status === "completed" && (await state.legacy.getBatch(state.owner.id, legacyRetry.batchId))?.items[0].status === "skipped", "APP_LEGACY_SKIP_DB_FAILED");
  await invoke("auth.close", {});
  await stopRuntimeChild(child);
  runtimeCheck(Object.keys(PHASE_OUTPUTS).every((phase) => results.some((result) => result.phase === phase)), "REQUIRED_APP_PHASE_MISSING");
  return { case: "integrated-runtime", boundary: "actual-app-process-network-and-web-next-injected-provider-pg", phases: results.length, results };
}

export async function runWebDiagnostics(state: RuntimeScenarios, name: string) {
  switch (name) {
    case "auth": return diagnoseRuntimeAuth(state);
    case "experience": return diagnoseRuntimeExperience(state);
    case "current": return diagnoseRuntimeCurrent(state);
    case "legacy": return diagnoseRuntimeLegacy(state);
    case "contacts": return diagnoseRuntimeContacts(state);
    case "tasks": return diagnoseRuntimeTasks(state);
    case "conversation": return diagnoseRuntimeConversation(state);
    case "registration": return diagnoseRuntimeRegistration(state);
    default: throw new Error("UNKNOWN_WEB_DIAGNOSTIC");
  }
}
