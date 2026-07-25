import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "events", "EventsScreen.tsx"),
  "utf8"
);

test("events screen loads global event value recommendations", () => {
  assert.match(screenSource, /useOrbitApiClient/u);
  assert.match(screenSource, /eventValueRecommendationsPath/u);
  assert.match(screenSource, /eventValueRecommendationAcceptPath/u);
  assert.match(screenSource, /eventValueRecommendationAcceptanceToView/u);
  assert.match(screenSource, /eventValueRecommendationsToView/u);
  assert.match(screenSource, /recommendationsState/u);
  assert.match(screenSource, /acceptEventRecommendation/u);
  assert.match(screenSource, /acceptedRecommendation/u);
  assert.match(screenSource, /EventValueRecommendationsModule/u);
  assert.match(screenSource, /EventValueRecommendationAcceptedCard/u);
  assert.match(screenSource, /client\.post<unknown>\(\s*eventValueRecommendationAcceptPath/u);
  assert.match(screenSource, /title="推荐参加"/u);
  assert.match(screenSource, /"接受推荐"/u);
  assert.match(screenSource, /"去报名"/u);
});

test("events screen presents the event home as an image-first list", () => {
  assert.match(screenSource, /function EventImageList/u);
  assert.match(screenSource, /function EventImageCard/u);
  assert.match(screenSource, /styles\.eventImageList/u);
  assert.match(screenSource, /styles\.eventImageCard/u);
  assert.match(screenSource, /styles\.eventImageFrame/u);
  assert.match(screenSource, /styles\.eventImageContent/u);
  assert.match(screenSource, /styles\.eventImageTopRow/u);
  assert.match(screenSource, /styles\.eventImageBottom/u);
  assert.match(screenSource, /styles\.eventImageDateChip/u);
  assert.match(screenSource, /styles\.eventImageStatusPill/u);
  assert.match(screenSource, /styles\.eventImageTitle/u);
  assert.match(screenSource, /styles\.eventImageMetaRow/u);
  assert.match(screenSource, /styles\.eventImageFooter/u);
  assert.match(screenSource, /event\.participantCountLabel/u);
  assert.match(screenSource, /event\.actionLabel/u);
  assert.match(
    screenSource,
    /eventImageFrame:\s*\{[^}]*height:\s*300[^}]*width:\s*"100%"/su
  );
  assert.match(screenSource, /eventImageCard:\s*\{[^}]*overflow:\s*"hidden"/su);
  assert.doesNotMatch(screenSource, /eventImageFrame:\s*\{[^}]*padding:/su);
  assert.match(
    screenSource,
    /eventImageContent:\s*\{[^}]*\.\.\.StyleSheet\.absoluteFill[^}]*padding:\s*spacing\.lg/su
  );
  assert.doesNotMatch(screenSource, /function EventModuleList/u);
  assert.doesNotMatch(screenSource, /function EventModuleCard/u);
  assert.doesNotMatch(screenSource, /styles\.eventModuleCoverFrame/u);
  assert.doesNotMatch(screenSource, /styles\.eventImageBody/u);
  assert.doesNotMatch(screenSource, /styles\.eventImageTopicRow/u);

  const coverIndex = screenSource.indexOf("style={styles.eventImageFrame}");
  const titleIndex = screenSource.indexOf("style={styles.eventImageTitle}");
  const ctaIndex = screenSource.indexOf("style={styles.eventImageCta}");
  const coverCloseIndex = screenSource.indexOf("</ImageBackground>", coverIndex);
  const listIndex = screenSource.indexOf("<EventImageList");
  const recommendationsIndex = screenSource.indexOf(
    "<EventValueRecommendationsModule"
  );

  assert.ok(titleIndex > -1);
  assert.ok(coverIndex > -1);
  assert.ok(coverIndex < titleIndex);
  assert.ok(titleIndex < coverCloseIndex);
  assert.ok(ctaIndex > titleIndex);
  assert.ok(ctaIndex < coverCloseIndex);
  assert.ok(listIndex > -1);
  assert.ok(recommendationsIndex > -1);
  assert.ok(listIndex < recommendationsIndex);
});

test("events screen keeps the image list ahead of discovery controls", () => {
  assert.match(screenSource, /TextInput/u);
  assert.match(screenSource, /filterEventSummaries/u);
  assert.match(screenSource, /eventDiscoveryFilterCounts/u);
  assert.match(screenSource, /eventDiscoveryTopics/u);
  assert.match(screenSource, /function EventDiscoveryControls/u);
  assert.match(screenSource, /query,\s*setQuery/u);
  assert.match(screenSource, /statusFilter,\s*setStatusFilter/u);
  assert.match(screenSource, /topicFilter,\s*setTopicFilter/u);
  assert.match(screenSource, /placeholder="搜索活动、地点或主题"/u);
  assert.match(screenSource, /全部/u);
  assert.match(screenSource, /即将/u);
  assert.match(screenSource, /进行中/u);
  assert.match(screenSource, /历史/u);
  assert.match(screenSource, /events=\{filteredEvents\}/u);
  assert.match(screenSource, /没有匹配的活动/u);

  const controlsIndex = screenSource.indexOf("<EventDiscoveryControls");
  const listIndex = screenSource.indexOf("<EventImageList");

  assert.ok(controlsIndex > -1);
  assert.ok(listIndex > -1);
  assert.ok(listIndex < controlsIndex);
});

test("events image cards keep time and location labels readable", () => {
  assert.match(
    screenSource,
    /eventImageMetaRow:\s*\{[^}]*gap:\s*spacing\.xs/su
  );
  assert.doesNotMatch(
    screenSource,
    /eventImageMetaRow:\s*\{[^}]*flexDirection:\s*"row"/su
  );
  assert.match(
    screenSource,
    /eventImageMetaLine:\s*\{[^}]*maxWidth:\s*"100%"/su
  );
  assert.match(
    screenSource,
    /eventImageDetail:\s*\{[^}]*flexShrink:\s*1/su
  );
  assert.doesNotMatch(screenSource, /eventImageDetail:\s*\{[^}]*flex:\s*1/su);
});

test("events screen renders recommended events as image-backed content modules", () => {
  assert.match(screenSource, /function eventSummaryById/u);
  assert.match(
    screenSource,
    /<EventValueRecommendationsModule[\s\S]*baseUrl=\{baseUrl\}[\s\S]*events=\{events\}/u
  );
  assert.match(screenSource, /events: EventSummary\[\]/u);
  assert.match(screenSource, /const eventById = eventSummaryById\(events\)/u);
  assert.match(screenSource, /recommendationCoverPath/u);
  assert.match(
    screenSource,
    /<EventValueRecommendationRow[\s\S]*baseUrl=\{baseUrl\}[\s\S]*coverPath=\{recommendationCoverPath\}/u
  );
  assert.match(screenSource, /coverPath\?: string/u);
  assert.match(screenSource, /styles\.recommendationCoverFrame/u);
  assert.match(screenSource, /styles\.recommendationCoverImage/u);
  assert.match(
    screenSource,
    /source=\{\{ uri: assetUrl\(baseUrl, coverPath\) \}\}/u
  );
  assert.match(screenSource, /styles\.recommendationCoverOverlay/u);
});
