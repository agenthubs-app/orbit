/**
 * R17（host/DESIGN.md §2.7）× R27 参加登録：主办方公开的申込質問先问（单选 / 多选 / 自由），问完再由访谈补足到 5 问；
 * 访谈与 persona 只看访谈自己的回答；提交时只留下合法回答（选项在问题集里、自由回答 ≤200 字）并单独保存。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createJoinService, HOST_QUESTION_FIELD_PREFIX, validHostAnswers } from "../../features/events/journey/join";
import { createJoinMockPorts } from "../../features/events/journey/join-mock";
import { JOURNEY_EVENT_ID } from "../../shared/mock/demo-world/events-journey";

const questions = [
  { id: "q1", kind: "single" as const, options: ["スタートアップの経営者・CFO", "投資家（VC・CVC・エンジェル）"], prompt: "あなたの立場に近いものを選んでください", required: true },
  { id: "q2", kind: "multiple" as const, options: ["資本政策", "上場準備", "採用"], prompt: "今回いちばん話したいテーマ（2つまで）", required: true },
];

test("host questions come first, then the interview; answers are validated and saved apart", async () => {
  const base = createJoinMockPorts();
  const seenByAi: string[][] = [];
  const saved: Array<Record<string, string>> = [];
  const service = createJoinService({ ports: { ...base, hostQuestions: async () => questions, async next(eventId, answers, language, more) { seenByAi.push(answers.map((answer) => answer.field)); return base.next(eventId, answers, language, more); }, saveHostAnswers: async (_actor, _event, answers) => { saved.push({ ...answers }); } } });
  const first = await service.next(JOURNEY_EVENT_ID, [], "ja");
  assert.deepEqual([first?.question?.field, first?.question?.multi, first?.index, first?.total], [`${HOST_QUESTION_FIELD_PREFIX}q1`, false, 1, 5]);
  const q1 = { answer: "投資家（VC・CVC・エンジェル）", field: "host:q1", prompt: questions[0]!.prompt, questionToken: "host:q1" };
  const second = await service.next(JOURNEY_EVENT_ID, [q1], "ja");
  assert.deepEqual([second?.question?.field, second?.question?.multi], ["host:q2", true]);
  const q2 = { answer: "資本政策 · 上場準備", field: "host:q2", prompt: questions[1]!.prompt, questionToken: "host:q2" };
  const third = await service.next(JOURNEY_EVENT_ID, [q1, q2], "ja");
  assert.ok(third?.question && !third.question.field.startsWith("host:"), "then the adaptive interview");
  assert.deepEqual(seenByAi.at(-1), [], "the interview does not see host answers");
  await service.submit("actor:a", JOURNEY_EVENT_ID, [q1, q2, { answer: "偽の選択肢", field: "host:q9", prompt: "x", questionToken: "host:q9" }], "ja");
  assert.deepEqual(saved, [{ q1: "投資家（VC・CVC・エンジェル）", q2: "資本政策 · 上場準備" }]);
});

test("validHostAnswers drops unknown questions, unknown options and two picks on a single choice", () => {
  const answer = (field: string, text: string) => ({ answer: text, field, prompt: "", questionToken: field });
  assert.deepEqual(validHostAnswers(questions, [answer("host:q1", "スタートアップの経営者・CFO · 投資家（VC・CVC・エンジェル）"), answer("host:q2", "資本政策 · 存在しない"), answer("positioning", "CFO")]), { q2: "資本政策" });
  assert.deepEqual(validHostAnswers([{ id: "f", kind: "free", options: [], prompt: "p", required: false }], [answer("host:f", "あ".repeat(250))]).f?.length, 200);
});
