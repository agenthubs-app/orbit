import assert from "node:assert/strict";
import test from "node:test";

import { createTranslator } from "../src/i18n/messages";
import { accountAuthToView } from "../src/view-models/account-auth";
import { accountSessionToView } from "../src/view-models/account-session";
import {
  homeDateView,
  homeRecommendedEventsToView,
  homeScheduleToView,
  homeTasksToView,
} from "../src/view-models/home-dashboard";

test("account and auth chrome changes language without rewriting identity or goals", () => {
  const data = {
    account: { displayName: "星野 / Hoshino", plan: "live-relationship-os", role: "operator", workspaceName: "東京の仲間" },
    profile: { relationshipGoal: "Meet 林悦 and Alex" },
    session: { status: "signed-in" },
    user: { displayName: "さくら", timezone: "Asia/Tokyo" },
  };
  const en = accountSessionToView(data, { authenticated: true, authUser: null, t: createTranslator("en") });
  const ja = accountSessionToView(data, { authenticated: true, authUser: null, t: createTranslator("ja") });
  assert.equal(en.displayName, "さくら");
  assert.equal(ja.displayName, "さくら");
  assert.equal(en.goal, "Meet 林悦 and Alex");
  assert.equal(ja.goal, "Meet 林悦 and Alex");
  assert.equal(en.statusLabel, "Signed in");
  assert.equal(ja.statusLabel, "ログイン済み");

  assert.equal(accountAuthToView("login", { t: createTranslator("en") }).title, "Welcome back");
  assert.equal(accountAuthToView("login", { t: createTranslator("ja") }).fields[0]?.label, "メールアドレス");
});

test("home locale changes labels but never changes date keys or source content", () => {
  const now = new Date("2026-09-15T03:00:00.000Z");
  const zhDate = homeDateView(now, "2026-09-15", "Asia/Tokyo", "zh");
  const enDate = homeDateView(now, "2026-09-15", "Asia/Tokyo", "en");
  const jaDate = homeDateView(now, "2026-09-15", "Asia/Tokyo", "ja");
  assert.equal(zhDate.selectedDateKey, enDate.selectedDateKey);
  assert.equal(jaDate.selectedDateKey, enDate.selectedDateKey);
  assert.notEqual(zhDate.weekdayLabel, enDate.weekdayLabel);
  assert.notEqual(jaDate.weekdayLabel, enDate.weekdayLabel);
  assert.deepEqual(zhDate.week.map(day => day.dateKey), enDate.week.map(day => day.dateKey));

  const schedule = {
    scheduleItems: [{
      id: "meeting:1",
      kind: "meeting",
      location: "東京 / Tokyo",
      sourceId: "meeting:1",
      startsAt: "2026-09-15T04:00:00.000Z",
      endsAt: "2026-09-15T05:30:00.000Z",
      state: "upcoming",
      title: "林悦 × Alex",
    }],
  };
  const zhSchedule = homeScheduleToView(schedule, "2026-09-15", now, "Asia/Tokyo", "zh")!;
  const enSchedule = homeScheduleToView(schedule, "2026-09-15", now, "Asia/Tokyo", "en")!;
  assert.equal(zhSchedule[0]?.title, enSchedule[0]?.title);
  assert.equal(zhSchedule[0]?.detail.includes("90 分钟"), true);
  assert.equal(enSchedule[0]?.detail.includes("90 min"), true);

  const recommendations = {
    state: "success",
    recommendations: [{
      eventId: "event:1",
      title: "生成AIではない交流会",
      startsAt: "2026-09-20T04:00:00.000Z",
      location: "渋谷",
      venue: "Hikarie",
      valueScore: 90,
      scoreBand: "high",
      signals: [],
      recommendedAction: "参加",
    }],
  };
  const jaEvents = homeRecommendedEventsToView(recommendations, "Asia/Tokyo", "ja")!;
  assert.equal(jaEvents[0]?.title, "生成AIではない交流会");
  assert.equal(jaEvents[0]?.locationLabel, "渋谷 · Hikarie");

  const tasks = { tasks: [{
    id: "task:1",
    title: "Follow up with 林悦",
    category: "relationship",
    status: "open",
    priority: "normal",
    plannedDate: "2026-09-15",
    location: "東京 / Tokyo",
  }] };
  const zhTasks = homeTasksToView(tasks, "2026-09-15", now, "Asia/Tokyo", "zh")!;
  const enTasks = homeTasksToView(tasks, "2026-09-15", now, "Asia/Tokyo", "en")!;
  const jaTasks = homeTasksToView(tasks, "2026-09-15", now, "Asia/Tokyo", "ja")!;
  assert.equal(enTasks[0]?.categoryLabel, "Relationship");
  assert.equal(jaTasks[0]?.dueLabel, "今日");
  assert.equal(zhTasks[0]?.title, enTasks[0]?.title);
  assert.equal(enTasks[0]?.location, "東京 / Tokyo");
});
