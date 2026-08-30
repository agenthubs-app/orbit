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
  assert.match(screenSource, /TextInput/u);
  assert.match(screenSource, /buildContactDetailNoteRequest/u);
  assert.match(screenSource, /noteDraft/u);
  assert.match(screenSource, /saveNote/u);
  assert.match(screenSource, /client\.patch<unknown>/u);
  assert.match(screenSource, /body: request\.request\.body/u);
  assert.match(screenSource, /title="添加记录"/u);
  assert.match(screenSource, /placeholder="记下刚聊到的事、承诺或下次要带的资料"/u);
});

test("contact detail screen can update tags and last interaction metadata", () => {
  assert.match(screenSource, /buildContactDetailMetadataRequest/u);
  assert.match(screenSource, /metadataDraft/u);
  assert.match(screenSource, /saveMetadata/u);
  assert.match(screenSource, /onChangeMetadataDraft/u);
  assert.match(screenSource, /title="编辑标签和互动"/u);
  assert.match(screenSource, /channel: "手动记录"/u);
  assert.match(screenSource, /placeholder="AI, 关西渠道, 待联系"/u);
  assert.match(screenSource, /placeholder="今天下午或 2026-07-24 09:30"/u);
  assert.match(screenSource, /placeholder="微信、邮件、活动现场"/u);
  assert.match(screenSource, /placeholder="刚确认了什么，下一步卡在哪里"/u);
  assert.doesNotMatch(
    screenSource,
    /topic:storage-pilots|priority:warm-follow-up|manual_note|2026-07-24T09:30:00\.000Z/u
  );
  assert.match(screenSource, /body: request\.request\.body/u);
});

test("contact detail screen exposes a reviewed archive action", () => {
  assert.match(screenSource, /contact\.archiveAction/u);
  assert.match(screenSource, /archiveButton/u);
  assert.match(screenSource, /archiveButtonText/u);
  assert.match(screenSource, /name="archive-outline"/u);
  assert.match(screenSource, /onStatusAction\(contact\.archiveAction!\)/u);
});

test("contact detail screen reads and renders relationship value analysis", () => {
  assert.match(screenSource, /relationshipValueAnalysisPath/u);
  assert.match(screenSource, /relationshipValueRecomputePath/u);
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.connections/u);
  assert.match(screenSource, /relationshipConnectionIdForContact/u);
  assert.match(screenSource, /relationshipValueToView/u);
  assert.match(screenSource, /relationshipValueState/u);
  assert.match(screenSource, /RelationshipValueCard/u);
  assert.match(screenSource, /title="关系价值"/u);
});

test("contact detail screen can recompute relationship value without external actions", () => {
  assert.match(screenSource, /recomputeRelationshipValue/u);
  assert.match(screenSource, /relationshipValueOverride/u);
  assert.match(screenSource, /client\.post<unknown>\(\s*relationshipValueRecomputePath\(\)/u);
  assert.match(screenSource, /body: \{\s*connectionId/u);
  assert.match(screenSource, /onRecompute=\{recomputeRelationshipValue\}/u);
  assert.match(screenSource, /重新计算/u);
  assert.match(screenSource, /未创建任务，也没有发送消息/u);
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
  assert.match(screenSource, /const statusCardDetail/u);
  assert.match(screenSource, /title="当前状态"/u);
  assert.doesNotMatch(
    screenSource,
    /<DataCard detail=\{contact\.location\} title="当前状态">/u
  );
});

test("contact detail screen prioritizes identity, next step, and relationship context", () => {
  assert.match(screenSource, /title="联系人详情"/u);
  assert.doesNotMatch(screenSource, /eyebrow="联系人详情"/u);
  assert.match(screenSource, /ContactIdentityHeader/u);
  assert.match(screenSource, /NextStepCard/u);
  assert.match(screenSource, /ContactOverview/u);
  assert.match(screenSource, /numberOfLines=\{3\}/u);

  const identityIndex = screenSource.indexOf("<ContactIdentityHeader");
  const nextStepIndex = screenSource.indexOf("<NextStepCard");
  const overviewIndex = screenSource.indexOf("<ContactOverview");

  assert.ok(identityIndex >= 0);
  assert.ok(nextStepIndex > identityIndex);
  assert.ok(overviewIndex > nextStepIndex);
});

test("contact detail screen structures exchange value and recent activity as compact rows", () => {
  assert.match(screenSource, /title="合作切入点"/u);
  assert.match(screenSource, /label="对方在找"/u);
  assert.match(screenSource, /label="对方能提供"/u);
  assert.match(screenSource, /relationshipExchangeFor/u);
  assert.match(screenSource, /LatestActivityPreview/u);
  assert.match(
    screenSource,
    /const hasInteraction = contact\.lastInteractionAt !== "暂无记录"/u
  );
  assert.match(
    screenSource,
    /const latest = hasInteraction \? contact\.noteSummaries\[0\] : undefined/u
  );
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
  assert.match(screenSource, /目前处于\$\{contact\.status\}/u);
  assert.doesNotMatch(latestActivitySource, /contact\.sourceLabel/u);
});

test("contact detail screen progressively discloses full data and editing controls", () => {
  assert.match(screenSource, /useState\(false\)/u);
  assert.match(screenSource, /title="完整资料"/u);
  assert.match(screenSource, /title="更新联系人"/u);
  assert.match(screenSource, /DisclosureSection/u);
  assert.match(screenSource, /accessibilityState=\{\{ expanded \}\}/u);
  assert.match(screenSource, /name=\{expanded \? "chevron-up" : "chevron-down"\}/u);
});

test("contact detail edits one fixed primary industry separately from custom tags", () => {
  assert.match(screenSource, /INDUSTRY_CATALOG/u);
  assert.match(screenSource, /primaryIndustryId/u);
  assert.match(screenSource, /主要行业/u);
  assert.match(screenSource, /自定义标签/u);
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
