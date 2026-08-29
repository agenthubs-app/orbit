import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { OrbitNextActions } from "../src/screens/ai/OrbitNextActions";
import type { TodayHomeSummaryView } from "../src/view-models/today-tasks";
import { renderToHtml, renderedText } from "./helpers/render";

const summary: TodayHomeSummaryView = {
  items: [
    {
      context: "活动 · 已逾期",
      href: "/tasks/task%3Aevent-list",
      id: "task:event-list",
      index: 1,
      kind: "task",
      title: "整理活动参会名单",
    },
    {
      context: "14:00 · 会面",
      href: "/schedule",
      id: "schedule:meeting",
      index: 2,
      kind: "schedule",
      title: "与渡边会面",
    },
  ],
  openTaskCount: 1,
  suggestionCount: 2,
};

const callbacks = {
  onOpen: () => undefined,
  onOpenSuggestions: () => undefined,
  onRefresh: () => undefined,
};

test("Orbit next actions render compact task and schedule rows with a separate suggestion link", () => {
  const tree = (
    <OrbitNextActions
      {...callbacks}
      error={null}
      loading={false}
      summary={summary}
    />
  );
  const html = renderToHtml(tree);
  const text = renderedText(tree);

  assert.match(text, /下一步/u);
  assert.match(text, /整理活动参会名单/u);
  assert.match(text, /与渡边会面/u);
  assert.match(text, /2 条待办建议/u);
  assert.match(html, /aria-label="打开日程：与渡边会面"/u);
  assert.doesNotMatch(text, /标记完成|明天提醒|忽略/u);
});

test("Orbit next actions render loading, empty and error states", () => {
  const emptySummary: TodayHomeSummaryView = {
    items: [],
    openTaskCount: 0,
    suggestionCount: 0,
  };
  const loading = renderedText(
    <OrbitNextActions {...callbacks} error={null} loading summary={emptySummary} />
  );
  const empty = renderedText(
    <OrbitNextActions {...callbacks} error={null} loading={false} summary={emptySummary} />
  );
  const failure = renderedText(
    <OrbitNextActions
      {...callbacks}
      error="暂时无法读取下一步。"
      loading={false}
      summary={emptySummary}
    />
  );

  assert.match(loading, /正在核对下一步/u);
  assert.match(empty, /现在没有必须处理的事项/u);
  assert.match(failure, /暂时无法读取下一步。/u);
  assert.match(failure, /重试/u);
});

test("Orbit next actions keep loaded rows visible when a refresh fails", () => {
  const text = renderedText(
    <OrbitNextActions
      {...callbacks}
      error="刷新失败，请重试。"
      loading={false}
      summary={summary}
    />
  );

  assert.match(text, /刷新失败，请重试。/u);
  assert.match(text, /整理活动参会名单/u);
  assert.match(text, /与渡边会面/u);
});
