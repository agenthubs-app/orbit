// 2026-11-20 主办方活动图片：POST/DELETE /api/host/events/[id]/cover —— 类型 / 大小 / 权限校验、2:1 webp 处理、存储与写回。
import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { hostEventCoverResultSchema, hostEventViewSchema } from "../../shared/api-schema/host-events";
import type { HostEventView } from "../../shared/contract/host-events";
import { eventCoverCrop, EVENT_COVER_MAX_BYTES, parseEventCoverFocus, sniffEventCoverType, validateEventCoverUpload } from "../../features/events/host/cover-image";
import { createHostRoutes } from "../../features/events/host/handlers";
import { createHostLiveService } from "../../features/events/host/live";
import type { HostService } from "../../features/events/host/service";
import { DEMO_ACTOR_ID } from "../../shared/mock/demo-world/fixtures";
import { hostDatabaseTest, withHostDatabase } from "../support/host-harness";
import { lockedFixtureQuery } from "../support/sync-revision-fixture";

const actor = (id: string) => async () => ({ id }) as never;
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function upload(file: Blob | null, fields: Record<string, string> = {}, name = "cover.png"): Request {
  const form = new FormData();
  if (file) form.set("file", file, name);
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request("http://localhost/api/host/events/ev1/cover", { body: form, method: "POST" });
}

async function png(width: number, height: number): Promise<Blob> {
  const bytes = await sharp({ create: { background: { b: 40, g: 120, r: 200 }, channels: 3, height, width } }).png().toBuffer();
  return new Blob([new Uint8Array(bytes)], { type: "image/png" });
}

function fakeService(capabilities: string[] | null) {
  const writes: Array<string | null> = [];
  const view = { capabilities: capabilities ?? [] } as unknown as HostEventView;
  const service = {
    event: async () => (capabilities ? view : null),
    setCover: async (_actor: string, _event: string, coverUrl: string | null) => { writes.push(coverUrl); return { coverUrl }; },
  } as unknown as HostService;
  return { service, writes };
}

function routesWith(service: HostService, stored: Buffer[] = []) {
  return createHostRoutes({
    coverStore: () => ({ put: async ({ webp }) => { stored.push(webp); return "https://blob.test/orbit-event-covers/x.webp"; } }),
    liveService: async () => service,
    resolveActor: actor("actor:host"),
    resolveMode: () => "live",
  });
}

test("cover upload: an editor's PNG becomes a 2:1 webp (≤ 1600 wide), is stored and written back", async () => {
  const { service, writes } = fakeService(["event.center.read", "event.edit"]);
  const stored: Buffer[] = [];
  const res = await routesWith(service, stored).uploadCover(upload(await png(2400, 2400), { focusY: "0.2" }), params("ev1"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(hostEventCoverResultSchema.parse(body.data), { coverUrl: "https://blob.test/orbit-event-covers/x.webp" });
  assert.deepEqual(writes, ["https://blob.test/orbit-event-covers/x.webp"]);
  const meta = await sharp(stored[0]!).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ["webp", 1600, 800]);
});

test("cover upload: a small wide image is cropped to 2:1 without enlarging", async () => {
  const { service } = fakeService(["event.edit"]);
  const stored: Buffer[] = [];
  assert.equal((await routesWith(service, stored).uploadCover(upload(await png(900, 300)), params("ev1"))).status, 200);
  const meta = await sharp(stored[0]!).metadata();
  assert.deepEqual([meta.width, meta.height], [600, 300]);
});

test("cover upload: wrong type, missing file, bad focusY and oversize are 400 with a machine-readable reason; nothing is written", async () => {
  const { service, writes } = fakeService(["event.edit"]);
  const routes = routesWith(service);
  const reason = async (res: Response) => [res.status, (await res.json()).error?.context?.reason ?? null];
  assert.deepEqual(await reason(await routes.uploadCover(upload(new Blob(["GIF89a......"], { type: "image/gif" }), {}, "a.gif"), params("ev1"))), [400, "COVER_TYPE_UNSUPPORTED"]);
  assert.deepEqual(await reason(await routes.uploadCover(upload(new Blob(["%PDF-1.4"], { type: "image/png" })), params("ev1"))), [400, "COVER_TYPE_UNSUPPORTED"], "the declared type is not trusted");
  assert.deepEqual(await reason(await routes.uploadCover(upload(null), params("ev1"))), [400, "COVER_FILE_MISSING"]);
  assert.deepEqual(await reason(await routes.uploadCover(upload(await png(400, 200), { focusY: "1.5" }), params("ev1"))), [400, "COVER_FOCUS_INVALID"]);
  const big = new Uint8Array(EVENT_COVER_MAX_BYTES + 1);
  big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.deepEqual(await reason(await routes.uploadCover(upload(new Blob([big], { type: "image/png" })), params("ev1"))), [400, "COVER_TOO_LARGE"]);
  assert.deepEqual(writes, []);
});

test("cover permissions: no event.edit → 403, unknown / not mine → 404, sample account → 403; delete clears", async () => {
  const viewer = fakeService(["event.center.read"]);
  assert.equal((await routesWith(viewer.service).uploadCover(upload(await png(400, 200)), params("ev1"))).status, 403);
  assert.equal((await routesWith(viewer.service).deleteCover(new Request("http://localhost/x", { method: "DELETE" }), params("ev1"))).status, 403);
  const stranger = fakeService(null);
  assert.equal((await routesWith(stranger.service).uploadCover(upload(await png(400, 200)), params("ev1"))).status, 404);
  assert.deepEqual([...viewer.writes, ...stranger.writes], []);
  const sample = createHostRoutes({ liveService: async () => viewer.service, resolveActor: actor(DEMO_ACTOR_ID), resolveMode: () => "live" });
  assert.equal((await sample.uploadCover(upload(await png(400, 200)), params("ev1"))).status, 403);

  const editor = fakeService(["event.edit"]);
  const res = await routesWith(editor.service).deleteCover(new Request("http://localhost/x", { method: "DELETE" }), params("ev1"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).data, { coverUrl: null });
  assert.deepEqual(editor.writes, [null]);
});

test("cover storage unconfigured (production without a Blob token) is a 503 with a reason", async () => {
  const { service, writes } = fakeService(["event.edit"]);
  const routes = createHostRoutes({ coverStore: () => null, liveService: async () => service, resolveActor: actor("actor:host"), resolveMode: () => "live" });
  const res = await routes.uploadCover(upload(await png(400, 200)), params("ev1"));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.context.reason, "COVER_STORAGE_UNCONFIGURED");
  assert.deepEqual(writes, []);
});

test("cover helpers: sniffing, focus, crop box", () => {
  assert.equal(sniffEventCoverType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffEventCoverType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(sniffEventCoverType(new TextEncoder().encode("\0\0\0\x18ftypheic\0\0\0\0")), "image/heic");
  assert.equal(sniffEventCoverType(new TextEncoder().encode("GIF89a")), null);
  assert.throws(() => validateEventCoverUpload({ bytes: new Uint8Array([0xff, 0xd8, 0xff]), declaredType: "text/html" }), /JPG, PNG/u);
  assert.equal(parseEventCoverFocus(null), 0.5);
  assert.equal(parseEventCoverFocus("0"), 0);
  assert.throws(() => parseEventCoverFocus("abc"));
  assert.deepEqual(eventCoverCrop(1000, 1000, 0), { height: 500, left: 0, top: 0, width: 1000 });
  assert.deepEqual(eventCoverCrop(1000, 1000, 1), { height: 500, left: 0, top: 500, width: 1000 });
  assert.deepEqual(eventCoverCrop(3000, 1000, 0.5), { height: 1000, left: 500, top: 0, width: 2000 });
});

test("cover (Postgres): stored in source_payload.coverUrl with a new event version, shown on the host view, cleared with coverPath", hostDatabaseTest, async () => {
  await withHostDatabase(async ({ client, pool, workspaceId }) => {
    const HOST = "actor:host";
    await lockedFixtureQuery(pool, `insert into orbit_records (workspace_id, collection_name, record_id, source_type, source_id, payload, created_at, updated_at) values ($1, 'auth_users', 'auth_user:host@example.com', 'auth', $2, $3::jsonb, now(), now())`, [workspaceId, HOST, JSON.stringify({ displayName: "佐藤 健一", email: "host@example.com", id: HOST })]);
    const service = createHostLiveService({ client, operations: null, workspaceId });
    const profile = await service.createProfile(HOST, { displayName: "CFO Night 実行委員会", emoji: "🥂" });
    const start = new Date(Date.now() + 5 * 86_400_000);
    const created = await service.createEvent(HOST, { endsAt: new Date(start.getTime() + 7_200_000).toISOString(), feeKind: "free", organizerProfileId: profile.profileId, startsAt: start.toISOString(), title: "表紙テスト", venueName: "渋谷" });
    const eventId = created.event.eventId;
    assert.equal(created.event.coverUrl, null);
    await lockedFixtureQuery(pool, `update event_ops_events set source_payload = source_payload || '{"coverPath":"/orbit-covers/chip.jpg"}'::jsonb where workspace_id = $1 and event_id = $2`, [workspaceId, eventId]);
    assert.equal((await service.event(HOST, eventId))?.coverUrl, "/orbit-covers/chip.jpg", "the seeded coverPath reads as the cover");

    const saved = await service.setCover!(HOST, eventId, "https://blob.test/orbit-event-covers/a.webp");
    assert.deepEqual(saved, { coverUrl: "https://blob.test/orbit-event-covers/a.webp" });
    const view = await service.event(HOST, eventId);
    assert.ok(hostEventViewSchema.safeParse(view).success);
    assert.equal(view?.coverUrl, "https://blob.test/orbit-event-covers/a.webp");
    assert.equal(view?.version, created.event.version + 1);
    const versions = await pool.query<{ n: number; cover: string | null }>(`select count(*)::int as n, max(source_payload ->> 'coverUrl') as cover from event_event_versions where workspace_id = $1 and event_id = $2`, [workspaceId, eventId]);
    assert.deepEqual([versions.rows[0]?.n, versions.rows[0]?.cover], [2, "https://blob.test/orbit-event-covers/a.webp"]);
    // 改基本情報不会盖掉封面（source_payload 只替换 host 键）。
    const edited = await service.updateEvent(HOST, eventId, { description: "説明", expectedVersion: view!.version });
    assert.equal(edited.event.coverUrl, "https://blob.test/orbit-event-covers/a.webp");

    await assert.rejects(() => service.setCover!(HOST, eventId, "http://insecure.test/x.webp"), /COVER_URL_INVALID/u);
    await assert.rejects(() => service.setCover!("actor:stranger", eventId, null), (error: { code?: string }) => error.code === "NOT_FOUND");
    assert.deepEqual(await service.setCover!(HOST, eventId, null), { coverUrl: null });
    const payload = await pool.query<{ payload: Record<string, unknown> }>(`select source_payload as payload from event_ops_events where workspace_id = $1 and event_id = $2`, [workspaceId, eventId]);
    assert.equal("coverUrl" in payload.rows[0]!.payload, false);
    assert.equal("coverPath" in payload.rows[0]!.payload, false);
    assert.equal((await service.event(HOST, eventId))?.coverUrl, null);
  });
});
