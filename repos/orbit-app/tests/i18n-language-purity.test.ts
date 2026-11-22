import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import ts from "typescript";

import { en } from "../src/i18n/en";
import { ja } from "../src/i18n/ja";
import { zh } from "../src/i18n/zh";

// 2026-11-21 language audit: a screen in one language must not show interface text
// in another. The type system already makes the three dictionaries share keys; these
// checks catch what types cannot: a value written in the wrong language, a key that
// loses a placeholder in one language, and English typed straight into a component
// (no-hardcoded-copy.test.ts only sees kana and CJK).
const appRoot = new URL("..", import.meta.url).pathname;
const dictionaries = { en, ja, zh } as const;
const KANA = /[぀-ヿｦ-ﾟ]/;
const HAN = /[㐀-鿿豈-﫿]/;

// Names that stay the same in every language (brands, products, formats, codes) are
// written capitalised or as acronyms; English interface wording leaks in as lowercase
// words ("people", "view only") or as a value with no Japanese / Chinese at all ("Ended").
const LOWERCASE_OK = new Set(["https", "http", "localhost", "csv", "vcf", "vol", "example", "com", "mirai", "seiki", "ryo", "takayama", "iOS", "iPad", "iPhone", "iOrbit", "vCard", "connpass"]);
const PROPER = new Set(["Orbit", "iOrbit", "IORBIT", "LinkedIn", "LINE", "WeChat", "iPhone", "Google", "SaaS", "CSV", "URL", "English", "Step", "Task", "ToDo", "App", "Web", "LIVE", "Connections", "XXXX", "WhatsApp", "FAX"]);
const words = (value: string) => [...value.replace(/\{[A-Za-z0-9_]+\}/g, "").replace(/\S+@\S+/g, "").matchAll(/[A-Za-z]{3,}/g)].map((m) => m[0]);
const englishWords = (value: string) => {
  const all = words(value);
  const lowercase = all.filter((word) => /^[a-z]/.test(word) && !LOWERCASE_OK.has(word));
  if (lowercase.length) return lowercase;
  return KANA.test(value) || HAN.test(value) ? [] : all.filter((word) => !PROPER.has(word) && !LOWERCASE_OK.has(word));
};

// A value that is the same in every language on purpose: language names shown in
// their own script, and search keywords that match text written in any language.
const MULTILINGUAL = new Set(["settings.languageZh", "settings.languageJa", "settings.languageEn", "publicInfo.sendSearchKeywords", "publicInfo.gmailSearchKeywords", "publicInfo.cardSearchKeywords", "plan.team.gapJoin",
  // sample event names in the host demo (content, not interface wording)
  "host.sample1Title", "host.sample3Title"]);
// Shorter wording in one language that drops a detail on purpose.
const PLACEHOLDER_DROPS = new Set(["plan.purpose.summary", "search.semanticBanner"]);

test("every key has a non-empty value in all three languages", () => {
  const empty: string[] = [];
  for (const [language, dictionary] of Object.entries(dictionaries)) {
    assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(zh).sort(), `${language} keys differ from zh`);
    for (const [key, value] of Object.entries(dictionary)) if (!String(value).trim()) empty.push(`${language} ${key}`);
  }
  assert.deepEqual(empty, []);
});

test("the three languages use the same placeholders", () => {
  const names = (value: string) => [...new Set([...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]))].sort().join(",");
  const differ = Object.keys(zh).filter((key) => {
    if (PLACEHOLDER_DROPS.has(key)) return false;
    const k = key as keyof typeof zh;
    return names(zh[k]) !== names(ja[k]) || names(zh[k]) !== names(en[k]);
  });
  assert.deepEqual(differ, []);
});

test("English values contain no Japanese or Chinese", () => {
  const wrong = Object.entries(en).filter(([key, value]) => !MULTILINGUAL.has(key) && (KANA.test(value) || HAN.test(value)));
  assert.deepEqual(wrong, []);
});

test("Chinese values contain no kana, no Japanese separators and no English words", () => {
  const wrong = Object.entries(zh).filter(([key, value]) => !MULTILINGUAL.has(key) && (KANA.test(value) || value.includes("・") || englishWords(value).length > 0));
  assert.deepEqual(wrong, []);
});

test("Japanese values contain no English words", () => {
  const wrong = Object.entries(ja).filter(([key, value]) => !MULTILINGUAL.has(key) && englishWords(value).length > 0);
  assert.deepEqual(wrong, []);
});

// Visible props that take text. JSX text and these props must come from t() or data.
const TEXT_PROPS = /^(title|label|placeholder|accessibilityLabel|subtitle|body|text|message|caption|hint|eyebrow|kicker|description|heading|confirmLabel|cancelLabel|actionLabel)$/;
const EXEMPT_FILES = [/^src\/i18n\//, /^src\/api\/(?:contract|schema|domain|compute|design|copy)\//, /showcase/];

export function hardcodedEnglish(source: string, fileName: string): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const check = (node: ts.Node, text: string) => {
    if (englishWords(text).length) found.push(`${fileName}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${text.trim()}`);
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) check(node, node.text);
    if (ts.isJsxAttribute(node) && TEXT_PROPS.test(node.name.getText(file)) && node.initializer) {
      const init = node.initializer;
      const literal = ts.isStringLiteral(init) ? init : ts.isJsxExpression(init) && init.expression && (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression)) ? init.expression : null;
      if (literal) check(node, literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

// Screens no route reaches (kept for reference; their copy is the legacy allow list's job).
const UNREACHED = new Set(["src/screens/agent/AgentLedgerContent.tsx", "src/screens/chat/RelationshipChatScreen.tsx", "src/screens/chat/RelationshipChatDetailScreen.tsx"]);

test("components do not type English interface text", () => {
  const found: string[] = [];
  for (const root of ["src", "app"]) {
    for (const entry of readdirSync(join(appRoot, root), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.tsx$/.test(entry.name)) continue;
      const path = relative(appRoot, join(entry.parentPath, entry.name));
      if (EXEMPT_FILES.some((pattern) => pattern.test(path)) || UNREACHED.has(path)) continue;
      found.push(...hardcodedEnglish(readFileSync(join(appRoot, path), "utf8"), path));
    }
  }
  assert.deepEqual(found, [], "move the text into src/i18n/<locale>/<domain>.ts");
});

test("the English scan sees JSX text and text props, and lets brand names through", () => {
  assert.equal(hardcodedEnglish("const a = <Text>Save draft</Text>;", "x.tsx").length, 1);
  assert.equal(hardcodedEnglish('const b = <Button label="Open" />;', "x.tsx").length, 1);
  assert.equal(hardcodedEnglish('const c = <Header title="iOrbit" />; const d = <Text>Orbit</Text>;', "x.tsx").length, 0);
  assert.equal(hardcodedEnglish('const e = <View testID="save-button" />;', "x.tsx").length, 0);
});
