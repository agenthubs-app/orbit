/**
 * R27 SC-R27-10 E4：报名 persona 同一次调用产出「自己紹介（下書き）」（≤200 字、可日文）、提示词版本入画像、
 * 不合格修复 1 次；报名访谈最多 5 问；画像 schema 接受新可选字段（旧画像不变）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ADAPTIVE_INTERVIEW_QUESTION_LIMIT, EVENT_PERSONA_PROMPT_VERSION, generateEventPersona, nextAdaptiveInterviewQuestion } from "../../features/events/registration/adaptive-interview-service";
import { mockEventRecords } from "../../features/events/event-crud-and-import/fixtures";
import { portraitPersonaSchema, portraitPreviewInputSchema } from "../../shared/api-schema/event-registration-portrait";

const event = mockEventRecords[0]!;
const transcript = [
  { answer: "製造業向け IoT SaaS の代表", field: "positioning" as const, prompt: "q1" },
  { answer: "VC・CVC、上場企業の CFO", field: "targetAttendees" as const, prompt: "q2" },
  { answer: "工場 DX の現場事情", field: "valueOffered" as const, prompt: "q3" },
];
const persona = {
  energyStyle: "まず聞いてから話す", industryTags: ["製造業"], offering: "工場 DX の現場事情を共有できます", openers: ["製造業の SaaS 導入、どこで止まりますか？", "資本政策の最初の一手は？"],
  seeking: "シリーズAに向けて CFO 経験者と話したい", tagline: "製造業向け IoT SaaS の代表", tags: ["IoT", "SaaS", "製造業"],
  selfIntroDraft: "製造業向け IoT SaaS「ミナトリンク」の代表です。来春のシリーズAに向けて、資本政策と CFO 採用について経験のある方のお話を伺いたいです。工場 DX の現場事情ならお話しできます。",
};
const ok = (text: string) => ({ model: "deepseek-chat", provider: "deepseek", source: "env", success: true, text }) as never;

test("E4: Japanese persona carries selfIntroDraft and the prompt version from the same call", async () => {
  const systems: string[] = [];
  const result = await generateEventPersona({ event, language: "ja", modelRunner: async (input) => { systems.push(input.systemInstruction); return ok(JSON.stringify(persona)); }, transcript });
  assert.equal(systems.length, 1, "no extra call");
  assert.match(systems[0]!, /Japanese/);
  assert.match(systems[0]!, /selfIntroDraft/);
  assert.equal(result.selfIntroDraft, persona.selfIntroDraft);
  assert.equal(result.promptVersion, EVENT_PERSONA_PROMPT_VERSION);
  assert.equal(portraitPersonaSchema.safeParse(result).success, true);
});

test("E4: an invalid answer is repaired once; an over-long intro is dropped without failing the persona", async () => {
  const answers = ["{oops", JSON.stringify({ ...persona, selfIntroDraft: "あ".repeat(300) })];
  let calls = 0;
  const result = await generateEventPersona({ event, language: "ja", modelRunner: async () => { calls += 1; return ok(answers.shift()!); }, transcript });
  assert.equal(calls, 2);
  assert.equal(result.selfIntroDraft, undefined);
  await assert.rejects(generateEventPersona({ event, language: "ja", modelRunner: async () => ok("{oops"), transcript }));
});

test("registration interview asks at most 5 questions", async () => {
  const five = [...transcript, { answer: "x", field: "desiredOutcome" as const, prompt: "q4" }, { answer: "y", field: "energyStyle" as const, prompt: "q5" }];
  assert.equal(ADAPTIVE_INTERVIEW_QUESTION_LIMIT, 5);
  let called = false;
  const step = await nextAdaptiveInterviewQuestion({ event, language: "zh", modelRunner: async () => { called = true; return ok("{}"); }, transcript: five });
  assert.deepEqual([step.done, called], [true, false]);
});

test("portrait schemas: preview accepts ja; old personas without the new fields still parse", () => {
  assert.equal(portraitPreviewInputSchema.safeParse({ language: "ja", mode: "portrait-preview", responses: [] }).success, false, "still needs ≥2 responses");
  const { selfIntroDraft: _intro, ...old } = persona;
  assert.equal(portraitPersonaSchema.safeParse({ ...old, provenance: { fallbackReason: null, generationMethod: "orbit-agent-model-adaptive", model: "m", provider: "p" } }).success, true);
});
