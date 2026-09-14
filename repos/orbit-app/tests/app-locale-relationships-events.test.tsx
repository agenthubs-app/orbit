import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createTranslator, type MessageKey } from "../src/i18n/messages";
import { contactDetailToSummary, contactSearchFilterSections, contactsSearchToView, contactsToSummaries } from "../src/view-models/contacts";
import { relationshipSearchToView } from "../src/view-models/relationship-search";
import { eventRegistrationToView } from "../src/view-models/event-registration";

const targetScreens = [
  "src/screens/contacts/ContactsScreen.tsx",
  "src/screens/contacts/ContactDetailScreen.tsx",
  "src/screens/contacts/RelationshipInvitationScreen.tsx",
  "src/screens/contacts/BusinessCardIngestScreen.tsx",
  "src/screens/events/EventsScreen.tsx",
  "src/screens/events/EventDetailScreen.tsx",
  "src/screens/events/EventRegistrationScreen.tsx",
] as const;

function translate(language: "en" | "ja" | "zh", key: string): string {
  return createTranslator(language)(key as MessageKey);
}

test("relationship, business-card, and event chrome exists in all three dictionaries", () => {
  const expected = {
    zh: ["人脉", "接受邀请并建立关系对话", "复核名片", "活动", "提交报名"],
    ja: ["つながり", "招待を承認して会話を始める", "名刺を確認", "イベント", "参加を申し込む"],
    en: ["People", "Accept invitation and start conversation", "Review business card", "Events", "Submit registration"],
  } as const;
  const keys = [
    "contacts.title",
    "invitation.accept",
    "businessCard.review",
    "events.title",
    "registration.submit",
  ];

  for (const language of ["zh", "ja", "en"] as const) {
    assert.deepEqual(keys.map(key => translate(language, key)), expected[language]);
  }
});

test("0014 route screens consume locale context instead of a fixed-language screen", async () => {
  for (const path of targetScreens) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, /useOrbitLocale/u, path);
  }
});

test("names, organizations, OCR text, answers, and stable ids remain literal", () => {
  const values = [
    "さくら / Hoshino Labs",
    "林悦 / 星野工作室",
    "OCR: Kenji Tanaka, Climate Foundry",
    "My answer stays exactly as typed.",
    "contact:stable-0014",
  ];
  for (const language of ["zh", "ja", "en"] as const) {
    const t = createTranslator(language);
    assert.deepEqual(values.map(value => t.literal(value)), values);
  }
});

test("contact summaries localize product status without translating business fields", () => {
  const data = { contacts: [{
    id: "contact:stable-0014",
    displayName: "さくら",
    organization: "株式会社星野",
    role: "Community Lead",
    profileSnippet: "Met at the climate dinner / 気候ディナーで知り合った",
    nextAction: "Ask about the storage pilot next week.",
    status: "needs_follow_up",
    value: { score: 82, valueTypes: ["business_opportunity"] },
  }] };
  const japanese = contactsToSummaries(data, "ja")[0]!;
  assert.equal(japanese.name, "さくら");
  assert.equal(japanese.organization, "株式会社星野");
  assert.equal(japanese.role, "Community Lead");
  assert.equal(japanese.relationship, "Met at the climate dinner / 気候ディナーで知り合った");
  assert.equal(japanese.nextAction, "Ask about the storage pilot next week.");
  assert.equal(japanese.status, "要フォロー");
  assert.deepEqual(japanese.valueLabels, ["ビジネス機会"]);

  const english = contactDetailToSummary({ contact: data.contacts[0] }, "en");
  assert.equal(english.organization, "株式会社星野");
  assert.equal(english.role, "Community Lead");
  assert.equal(english.relationship, "Met at the climate dinner / 気候ディナーで知り合った");
  assert.equal(english.status, "Follow up");
});

test("contact detail actions and fields are available in all three languages", () => {
  const expected = {
    zh: ["编辑资料", "取消", "保存", "起草消息", "基本资料", "互动记录", "重新计算"],
    ja: ["プロフィールを編集", "キャンセル", "保存", "メッセージを下書き", "基本情報", "やり取りの記録", "再計算"],
    en: ["Edit details", "Cancel", "Save", "Draft message", "Basic details", "Interaction history", "Recalculate"],
  } as const;
  const keys = [
    "contacts.edit",
    "common.cancel",
    "common.save",
    "contacts.draftMessage",
    "contacts.basicDetails",
    "contacts.interactionHistory",
    "contacts.recalculate",
  ];

  for (const language of ["zh", "ja", "en"] as const) {
    assert.deepEqual(keys.map(key => translate(language, key)), expected[language]);
  }
});

test("every contact workflow chrome message is defined for each supported language", () => {
  const requiredKeys = [
    "contacts.saving", "contacts.editUnavailable", "contacts.saved", "contacts.saveUnconfirmed",
    "contacts.retryDetail", "contacts.valueInsufficient", "contacts.valueRecomputed", "contacts.valueError",
    "contacts.signInForAi", "contacts.fullDetails", "contacts.fullDetailsDetail", "contacts.chatChecking",
    "contacts.chatUnavailable", "contacts.chatEligibility", "contacts.statusConfirmed", "contacts.statusConflict",
    "contacts.statusExpired", "contacts.statusForbidden", "contacts.statusPending", "contacts.statusRevoked",
    "contacts.statusUnregistered", "contacts.openChat", "contacts.createInvitation", "contacts.viewSchedule",
    "contacts.writeNote", "contacts.identity", "contacts.aboutCollaboration", "contacts.noIntroduction",
    "contacts.offering", "contacts.seeking", "contacts.notRecorded", "contacts.latestActivity",
    "contacts.noInteractions", "contacts.relationshipBackground", "contacts.nextStep", "contacts.publicTopics",
    "contacts.publicTopicsDetail", "contacts.relationshipValue", "contacts.sourceRecords", "contacts.moreRecords",
    "contacts.avatarFor", "contacts.readOnlyIdentity", "contacts.followUpStatus", "contacts.tags",
    "contacts.removeTag", "contacts.addTag", "contacts.inputNewTag", "contacts.addThisTag",
    "contacts.add", "contacts.interactionOnlyUpdatesLatest", "contacts.time", "contacts.channel",
    "contacts.summary", "contacts.interactionTimePlaceholder", "contacts.interactionSummaryPlaceholder",
    "contacts.channelManualNote", "contacts.channelEventNote", "contacts.channelEmail", "contacts.channelCalendar",
    "contacts.channelReferral", "contacts.selectSecondaryIndustry", "contacts.secondaryIndustryMissing",
    "contacts.setSecondaryIndustry", "contacts.selectPrimaryIndustry", "contacts.clearPrimaryIndustry",
    "contacts.setPrimaryIndustry", "contacts.sourceEvidenceExists", "contacts.valueReading",
    "contacts.valueReadingBody", "contacts.unavailable", "contacts.valueUnavailableBody", "contacts.calculating",
    "contacts.relationshipSummary", "contacts.relationshipLocation", "contacts.recommendedSearches",
    "contacts.listFilterCount", "contacts.tapSearchAgain", "contacts.emptyFilteredBody", "contacts.emptyListBody",
    "contacts.see", "contacts.analysisDetail", "contacts.contactCount", "contacts.overviewDetail",
    "contacts.seeNext", "contacts.progressDetail", "contacts.startAdding", "contacts.addDetail",
    "contacts.addPeople", "contacts.listBack",
    "contacts.intentWarmIntro", "contacts.intentPartnership", "contacts.intentEventFollowUp",
    "contacts.intentCustomerReference", "contacts.suggestedSearches", "contacts.name", "contacts.addMethod",
    "contacts.value", "contacts.keyword", "contacts.source", "contacts.status", "contacts.noFilters",
    "contacts.searchEmpty", "contacts.searchNext", "contacts.searchNone", "contacts.matchCount",
    "contacts.connectionSearchResults", "contacts.noSuitablePeople", "contacts.clearOrRephrase",
    "contacts.question", "contacts.relatedCount", "contacts.reviewBackground", "contacts.industryClimate",
    "contacts.industryEnterpriseSaas", "contacts.industryFintech", "contacts.industryHealthcare",
    "contacts.industryMobility", "contacts.statusWaiting", "contacts.scoreHigh", "contacts.scoreMedium",
    "contacts.scoreLow", "contacts.scoreMatched", "contacts.suggestionsEmpty", "contacts.suggestionsNext",
    "contacts.suggestionsUseDirect", "contacts.suggestionsCount",
    "contacts.filterNamed", "contacts.selectedCount", "contacts.searchUnconfirmed",
    "contacts.relationshipSearchUnconfirmed",
  ];

  for (const language of ["zh", "ja", "en"] as const) {
    for (const key of requiredKeys) {
      const value = translate(language, key);
      assert.equal(typeof value, "string", `${language}:${key}`);
      assert.ok(value.trim(), `${language}:${key}`);
    }
  }
});

test("contact and relationship search localize product chrome while preserving literal queries and records", () => {
  const searchData = {
    query: "Pilot / 実証",
    appliedFilters: { query: "Pilot / 実証", statusFilters: ["needs_follow_up"] },
    contacts: [{
      id: "contact:search-0014",
      displayName: "林悦 / Hayashi",
      organization: "星野工作室",
      role: "Product Lead",
      relationshipContext: "Met during Demo Day / デモデイ",
      nextAction: "Send the original deck.",
      status: "needs_follow_up",
      value: { score: 71, valueTypes: [] },
    }],
    availableFilters: {
      sources: [{ value: "manual", label: "手动记录", count: 1, selected: false }],
      tags: [], values: [], statuses: [],
    },
  };
  const english = contactsSearchToView(searchData, "en");
  assert.equal(english.title, "Deep search");
  assert.match(english.filtersLabel, /Keyword: Pilot \/ 実証/u);
  assert.match(english.filtersLabel, /Status: Follow up/u);
  assert.equal(english.results[0]?.name, "林悦 / Hayashi");
  assert.equal(english.results[0]?.detail, "星野工作室 · Product Lead · Follow up");
  assert.equal(english.results[0]?.relationship, "Met during Demo Day / デモデイ");

  const japaneseSections = contactSearchFilterSections(searchData, {}, "ja");
  assert.equal(japaneseSections[0]?.title, "追加方法");
  assert.equal(japaneseSections[0]?.options[0]?.label, "手動メモ");

  const relationship = relationshipSearchToView({
    state: "empty",
    query: "Partner / パートナー",
    appliedFilters: { businessIntent: null, industries: [], sources: [], valueTypes: [], followUpStatuses: [] },
    results: [],
  }, "en");
  assert.equal(relationship.title, "Connection search results");
  assert.equal(relationship.queryLabel, "Question: Partner / パートナー");
  assert.equal(relationship.emptyText, "No suitable people found. Try another phrasing or clear the filters.");
});

test("registration state localizes while server questions and saved answers remain literal", () => {
  const payload = {
    eligibility: {
      allowedActions: ["update", "cancel"],
      applicationVersion: null,
      evaluatedAt: "2026-09-15T01:00:00.000Z",
      reason: "registered",
      registrationVersion: "2026-09-13T00:00:00Z",
      state: "registered",
    },
    registration: {
      status: "rsvped",
      participantProfile: { answers: { targetAttendees: "日本の産業パートナー / Climate founders" } },
    },
    questionSet: {
      questionSetHash: "a".repeat(64),
      questionSetVersion: 1,
      questions: [{ id: "target", participantProfileField: "targetAttendees", prompt: "Who would you like to meet?", options: [], required: true }],
    },
  };

  const japanese = eventRegistrationToView(payload, "ja");
  assert.equal(japanese.statusLabel, "登録済み");
  assert.equal(japanese.confirmLabel, "登録情報を更新");
  assert.equal(japanese.cancelLabel, "参加登録をキャンセル");
  assert.equal(japanese.questions[0]?.prompt, "Who would you like to meet?");
  assert.equal(japanese.questions[0]?.answer, "日本の産業パートナー / Climate founders");

  const english = eventRegistrationToView(payload, "en");
  assert.equal(english.statusLabel, "Registered");
  assert.equal(english.confirmLabel, "Update registration");
  assert.equal(english.cancelLabel, "Cancel registration");
  assert.equal(english.questions[0]?.answer, "日本の産業パートナー / Climate founders");
});
