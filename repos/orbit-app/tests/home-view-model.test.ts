import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { filterEventSummaries } from "../src/view-models/events";
import { homeEventsToView, type HomeEventFilter } from "../src/view-models/home";
import { scheduleToTimelineView } from "../src/view-models/schedule";

const eventsPayload = {
  events: [
    {
      id: "event_live",
      location: "东京",
      startsAt: "2026-08-04T10:00:00.000+09:00",
      status: "active",
      title: "AI 企业落地早餐会"
    },
    {
      id: "event_next",
      location: "大阪",
      startsAt: "2026-08-10T10:00:00.000+09:00",
      status: "scheduled",
      title: "关西跨境商务交流会"
    },
    {
      id: "event_done",
      location: "京都",
      startsAt: "2026-07-10T10:00:00.000+09:00",
      status: "ended",
      title: "创业者复盘会"
    }
  ]
};

test("home events view derives event state from status and schedule timestamps", () => {
  const view = homeEventsToView({
    events: eventsPayload,
    now: new Date("2026-07-24T00:00:00.000+09:00")
  });

  assert.deepEqual(
    view.map((event) => [event.id, event.state]),
    [
      ["event_live", "active"],
      ["event_next", "upcoming"],
      ["event_done", "ended"]
    ]
  );
  assert.equal(view[0]?.detailLine, "8月4日 周二 10:00 · 东京");
});

test("the mounted HomeScreen is the events page and has no profile or contacts source", () => {
  const source = readFileSync(
    new URL("../src/screens/home/HomeScreen.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /export function HomeScreen\(\)/u);
  assert.match(
    source,
    /useApiResource<unknown>\(\s*ORBIT_API_ENDPOINTS\.publicEvents/u
  );
  assert.doesNotMatch(source, /ORBIT_API_ENDPOINTS\.(?:profile|contacts)/u);
  assert.doesNotMatch(source, /HomeHub|homeToView|HomeProfilePanel|PipelineRail/u);
});

test("home events route renders events as an image-first list", () => {
  const source = readFileSync(
    new URL("../src/screens/home/HomeScreen.tsx", import.meta.url),
    "utf8"
  );
  const contentStart = source.indexOf("function HomeEventsContent");
  const imageListStart = source.indexOf("function EventImageList");
  const contentSource = source.slice(contentStart, imageListStart);

  assert.ok(contentStart > -1);
  assert.ok(imageListStart > contentStart);
  assert.match(source, /filterEventSummaries/u);
  assert.match(source, /eventDiscoveryFilterCounts/u);
  assert.match(source, /eventDiscoveryTopics/u);
  assert.match(source, /function HomeEventDiscoveryControls/u);
  assert.match(
    source,
    /const homeEventFilterOrder: HomeEventFilter\[\] = \[\s*"all",\s*"upcoming",\s*"active",\s*"ended"\s*\]/su
  );
  assert.match(source, /eventQuery,\s*setEventQuery/u);
  assert.match(source, /eventTopicFilter,\s*setEventTopicFilter/u);
  assert.match(source, /placeholder="搜索活动、地点或主题"/u);
  assert.match(source, /function EventImageList/u);
  assert.match(source, /function EventImageCard/u);
  assert.match(source, /styles\.homeEventImageList/u);
  assert.match(source, /styles\.homeEventImageCard/u);
  assert.match(source, /styles\.homeEventImageFrame/u);
  assert.match(source, /styles\.homeEventImageContent/u);
  assert.match(source, /styles\.homeEventImageTopRow/u);
  assert.match(source, /styles\.homeEventImageBottom/u);
  assert.match(source, /styles\.homeEventImageDateChip/u);
  assert.match(source, /styles\.homeEventImageStatusPill/u);
  assert.match(source, /styles\.homeEventImageTitle/u);
  assert.match(source, /styles\.homeEventImageMetaRow/u);
  assert.match(source, /event\.participantCountLabel/u);
  assert.match(source, /event\.actionLabel/u);
  assert.doesNotMatch(source, /homeEventImageFrame:\s*\{[^}]*padding:/su);
  assert.doesNotMatch(source, /function EventModuleList/u);
  assert.doesNotMatch(source, /function EventModuleCard/u);
  assert.doesNotMatch(source, /styles\.homeEventModuleCoverFrame/u);
  assert.doesNotMatch(source, /styles\.homeEventImageBody/u);
  assert.doesNotMatch(source, /styles\.homeEventImageTopicRow/u);

  const coverIndex = source.indexOf("style={styles.homeEventImageFrame}");
  const titleIndex = source.indexOf("style={styles.homeEventImageTitle}");
  const ctaIndex = source.indexOf("style={styles.homeEventImageCta}");
  const coverCloseIndex = source.indexOf("</ImageBackground>", coverIndex);

  assert.ok(titleIndex > -1);
  assert.ok(coverIndex > -1);
  assert.ok(coverIndex < titleIndex);
  assert.ok(titleIndex < coverCloseIndex);
  assert.ok(ctaIndex > titleIndex);
  assert.ok(ctaIndex < coverCloseIndex);
  assert.match(contentSource, /<EventImageList/u);
  assert.match(contentSource, /events=\{filteredEvents\}/u);
  assert.ok(
    contentSource.indexOf("<EventImageList") <
      contentSource.indexOf("<HomeEventDiscoveryControls"),
    "home events should open with image modules before discovery controls"
  );
  assert.doesNotMatch(contentSource, /homeEventFilterBlock/u);
  assert.doesNotMatch(contentSource, /title="活动状态"/u);
  assert.doesNotMatch(contentSource, /<EventRow/u);
});

test("home and schedule consume the same canonical public event count", () => {
  const source = readFileSync(
    new URL("../src/screens/home/HomeScreen.tsx", import.meta.url),
    "utf8"
  );
  assert.match(
    source,
    /const eventsState = useApiResource<unknown>\(\s*ORBIT_API_ENDPOINTS\.publicEvents/u
  );

  const events = {
    events: [{
      id: "event:registration",
      participantCount: 0,
      startsAt: "2026-09-17T10:00:00+09:00",
      status: "imported",
      title: "准入活动"
    }]
  };
  const home = homeEventsToView({
    events,
    now: new Date("2026-09-15T00:00:00+09:00")
  });
  const schedule = scheduleToTimelineView({
    events,
    now: new Date("2026-09-15T00:00:00+09:00"),
    tasks: { tasks: [] }
  });
  assert.equal(home[0]?.participantCountLabel, "0 人已报名");
  assert.equal(
    schedule.eventHighlights[0]?.participantCountLabel,
    home[0]?.participantCountLabel
  );
});

test("home event cards keep time and location labels readable", () => {
  const source = readFileSync(
    new URL("../src/screens/home/HomeScreen.tsx", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /homeEventImageMetaRow:\s*\{[^}]*gap:\s*spacing\.xs/su
  );
  assert.doesNotMatch(
    source,
    /homeEventImageMetaRow:\s*\{[^}]*flexDirection:\s*"row"/su
  );
  assert.match(
    source,
    /homeEventImageMetaLine:\s*\{[^}]*maxWidth:\s*"100%"/su
  );
  assert.match(
    source,
    /homeEventImageDetail:\s*\{[^}]*flexShrink:\s*1/su
  );
  assert.doesNotMatch(source, /homeEventImageDetail:\s*\{[^}]*flex:\s*1/su);
});

test("home event filters use the shared public event filter implementation", () => {
  const events = homeEventsToView({
    events: eventsPayload,
    now: new Date("2026-07-24T00:00:00.000+09:00")
  });
  const idsByFilter = (filter: HomeEventFilter) =>
    filterEventSummaries(events, { status: filter }).map((event) => event.id);

  assert.deepEqual(idsByFilter("all"), ["event_live", "event_next", "event_done"]);
  assert.deepEqual(idsByFilter("active"), ["event_live"]);
  assert.deepEqual(idsByFilter("upcoming"), ["event_next"]);
  assert.deepEqual(idsByFilter("ended"), ["event_done"]);
});

test("home event view marks past scheduled events as ended", () => {
  const view = homeEventsToView({
    events: {
      events: [
        {
          endsAt: "2026-06-15T11:00:00.000+09:00",
          id: "event_past_scheduled",
          location: "Osaka",
          startsAt: "2026-06-15T10:00:00.000+09:00",
          status: "scheduled",
          title: "已过去的商务交流会"
        }
      ]
    },
    now: new Date("2026-07-24T00:00:00.000+09:00")
  });

  assert.equal(view[0]?.state, "ended");
});
