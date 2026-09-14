import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "contacts", "ContactDetailScreen.tsx"),
  "utf8"
);

test("contact detail screen can save a reviewed note through the web PATCH route", () => {
  // Native provider wiring only; browser rendering and save behavior are covered
  // by contact-notes-interactions.test.ts using the production API client.
  assert.match(screenSource, /<ContactNotesSection actorId=\{actorId\} client=\{client\} colors=\{colors\} contactId=\{contactId\} data=\{data\} onRefresh=\{onNotesRefresh\}/u);
  assert.match(screenSource, /scopeKey: scopeKey \?\? actorId/u);
  assert.match(screenSource, /onNotesRefresh=\{state\.refresh\}/u);
});

test("contact detail screen can update tags and last interaction metadata", () => {
  // Provider wiring only. Combined PATCH, no-op, cancellation and acknowledgement
  // behavior run through the real editor in ink-signal-contact-detail.test.ts.
  assert.match(screenSource, /buildContactDetailEditRequest/u);
  assert.match(screenSource, /confirmContactDetailEdit/u);
  assert.match(screenSource, /"互动时间"/u);
  assert.match(screenSource, /"互动摘要"/u);
  assert.match(screenSource, /contacts\.addTag/u);
  assert.match(screenSource, /contacts\.interactionTimePlaceholder/u);
  assert.match(screenSource, /contacts\.interactionSummaryPlaceholder/u);
  assert.doesNotMatch(
    screenSource,
    /topic:storage-pilots|priority:warm-follow-up|2026-07-24T09:30:00\.000Z/u
  );
  assert.match(screenSource, /body: request\.body/u);
});

test("contact detail screen exposes a reviewed archive action", () => {
  assert.match(screenSource, /archived: locale\.t\("contacts\.statusArchived"\)/u);
  assert.match(screenSource, /original\.statusOptions\.map/u);
  assert.match(screenSource, /"保存人脉"/u);
});

test("contact detail screen reads and renders relationship value analysis", () => {
  assert.match(screenSource, /relationshipValueAnalysisPath/u);
  assert.match(screenSource, /relationshipValueRecomputePath/u);
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.connections/u);
  assert.match(screenSource, /relationshipConnectionIdForContact/u);
  assert.match(screenSource, /relationshipValueToView/u);
  assert.match(screenSource, /relationshipValueState/u);
  assert.match(screenSource, /RelationshipValueCard/u);
  assert.match(screenSource, /contacts\.relationshipValue/u);
});

test("contact detail screen can recompute relationship value without external actions", () => {
  assert.match(screenSource, /recomputeRelationshipValue/u);
  assert.match(screenSource, /relationshipValueOverride/u);
  assert.match(screenSource, /client\.post<unknown>\(\s*relationshipValueRecomputePath\(\)/u);
  assert.match(screenSource, /body: \{\s*connectionId/u);
  assert.match(screenSource, /onRecompute=\{recomputeRelationshipValue\}/u);
  assert.match(screenSource, /contacts\.recalculate/u);
  assert.match(screenSource, /contacts\.valueRecomputed/u);
  assert.doesNotMatch(screenSource, /messageDraftPath|ORBIT_API_ENDPOINTS\.messageDrafts/u);
});

test("contact detail screen renders web avatar assets when available", () => {
  assert.match(screenSource, /Image/u);
  assert.match(screenSource, /useOrbitApiBaseUrl/u);
  assert.match(screenSource, /assetUrl/u);
  assert.match(screenSource, /hero\.avatar\.imageUrl/u);
  assert.match(screenSource, /source=\{\{ uri: assetUrl\(baseUrl, hero\.avatar\.imageUrl\) \}\}/u);
  assert.match(screenSource, /styles\.heroAvatarImage/u);
});

test("contact detail status card does not use location as its status subtitle", () => {
  assert.match(screenSource, /contacts\.followUpStatus/u);
  assert.doesNotMatch(
    screenSource,
    /<DataCard detail=\{contact\.location\} title="当前状态">/u
  );
});

test("contact detail screen prioritizes identity, next step, and relationship context", () => {
  assert.match(screenSource, /title=\{currentEdit \? locale\.t\("contacts\.editTitle"\) : locale\.t\("contacts\.detailTitle"\)\}/u);
  assert.doesNotMatch(screenSource, /eyebrow="联系人详情"/u);
  assert.match(screenSource, /ContactIdentityHeader/u);
  assert.match(screenSource, /NextStepCard/u);
  assert.match(screenSource, /ContactOverview/u);
  // Actual long-text layout and visible cooperation data are covered by
  // ink-signal-contact-detail.test.ts; the new open layout does not clamp to 3 lines.

  const identityIndex = screenSource.indexOf("<ContactIdentityHeader");
  const nextStepIndex = screenSource.indexOf("<NextStepCard");
  const overviewIndex = screenSource.indexOf("<ContactOverview");

  assert.ok(identityIndex >= 0);
  assert.ok(nextStepIndex > identityIndex);
  assert.ok(overviewIndex > nextStepIndex);
});

test("contact detail screen structures exchange value and recent activity as compact rows", () => {
  assert.match(screenSource, /contacts\.aboutCollaboration/u);
  assert.match(screenSource, /contacts\.seeking/u);
  assert.match(screenSource, /contacts\.offering/u);
  assert.match(screenSource, /relationshipExchangeFor/u);
  assert.match(screenSource, /LatestActivityPreview/u);
  assert.match(
    screenSource,
    /const hasInteraction = contact\.lastInteractionAt !== locale\.t\("profile\.notFilled"\)/u
  );
  // Nested interaction content and private-note separation are exercised by
  // ink-signal-contact-detail.test.ts against the real rendered detail.
  assert.doesNotMatch(
    screenSource,
    /contact\.noteSummaries\[0\] \?\? contact\.evidenceExcerpts\[0\]/u
  );
  assert.match(screenSource, /numberOfLines=\{2\}/u);
  assert.doesNotMatch(screenSource, /title="公开资料"/u);
  assert.doesNotMatch(screenSource, /title="来源证据"/u);
});

test("contact detail summary does not repeat exchange values or scores", () => {
  const latestActivitySource = screenSource.slice(
    screenSource.indexOf("function LatestActivityPreview"),
    screenSource.indexOf("function DisclosureSection")
  );

  assert.match(screenSource, /relationshipSummaryFor/u);
  assert.match(screenSource, /contacts\.relationshipSummary/u);
  assert.doesNotMatch(latestActivitySource, /contact\.sourceLabel/u);
});

test("contact detail screen progressively discloses full data and editing controls", () => {
  assert.match(screenSource, /useState\(false\)/u);
  assert.match(screenSource, /contacts\.fullDetails/u);
  assert.match(screenSource, /accessibilityLabel=\{locale\.t\("contacts\.edit"\)\}/u);
  assert.match(screenSource, /DisclosureSection/u);
  assert.match(screenSource, /accessibilityState=\{\{ expanded \}\}/u);
  assert.match(screenSource, /name=\{expanded \? "chevron-up" : "chevron-down"\}/u);
});

test("contact detail edits one fixed primary industry separately from custom tags", () => {
  assert.match(screenSource, /INDUSTRY_CATALOG/u);
  assert.match(screenSource, /primaryIndustryId/u);
  assert.match(screenSource, /contacts\.selectPrimaryIndustry/u);
  assert.match(screenSource, /contacts\.addTag/u);
  assert.match(screenSource, /client\.patch<unknown>\(contactDetailPath\(contactId\)/u);
});

test("expanded relationship value stays concise and does not repeat raw evidence", () => {
  assert.match(screenSource, /view\.scoreLabel/u);
  assert.match(screenSource, /view\.priorityLabel/u);
  assert.match(screenSource, /view\.summary/u);
  assert.doesNotMatch(screenSource, /view\.factors\.map/u);
  assert.doesNotMatch(screenSource, /view\.evidenceLines\.map/u);
  assert.doesNotMatch(screenSource, /<Text style=\{styles\.sectionDetail\}>\{view\.nextAction\}<\/Text>/u);
});
