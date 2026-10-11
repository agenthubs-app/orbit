import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  inviteAppLink,
  inviteDate,
  inviteDaysLeft,
  inviteDefaultKeys,
  inviteFieldsFromProfile,
  inviteKeysWithValues,
  inviteKeyValue,
  inviteLinkLabel,
  lineShareUrl,
  mailDraftUrl,
  orderedInviteKeys,
} from "../../app/(app)/app/orbit-2026/add/invite/invite-model";
import {
  INVITE_PROFILE_TAG_LIMIT,
  initialLandingView,
  inviteAuthHref,
  toggleTag,
  viewAfterProfile,
  viewForRedeemFailure,
  viewForRedeemResult,
} from "../../app/(app)/app/orbit-2026/invite-landing/landing-model";
import { inviteLandingMetadata } from "../../app/i/_landing/landing-metadata";
import { interpretInvitePreviewResponse } from "../../app/i/_landing/preview-response";
import { normalizeOrbitAuthReturnPath } from "../../features/auth/app-auth-routing";
import type { InviteCodePreview } from "../../shared/contract/invite-codes";

// R15 招待コード on the Web (DESIGN add-and-invite §2.4–§2.5, §6): the pure rules behind the sender
// dialog and /i/<code> — dates, days left, which switches exist and their defaults, the draft links,
// which page each preview / redeem answer leads to, and the page head (noindex, no-referrer, no name).

const preview = (patch: Partial<InviteCodePreview> = {}): InviteCodePreview => ({
  code: "H8MW-4QZT",
  expiresAt: "2026-10-14T09:00:00.000Z",
  shared: { displayName: "松井 遥", organization: "株式会社ソラノテ", role: "取締役COO", offering: ["PoC 先の紹介"], seeking: ["資金調達の相談相手"] },
  status: "active",
  ...patch,
});

test("dates are shown in Japan time in the page language; days left round up and stop at 0", () => {
  // 2026-10-13T20:00Z is already 10/14 in Tokyo.
  assert.equal(inviteDate("2026-10-13T20:00:00.000Z", "ja"), "10/14");
  assert.equal(inviteDate("2026-10-13T20:00:00.000Z", "zh"), "10月14日");
  assert.equal(inviteDate("2026-10-13T20:00:00.000Z", "en"), "Oct 14");
  assert.equal(inviteDate("not a date", "ja"), "");
  const now = Date.parse("2026-10-07T09:00:00.000Z");
  assert.equal(inviteDaysLeft("2026-10-14T09:00:00.000Z", now), 7);
  assert.equal(inviteDaysLeft("2026-10-14T08:00:00.000Z", now), 7);
  assert.equal(inviteDaysLeft("2026-10-07T10:00:00.000Z", now), 1);
  assert.equal(inviteDaysLeft("2026-10-06T00:00:00.000Z", now), 0);
});

test("switches: only what the profile has; 会社・役職 / 提供 / 求めている on, メール / 電話 off by default", () => {
  const full = inviteFieldsFromProfile({ displayName: " 高橋 美咲 ", organization: "青葉ベンチャーズ", role: "パートナー", offering: ["投資", " "], seeking: [], handles: { email: "m@aoba.example", phone: "" } });
  assert.deepEqual(full, { displayName: "高橋 美咲", organization: "青葉ベンチャーズ", role: "パートナー", offering: ["投資"], email: "m@aoba.example" });
  const available = inviteKeysWithValues(full);
  assert.deepEqual(available, ["organization", "offering", "email"]);
  assert.deepEqual(inviteDefaultKeys(available), ["organization", "offering"], "e-mail is never on by default");
  assert.deepEqual(inviteDefaultKeys(["organization", "offering", "seeking", "email", "phone"]), ["organization", "offering", "seeking"]);
  assert.deepEqual(inviteKeysWithValues(inviteFieldsFromProfile({ displayName: "名前だけ" })), []);
  assert.equal(inviteFieldsFromProfile(null), null);
  assert.deepEqual(orderedInviteKeys(["phone", "organization", "phone", "seeking"]), ["organization", "seeking", "phone"]);
  assert.equal(inviteKeyValue("organization", full, "ja"), "青葉ベンチャーズ · パートナー");
  assert.equal(inviteKeyValue("offering", { displayName: "x", offering: ["A", "B"] }, "ja"), "A、B");
  assert.equal(inviteKeyValue("offering", { displayName: "x", offering: ["A", "B"] }, "en"), "A, B");
  assert.equal(inviteKeyValue("phone", full, "ja"), "");
});

test("draft links open the person's own apps (nothing is sent by Orbit); the App link is orbit://i/<code>", () => {
  assert.equal(lineShareUrl("こんにちは\nhttps://x/i/A"), "https://line.me/R/share?text=%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF%0Ahttps%3A%2F%2Fx%2Fi%2FA");
  assert.equal(mailDraftUrl("Orbit への招待", "a&b"), "mailto:?subject=Orbit%20%E3%81%B8%E3%81%AE%E6%8B%9B%E5%BE%85&body=a%26b");
  assert.equal(inviteAppLink("H8MW-4QZT"), "orbit://i/H8MW-4QZT");
  assert.equal(inviteLinkLabel("https://orbitailink.com/i/H8MW-4QZT"), "orbitailink.com/i/H8MW-4QZT");
});

test("landing: own code > already connected > expired / full > signed out > signed in (profile check)", () => {
  assert.deepEqual(initialLandingView({ kind: "unavailable", limited: false }, true), { view: "unavailable", limited: false });
  assert.deepEqual(initialLandingView({ kind: "unavailable", limited: true }, false), { view: "unavailable", limited: true });
  assert.deepEqual(initialLandingView({ kind: "preview", preview: preview() }, false), { view: "open" });
  assert.deepEqual(initialLandingView({ kind: "preview", preview: preview() }, true), { view: "checking" });
  assert.deepEqual(initialLandingView({ kind: "preview", preview: preview({ status: "expired" }) }, false), { view: "expired" });
  assert.deepEqual(initialLandingView({ kind: "preview", preview: preview({ status: "full" }) }, true), { view: "full" });
  assert.deepEqual(initialLandingView({ kind: "preview", preview: preview({ status: "expired", isOwnCode: true }) }, true), { view: "own" });
  assert.deepEqual(initialLandingView({ kind: "preview", preview: preview({ status: "full", inviterAlreadyConnected: true }) }, true), { view: "already" });
  // Signed out, the flags are never sent; a stray one is ignored.
  assert.deepEqual(initialLandingView({ kind: "preview", preview: preview({ isOwnCode: true }) }, false), { view: "open" });
  assert.deepEqual(viewAfterProfile(""), { view: "profile" });
  assert.deepEqual(viewAfterProfile("  "), { view: "profile" });
  assert.deepEqual(viewAfterProfile(null), { view: "profile" });
  assert.deepEqual(viewAfterProfile("高橋 美咲"), { view: "confirm" });
});

test("redeem answers: each failure has its page; unknown failures stay on the confirm step", () => {
  assert.deepEqual(viewForRedeemFailure(409, "INVITE_EXPIRED"), { view: "expired" });
  assert.deepEqual(viewForRedeemFailure(409, "INVITE_FULL"), { view: "full" });
  assert.deepEqual(viewForRedeemFailure(409, "OWN_CODE"), { view: "own" });
  assert.deepEqual(viewForRedeemFailure(409, "PROFILE_REQUIRED"), { view: "profile" });
  assert.deepEqual(viewForRedeemFailure(404, "INVITE_UNAVAILABLE"), { view: "unavailable", limited: false });
  assert.deepEqual(viewForRedeemFailure(429, "INVITE_UNAVAILABLE"), { view: "unavailable", limited: true });
  assert.equal(viewForRedeemFailure(401, null), "login");
  assert.equal(viewForRedeemFailure(500, null), null);
  assert.equal(viewForRedeemFailure(0, null), null);
  assert.deepEqual(viewForRedeemResult({ outcome: "already_connected", contactId: "c-1" }), { view: "already", contactId: "c-1" });
  assert.equal(viewForRedeemResult({ outcome: "merged", contactId: "c-2" }).view, "done");
});

test("sign-up / log-in come back to exactly /i/<code> (and nothing else gets through the same door)", () => {
  assert.equal(inviteAuthHref("signup", "H8MW-4QZT"), "/app/account/signup?next=%2Fi%2FH8MW-4QZT");
  assert.equal(inviteAuthHref("login", "H8MW-4QZT"), "/app/account/login?next=%2Fi%2FH8MW-4QZT");
  const next = new URLSearchParams(inviteAuthHref("signup", "H8MW-4QZT").split("?")[1]).get("next");
  assert.equal(normalizeOrbitAuthReturnPath(next), "/i/H8MW-4QZT");
});

test("short profile tags: dedupe ignoring case and width, toggle off, at most 5 (the profile save limit)", () => {
  assert.deepEqual(toggleTag([], " 人の紹介 "), ["人の紹介"]);
  assert.deepEqual(toggleTag(["Hiring"], "hiring"), []);
  assert.deepEqual(toggleTag(["ａ"], "a"), [], "full-width folds to the same tag");
  assert.deepEqual(toggleTag(["a"], "  "), ["a"]);
  const five = ["1", "2", "3", "4", "5"];
  assert.equal(INVITE_PROFILE_TAG_LIMIT, 5);
  assert.deepEqual(toggleTag(five, "6"), five);
  assert.deepEqual(toggleTag(five, "3"), ["1", "2", "4", "5"]);
});

test("page head: title and OG are only 「Orbit への招待」 (no inviter name), noindex nofollow, no-referrer", () => {
  for (const [language, title] of [["ja", "Orbit への招待"], ["zh", "Orbit 邀请"], ["en", "An invite to Orbit"]] as const) {
    const meta = inviteLandingMetadata(language);
    assert.equal(meta.title, title);
    assert.equal((meta.openGraph as { title?: string }).title, title);
    assert.equal((meta.twitter as { title?: string }).title, title);
    assert.equal(meta.referrer, "no-referrer");
    assert.deepEqual(meta.robots, { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } });
    const text = JSON.stringify(meta);
    assert.doesNotMatch(text, /松井|佐藤|高橋|H8MW/u, "no name and no code in the head");
  }
  for (const page of ["app/i/[code]/page.tsx", "app/i/page.tsx"]) {
    const source = readFileSync(page, "utf8");
    assert.match(source, /export async function generateMetadata\(\): Promise<Metadata> \{\n\s+return inviteLandingMetadata\(await inviteLandingLanguage\(\)\);/u, `${page} uses the shared head (no preview data in it)`);
    assert.doesNotMatch(source, /Orbit2026Shell|ShellPage/u, `${page} has no shell`);
  }
});

test("response header: next.config adds Referrer-Policy: no-referrer for /i and /i/<code> only (the /api entry is untouched)", async () => {
  const { default: config } = await import("../../next.config.js");
  const entries = (await (config as { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> }).headers());
  const invite = entries.find((entry) => entry.source === "/i/:path*");
  assert.deepEqual(invite?.headers, [{ key: "Referrer-Policy", value: "no-referrer" }]);
  assert.equal(entries.length, 2);
  assert.equal(entries[1]!.source, "/api/:path*");
});

test("server render: same service and same rate limit as the preview API (shared buckets: 60 previews per IP per 10 minutes across page and API); no mock data in the live page", async () => {
  const loader = readFileSync("app/i/_landing/load-invite.ts", "utf8");
  assert.match(loader, /negotiateOrbitLanguage\(\(await headers\(\)\)\.get\("accept-language"\)\)/u, "language from Accept-Language only");
  assert.match(loader, /inviteClientIp\(await headers\(\)\)/u, "the client IP rule of the API (x-real-ip only)");
  assert.doesNotMatch(loader, /from "[^"]*(?:features\/invite-codes\/handlers|shared\/mock|mock-service)"/u, "the public page does not pull in the demo world");
  const { readLiveInvitePreview } = await import("../../app/i/_landing/load-invite");
  const { createInviteCodeLiveHandlers } = await import("../../features/invite-codes/handlers");
  const { createInviteRateLimiter, createMemoryInviteAttemptStore } = await import("../../features/invite-codes/rate-limit");
  const { createInviteCodeService } = await import("../../features/invite-codes/service");
  const { ALICE, memoryHarness, profile } = await import("../support/invite-codes-harness");
  const harness = memoryHarness();
  await harness.setProfile(profile(ALICE));
  const service = createInviteCodeService({ log: () => undefined, storage: harness.storage });
  const limiter = createInviteRateLimiter({ secret: Buffer.from("page-parity"), store: createMemoryInviteAttemptStore() });
  const lines: string[] = [];
  const live = createInviteCodeLiveHandlers({ limiter, log: () => undefined, resolveActor: async () => null, service });
  const real = await service.create(ALICE, { idempotencyKey: "k", maxUses: 10, shared: { displayName: "x" } });
  const page = (code: string, ip = "10.9.9.9") => readLiveInvitePreview({ actorId: null, code, ip, limiter, log: (line) => lines.push(line), service });
  const api = (code: string, ip = "10.9.9.9") => live.preview(new Request(`http://localhost/api/invite-codes/${code}/preview`, { headers: { "x-real-ip": ip } }), { params: Promise.resolve({ code }) });

  const opened = await page(real.code);
  assert.equal(opened.kind, "preview");
  assert.equal(opened.kind === "preview" && "email" in opened.preview.shared, false, "never the e-mail");
  assert.deepEqual(await page("ZZZZ-ZZZZ"), { kind: "unavailable", limited: false });
  assert.deepEqual(await page("not-a-code"), { kind: "unavailable", limited: false });
  // 3 previews from the page + 57 from the API = 60 in the same 10-minute bucket → the 61st is refused on both, even for the real code.
  for (let index = 0; index < 57; index += 1) assert.equal((await api("ZZZZ-ZZZZ")).status, 404);
  assert.equal((await api(real.code)).status, 429, "the API counts the page's failures");
  assert.deepEqual(await page(real.code), { kind: "unavailable", limited: true }, "the page counts the API's failures");
  assert.equal((await page(real.code, "10.9.9.10")).kind, "preview", "another IP is not affected");
  assert.ok(lines.length > 0 && lines.every((line) => !line.includes(real.code) && !line.includes("10.9.9.9")), "logs carry no full code and no raw IP");
});
