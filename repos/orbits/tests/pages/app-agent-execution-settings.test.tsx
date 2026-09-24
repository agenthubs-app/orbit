/**
 * Agent 执行、通知与外部连接设置区测试。
 *
 * 设置读取并持久化到 Agent preferences；外部连接使用独立 OAuth 授权。
 * （原「全部安排」账本页用例随该路由退役删除，账本现由 /app/agent/actions 承载。）
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OrbitAgentExecutionSettings } from "../../app/(app)/app/settings/orbit-agent-execution-settings";

test("the settings block renders the three designed controls", () => {
  const html = renderToStaticMarkup(<OrbitAgentExecutionSettings />);

  assert.ok(html.includes("Agent 执行与通知"));
  assert.ok(html.includes("安全执行与外部连接"));
  assert.ok(html.includes("自动准备会面笔记"));
  assert.ok(html.includes("活动后推送跟进提醒"));
  assert.ok(html.includes("安静时段"));
  assert.ok(html.includes("通知时区"));
  assert.ok(html.includes("Asia/Tokyo"));
  assert.ok(html.includes("22:00"));
  assert.ok(html.includes("08:00"));
});

test("the settings block exposes a persistent save action", () => {
  const html = renderToStaticMarkup(<OrbitAgentExecutionSettings />);

  assert.ok(html.includes("保存设置"));
  assert.ok(!html.includes("尚未保存"));
});

test("calendar writes are an explicit fourth toggle and default off", () => {
  const html = renderToStaticMarkup(<OrbitAgentExecutionSettings />);
  const checkboxes = html.match(/type="checkbox"/g) ?? [];

  assert.equal(checkboxes.length, 4);
  assert.equal((html.match(/checked=""/g) ?? []).length, 3);
  assert.ok(html.includes("允许逐次确认后写入外部日历"));
  assert.ok(html.includes("运行状态"));
  assert.ok(html.includes("刷新运行状态"));
});
