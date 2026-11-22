import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { attendeeAnswerInLanguage } from "../../features/events/journey/attendee-answer-language";
import { localizeLibraryAnswerText, localizeLibraryPrompt } from "../../shared/domain/host-question-library";

// 2026-11-21 语言混杂审计：同一屏只许一种界面语言。这里是不依赖浏览器的几道闸；整站实测用
// scripts/lang-mix-scan.mjs（三种语言各爬一遍，列出当前语言下出现的别种语言文字）。

const ROOT = "app/(app)/app/orbit-2026";
const KANA = /[぀-ヿ]/u;
const CJK = /[぀-ヿ一-鿿]/u;
// 语言选择里用各语言自己的名字（成熟产品惯例），样例人物名保持原文。
const ENDONYMS = new Set(["日本語", "中文", "简体中文", "English"]);
const SAMPLE_FILES = [/\/host\/matching-sample\.ts$/u];

function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !SAMPLE_FILES.some((pattern) => pattern.test(path)));
}

test("Chinese copy has no Japanese kana or 「・」, English copy has no CJK", () => {
  const bad: string[] = [];
  for (const path of files(ROOT)) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/\bzh:\s*"((?:[^"\\]|\\.)*)"/gu)) {
      if (KANA.test(match[1]!) || match[1]!.includes("・")) bad.push(`${path}: zh "${match[1]}"`);
    }
    for (const match of source.matchAll(/\ben:\s*"((?:[^"\\]|\\.)*)"/gu)) {
      if (CJK.test(match[1]!) && !ENDONYMS.has(match[1]!)) bad.push(`${path}: en "${match[1]}"`);
    }
  }
  assert.deepEqual(bad, []);
});

test("new-UI components have no hard-coded English sentences in JSX text", () => {
  const bad: string[] = [];
  for (const path of files(ROOT).filter((file) => file.endsWith(".tsx") && !file.includes("/copy/"))) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/>\s*([A-Z][a-z]+(?: [a-z]+){1,})\s*</gu)) bad.push(`${path}: "${match[1]}"`);
  }
  assert.deepEqual(bad, []);
});

test("only a page address remembers the language: an API ?lang= is a data parameter and never rewrites the cookie", () => {
  const proxy = readFileSync("proxy.ts", "utf8");
  assert.match(proxy, /const rememberLanguage = request\.nextUrl\.pathname\.startsWith\("\/api\/"\) \? null : language;/u);
  assert.doesNotMatch(proxy, /cookies\.set\("orbit-lang", language\b/u);
});

test("a soft navigation that finds another language in the cookie reloads, so the shell and the page never differ", () => {
  const context = readFileSync("app/(app)/app/orbit-language-context.tsx", "utf8");
  assert.match(context, /if \(stored && stored !== language\) window\.location\.reload\(\);/u);
});

test("the old dictionary translator never rewrites parts of content", () => {
  const server = readFileSync("app/(app)/app/orbit-language-server.ts", "utf8");
  assert.doesNotMatch(server, /out\.split\(key\)\.join/u);
});

test("registration answers: field names and library options follow the viewer; host-written and own words stay", () => {
  assert.equal(localizeLibraryAnswerText("IT・ソフトウェア", "en"), "IT or software");
  assert.equal(localizeLibraryAnswerText("AI・データ、SaaS", "zh"), "AI、数据、SaaS");
  assert.equal(localizeLibraryAnswerText("AI、数据、SaaS", "ja"), "AI・データ、SaaS", "an option with 「、」 inside still matches");
  assert.equal(localizeLibraryAnswerText("AI / 機械学習", "en"), "AI / 機械学習", "host-written option stays");
  assert.equal(localizeLibraryPrompt("お仕事の業界を選んでください", "en"), "Which industry are you in?");
  assert.deepEqual(attendeeAnswerInLanguage({ a: "生成AI / LLMの活用", q: "参加の目的" }, "en"), { a: "生成AI / LLMの活用", q: "Why I'm here" });
  assert.deepEqual(attendeeAnswerInLanguage({ a: "製造業", field: "industry", q: "業界" }, "zh"), { a: "制造业", q: "行业" });
  assert.deepEqual(attendeeAnswerInLanguage({ a: "シード期の B2B SaaS", q: "どんな人に会いたい？" }, "en"), { a: "シード期の B2B SaaS", q: "どんな人に会いたい？" });
});
