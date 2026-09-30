import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "schedule", "ScheduleScreen.tsx"),
  "utf8"
);
// Sprint 0115: the calendar's data comes from a source hook — the device mirror
// on native, the mirror or (when the browser has none) these network reads on web.
const webSource = readFileSync(join(repoRoot, "src", "screens", "schedule", "schedule-calendar-source.web.ts"), "utf8");
const nativeSource = readFileSync(join(repoRoot, "src", "screens", "schedule", "schedule-calendar-source.ts"), "utf8");

test("schedule screen reads its calendar from the source hook; native reads only the device mirror", () => {
  assert.match(screenSource, /useScheduleCalendarSource\(\)/u);
  assert.doesNotMatch(screenSource, /useApiResource/u);
  assert.doesNotMatch(nativeSource, /useApiResource|ORBIT_API_ENDPOINTS/u);
  for (const kind of ["task", "personal_schedule", "registered_event"]) assert.match(nativeSource, new RegExp(`kind: "${kind}"`, "u"));
});

test("the browser fallback reads the same public event collection as event discovery", () => {
  assert.match(webSource, /ORBIT_API_ENDPOINTS\.publicEvents/u);
  assert.match(webSource, /ORBIT_API_ENDPOINTS\.scheduleItems/u);
  assert.doesNotMatch(webSource, /ORBIT_API_ENDPOINTS\.events\b/u);
  assert.match(webSource, /enabled: !mirrorActive/u);
});

test("schedule screen uses one title and a calendar-first hierarchy", () => {
  assert.match(screenSource, /title=\{locale\.t\("schedule\.title"\)\}/u);
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
    /accessibilityLabel=\{`\$\{item\.title\}，\$\{item\.timeLabel \|\| locale\.t\("schedule\.timePending"\)\}，\$\{item\.actionLabel\}`\}/u
  );
  assert.match(moduleSource, /accessibilityHint=\{locale\.t\("schedule\.openDetail"\)\}/u);
});

test("schedule screen offers working day, week, and month view controls", () => {
  assert.match(screenSource, /type ScheduleViewMode = "day" \| "week" \| "month"/u);
  assert.match(screenSource, /setViewMode/u);
  assert.match(screenSource, /label: locale\.t\("schedule\.viewDay"\)/u);
  assert.match(screenSource, /label: locale\.t\("schedule\.viewWeek"\)/u);
  assert.match(screenSource, /label: locale\.t\("schedule\.viewMonth"\)/u);
  assert.match(screenSource, /function ScheduleWeekAgenda/u);
  assert.match(screenSource, /function ScheduleMonthGrid/u);
});

test("schedule calendar marks Japanese holidays and weekends without replacing event colors", () => {
  assert.match(
    screenSource,
    /weekdayReferenceKeys\.map\(\(dateKey, index\) =>/u
  );
  assert.match(screenSource, /localizedWeekday\(dateKey, locale\.language, true\)/u);
  assert.match(screenSource, /const mondayOffset = -\(\(firstDate\.getUTCDay\(\) \+ 6\) % 7\)/u);
  assert.match(screenSource, /index === 5 \? styles\.saturdayText/u);
  assert.match(screenSource, /index === 6 \? styles\.holidayText/u);
  assert.match(screenSource, /japanCalendarDateInfo/u);
  assert.match(screenSource, /day\.isSaturday/u);
  assert.match(screenSource, /day\.isSunday \|\| day\.isHoliday/u);
  assert.match(screenSource, /selectedHolidayName/u);
  assert.match(screenSource, /badgeLabel=\{view\.selectedHolidayName\}/u);
  assert.match(screenSource, /styles\.saturdayText/u);
  assert.match(screenSource, /styles\.holidayText/u);
});

test("schedule screen can render partial timeline data while one source is pending", () => {
  assert.match(screenSource, /const hasAnyData = \[tasksPart, eventsPart, itemsPart\]\.some\(\(part\) => part\.kind === "ready"\)/u);
  assert.match(screenSource, /tasks: tasksPart\.kind === "ready" \? tasksPart\.data : \{ tasks: \[\] \}/u);
  assert.match(screenSource, /events: eventsPart\.kind === "ready" \? eventsPart\.data : \{ events: \[\] \}/u);
});

test("schedule preview reads four bounded task cards instead of the full task collection", () => {
  assert.match(webSource, /\/api\/tasks\/page\?status=open&scope=all&limit=4/u);
  assert.match(webSource, /taskPageSchema/u);
  assert.doesNotMatch(webSource, /ORBIT_API_ENDPOINTS\.tasks\b/u);
  assert.match(readFileSync(join(repoRoot, "src", "screens", "schedule", "schedule-calendar-source-mirror.ts"), "utf8"), /CALENDAR_TASK_LIMIT = 4/u);
});
