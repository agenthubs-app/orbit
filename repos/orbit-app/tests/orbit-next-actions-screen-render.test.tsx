import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { OrbitNextActions } from "../src/screens/ai/OrbitNextActions";
import type { AgentSignalNextActionView } from "../src/view-models/agent-signals";
import { renderToHtml, renderedText } from "./helpers/render";

const active: AgentSignalNextActionView = {
  actions: [
    {
      kind: "navigate",
      label: "查看活动",
      route: "/events/event-1"
    },
    {
      kind: "ask",
      label: "交给 iOrbit",
      prompt: "帮我准备活动"
    }
  ],
  completed: false,
  context: "周五开始，建议提前准备。",
  id: "signal-active",
  index: 1,
  title: "准备关西跨境商务交流会"
};

const completed: AgentSignalNextActionView = {
  actions: [],
  completed: true,
  context: "已完成",
  id: "signal-completed",
  index: 2,
  title: "回复活动主办方"
};

const callbacks = {
  onAction: () => undefined,
  onDismiss: () => undefined,
  onRefresh: () => undefined,
  onSnooze: () => undefined
};

test("Orbit next actions render concise active and completed rows", () => {
  const html = renderToHtml(
    <OrbitNextActions
      {...callbacks}
      actions={[active, completed]}
      error={null}
      loading={false}
      updatingId={null}
    />
  );
  const text = renderedText(
    <OrbitNextActions
      {...callbacks}
      actions={[active, completed]}
      error={null}
      loading={false}
      updatingId={null}
    />
  );

  assert.match(text, /下一步/u);
  assert.match(text, /准备关西跨境商务交流会/u);
  assert.match(text, /周五开始，建议提前准备。/u);
  assert.match(text, /查看活动/u);
  assert.match(text, /交给 iOrbit/u);
  assert.match(text, /回复活动主办方/u);
  assert.match(text, /已完成/u);
  assert.match(html, /aria-label="准备关西跨境商务交流会的更多操作"/u);
});

test("Orbit next actions render loading, empty and error states", () => {
  const loading = renderedText(
    <OrbitNextActions
      {...callbacks}
      actions={[]}
      error={null}
      loading
      updatingId={null}
    />
  );
  const empty = renderedText(
    <OrbitNextActions
      {...callbacks}
      actions={[]}
      error={null}
      loading={false}
      updatingId={null}
    />
  );
  const failure = renderedText(
    <OrbitNextActions
      {...callbacks}
      actions={[]}
      error="暂时无法读取下一步。"
      loading={false}
      updatingId={null}
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
      actions={[active]}
      error="刷新失败，请重试。"
      loading={false}
      updatingId={null}
    />
  );

  assert.match(text, /刷新失败，请重试。/u);
  assert.match(text, /准备关西跨境商务交流会/u);
  assert.match(text, /查看活动/u);
});
