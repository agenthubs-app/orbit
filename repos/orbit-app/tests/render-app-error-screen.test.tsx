import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { AppErrorScreen } from "../src/components/AppErrorBoundary";
import { renderToHtml, renderedText } from "./helpers/render";

// 第一个真渲染测试：组件真的被渲染出来，断言的是渲染结果而不是源码文本。

test("错误屏渲染出中文说明与重试按钮", () => {
  const text = renderedText(
    <AppErrorScreen error={new Error("BOOM")} onRetry={() => undefined} />
  );

  assert.match(text, /这个页面出了点问题/u);
  assert.match(text, /你的数据没有受影响/u);
  assert.match(text, /错误信息/u);
  assert.match(text, /重试/u);
});

test("错误屏把原始异常信息显示在次要位置", () => {
  const text = renderedText(
    <AppErrorScreen
      error={new Error("ORBIT_SOMETHING_BROKE")}
      onRetry={() => undefined}
    />
  );

  assert.match(text, /ORBIT_SOMETHING_BROKE/u);

  // 技术信息不能进标题。
  const html = renderToHtml(
    <AppErrorScreen
      error={new Error("ORBIT_SOMETHING_BROKE")}
      onRetry={() => undefined}
    />
  );
  const titleIndex = html.indexOf("这个页面出了点问题");
  const detailIndex = html.indexOf("ORBIT_SOMETHING_BROKE");

  assert.ok(titleIndex !== -1 && detailIndex !== -1);
  assert.ok(titleIndex < detailIndex);
});

test("没有异常信息时给一句可读的兜底", () => {
  const text = renderedText(
    <AppErrorScreen error={new Error("")} onRetry={() => undefined} />
  );

  assert.match(text, /没有更多信息/u);
});

test("超长异常信息被截断，不会把屏幕撑爆", () => {
  const longMessage = "X".repeat(400);
  const text = renderedText(
    <AppErrorScreen error={new Error(longMessage)} onRetry={() => undefined} />
  );

  assert.ok(text.includes("…"));
  assert.ok(!text.includes("X".repeat(300)));
});

test("重试按钮带无障碍标签与按钮语义", () => {
  const html = renderToHtml(
    <AppErrorScreen error={new Error("BOOM")} onRetry={() => undefined} />
  );

  assert.match(html, /aria-label="重试"/u);
  assert.match(html, /role="button"/u);
});
