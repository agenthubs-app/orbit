/**
 * 申込フォームの質問集（shared/domain/host-question-library.ts）：表の整合（id・3 言語・選択肢数・スキーマ）、テンプレートの対応、
 * 5 問の上限、言語の切り替え、質問案（サーバー）、保存入力の形、選択ドロワーの描画。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { QuestionsEditor } from "../../app/(app)/app/orbit-2026/host/HostSetup";
import { QuestionLibraryPanel, togglePick } from "../../app/(app)/app/orbit-2026/host/QuestionLibrary";
import { hostTranslator } from "../../app/(app)/app/orbit-2026/host/host-model";
import { addSuggested, draftInput, templateKeyOf, templateQuestions } from "../../app/(app)/app/orbit-2026/host/setup-model";
import { HOST_QUESTION_LIBRARY } from "../../features/events/host/templates";
import { validHostAnswers } from "../../features/events/journey/join";
import { hostQuestionInput, hostQuestionList } from "../../shared/api-schema/host-events";
import { hostSetupDraftInputObject } from "../../shared/api-schema/host-console";
import { suggestQuestions } from "../../shared/compute/question-suggest";
import type { HostSetupQuestion } from "../../shared/contract/host-console";
import {
  HOST_QUESTION_CATEGORY_IDS, HOST_QUESTION_LIBRARY_ENTRIES, HOST_QUESTION_MAX, HOST_SUGGESTION_ORDER, HOST_TEMPLATE_QUESTION_IDS,
  addLibraryQuestions, hostQuestionLibrary, libraryQuestion, localizeQuestion, remainingQuestionSlots, searchLibrary,
} from "../../shared/domain/host-question-library";

const LANGS = ["ja", "zh", "en"] as const;
const t = hostTranslator("ja");
const custom = (id: string): HostSetupQuestion => ({ id, kind: "single", options: ["A", "B"], prompt: `custom ${id}`, required: false });

test("質問集：25 問以上、id は一意で安定した形、3 言語そろい、選択式が中心", () => {
  const entries = HOST_QUESTION_LIBRARY_ENTRIES;
  assert.ok(entries.length >= 25, `${entries.length} questions`);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length, "ids are unique");
  for (const entry of entries) {
    assert.match(entry.id, /^lib-[a-z][a-z-]*$/u);
    assert.ok(`host:${entry.id}`.length <= 40, "参加登録の field（≤40）に収まる");
    assert.ok(HOST_QUESTION_CATEGORY_IDS.includes(entry.category));
    for (const text of entry.prompt) assert.ok(text.trim() && Array.from(text).length <= 120, `${entry.id} prompt`);
    if (entry.kind === "free") { assert.equal(entry.options.length, 0); continue; }
    assert.ok(entry.options.length >= 3 && entry.options.length <= 12, `${entry.id}: ${entry.options.length} options`);
    for (const [i] of LANGS.entries()) {
      const texts = entry.options.map((option) => option[i]);
      assert.equal(new Set(texts).size, texts.length, `${entry.id} options are distinct in ${LANGS[i]}`);
      for (const text of texts) {
        assert.ok(text.trim() && Array.from(text).length <= 60, `${entry.id} option ${text}`);
        assert.doesNotMatch(text, /·|\|/u, "複数選択の区切り「·」を選択肢に使わない");
      }
    }
  }
  const choice = entries.filter((entry) => entry.kind !== "free");
  assert.ok(entries.length - choice.length <= 4, "自由記述は少なめ");
  assert.ok(choice.filter((entry) => entry.options.length >= 6).length >= choice.length * 0.7, "選択肢は 6 個以上が中心");
  for (const category of HOST_QUESTION_CATEGORY_IDS) assert.ok(entries.some((entry) => entry.category === category), `${category} has questions`);
  // どの言語でもそのまま保存スキーマを通る。
  for (const language of LANGS) for (const question of hostQuestionLibrary(language)) assert.equal(hostQuestionInput.safeParse(question).success, true, `${language} ${question.id}`);
});

test("質問集：CFO 専用の質問は残っていない", () => {
  const all = HOST_QUESTION_LIBRARY_ENTRIES.flatMap((entry) => [...entry.prompt, ...entry.options.flat()]).join("\n");
  assert.doesNotMatch(all, /CFO|資本政策|財務チーム/u);
});

test("テンプレート：質問集から選ぶ、Q1 はどれも「立場」、新規作成の templateId と対応", () => {
  for (const [key, ids] of Object.entries(HOST_TEMPLATE_QUESTION_IDS)) {
    assert.equal(ids[0], "lib-role", `${key}: Q1 = 立場（レポートの分布）`);
    assert.ok(ids.length <= HOST_QUESTION_MAX);
    for (const id of ids) assert.ok(libraryQuestion(id, "ja"), `${key}: ${id}`);
  }
  assert.deepEqual(templateQuestions("mixer", "ja").map((question) => question.id), ["lib-role", "lib-industry", "lib-topic", "lib-meet"]);
  assert.equal(templateQuestions("study", "zh")[0]!.prompt, "请选择最接近你身份的一项");
  assert.equal(templateQuestions("round", "en")[1]!.prompt, "What's your biggest challenge right now?");
  const blank = templateQuestions("blank", "ja");
  assert.deepEqual([blank.length, blank[0]!.kind, blank[0]!.prompt], [1, "single", ""]);
  assert.deepEqual([templateKeyOf("mixer"), templateKeyOf("study"), templateKeyOf("roundtable"), templateKeyOf(null)], ["mixer", "study", "round", "mixer"]);
});

test("選ぶ：5 問まで、すでにある質問は足さない、上限で足せなかったものを返す", () => {
  const three = templateQuestions("mixer", "ja").slice(0, 3);
  assert.equal(remainingQuestionSlots(three), 2);
  const result = addLibraryQuestions(three, ["lib-role", "lib-offer", "lib-seek", "lib-diet", "lib-nope"], "zh");
  assert.deepEqual(result.added, ["lib-offer", "lib-seek"]);
  assert.deepEqual(result.skipped, ["lib-diet"]);
  assert.equal(result.questions.length, 5);
  assert.equal(result.questions[3]!.prompt, "你能为其他参加者提供什么？（可多选）");
  assert.equal(remainingQuestionSlots(result.questions), 0);
  // ドロワーの中の選択：選んだ順、もう一度押すと外す、空きがないと選べない。
  assert.deepEqual(togglePick([], "a", 2), { full: false, picked: ["a"] });
  assert.deepEqual(togglePick(["a", "b"], "c", 2), { full: true, picked: ["a", "b"] });
  assert.deepEqual(togglePick(["a", "b"], "a", 2), { full: false, picked: ["b"] });
});

test("言語：手を入れていない質問集の質問だけ画面の言語に直す", () => {
  const ja = libraryQuestion("lib-meet", "ja")!;
  assert.equal(localizeQuestion(ja, "en").prompt, "Who would you like to meet? (choose any)");
  assert.equal(localizeQuestion({ ...ja, required: false }, "zh").required, false, "必須の切り替えは残す");
  const edited = { ...ja, options: [...ja.options.slice(0, 3), "自分で足した"] };
  assert.equal(localizeQuestion(edited, "en"), edited, "編集済みはそのまま");
  assert.equal(localizeQuestion(custom("q-1"), "en").prompt, "custom q-1");
  // 検索は 3 言語どれでも当たる。
  assert.ok(searchLibrary("WeChat").some((entry) => entry.id === "lib-followup"));
  assert.ok(searchLibrary("投资人", "meet").every((entry) => entry.category === "meet"));
  assert.deepEqual(searchLibrary("zzzz"), []);
});

test("質問案（サーバー）：質問集から、汎用の 3 問（立場・テーマ・会いたい人）；画面では主催者の言語・質問集の id で入る", () => {
  assert.deepEqual(HOST_QUESTION_LIBRARY.slice(0, HOST_SUGGESTION_ORDER.length).map((question) => question.id), [...HOST_SUGGESTION_ORDER]);
  const picked = suggestQuestions({ existing: [], library: HOST_QUESTION_LIBRARY, past: [] });
  assert.deepEqual(picked.map((question) => question.id), ["lib-role", "lib-topic", "lib-meet"]);
  // 同じ id がすでにあれば出さない（文面を言語ごとに変えていても）。
  const again = suggestQuestions({ existing: [libraryQuestion("lib-role", "en")!], library: HOST_QUESTION_LIBRARY, past: [] });
  assert.deepEqual(again.map((question) => question.id), ["lib-topic", "lib-meet", "lib-industry"]);
  const added = addSuggested([custom("q-a")], picked, "zh");
  assert.deepEqual(added.map((question) => question.id), ["q-a", "lib-role", "lib-topic", "lib-meet"]);
  assert.equal(added[1]!.prompt, "请选择最接近你身份的一项");
  assert.equal(addSuggested(added, picked, "zh").length, 4, "同じ質問は二度入らない");
});

test("保存入力：質問集の id のまま送り、スキーマは id の重複・選択肢のない選択式を拒む", () => {
  const questions = templateQuestions("mixer", "en");
  const input = draftInput({ admissionMode: "review", capacity: null, description: "", questions, registrationClosesAt: null }, 4);
  assert.deepEqual(input.questions.map((question) => question.id), ["lib-role", "lib-industry", "lib-topic", "lib-meet"]);
  assert.equal(hostSetupDraftInputObject.safeParse(input).success, true);
  assert.equal(hostQuestionList.safeParse([questions[0], questions[0]]).success, false, "same id twice");
  assert.equal(hostQuestionInput.safeParse({ ...questions[0], options: [] }).success, false, "choice without options");
  assert.equal(hostQuestionInput.safeParse({ ...questions[0], kind: "free", options: [] }).success, true);
  assert.equal(hostQuestionList.safeParse(hostQuestionLibrary("ja").slice(0, 6)).success, false, "6 問は多い");
});

test("回答：選択肢そのものに「·」があっても 1 つの回答として残す（旧テンプレートの「专业服务 · 支援机构」）", () => {
  const question = { id: "q1", kind: "single" as const, options: ["投资人", "专业服务 · 支援机构"], prompt: "身份", required: true };
  assert.deepEqual(validHostAnswers([question], [{ answer: "专业服务 · 支援机构", field: "host:q1", prompt: "身份", questionToken: "host:q1" }]), { q1: "专业服务 · 支援机构" });
  const multi = libraryQuestion("lib-language", "ja")!;
  assert.deepEqual(validHostAnswers([multi], [{ answer: "日本語 · 英語", field: "host:lib-language", prompt: multi.prompt, questionToken: "host:lib-language" }]), { "lib-language": "日本語 · 英語" });
});

test("選ぶ画面：カテゴリ（件数つき）、選択肢のプレビュー、追加済み、5 問で選べない案内", () => {
  const questions = templateQuestions("mixer", "ja");
  const html = renderToStaticMarkup(<QuestionLibraryPanel questions={questions} t={t} language="ja" picked={["lib-offer"]} query="" category="all" onQuery={() => {}} onCategory={() => {}} onToggle={() => {}} />);
  assert.equal((html.match(/data-host-qlib-q=/g) ?? []).length, HOST_QUESTION_LIBRARY_ENTRIES.length);
  assert.equal((html.match(/data-host-qlib-cat=/g) ?? []).length, HOST_QUESTION_CATEGORY_IDS.length);
  assert.match(html, />すべて<small[^>]*>\d+<\/small>/);
  assert.match(html, />立場・役職</);
  assert.equal((html.match(/>追加済み</g) ?? []).length, 4);
  assert.match(html, /data-host-qlib-q="lib-offer"[^>]*data-picked=""/);
  assert.match(html, /ほか \d/);
  // あと 1 問しか入らない：選んでいない行は選べない表示。
  assert.ok((html.match(/aria-disabled="true"/g) ?? []).length >= HOST_QUESTION_LIBRARY_ENTRIES.length - 1 - 4);
  const zh = renderToStaticMarkup(<QuestionLibraryPanel questions={[]} t={hostTranslator("zh")} language="zh" picked={[]} query="微信" category="all" onQuery={() => {}} onCategory={() => {}} onToggle={() => {}} />);
  assert.match(zh, /会后希望怎么联系/);
  const fullForm = renderToStaticMarkup(<QuestionLibraryPanel questions={hostQuestionLibrary("ja").slice(0, 5)} t={t} language="ja" picked={[]} query="" category="meet" onQuery={() => {}} onCategory={() => {}} onToggle={() => {}} />);
  assert.match(fullForm, /フォームはすでに 5問です/);
  assert.doesNotMatch(fullForm, /data-host-qlib-cat="role"/, "カテゴリで絞り込み");
});

test("質問カード：新規作成と同じ QuestionsEditor に「質問集から選ぶ」、5 問で無効", () => {
  const html = renderToStaticMarkup(<QuestionsEditor questions={templateQuestions("mixer", "ja")} t={t} language="ja" editing={-1} onEdit={() => {}} onChange={() => {}} />);
  assert.match(html, /data-host-qlib-open=""/);
  assert.match(html, />質問集から選ぶ</);
  assert.equal((html.match(/data-host-question=/g) ?? []).length, 4);
  const full = renderToStaticMarkup(<QuestionsEditor questions={hostQuestionLibrary("ja").slice(0, 5)} t={t} language="ja" editing={-1} onEdit={() => {}} onChange={() => {}} />);
  assert.match(full, /data-host-qadd="full"/);
  assert.match(full, /disabled=""[^>]*data-host-qlib-open=""/);
});
