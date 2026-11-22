import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { loadAreaFiles } from "./lib/cases";

/**
 * Hotfix 2026-11-20 part 2 (the owner on the live site): three of the four questions the App suggests on its home screen
 * gave a wrong answer, and none of them was in the test set. Every fixed question the App or the Web offers the user to send
 * to the Agent must be the message of at least one visible eval case. This test reads the questions from the products'
 * own copy, so a new or reworded suggestion without a case fails here.
 *
 * Not sent to the Agent, so not counted: the App's 「帮我规划新目标」 (ai.planPrompt opens the goal flow, AiScreen.sendMessage),
 * and the older Web view-model's three `suggests` (IOrbit2026 passes its own suggestions to the chat) — both checked below.
 */

const ORBITS = path.resolve(__dirname, "../..");
const APP = path.resolve(ORBITS, "../orbit-app/src");
const LANGUAGES = ["zh", "ja", "en"] as const;

function appStrings(file: string, keys: RegExp): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  for (const language of LANGUAGES) {
    const source = fs.readFileSync(path.join(APP, "i18n", language, file), "utf8");
    for (const match of source.matchAll(/"([\w.]+)":\s*"((?:[^"\\]|\\.)*)"/gu)) if (keys.test(match[1])) out.push({ key: `app ${language} ${match[1]}`, text: match[2] });
  }
  return out;
}

function webSuggestions(): { key: string; text: string }[] {
  const source = fs.readFileSync(path.join(ORBITS, "app/(app)/app/orbit-2026/copy/iorbit.ts"), "utf8");
  const out: { key: string; text: string }[] = [];
  for (const line of source.split("\n")) {
    const name = line.match(/^\s*(suggestion\w+Query):/u)?.[1];
    if (!name) continue;
    for (const language of LANGUAGES) {
      const text = line.match(new RegExp(`\\b${language}:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "u"))?.[1];
      if (text) out.push({ key: `web ${language} ${name}`, text });
    }
  }
  return out;
}

export function suggestedQuestions(): { key: string; text: string }[] {
  return [...appStrings("todayVm.ts", /^todayVm\.question/u), ...appStrings("ai.ts", /^ai\.discussionPrompt$/u), ...webSuggestions()];
}

test("the suggested questions are found in the products' copy (4 App home questions, the App's discussion prompt and 4 Web suggestions, in zh, ja and en)", () => {
  const questions = suggestedQuestions();
  assert.equal(questions.filter((item) => item.key.startsWith("app") && item.key.includes("todayVm.question")).length, 12);
  assert.equal(questions.filter((item) => item.key.includes("ai.discussionPrompt")).length, 3);
  assert.equal(questions.filter((item) => item.key.startsWith("web")).length, 12);
});

test("every suggested question is the message of at least one eval case", () => {
  const sent = new Set(loadAreaFiles().flatMap((file) => file.cases).flatMap((testCase) => testCase.steps.flatMap((step) => (step && typeof step === "object" && typeof step.user === "string" ? [step.user.trim()] : []))));
  const missing = suggestedQuestions().filter((item) => !sent.has(item.text.trim()));
  assert.deepEqual(missing, [], `suggested questions with no eval case: ${missing.map((item) => `${item.key} 「${item.text}」`).join("; ")}`);
});

test("what is left out is still not sent to the Agent", () => {
  const screen = fs.readFileSync(path.join(APP, "screens/ai/AiScreen.tsx"), "utf8");
  assert.match(screen, /messageOverride === locale\.t\("ai\.planPrompt"\)\) \{ router\.push\(planNewGoalHref/u, "ai.planPrompt opens the goal flow");
  const web = fs.readFileSync(path.join(ORBITS, "app/(app)/app/agent/iorbit-2026/IOrbit2026.tsx"), "utf8");
  assert.match(web, /suggests: suggestions, agentV1/u, "the live Web page gives the chat its own suggestions (copy/iorbit.ts)");
});
