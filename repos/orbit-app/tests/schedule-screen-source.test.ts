import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "schedule", "ScheduleScreen.tsx"),
  "utf8"
);

test("schedule screen reads the same public event collection as event discovery", () => {
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.publicEvents/u);
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.scheduleItems/u);
  assert.doesNotMatch(screenSource, /ORBIT_API_ENDPOINTS\.events\b/u);
});

test("schedule screen uses one title and a calendar-first hierarchy", () => {
  assert.match(screenSource, /title="日程"/u);
  assert.doesNotMatch(screenSource, /eyebrow="关系日程"/u);
  assert.doesNotMatch(screenSource, /title="关系日程"/u);
  assert.match(screenSource, /function ScheduleWeekStrip/u);
  assert.match(screenSource, /function ScheduleTimeGrid/u);
  assert.match(screenSource, /function ScheduleViewSwitcher/u);
  assert.doesNotMatch(screenSource, /function ScheduleEventHighlights/u);
  assert.doesNotMatch(screenSource, /ImageBackground/u);
  assert.doesNotMatch(screenSource, /MetricPill/u);
});

test("schedule time blocks expose a useful VoiceOver action label", () => {
  const moduleStart = screenSource.indexOf("function ScheduleTimeBlock");
  const moduleEnd = screenSource.indexOf("const styles");
  const moduleSource = screenSource.slice(moduleStart, moduleEnd);

  assert.match(
    moduleSource,
    /accessibilityLabel=\{`\$\{item\.title\}，\$\{item\.timeLabel \|\| "时间待定"\}，\$\{item\.actionLabel\}`\}/u
  );
  assert.match(moduleSource, /accessibilityHint="打开日程详情"/u);
});

test("schedule screen offers working day, week, and month view controls", () => {
  assert.match(screenSource, /type ScheduleViewMode = "day" \| "week" \| "month"/u);
  assert.match(screenSource, /setViewMode/u);
  assert.match(screenSource, /label: "日"/u);
  assert.match(screenSource, /label: "周"/u);
  assert.match(screenSource, /label: "月"/u);
  assert.match(screenSource, /function ScheduleWeekAgenda/u);
  assert.match(screenSource, /function ScheduleMonthGrid/u);
});

test("schedule calendar marks Japanese holidays and weekends without replacing event colors", () => {
  assert.match(
    screenSource,
    /const weekdayLabels = \["周日", "周一", "周二", "周三", "周四", "周五", "周六"\]/u
  );
  assert.match(screenSource, /const sundayOffset = -firstDate\.getUTCDay\(\)/u);
  assert.match(screenSource, /index === 6 \? styles\.saturdayText/u);
  assert.match(screenSource, /index === 0 \? styles\.holidayText/u);
  assert.match(screenSource, /japanCalendarDateInfo/u);
  assert.match(screenSource, /day\.isSaturday/u);
  assert.match(screenSource, /day\.isSunday \|\| day\.isHoliday/u);
  assert.match(screenSource, /selectedHolidayName/u);
  assert.match(screenSource, /badgeLabel=\{view\.selectedHolidayName\}/u);
  assert.match(screenSource, /styles\.saturdayText/u);
  assert.match(screenSource, /styles\.holidayText/u);
});

test("schedule screen can render partial timeline data while one source is pending", () => {
  assert.match(
    screenSource,
    /const hasAnyData =\s*usable\(tasksState\) \|\| usable\(eventsState\) \|\| usable\(scheduleItemsState\)/u
  );
  assert.match(
    screenSource,
    /tasks:\s*usable\(tasksState\)\s*\?\s*tasksState\.data\s*:\s*\{\s*tasks:\s*\[\]\s*\}/u
  );
  assert.match(
    screenSource,
    /events:\s*usable\(eventsState\)\s*\?\s*eventsState\.data\s*:\s*\{\s*events:\s*\[\]\s*\}/u
  );
  assert.doesNotMatch(
    screenSource,
    /usable\(tasksState\) && usable\(eventsState\)\s*\?/u
  );
});
