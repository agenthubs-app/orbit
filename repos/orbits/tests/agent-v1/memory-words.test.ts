/**
 * agent-design AG14 (设计稿 §6): the user's words about saved memory, read by code — which ask it is ("记住" / "这次" /
 * "以后" / "忘掉" / what is saved), and what a sentence to remember holds.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { appliesLabel, asksWhyOrder, composeEventTimeContent, entriesPointedAt, kindLabel, memoryAskOf, readMemoryWords, rememberedWordsOf, replacementOf, replyLanguageIn, saysThisTime, timeValuesIn, timeWordsOf } from "../../features/agent-v1/domains/memory/words";

test("which ask: remember, forget, list, an exception for this time, or none", () => {
  assert.equal(memoryAskOf("记住，以后给我推荐活动时优先周末上午。"), "remember");
  assert.equal(memoryAskOf("覚えておいて。これからイベントをおすすめするときは、週末の午前中を優先してほしい。"), "remember");
  assert.equal(memoryAskOf("From now on, when you recommend events, prefer weekend afternoons instead of weekend mornings."), "remember");
  assert.equal(memoryAskOf("以后改成周末下午"), "remember");
  assert.equal(memoryAskOf("Remember that I only want weekday events."), "remember");
  assert.equal(memoryAskOf("这次看周四晚上的。"), "this_time");
  assert.equal(memoryAskOf("今回は木曜の夜のを見せて"), "this_time");
  assert.equal(memoryAskOf("Just this once, show me Thursday evening."), "this_time");
  assert.equal(memoryAskOf("还是算了，忘掉我的活动时段偏好。"), "forget");
  assert.equal(memoryAskOf("忘掉我的活动时段偏好。"), "forget");
  assert.equal(memoryAskOf("イベントの時間帯の好みは忘れてください"), "forget");
  assert.equal(memoryAskOf("Forget my event time preference."), "forget");
  assert.equal(memoryAskOf("你现在记着我哪些偏好和规矩？"), "list");
  assert.equal(memoryAskOf("你记着我哪些偏好？"), "list");
  assert.equal(memoryAskOf("What do you remember about me?"), "list");
  assert.equal(memoryAskOf("私の好みで何を覚えていますか？"), "list");
  // Not asks about memory.
  assert.equal(memoryAskOf("给我推荐几场下周的活动。"), null);
  assert.equal(memoryAskOf("我忘了他叫什么名字"), null);
  assert.equal(memoryAskOf("Do you remember what he said last week?"), null);
  assert.equal(memoryAskOf("以后有空再聊"), null);
  // The first layer named a memory change: a lasting word is enough then.
  assert.equal(memoryAskOf("以后有空再聊", true), "remember");
  // "这次" with a lasting word next to it is not an exception.
  assert.equal(memoryAskOf("这次之后，以后都优先周末下午"), "remember");
  assert.equal(saysThisTime("这次看周四晚上的。"), true);
  assert.equal(saysThisTime("以后改成周末下午"), false);
});

test("a question about the order of the list just shown", () => {
  assert.equal(asksWhyOrder("你为什么把第一场排在最前面？"), true);
  assert.equal(asksWhyOrder("Why is that one first?"), true);
  assert.equal(asksWhyOrder("なぜそれが一番上なんですか？"), true);
  assert.equal(asksWhyOrder("给我推荐几场下周的活动。"), false);
});

test("the sentence to keep, without the words that only ask to keep it", () => {
  assert.equal(rememberedWordsOf("记住，以后给我推荐活动时优先周末上午。"), "给我推荐活动时优先周末上午");
  assert.equal(rememberedWordsOf("覚えておいて。これからイベントをおすすめするときは、週末の午前中を優先してほしい。"), "イベントをおすすめするときは、週末の午前中を優先");
  assert.equal(rememberedWordsOf("Remember that I only want weekday events."), "I only want weekday events");
  assert.equal(rememberedWordsOf("From now on, when you recommend events, prefer weekend afternoons"), "when you recommend events, prefer weekend afternoons");
  assert.equal(rememberedWordsOf("记住，回答用日语。"), "回答用日语");
});

test("a change names the new value and the one it replaces", () => {
  assert.deepEqual(replacementOf("when you recommend events, prefer weekend afternoons instead of weekend mornings"), { next: "when you recommend events, prefer weekend afternoons", previous: "weekend mornings" });
  assert.deepEqual(replacementOf("推荐活动时优先周末下午，而不是周末上午"), { next: "推荐活动时优先周末下午", previous: "周末上午" });
  // AG14 UI run: the change verb after where it is used is not part of the new words.
  assert.deepEqual(replacementOf("推荐活动时改成优先周末下午"), { next: "推荐活动时优先周末下午", previous: null });
  assert.deepEqual(replacementOf("推荐活动的时候换成优先周末下午"), { next: "推荐活动的时候优先周末下午", previous: null });
  assert.deepEqual(replacementOf("把周末上午改成周末下午"), { next: "周末下午", previous: "周末上午" });
  assert.deepEqual(replacementOf("週末の午前ではなく週末の午後を優先して"), { next: "週末の午後を優先", previous: "週末の午前" });
  assert.deepEqual(replacementOf("改成周末下午"), { next: "改成周末下午", previous: null });
  // A plain negation is not a replacement.
  assert.deepEqual(replacementOf("do not recommend evening events"), { next: "do not recommend evening events", previous: null });
  assert.deepEqual(replacementOf("不要再给我推荐晚上的活动"), { next: "不要再给我推荐晚上的活动", previous: null });
});

test("what a sentence to remember holds: the kind, the tasks and the values", () => {
  assert.deepEqual(readMemoryWords("给我推荐活动时优先周末上午"), { appliesTo: ["event.recommend"], category: "preference", composable: true, structured: { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" } });
  assert.deepEqual(readMemoryWords("イベントをおすすめするときは、週末の午前中を優先"), { appliesTo: ["event.recommend"], category: "preference", composable: true, structured: { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" } });
  assert.deepEqual(readMemoryWords("when you recommend events, prefer weekend afternoons"), { appliesTo: ["event.recommend"], category: "preference", composable: true, structured: { dayPart: "afternoon", preferredDays: ["Sat", "Sun"], strength: "prefer" } });
  assert.deepEqual(readMemoryWords("周末下午"), { appliesTo: ["event.recommend"], category: "preference", composable: true, structured: { dayPart: "afternoon", preferredDays: ["Sat", "Sun"], strength: "prefer" } });
  // A rule: what is left out is a hard condition.
  const noEvening = readMemoryWords("不要推荐晚上的活动");
  assert.equal(noEvening.category, "constraint");
  assert.deepEqual(noEvening.appliesTo, ["event.recommend"]);
  assert.deepEqual(noEvening.structured, { dayPart: "evening", strength: "avoid" });
  // The reply language is a rule for every answer.
  assert.deepEqual(readMemoryWords("回答用日语"), { appliesTo: ["all"], category: "constraint", composable: false, structured: { replyLanguage: "ja" } });
  assert.deepEqual(readMemoryWords("Always reply in English"), { appliesTo: ["all"], category: "constraint", composable: false, structured: { replyLanguage: "en" } });
  // Words beyond the time stay the entry's own words (not written again from the values).
  assert.equal(readMemoryWords("推荐活动时优先周末上午的摄影类活动").composable, false);
  // A rule that names no task is for every task; a preference that names none is not classified.
  assert.deepEqual(readMemoryWords("日期一律带上星期").appliesTo, ["all"]);
  assert.deepEqual(readMemoryWords("我喜欢简短一点的总结").appliesTo, []);
  assert.equal(readMemoryWords("整理笔记时先列结论再列细节").appliesTo[0], "memo.summarize");
});

test("time values and the reply language are read from an entry's own words too", () => {
  assert.deepEqual(timeValuesIn("推荐活动时优先周末上午"), { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" });
  // AG21b (R33): a clock time is a start-time bound read from the words, never widened to the whole evening.
  assert.deepEqual(timeValuesIn("不要推荐晚上 18 点以后开始的活动"), { strength: "avoid" });
  assert.equal(timeValuesIn("推荐活动时优先和器物、茶有关的"), null);
  assert.equal(replyLanguageIn("回答用日语"), "ja");
  assert.equal(replyLanguageIn("日本語で答えて"), "ja");
  assert.equal(replyLanguageIn("我在学日语"), null);
});

test("words code writes: the time, the composed sentence, where it is used, which group it is in", () => {
  const afternoon = { dayPart: "afternoon" as const, preferredDays: ["Sat" as const, "Sun" as const], strength: "prefer" as const };
  assert.equal(timeWordsOf(afternoon, "zh"), "周末下午");
  assert.equal(timeWordsOf(afternoon, "en"), "weekend afternoons");
  assert.equal(timeWordsOf(afternoon, "ja"), "週末の午後");
  assert.equal(composeEventTimeContent({ ...afternoon, dayPart: "morning" }, "zh"), "推荐活动时优先周末上午");
  assert.equal(composeEventTimeContent(afternoon, "en"), "When recommending events, prefer weekend afternoons");
  assert.equal(composeEventTimeContent(afternoon, "ja"), "イベントをおすすめするときは週末の午後を優先");
  assert.equal(composeEventTimeContent({ dayPart: "evening", strength: "avoid" }, "zh"), "推荐活动时不要晚上的");
  assert.equal(appliesLabel(["event.recommend"], "zh"), "推荐活动时");
  assert.equal(appliesLabel(["all"], "zh"), "所有回答");
  assert.equal(appliesLabel([], "zh"), "还没归类");
  assert.equal(kindLabel("constraint", "zh"), "一直遵守的");
  assert.equal(kindLabel("preference", "zh"), "酌情参考的");
  assert.equal(kindLabel("goal", "zh"), "酌情参考的");
});

const MM1 = { appliesTo: ["event.recommend" as const], category: "preference" as const, content: "推荐活动时优先周末上午", memoryId: "MM1", structured: { dayPart: "morning" as const, preferredDays: ["Sat" as const, "Sun" as const], strength: "prefer" as const } };
const MM2 = { appliesTo: ["event.recommend" as const], category: "constraint" as const, content: "不要推荐晚上的活动", memoryId: "MM2", structured: null };
const MM3 = { appliesTo: ["all" as const], category: "constraint" as const, content: "回答用日语", memoryId: "MM3", structured: null };

test("which saved entry the words point at", () => {
  const ids = (words: string, entries = [MM1, MM2, MM3]) => entriesPointedAt(words, entries).map((entry) => entry.memoryId);
  assert.deepEqual(ids("忘掉我的活动时段偏好。"), ["MM1"]);
  assert.deepEqual(ids("还是算了，忘掉我的活动时段偏好。", [MM1]), ["MM1"]);
  assert.deepEqual(ids("Forget my event time preference."), ["MM1"]);
  assert.deepEqual(ids("别再记着不要推荐晚上的活动那条了"), ["MM2"]);
  assert.deepEqual(ids("忘掉「回答用日语」"), ["MM3"]);
  assert.deepEqual(ids("忘掉回答语言那条规矩"), ["MM3"]);
  // Nothing saved: nothing is pointed at.
  assert.deepEqual(ids("忘掉我的活动时段偏好。", []), []);
  // Words that name nothing saved point at nothing (never a guess).
  assert.deepEqual(ids("忘掉我说的那件事"), []);
  assert.deepEqual(ids("把你记着的全部忘掉").sort(), ["MM1", "MM2", "MM3"]);
});
