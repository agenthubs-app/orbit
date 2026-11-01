/**
 * R34 SC-R34-02：`filterSearchResults(raw, { now })` 去掉非 https、社交平台个人页、广告 / 追踪页；同 host 只留分数最高一条
 * （按完整 host，不按根域：`a.go.jp` 与 `b.go.jp` 是两个机构）；`snippet` ≤300 字；输出带 `fetchedAt`（ISO）与 `query`。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { filterSearchResults, PLAN_SEARCH_SNIPPET_MAX } from "../../features/plans/search/filter";
import type { PlanSearchRawResult } from "../../features/plans/search/types";

const NOW = new Date("2026-11-01T09:00:00.000Z");
const raw = (url: string, score = 0.5, content = "本文", title = "タイトル"): PlanSearchRawResult => ({ content, score, title, url });

test("non-https, social personal pages and ad / tracking urls are dropped; compliant pages stay", () => {
  const out = filterSearchResults(
    [
      {
        query: "q1",
        results: [
          raw("http://www.meti.go.jp/policy/startup.html"),
          raw("ftp://example.org/file"),
          raw("https://x.com/someone/status/1"),
          raw("https://twitter.com/someone"),
          raw("https://m.facebook.com/someone"),
          raw("https://www.instagram.com/someone/"),
          raw("https://www.threads.net/@someone"),
          raw("https://www.linkedin.com/in/someone/"),
          raw("https://note.com/someone"),
          raw("https://note.com/someone/"),
          raw("https://example.com/page?utm_source=newsletter"),
          raw("https://example.net/affiliate/offer"),
          raw("https://ads.example.org/landing"),
          raw("https://example.co.jp/shop?affiliate_id=99"),
          raw("https://example.co.jp/shop?gclid=abc"),
          raw("not a url"),
          raw("https://www.jetro.go.jp/startup/programs.html", 0.9),
          raw("https://note.com/someone/n/n123abc", 0.4),
          raw("https://www.linkedin.com/company/example/", 0.3),
          raw("https://www.adachi.tokyo.jp/business/", 0.2),
          raw("https://example.com/download/report", 0.1),
        ],
      },
    ],
    { now: NOW },
  );
  assert.deepEqual(
    out.map((source) => source.url),
    ["https://www.jetro.go.jp/startup/programs.html", "https://note.com/someone/n/n123abc", "https://www.linkedin.com/company/example/", "https://www.adachi.tokyo.jp/business/", "https://example.com/download/report"],
  );
  for (const source of out) {
    assert.equal(source.kind, "web");
    assert.equal(source.query, "q1");
    assert.equal(source.fetchedAt, NOW.toISOString());
    assert.ok(!("id" in source));
  }
});

test("same full host keeps only the highest-scored result (in the slot where the host first appeared); different hosts under one root domain are kept", () => {
  const out = filterSearchResults(
    [
      { query: "q1", results: [raw("https://www.meti.go.jp/a", 0.3), raw("https://www.jpo.go.jp/b", 0.2)] },
      { query: "q2", results: [raw("https://www.meti.go.jp/c", 0.8), raw("https://www.meti.go.jp/d", 0.8), raw("https://www.mhlw.go.jp/e", 0.1)] },
    ],
    { now: NOW },
  );
  assert.deepEqual(
    out.map((source) => [source.url, source.query]),
    [["https://www.meti.go.jp/c", "q2"], ["https://www.jpo.go.jp/b", "q1"], ["https://www.mhlw.go.jp/e", "q2"]],
  );
});

test("snippet is whitespace-collapsed and cut to 300 characters; empty title falls back to the host", () => {
  const long = "あ".repeat(400);
  const out = filterSearchResults([{ query: "q", results: [raw("https://example.jp/x", 0.5, `  前半\n\n ${long}  `, "  ")] }], { now: NOW });
  assert.equal(out.length, 1);
  assert.equal(PLAN_SEARCH_SNIPPET_MAX, 300);
  assert.equal(Array.from(out[0].snippet).length, 300);
  assert.ok(out[0].snippet.startsWith("前半 あ"));
  assert.equal(out[0].title, "example.jp");
});

test("empty input and all-rejected input both give an empty list", () => {
  assert.deepEqual(filterSearchResults([], { now: NOW }), []);
  assert.deepEqual(filterSearchResults([{ query: "q", results: [raw("http://insecure.example/")] }], { now: NOW }), []);
});
