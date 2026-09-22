import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

// 运营台 任务 3：概览屏（设计 115–164 行）— 四张大数卡 / 五阶段推导 / 当前设置 / 需要处理 / 动作门禁 / 空态。

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const MATCH_HREF = `/app/events/${encodeURIComponent(EVENT.id)}/operations?tab=match`;
const PEOPLE_HREF = `/app/events/${encodeURIComponent(EVENT.id)}/operations/admission`;

function withNow<T>(iso: string, run: () => Promise<T>): Promise<T> {
  const original = Date.now;
  Date.now = () => Date.parse(iso);
  return run().finally(() => {
    Date.now = original;
  });
}

test("overview SSR renders the console head, the 更多 menu and the configuration fold before any data arrives", () => {
  const html = renderToStaticMarkup(<OpsConsole canManageRoles event={EVENT} tab="ops" />);
  assert.match(html, /<h1 class="op-h1">屏级替换夹具活动 · 运营台<\/h1>/u);
  assert.match(html, /aria-current="page" class="op-tab op-tab-on" href="[^"]+\/operations" role="tab">概览</u);
  assert.match(html, /<summary aria-expanded="false" aria-haspopup="menu" class="btn op-btn-ghost op-head-more-summary" data-ops-more="true">更多 ⌄<\/summary>/u);
  assert.match(html, new RegExp(`<a class="op-menu-item" href="${BASE.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}/export" role="menuitem">导出 CSV</a>`, "u"));
  assert.match(html, /<a class="op-menu-item" href="[^"]+\/operations\?drawer=roles" role="menuitem" data-event-roles-entry="true">管理角色<\/a>/u);
  assert.doesNotMatch(renderToStaticMarkup(<OpsConsole event={EVENT} tab="ops" />), /管理角色/u);
  // 配置折叠区（含时间闸门 + 高级引擎参数）在工作区加载前就存在；设计区块等数据
  assert.match(html, /TIME GATES &amp; SHARD POLICY/u);
  assert.match(html, /高级引擎参数（一般无需调整）/u);
  assert.doesNotMatch(html, /class="op-stats"/u);
  for (const source of ["ops-console.tsx", "ops-overview.tsx", "ops-match.tsx", "ops-operations-shared.tsx"]) {
    const file = readFileSync(join(projectRoot, "app/(app)/app/events/ops-0918", source), "utf8");
    // 设计 mock（Tokyo AI Meetup / 86 / 64 / 张明 / 25 分钟 / 86 \/ 120）不得出现在 JSX（数字只查 JSX 文本位，注释里的设计行号除外）
    assert.doesNotMatch(file, /Tokyo AI Meetup|张明|李青|田中惠子|>\s*(86|64|12|18)\s*<|25 分钟|86 \/ 120/u, source);
  }
});

test("overview shows four real stat cards, config rows, the registration-open pipeline and the 需要处理 list", async () => {
  await withNow("2026-09-22T00:00:00.000Z", () =>
    withConsole("ops", workspace(), async (renderer) => {
      const stat = (key: string) => renderer.root.find((node) => node.props["data-ops-stat"] === key).children.join("");
      assert.equal(stat("signup"), "3");
      assert.equal(stat("eligible"), "2", "可参与匹配 = profileCompleteness !== minimal");
      assert.equal(stat("checked"), "1");
      assert.equal(stat("result"), "未发布");
      const steps = renderer.root.findAll((node) => node.props["data-ops-step"] !== undefined).map((node) => node.props["data-ops-step"]);
      assert.deepEqual(steps, ["now", "todo", "todo", "todo", "todo"]);
      const body = text(renderer);
      assert.match(body, /报名中当前阶段/u);
      assert.match(body, /活动现场10月1日/u);
      assert.match(body, /每桌人数4/u);
      assert.match(body, /交流轮数2/u);
      assert.match(body, /每人推荐数5/u);
      assert.match(body, /已报名3/u);
      assert.match(body, /1 位参会者资料不完整/u);
      assert.equal(linksNamed(renderer, "查看详情 →")[0].props.href, PEOPLE_HREF);
      assert.equal(linksNamed(renderer, "查看分组结果 →")[0].props.href, MATCH_HREF);
      assert.match(body, /尚未生成匹配/u);
      assert.equal(buttonsNamed(renderer, "生成匹配").length, 1, "no generation yet → 生成匹配");
      assert.equal(buttonsNamed(renderer, "前往发布 →").length, 0);
      // 去生成 → 打开同一个确认框
      await act(async () => {
        buttonNamed(renderer, "去生成 →").props.onClick();
        await flush();
      });
      assert.equal(renderer.root.findAll((node) => node.props["data-generation-start-confirm"] !== undefined).length, 1);
      await act(async () => {
        buttonNamed(renderer, "取消").props.onClick();
        await flush();
      });
      assert.equal(renderer.root.findAll((node) => node.props["data-generation-start-confirm"] !== undefined).length, 0);
    }),
  );
});

test("completed-but-unpublished: 待发布, 等待检查分组 is current, 前往发布 → publishes the newest generation", async () => {
  const posts: string[] = [];
  await withNow("2026-09-30T13:00:00.000Z", () =>
    withConsole("ops", workspace({ generations: [generation("completed", "gen:done")] }), async (renderer, harness) => {
      assert.equal(renderer.root.find((node) => node.props["data-ops-stat"] === "result").children.join(""), "待发布");
      const steps = renderer.root.findAll((node) => node.props["data-ops-step"] !== undefined).map((node) => node.props["data-ops-step"]);
      assert.deepEqual(steps, ["done", "done", "now", "todo", "todo"]);
      assert.match(text(renderer), /已生成匹配9月21日/u);
      assert.match(text(renderer), /匹配结果尚未发布/u);
      assert.equal(buttonsNamed(renderer, "重新生成").length, 1);
      await act(async () => {
        buttonNamed(renderer, "前往发布 →").props.onClick();
        await flush();
      });
      assert.deepEqual(posts, [`${BASE}/generations/${encodeURIComponent("gen:done")}/publish`]);
      assert.equal(harness.observed.filter((call) => call.method === "GET").length, 2, "publish reloads the workspace");
      assert.match(text(renderer), /整份生成结果已通过一次原子指针更新发布/u);
    }, {
      respond: (call) => {
        if (call.method !== "POST") return null;
        posts.push(call.url);
        return Response.json({ data: { ok: true }, success: true });
      },
    }),
  );
});

test("published: 已发布 chip, 已发布 step done, no publish item, and an empty 需要处理 when every profile is complete", async () => {
  await withNow("2026-09-30T13:00:00.000Z", () =>
    withConsole(
      "ops",
      workspace({
        generations: [generation("published")],
        participants: [participant("p:a", "Alice"), participant("p:b", "Bob")],
        publishedResult: publishedResult(),
      }),
      (renderer) => {
        assert.equal(renderer.root.find((node) => node.props["data-ops-stat"] === "result").children.join(""), "已发布");
        const steps = renderer.root.findAll((node) => node.props["data-ops-step"] !== undefined).map((node) => node.props["data-ops-step"]);
        assert.deepEqual(steps, ["done", "done", "done", "done", "now"]);
        const body = text(renderer);
        assert.match(body, /已发布9月21日/u);
        assert.doesNotMatch(body, /未发布/u);
        assert.match(body, /暂无需要处理的事项/u);
        assert.equal(buttonsNamed(renderer, "前往发布 →").length, 0);
        assert.equal(buttonsNamed(renderer, "去生成 →").length, 0);
      },
    ),
  );
});

test("published: a minimal profile already inside the published directory no longer counts as 资料不完整; 可参与匹配 keeps its rule; the 到场 directory moved to the check-in screen", async () => {
  await withNow("2026-09-30T13:00:00.000Z", () =>
    withConsole("ops", workspace({ generations: [generation("published")], publishedResult: publishedResult() }), (renderer) => {
      const body = text(renderer);
      assert.doesNotMatch(body, /位参会者资料不完整/u, "Cai (minimal) sits in publishedResult.directory");
      assert.match(body, /暂无需要处理的事项/u);
      assert.equal(renderer.root.find((node) => node.props["data-ops-stat"] === "eligible").children.join(""), "2");
      assert.doesNotMatch(body, /REAL REGISTRATION DIRECTORY|参会者与到场状态/u);
      assert.equal(buttonsNamed(renderer, "标记到场").length, 0);
      assert.match(body, /CONSENT AUDIT/u, "the other extra cards stay");
      assert.match(body, /VENUE CHECK-IN ENTRY/u);
    }),
  );
});

test("an active generation disables 重新生成 and reports 匹配正在生成中", async () => {
  await withConsole("ops", workspace({ generations: [generation("running")] }), (renderer) => {
    const button = buttonNamed(renderer, "生成进行中…");
    assert.equal(button.props.disabled, true);
    assert.match(text(renderer), /匹配正在生成中/u);
    assert.equal(buttonsNamed(renderer, "前往发布 →").length, 0);
  });
});

// 任务 7 评审遗留 4：hook 的 publishedMatchStatus 与 ops-model matchResultLabel / publishableGeneration 同一谓词（最新生成）
test("[running, completed] (newest first): 匹配结果 reads the newest generation → 未发布, no 前往发布, 匹配正在生成中", async () => {
  await withConsole("ops", workspace({ generations: [generation("running", "gen:0000000000000002"), generation("completed")] }), (renderer) => {
    assert.equal(renderer.root.find((node) => node.props["data-ops-stat"] === "result").children.join(""), "未发布");
    assert.equal(buttonsNamed(renderer, "前往发布 →").length, 0);
    assert.match(text(renderer), /匹配正在生成中/u);
    assert.equal(buttonNamed(renderer, "生成进行中…").props.disabled, true);
  });
});

test("编辑配置 opens the configuration fold instead of leaving the screen", async () => {
  await withConsole("ops", workspace(), async (renderer) => {
    const fold = renderer.root.find((node) => node.type === "details" && node.props.id === "ops-configuration");
    assert.equal(fold.props.open, false);
    const edit = linksNamed(renderer, "编辑配置")[0];
    assert.equal(edit.props.href, "#ops-configuration");
    await act(async () => {
      edit.props.onClick();
      await flush();
    });
    assert.equal(renderer.root.find((node) => node.type === "details" && node.props.id === "ops-configuration").props.open, true);
    assert.match(text(renderer), /CONFIGURED TIMELINE · LIVE STATUS/u);
    assert.equal(renderer.root.findAllByType("input").filter((node) => node.props.readOnly === true).length, 2);
  });
});

test("load failure keeps the configuration fold and shows the alert without design cards", async () => {
  const harnessFail = { error: { message: "Event operations access required" }, success: false };
  await withConsole("ops", workspace(), (renderer) => {
    assert.equal(renderer.root.find((node) => node.props.role === "alert").children.join(""), "Event operations access required");
    assert.equal(renderer.root.findAll((node) => node.props["data-ops-stat"] !== undefined).length, 0);
    assert.equal(renderer.root.findAll((node) => node.props["data-ops-steps"] !== undefined).length, 0);
    assert.match(text(renderer), /运营配置/u);
  }, { respond: () => Response.json(harnessFail, { status: 401 }) });
});
