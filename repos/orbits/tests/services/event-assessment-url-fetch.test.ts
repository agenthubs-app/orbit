import assert from "node:assert/strict";
import test from "node:test";

import { checkUrlShape, fetchEventPage, isPublicAddress, normalizeUrl, type PinnedRequest, type RawResponse } from "../../features/events/assessment/url-fetch";
import { extractEventPage, isLoginPage, normalizeEventDate, PAGE_TEXT_LIMIT } from "../../features/events/assessment/page-extract";

// R26 SC-R26-04（url-fetch.test / page-extract.test，PLANNER「测试」）：SSRF 表驱动 + 抽取规则。

test("地址段：私网 / 环回 / 链路本地 / 元数据 / 组播 / IPv6 ULA / IPv4 映射一律拒绝，公网放行", () => {
  const blocked = ["0.0.0.0", "10.1.2.3", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.0.0.8", "192.168.1.1", "198.18.0.1", "224.0.0.1", "240.0.0.1", "255.255.255.255",
    "::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "64:ff9b::a00:1", "2002:a00:1::", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:a9fe:a9fe", "not-an-ip"];
  for (const address of blocked) assert.equal(isPublicAddress(address), false, address);
  for (const address of ["8.8.8.8", "203.0.113.1".replace("203.0.113.1", "93.184.216.34"), "2606:4700::1111", "::ffff:8.8.8.8"]) assert.equal(isPublicAddress(address), true, address);
});

test("URL 形状：只 http / https、默认端口、无凭据", () => {
  assert.ok(checkUrlShape("https://connpass.com/event/1/"));
  for (const bad of ["ftp://x.jp/", "file:///etc/passwd", "https://user:pw@x.jp/", "https://x.jp:8443/", "http://x.jp:22/", "javascript:alert(1)", "not a url"]) assert.equal(checkUrlShape(bad), null, bad);
  assert.equal(normalizeUrl("https://Peatix.com/event/123/?utm_source=x#top"), "https://peatix.com/event/123");
});

const html = (body: string) => ({ body, headers: { "content-type": "text/html; charset=utf-8" }, status: 200 }) as RawResponse;
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

test("DNS 返回内网 → blocked_host；一公一私也拒；localhost 直接拒", async () => {
  assert.deepEqual((await fetchEventPage("https://evil.example/", { lookup: async () => [{ address: "10.0.0.5", family: 4 }], request: async () => html("x") })).ok, false);
  const mixed = await fetchEventPage("https://evil.example/", { lookup: async () => [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }], request: async () => html("x") });
  assert.equal(mixed.ok === false && mixed.reason, "blocked_host");
  const local = await fetchEventPage("http://localhost/", { lookup: publicLookup, request: async () => html("x") });
  assert.equal(local.ok === false && local.reason, "blocked_host");
  const literal = await fetchEventPage("http://169.254.169.254/latest/meta-data", { request: async () => html("x") });
  assert.equal(literal.ok === false && literal.reason, "blocked_host");
});

test("钉住 IP：请求拿到的是已校验的地址（防 rebinding：第二次解析不再发生）", async () => {
  let lookups = 0;
  const seen: PinnedRequest[] = [];
  const result = await fetchEventPage("https://connpass.com/event/1/", {
    lookup: async () => { lookups += 1; return lookups === 1 ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "127.0.0.1", family: 4 }]; },
    request: async (target) => { seen.push(target); return html("<html><body>ok</body></html>"); },
  });
  assert.equal(result.ok, true);
  assert.equal(lookups, 1);
  assert.equal(seen[0]?.address, "93.184.216.34");
});

test("重定向：每跳重新校验，第 2 跳到内网 → blocked_host；超过 3 次 → fetch_failed", async () => {
  let hop = 0;
  const toInternal = await fetchEventPage("https://a.example/", {
    lookup: async (host) => (host === "b.example" ? [{ address: "192.168.0.10", family: 4 }] : [{ address: "93.184.216.34", family: 4 }]),
    request: async () => { hop += 1; return { body: "", headers: { location: hop === 1 ? "https://a.example/2" : "https://b.example/" }, status: 302 }; },
  });
  assert.equal(toInternal.ok === false && toInternal.reason, "blocked_host");
  const loop = await fetchEventPage("https://a.example/", { lookup: publicLookup, request: async () => ({ body: "", headers: { location: "/again" }, status: 301 }) });
  assert.equal(loop.ok === false && loop.reason, "fetch_failed");
});

test("超时 / 连接失败 → fetch_failed；>2MB → too_large；非 HTML → not_event_page；401 / 403 → login_required", async () => {
  const failing = await fetchEventPage("https://a.example/", { lookup: publicLookup, request: async () => { throw new Error("timeout"); } });
  assert.equal(failing.ok === false && failing.reason, "fetch_failed");
  const big = await fetchEventPage("https://a.example/", { lookup: publicLookup, request: async () => ({ body: "", headers: { "content-type": "text/html" }, status: 200, tooLarge: true }) });
  assert.equal(big.ok === false && big.reason, "too_large");
  const pdf = await fetchEventPage("https://a.example/x.pdf", { lookup: publicLookup, request: async () => ({ body: "%PDF", headers: { "content-type": "application/pdf" }, status: 200 }) });
  assert.equal(pdf.ok === false && pdf.reason, "not_event_page");
  const members = await fetchEventPage("https://a.example/members", { lookup: publicLookup, request: async () => ({ body: "", headers: { "content-type": "text/html" }, status: 403 }) });
  assert.equal(members.ok === false && members.reason, "login_required");
  const server = await fetchEventPage("https://a.example/", { lookup: publicLookup, request: async () => ({ body: "", headers: { "content-type": "text/html" }, status: 500 }) });
  assert.equal(server.ok === false && server.reason, "fetch_failed");
});

const jsonLd = (value: unknown) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;

test("JSON-LD Event 优先：名称 / 日时（无时区按东京）/ 会场 / 地区 / 费用 / 主办 / 登壇者", () => {
  const page = extractEventPage(`<html><head><title>x</title>${jsonLd({ "@context": "https://schema.org", "@type": "BusinessEvent", location: { "@type": "Place", address: { addressLocality: "千代田区", addressRegion: "東京都" }, name: "東京国際フォーラム" }, name: "Japan SaaS Summit 2026 秋", offers: { price: "15000", priceCurrency: "JPY" }, organizer: { name: "SaaS Japan" }, performer: [{ "@type": "Person", affiliation: { name: "青葉ベンチャーズ" }, jobTitle: "パートナー", name: "山田 太郎" }], startDate: "2026-10-16T10:00" })}</head><body><main>本文</main></body></html>`, "https://saas-summit.jp/2026");
  assert.equal(page.eventCount, 1);
  assert.deepEqual(page.facts, {
    area: "東京都千代田区", organizer: "SaaS Japan", price: "¥15,000", speakers: [{ name: "山田 太郎", org: "青葉ベンチャーズ", role: "パートナー" }], startsAt: "2026-10-16T10:00:00+09:00", title: "Japan SaaS Summit 2026 秋", url: "https://saas-summit.jp/2026", venue: "東京国際フォーラム",
  });
  assert.equal(normalizeEventDate("2026-10-16"), "2026-10-16T00:00:00+09:00");
  assert.equal(normalizeEventDate("2026-10-16T01:00:00Z"), "2026-10-16T01:00:00Z");
});

test("页内多个活动 → pageCandidates（≤5），不只评第一个；正文截断 12k；去 script", () => {
  const events = Array.from({ length: 7 }, (_, i) => ({ "@type": "Event", name: `Event ${i}`, startDate: `2026-11-0${i + 1}T19:00:00+09:00`, url: `https://x.jp/e/${i}` }));
  const page = extractEventPage(`<html><head>${jsonLd({ "@graph": events })}</head><body><script>var secret=1</script><article>${"あ".repeat(20000)}</article></body></html>`, "https://x.jp/");
  assert.equal(page.eventCount, 7);
  assert.equal(page.pageCandidates.length, 5);
  assert.deepEqual(page.facts, { url: "https://x.jp/" });
  assert.ok(page.text.length <= PAGE_TEXT_LIMIT);
  assert.ok(!page.text.includes("secret"));
});

test("登录页三条规则：密码框；路径含 login / members 且正文短；长正文的 members 页不算", () => {
  assert.equal(isLoginPage({ finalUrl: "https://x.jp/event/1", html: "<form><input type=\"password\"></form>", text: "long ".repeat(500) }), true);
  assert.equal(isLoginPage({ finalUrl: "https://x.jp/members/event", html: "<div></div>", text: "ログインしてください" }), true);
  assert.equal(isLoginPage({ finalUrl: "https://x.jp/members/event", html: "<div></div>", text: "あ".repeat(800) }), false);
  assert.equal(extractEventPage("<html><body><form><input type='password'></form></body></html>", "https://x.jp/signin").loginRequired, true);
});

test("E1 / E2 输出宽进：空列表写成 \"\" / null / \"a, b\" 都读成数组（真实验证 2026-10-14 发现）", async () => {
  const { extractionOutputSchema } = await import("../../features/events/assessment/extract-provider");
  const parsed = extractionOutputSchema.parse({ events: null, facts: { title: "x" }, guessed: "", isEventPage: true, unreadable: "startsAt, price" });
  assert.deepEqual([parsed.guessed, parsed.unreadable, parsed.events], [[], ["startsAt", "price"], []]);
});

test("QA-B2: a clear poster answered with \"isEventPage\":\"true\" (a string) is read, not unreadable (real reply 2026-10-26)", async () => {
  const { createConfiguredEventFactsProvider } = await import("../../features/events/assessment/extract-provider");
  // The real deepseek-v4-flash replies for a generated poster: transcription OK, then JSON with string booleans.
  const structured = JSON.stringify({ events: [], facts: { agenda: [{ at: "18:30", minutes: null, title: "受付・開場" }], area: "東京都千代田区", endsAt: "2026-11-20T21:00:00+09:00", format: { matching: null, networking: "true", tableTalk: null }, price: "3,000円", startsAt: "2026-11-20T18:30:00+09:00", title: "AI × 製造業 交流ナイト 2026", venue: "丸の内ホール 3F" }, guessed: [], isEventPage: "true", unreadable: [] });
  const replies = ["AI × 製造業 交流ナイト 2026\n日時：2026年11月20日（金）18:30〜21:00", structured];
  const requests: string[] = [];
  const fetchImpl = (async (_url: string, init: { body: string }) => {
    requests.push(JSON.parse(init.body).model);
    const content = replies.shift() ?? "";
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { completion_tokens: 1, prompt_tokens: 1 } }), { status: 200 });
  }) as unknown as typeof fetch;
  const provider = createConfiguredEventFactsProvider({ env: { DEEPSEEK_API_KEY: "test" }, fetchImpl })!;
  const result = await provider.extractFromImages({ images: [{ base64: "AAAA", mimeType: "image/png" }], meter: { begin: async () => "c", end: async () => undefined } });
  assert.equal(result.isEventPage, true);
  assert.equal(result.facts.title, "AI × 製造業 交流ナイト 2026");
  assert.equal(result.facts.startsAt, "2026-11-20T18:30:00+09:00");
  assert.deepEqual(result.facts.format, { networking: true });
  assert.equal(requests.length, 2, "no repair call was needed");
});

test("QA-B2: an output that still fails the schema logs the field paths before it ends as unreadable", async () => {
  const { createConfiguredEventFactsProvider } = await import("../../features/events/assessment/extract-provider");
  const fetchImpl = (async () => new Response(JSON.stringify({ choices: [{ message: { content: "{\"isEventPage\":\"maybe\",\"facts\":{}}" } }] }), { status: 200 })) as unknown as typeof fetch;
  const provider = createConfiguredEventFactsProvider({ env: { DEEPSEEK_API_KEY: "test" }, fetchImpl })!;
  const warnings: string[] = [];
  const previous = console.warn;
  console.warn = (line: string) => { warnings.push(line); };
  try {
    await assert.rejects(provider.extractFromText({ meter: { begin: async () => "c", end: async () => undefined }, text: "x" }), (error: Error & { code?: string }) => error.code === "UNREADABLE");
  } finally { console.warn = previous; }
  assert.equal(warnings.length, 2);
  assert.match(warnings[0]!, /event_facts_schema_invalid/);
  assert.match(warnings[0]!, /isEventPage/);
});

test("复核 S1：AI 给的「19:00+09:00」「19:00Z」不带秒也规范化成合法时间；认不出的丢掉", async () => {
  const { toContractFacts } = await import("../../features/events/assessment/extract-provider");
  const base = { events: [], guessed: [], isEventPage: true, unreadable: [] };
  assert.equal(toContractFacts({ ...base, facts: { startsAt: "2026-10-20T19:00+09:00" } } as never).startsAt, "2026-10-20T19:00:00+09:00");
  assert.equal(toContractFacts({ ...base, facts: { startsAt: "2026-10-20T19:00Z" } } as never).startsAt, "2026-10-20T19:00:00Z");
  assert.equal(toContractFacts({ ...base, facts: { startsAt: "2026-10-20T19:00" } } as never).startsAt, "2026-10-20T19:00:00+09:00");
  assert.equal(toContractFacts({ ...base, facts: { startsAt: "2026-10-20T19時" } } as never).startsAt, undefined);
});

test("复核：文档段 / 6to4 中继 / Teredo / NAT64 本地段也拒绝", () => {
  for (const address of ["192.0.2.1", "198.51.100.7", "203.0.113.9", "192.88.99.1", "2001::1", "2001:db8::1", "64:ff9b:1::1"]) assert.equal(isPublicAddress(address), false, address);
});
