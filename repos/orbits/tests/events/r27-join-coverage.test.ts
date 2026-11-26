/** 2026-11-26：参加者の確認画面と主催者の参加者一覧が同じ完整度を出す（shared/domain/join-coverage）。 */
import assert from "node:assert/strict";
import test from "node:test";

import { profileScore } from "../../features/events/host/live";
import { joinCoverage, joinCoverageSqlParams, joinFilledItems } from "../../shared/domain/join-coverage";
import { profileFromAnswers } from "../../features/events/journey/join";

const response = (field: string) => ({ answer: { displayText: "x" }, field });

test("one calculation: an item counts when the interview answered it or an organizer question that fills it was answered", () => {
  // 確認画面：会いたい人・提供・目的を訪談で、話題を主催者の lib-topic で答えた人 = 100。
  const answers = [["targetAttendees", "x"], ["valueOffered", "x"], ["desiredOutcome", "x"], ["host:lib-topic", "AI"]].map(([field, answer]) => ({ answer: answer!, field: field!, prompt: "?", questionToken: "t" }));
  assert.equal(profileFromAnswers(answers, { review: false }).coverage, 100);
  // 主催者側の同じ人：以前は訪談だけ数えて 86 だった。
  const payload = { interviewResponses: ["targetAttendees", "valueOffered", "desiredOutcome"].map(response) };
  assert.equal(profileScore(payload), 86, "without the organizer answers the topic is missing (the old number)");
  assert.equal(profileScore(payload, { "lib-topic": "AI" }), 100);
  assert.equal(profileScore(payload, { "lib-topic": "  " }), 86, "an empty answer does not count");
  assert.equal(profileScore(payload, { "lib-role": "投資家" }), 86, "a question that fills no item does not count");
  assert.equal(profileScore({ interviewResponses: ["targetAttendees", "valueOffered"].map(response) }, { "lib-purpose": "x" }), 86);
  assert.equal(profileScore({ interviewResponses: ["targetAttendees", "valueOffered"].map(response) }), 72);
  assert.equal(joinCoverage(joinFilledItems({ fields: [] })), 44);
  const params = joinCoverageSqlParams();
  assert.equal(params.hostItems["lib-topic"], "topics");
  assert.equal(params.weights.company + params.weights.offer * 4, 100);
});
