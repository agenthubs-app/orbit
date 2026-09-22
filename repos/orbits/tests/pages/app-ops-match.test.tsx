import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react-test-renderer";

import { OpsConsole } from "../../app/(app)/app/events/ops-0918/ops-console";
import {
  BASE,
  buttonNamed,
  buttonsNamed,
  EVENT,
  flush,
  generation,
  linksNamed,
  participant,
  publishedResult,
  text,
  withConsole,
  workspace,
} from "../support/ops-console-fixture";

// 运营台 任务 3：匹配与分组屏（设计 166–209 行；`?tab=match`）— 四计数 / 两轮切换 / 桌卡只读已发布分桌 /
// 「已生成 N 人，待发布」空态 / 资料不足提示 / 重新生成 + 发布结果 → 门禁 / 生成列表原样。

const PEOPLE_HREF = `/app/events/${encodeURIComponent(EVENT.id)}/operations/admission`;

function stat(renderer: Parameters<typeof text>[0], key: string): string {
  return renderer.root.find((node) => node.props["data-ops-stat"] === key).children.flatMap((child) => (typeof child === "string" ? [child] : [])).join("").trim();
}

test("match SSR renders the console head with the 匹配与分组 tab active and no design mock", () => {
  const html = renderToStaticMarkup(<OpsConsole event={EVENT} tab="match" />);
  assert.match(html, /<h1 class="op-h1">匹配与分组<\/h1>/u);
  assert.match(html, /aria-current="page" class="op-tab op-tab-on" href="[^"]+\/operations\?tab=match" role="tab">匹配与分组</u);
  assert.match(html, /活动中心<\/a> \/ <a class="op-crumb-link" href="[^"]+">屏级替换夹具活动<\/a> \/ <a class="op-crumb-link" href="[^"]+">运营台<\/a> \/ 匹配与分组/u);
  assert.doesNotMatch(html, /张明|David Kim|AI Lab|Tokyo AI Meetup/u);
  assert.doesNotMatch(html, /class="op-mstats"/u, "counts wait for the workspace");
});

test("published grouping: four real counts, round toggle switches the published tables, cards carry theme / rationale / seat / icebreakers", async () => {
  await withConsole("match", workspace({ generations: [generation("published")], publishedResult: publishedResult() }), async (renderer) => {
    assert.equal(stat(renderer, "participants"), "3");
    assert.equal(stat(renderer, "matched"), "3", "参与匹配 = published directory size");
    assert.equal(stat(renderer, "tables"), "2", "分组桌数 = round one tables");
    assert.equal(stat(renderer, "rounds"), "2");

    const tables = () => renderer.root.findAll((node) => node.props["data-ops-table"] !== undefined).map((node) => node.props["data-ops-table"]);
    assert.deepEqual(tables(), [1, 2]);
    const body = text(renderer);
    assert.match(body, /第 1 轮 · 桌 12 人/u);
    assert.match(body, /话题 1/u);
    assert.match(body, /桌 1 的归因/u);
    assert.match(body, /AliceFounder · Orbit · R1-T1-S1/u);
    assert.match(body, /BobFounder · Orbit · R1-T1-S2/u);
    assert.match(body, /桌级破冰问题（3）/u);
    assert.match(body, /破冰一/u);

    const round2 = buttonNamed(renderer, "第 2 轮");
    assert.equal(round2.props.style.background, "transparent");
    assert.equal(buttonNamed(renderer, "第 1 轮").props.style.background, "#DDDEFA");
    await act(async () => {
      round2.props.onClick();
      await flush();
    });
    assert.deepEqual(tables(), [1]);
    assert.match(text(renderer), /第 2 轮 · 桌 13 人/u);
    assert.match(text(renderer), /第二轮话题/u);
    assert.equal(buttonNamed(renderer, "第 2 轮").props.style.background, "#DDDEFA");
    assert.equal(buttonNamed(renderer, "第 2 轮").props["aria-selected"], true);

    // 资料不足提示（1 位 minimal）→ 参会者屏
    assert.match(text(renderer), /1 位参会者资料不足，暂未进入分组/u);
    assert.equal(linksNamed(renderer, "查看参会者 →")[0].props.href, PEOPLE_HREF);
    // 已发布 → 发布结果 → 不可用；重新生成 可用；生成列表显示已发布
    assert.equal(buttonNamed(renderer, "发布结果 →").props.disabled, true);
    assert.equal(buttonNamed(renderer, "重新生成").props.disabled, false);
    assert.match(text(renderer), /生成 #00000000/u);
    assert.equal(buttonNamed(renderer, "已发布").props.disabled, true);
  });
});

test("completed but unpublished: empty state 已生成 N 人，待发布 and 发布结果 → publishes atomically", async () => {
  const posts: string[] = [];
  await withConsole("match", workspace({ generations: [generation("completed", "gen:done", ["p:a", "p:b", "p:c"])] }), async (renderer, harness) => {
    assert.equal(stat(renderer, "matched"), "3", "参与匹配 = newest completed snapshot size");
    assert.equal(stat(renderer, "tables"), "—");
    assert.equal(renderer.root.findAll((node) => node.props["data-ops-table"] !== undefined).length, 0);
    assert.match(renderer.root.find((node) => node.props["data-ops-tables-empty"] !== undefined).children.join(""), /^已生成 3 人，待发布/u);
    const publish = buttonNamed(renderer, "发布结果 →");
    assert.equal(publish.props.disabled, false);
    await act(async () => {
      publish.props.onClick();
      await flush();
    });
    assert.deepEqual(posts, [`${BASE}/generations/${encodeURIComponent("gen:done")}/publish`]);
    assert.equal(harness.observed.filter((call) => call.method === "GET").length, 2);
    assert.match(text(renderer), /整份生成结果已通过一次原子指针更新发布/u);
  }, {
    respond: (call) => {
      if (call.method !== "POST") return null;
      posts.push(call.url);
      return Response.json({ data: { ok: true }, success: true });
    },
  });
});

test("nothing generated: 尚未生成 empty state, 发布结果 → disabled, 生成匹配 → confirm → POST /generations", async () => {
  const posts: string[] = [];
  const two = workspace({ participants: [participant("p:a", "Alice"), participant("p:b", "Bob")] });
  two.metrics.participantCount = 2;
  await withConsole("match", two, async (renderer) => {
    assert.equal(stat(renderer, "matched"), "—");
    assert.match(text(renderer), /尚未生成匹配结果/u);
    assert.doesNotMatch(text(renderer), /位参会者资料不足/u, "no minimal profiles → banner omitted");
    assert.equal(buttonNamed(renderer, "发布结果 →").props.disabled, true);
    assert.match(text(renderer), /尚未创建任何生成/u);
    await act(async () => {
      buttonNamed(renderer, "生成匹配").props.onClick();
      await flush();
    });
    assert.equal(renderer.root.findAll((node) => node.props["data-generation-start-confirm"] !== undefined).length, 1);
    assert.match(text(renderer), /将为 2 位已报名参会者生成推荐与两轮分桌/u);
    await act(async () => {
      buttonNamed(renderer, "开始生成").props.onClick();
      await flush();
    });
    assert.deepEqual(posts, [`${BASE}/generations`]);
    assert.match(text(renderer), /已开始生成匹配（报名快照 abcdef123456…）/u);
  }, {
    respond: (call) => {
      if (call.method !== "POST") return null;
      posts.push(call.url);
      assert.equal(call.body, "{}");
      return Response.json({ data: generation("queued", "gen:new").generation, success: true });
    },
  });
});

test("an active generation disables both 重新生成 and 发布结果 → and shows the progress marker", async () => {
  await withConsole("match", workspace({ generations: [generation("running")] }), (renderer) => {
    assert.equal(buttonNamed(renderer, "生成进行中…").props.disabled, true);
    assert.equal(buttonNamed(renderer, "发布结果 →").props.disabled, true);
    assert.match(renderer.root.find((node) => node.props["data-ops-tables-empty"] !== undefined).children.join(""), /匹配正在生成中/u);
    assert.equal(renderer.root.findAll((node) => node.props["data-generation-progress"] !== undefined).length, 1);
    assert.equal(buttonsNamed(renderer, "Worker 处理中…").length, 1);
  });
});
