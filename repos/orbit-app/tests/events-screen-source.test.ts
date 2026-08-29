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
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.publicEvents/u);
  assert.match(screenSource, /useOrbitAuthSession/u);
  assert.match(screenSource, /showRecommendations \? \(/u);
  assert.match(screenSource, /AuthenticatedEventValueRecommendations/u);
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
  assert.match(screenSource, /为你推荐/u);
  assert.match(screenSource, /"记下推荐"/u);
  assert.match(screenSource, /"去报名"/u);
});

test("signed-in users can open the event operations center", () => {
  assert.match(screenSource, /signedIn/u);
  assert.match(screenSource, /\/events\/center/u);
  assert.match(screenSource, /运营中心/u);
});

test("events screen presents a compact image-backed activity stream", () => {
  assert.match(screenSource, /function CompactEventList/u);
  assert.match(screenSource, /function CompactEventRow/u);
  assert.match(screenSource, /styles\.eventList/u);
  assert.match(screenSource, /styles\.eventRow/u);
  assert.match(screenSource, /styles\.eventRowImageFrame/u);
  assert.match(screenSource, /styles\.eventRowContent/u);
  assert.match(screenSource, /styles\.eventRowDate/u);
  assert.match(screenSource, /styles\.eventRowTitle/u);
  assert.match(screenSource, /styles\.eventRowLocation/u);
  assert.match(screenSource, /styles\.eventRowStatus/u);
  assert.match(screenSource, /publicEventStatus\(event\.status\)/u);
  assert.match(screenSource, /publicEventSubtitle\(event\.subtitle\)/u);
  assert.match(screenSource, /numberOfLines=\{2\} style=\{styles\.eventRowTitle\}/u);
  assert.match(
    screenSource,
    /eventRowImageFrame:\s*\{[^}]*height:\s*84[^}]*width:\s*112/su
  );
  assert.doesNotMatch(screenSource, /height:\s*300/u);
  assert.doesNotMatch(screenSource, /function EventImageCard/u);
  assert.doesNotMatch(screenSource, /function EventImageList/u);

  const listIndex = screenSource.indexOf("<CompactEventList");
  const recommendationsIndex = screenSource.indexOf(
    "<AuthenticatedEventValueRecommendations"
  );

  assert.ok(listIndex > -1);
  assert.ok(recommendationsIndex > -1);
  assert.ok(recommendationsIndex < listIndex);
});

test("events screen uses compact composable discovery controls", () => {
  assert.match(screenSource, /TextInput/u);
  assert.match(screenSource, /ScrollView/u);
  assert.match(screenSource, /filterEventSummaries/u);
  assert.match(screenSource, /eventDiscoveryFilterCounts/u);
  assert.match(screenSource, /discoveryTopicsForEvent/u);
  assert.match(screenSource, /eventDiscoveryLocations/u);
  assert.match(screenSource, /inferredEventTopic/u);
  assert.match(screenSource, /locationFilter,\s*setLocationFilter/u);
  assert.match(screenSource, /function EventDiscoveryControls/u);
  assert.match(screenSource, /query,\s*setQuery/u);
  assert.match(screenSource, /statusFilter,\s*setStatusFilter/u);
  assert.match(screenSource, /topicFilter,\s*setTopicFilter/u);
  assert.match(screenSource, /useState<EventDiscoveryStatusFilter>\("upcoming"\)/u);
  assert.match(screenSource, /placeholder="搜索活动、地点或主题"/u);
  assert.match(screenSource, /全部/u);
  assert.match(screenSource, /即将/u);
  assert.match(screenSource, /进行中/u);
  assert.match(screenSource, /历史/u);
  assert.match(screenSource, /horizontal/u);
  assert.match(screenSource, /showsHorizontalScrollIndicator=\{false\}/u);
  assert.match(screenSource, /events=\{visibleEvents\}/u);
  assert.match(screenSource, /没有匹配的活动/u);

  const controlsIndex = screenSource.indexOf("<EventDiscoveryControls");
  const listIndex = screenSource.indexOf("<CompactEventList");

  assert.ok(controlsIndex > -1);
  assert.ok(listIndex > -1);
  assert.ok(controlsIndex < listIndex);
});

test("events screen progressively reveals a dense event list", () => {
  assert.match(screenSource, /const eventPageSize = 8/u);
  assert.match(screenSource, /visibleEventCount/u);
  assert.match(screenSource, /filteredEvents\.slice\(0, visibleEventCount\)/u);
  assert.match(screenSource, /查看更多活动/u);
  assert.match(screenSource, /收起活动/u);
});

test("event discovery filters expose their selected state to VoiceOver", () => {
  const controlsStart = screenSource.indexOf("function EventDiscoveryControls");
  const controlsEnd = screenSource.indexOf("function CompactEventList");
  const controlsSource = screenSource.slice(controlsStart, controlsEnd);

  assert.match(screenSource, /accessibilityState=\{\{ selected \}\}/u);
  assert.match(screenSource, /discoveryChip:\s*\{[^}]*minHeight:\s*44/su);
});

test("event discovery cleans implementation labels only on this screen", () => {
  assert.match(screenSource, /function publicEventStatus/u);
  assert.match(screenSource, /normalized === "imported"/u);
  assert.match(screenSource, /return "可报名"/u);
  assert.match(screenSource, /function publicEventSubtitle/u);
  assert.match(screenSource, /Organizer/u);
});

test("events screen renders recommendations as a horizontal image collection", () => {
  assert.match(screenSource, /function eventSummaryById/u);
  assert.match(
    screenSource,
    /<EventValueRecommendationsModule[\s\S]*baseUrl=\{baseUrl\}[\s\S]*events=\{events\}/u
  );
  assert.match(screenSource, /events: EventSummary\[\]/u);
  assert.match(screenSource, /const eventById = eventSummaryById\(events\)/u);
  assert.match(screenSource, /recommendationCoverPath/u);
  assert.match(screenSource, /function EventRecommendationRail/u);
  assert.match(screenSource, /function EventRecommendationCard/u);
  assert.match(
    screenSource,
    /<ScrollView[\s\S]*horizontal[\s\S]*showsHorizontalScrollIndicator=\{false\}/u
  );
  assert.match(screenSource, /coverPath\?: string/u);
  assert.match(screenSource, /styles\.recommendationCoverFrame/u);
  assert.match(screenSource, /styles\.recommendationCoverImage/u);
  assert.match(
    screenSource,
    /source=\{\{ uri: assetUrl\(baseUrl, coverPath\) \}\}/u
  );
  assert.match(screenSource, /styles\.recommendationCoverOverlay/u);
  assert.match(screenSource, /recommendationCard:\s*\{[^}]*width:\s*280/su);
});
