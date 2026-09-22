import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { OpsForm } from "../../app/(app)/app/events/ops-0918/ops-form";
import { exportCsvHref } from "../../app/(app)/app/events/ops-0918/ops-model";
import { OpsConsoleShell } from "../../app/(app)/app/events/ops-0918/ops-shell";
import { buttonNamed, EVENT, EVENT_ID, flush, text } from "../support/ops-console-fixture";

// 运营台 任务 5：报名设置屏（设计 300–367 行；`/operations/experience`）。特征化用例自 tests/pages/event-experience-editor.test.tsx
// （6 例）改指本屏：加载 + 草稿种子 / NOT_FOUND 默认题集 / saveDraft PUT 体 + 重种 / publish CONFLICT → 重读 / save CONFLICT /
// 预览零写入 POST；另加 SSR 结构、行内编辑（✎ / ⌫ / ＋ 添加问题 / 必填）、冻结态、页面门禁源码断言（替代 app-event-experience.test.ts）。

const BASE = `/api/events/${encodeURIComponent(EVENT_ID)}/experience`;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function question(intent: "target_attendees" | "value_offered", prompt: string, required = true) {
  return {
    id: intent,
    intent,
    options: ["A", "B"],
    participantProfileField: intent === "target_attendees" ? "targetAttendees" : "valueOffered",
    prompt,
    required,
  };
}

function configuration(introduction: string | null = "Welcome", track: "v1" | "v2" = "v1") {
  return {
    accentColor: "#123456",
    coverAssetId: null,
    introduction,
    questionSet: {
      questions: [question("target_attendees", "Who?", track === "v1"), question("value_offered", "What?", track === "v1")],
      track,
    },
    templateId: "default",
  };
}

function version(versionNumber: number, hash = `hash-${versionNumber}`, track: "v1" | "v2" = "v1") {
  return {
    configuration: configuration("Welcome", track),
    createdAt: "2026-09-20T00:00:00.000Z",
    createdByActorId: "user:organizer",
    eventId: EVENT_ID,
    hash,
    version: versionNumber,
  };
}

function snapshot(revision: number, options: { draft?: boolean; frozenAt?: string | null; published?: boolean; track?: "v1" | "v2" } = {}) {
  return {
    draft: options.draft === false ? null : version(revision, undefined, options.track),
    head: {
      draftVersion: options.draft === false ? null : revision,
      eventId: EVENT_ID,
      frozenAt: options.frozenAt ?? null,
      publishedAt: options.published ? "2026-09-21T00:00:00.000Z" : null,
      publishedVersion: options.published ? 1 : null,
      revision,
    },
    published: options.published ? version(1, "published-hash", options.track) : null,
  };
}

interface Observed {
  body: string | null;
  method: string;
  url: string;
}

function install(respond: (call: Observed) => Response | Promise<Response>) {
  const originalFetch = globalThis.fetch;
  const observed: Observed[] = [];
  globalThis.fetch = (async (url, init) => {
    const call = { body: typeof init?.body === "string" ? init.body : null, method: init?.method ?? "GET", url: String(url) };
    observed.push(call);
    return respond(call);
  }) as typeof fetch;
  return { observed, restore() { globalThis.fetch = originalFetch; } };
}

async function withForm(
  respond: (call: Observed) => Response | Promise<Response>,
  run: (renderer: ReactTestRenderer, harness: ReturnType<typeof install>) => Promise<void> | void,
): Promise<void> {
  const harness = install(respond);
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(<OpsForm event={EVENT} />);
      await flush();
    });
    await run(renderer!, harness);
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    harness.restore();
  }
}

function rows(renderer: ReactTestRenderer) {
  return renderer.root.findAll((node) => typeof node.props["data-ops-question"] === "string").map((node) => node.props["data-ops-question"] as string);
}

function chip(renderer: ReactTestRenderer) {
  return renderer.root.find((node) => node.props["data-ops-form-status"] !== undefined);
}

function textarea(renderer: ReactTestRenderer) {
  return renderer.root.findAllByType("textarea")[0];
}

function alerts(renderer: ReactTestRenderer) {
  return renderer.root.findAll((node) => node.props.role === "alert");
}

test("form SSR renders the console head with the 报名设置 tab active, the three sections, the real-event preview card and no design mock", () => {
  const html = renderToStaticMarkup(
    <OpsConsoleShell event={EVENT} more={[{ href: exportCsvHref(EVENT.id), label: "导出 CSV" }]} view="form">
      <OpsForm event={EVENT} />
    </OpsConsoleShell>,
  );
  assert.match(html, /<h1 class="op-h1">报名设置<\/h1>/u);
  assert.match(html, /aria-current="page" class="op-tab op-tab-on" href="[^"]+\/operations\/experience" role="tab">报名设置</u);
  assert.match(html, /活动中心<\/a> \/ <a class="op-crumb-link" href="[^"]+">屏级替换夹具活动<\/a> \/ <a class="op-crumb-link" href="[^"]+">运营台<\/a> \/ 报名设置/u);
  assert.match(html, /role="menuitem">导出 CSV/u);
  assert.doesNotMatch(html, /管理角色/u);
  assert.match(html, /class="op-fchip" data-ops-form-status="true" style="background:#E6F1EC;color:#2F6B4F">草稿中</u);
  assert.match(html, /class="op-fchip-saved">◷ 尚未保存</u);
  assert.match(html, /<button class="btn op-fsave"[^>]*>保存草稿<\/button>/u);
  assert.match(html, /<button class="btn op-fpublish"[^>]*>发布报名设置<\/button>/u);
  for (const title of ["报名弹窗说明", "报名问题", "报名弹窗预览"]) assert.match(html, new RegExp(`<strong class="op-sec-title-20">${title}</strong>`, "u"));
  assert.match(html, /这段说明将显示在用户点击「报名」后，位于问题列表的上方。/u);
  assert.match(html, /设置用户报名时需要回答的问题。你可以调整问题顺序、编辑或删除问题。/u);
  assert.match(html, /这是用户实际看到的报名界面效果。/u);
  assert.match(html, /class="op-fcount">0 \/ 1000</u, "counter uses the API limit, not the design mock 200");
  assert.match(html, /<button class="btn op-fadd"[^>]*>＋ 添加问题<\/button>/u);
  assert.match(html, /<button class="btn op-btn-edit"[^>]*>预览（零写入）<\/button>/u, "zero-write preview kept beside the preview title (deviation)");
  assert.match(html, /<strong class="op-fp-title">屏级替换夹具活动<\/strong><span class="op-fp-line">▦ 2026年10月1日（周四）18:00 – 21:00<\/span>/u, "real title + JST date/time");
  assert.doesNotMatch(html, /◎/u, "venue has no source → line omitted");
  assert.match(html, /aria-disabled="true" class="op-fp-submit">提交报名</u);
  assert.match(html, /ⓘ 预览仅用于编辑参考，发布后用户将看到此弹窗。/u);
  assert.match(html, /<details class="op-fold op-fsec" data-ops-advanced="true">/u);
  assert.doesNotMatch(html, /Tokyo AI Meetup|Tokyo Innovation Hub|你当前的身份|你最想交流的话题|补充介绍|0 \/ 500|5 分钟前|校友推荐/u);
  assert.doesNotMatch(html, />单选<|>多选<|>多行文本</u, "type chip omitted (审阅修订 12)");
  assert.match(html, /data-ops-question="target_attendees"[\s\S]*data-ops-question="value_offered"/u, "hook seeds the default V1 two-question set before the snapshot arrives (unchanged hook behaviour)");
});

test("editor loads the snapshot and seeds the form from the draft configuration", async () => {
  await withForm(() => Response.json({ data: snapshot(3, { published: true }), success: true }), (renderer, harness) => {
    assert.deepEqual(harness.observed.map((call) => [call.method, call.url]), [["GET", BASE]]);
    assert.equal(chip(renderer).children.join(""), "草稿中", "draft v3 ahead of published v1");
    assert.match(text(renderer), /◷ 上次保存 \d+ 天前/u, "draft.createdAt relative time");
    assert.deepEqual(rows(renderer), ["target_attendees", "value_offered"]);
    assert.equal(textarea(renderer).props.value, "Welcome");
    assert.match(text(renderer), /7 \/ 1000/u);
    assert.doesNotMatch(text(renderer), /正在读取活动体验/u);
    assert.equal(buttonNamed(renderer, "发布报名设置").props.disabled, false);
    const add = buttonNamed(renderer, "＋ 添加问题");
    assert.equal(add.props.disabled, true, "V1 track cannot add");
    assert.match(text(renderer), /V1 轨道固定两题必答；切到 V2 后可增删。/u);
    const req = renderer.root.findAll((node) => node.props["data-ops-req"] !== undefined);
    assert.deepEqual(req.map((node) => [node.children.join(""), node.props.style.background, node.props.style.color]), [["必填", "#FBECEA", "#B5473A"], ["必填", "#FBECEA", "#B5473A"]]);
    assert.match(text(renderer), /1\. Who\? \*AB2\. What\? \*AB/u, "preview renders the live draft with the required asterisk");
    assert.match(text(renderer), /Welcome/u);
  });
});

test("a NOT_FOUND snapshot falls back to the default v1 two-question configuration without an error", async () => {
  await withForm(() => Response.json({ error: { code: "NOT_FOUND", message: "no experience" }, success: false }, { status: 404 }), (renderer) => {
    assert.equal(alerts(renderer).length, 0);
    assert.equal(chip(renderer).children.join(""), "草稿中");
    assert.match(text(renderer), /◷ 尚未保存/u);
    assert.deepEqual(rows(renderer), ["target_attendees", "value_offered"]);
    assert.equal(buttonNamed(renderer, "发布报名设置").props.disabled, true, "no draft → publish disabled");
    assert.equal(buttonNamed(renderer, "保存草稿").props.disabled, false);
    assert.match(text(renderer), /尚未填写报名说明。/u, "empty introduction placeholder in the preview card");
  });
});

test("save draft PUTs the edited configuration with the current expectedRevision and re-seeds from the response", async () => {
  let put: Observed | null = null;
  await withForm((call) => {
    if (call.method === "PUT") {
      put = call;
      return Response.json({ data: snapshot(4), success: true });
    }
    return Response.json({ data: snapshot(3), success: true });
  }, async (renderer, harness) => {
    await act(async () => {
      textarea(renderer).props.onChange({ target: { value: "Edited intro" } });
      await flush();
    });
    assert.equal(textarea(renderer).props.value, "Edited intro");
    assert.match(text(renderer), /12 \/ 1000/u);
    assert.match(text(renderer), /Edited intro/u, "preview card follows the draft");
    await act(async () => {
      buttonNamed(renderer, "保存草稿").props.onClick();
      await flush();
    });
    assert.ok(put);
    const observedPut = put as Observed;
    assert.equal(observedPut.url, BASE);
    const payload = JSON.parse(observedPut.body ?? "{}") as { configuration: { introduction: string }; expectedRevision: number };
    assert.equal(payload.expectedRevision, 3);
    assert.equal(payload.configuration.introduction, "Edited intro");
    assert.match(text(renderer), /草稿已保存/u);
    assert.equal(textarea(renderer).props.value, "Welcome", "re-seeded from the PUT response");
    assert.deepEqual(harness.observed.map((call) => call.method), ["GET", "PUT"]);
  });
});

test("publish POSTs /publish with expectedRevision; CONFLICT shows the conflict copy, then the reload replaces it", async () => {
  // 既有行为：CONFLICT 文案先出现，随后 load() 成功会 setError(null) 把它清掉。
  let gets = 0;
  let releaseReload!: () => void;
  const reloadGate = new Promise<void>((resolve) => { releaseReload = resolve; });
  await withForm(async (call) => {
    if (call.method === "POST") {
      assert.equal(call.url, `${BASE}/publish`);
      assert.deepEqual(JSON.parse(call.body ?? "{}"), { expectedRevision: 3 });
      return Response.json({ error: { code: "CONFLICT", message: "stale" }, success: false }, { status: 409 });
    }
    gets += 1;
    if (gets > 1) await reloadGate;
    return Response.json({ data: snapshot(gets === 1 ? 3 : 5, gets === 1 ? {} : { published: true }), success: true });
  }, async (renderer) => {
    await act(async () => {
      buttonNamed(renderer, "发布报名设置").props.onClick();
      await flush();
    });
    assert.match(alerts(renderer)[0].children.join(""), /发布冲突、缺少草稿，或活动已冻结/u);
    assert.equal(gets, 2, "CONFLICT reloads the snapshot");
    await act(async () => {
      releaseReload();
      await flush();
    });
    assert.equal(alerts(renderer).length, 0, "successful reload clears the error");
    assert.equal(chip(renderer).children.join(""), "草稿中", "reloaded snapshot: draft v5 ahead of published v1");
  });
});

test("save draft CONFLICT shows the save conflict copy and reloads", async () => {
  let gets = 0;
  let releaseReload!: () => void;
  const reloadGate = new Promise<void>((resolve) => { releaseReload = resolve; });
  await withForm(async (call) => {
    if (call.method === "PUT") {
      return Response.json({ error: { code: "CONFLICT", message: "stale" }, success: false }, { status: 409 });
    }
    gets += 1;
    if (gets > 1) await reloadGate;
    return Response.json({ data: snapshot(3), success: true });
  }, async (renderer) => {
    await act(async () => {
      buttonNamed(renderer, "保存草稿").props.onClick();
      await flush();
    });
    assert.match(text(renderer), /保存冲突或活动已冻结。请重新读取最新版本后再操作。/u);
    assert.equal(gets, 2);
    await act(async () => {
      releaseReload();
      await flush();
    });
    assert.equal(alerts(renderer).length, 0);
  });
});

test("preview POSTs the current configuration to /preview and renders the returned hash under the card without any other write", async () => {
  await withForm((call) => {
    if (call.method === "POST") {
      assert.equal(call.url, `${BASE}/preview`);
      const payload = JSON.parse(call.body ?? "{}") as { configuration: { introduction: string } };
      assert.equal(payload.configuration.introduction, "Welcome");
      return Response.json({ data: { version: { ...version(9, "preview-hash"), configuration: configuration("Preview intro") } }, success: true });
    }
    return Response.json({ data: snapshot(3), success: true });
  }, async (renderer, harness) => {
    assert.equal(renderer.root.findAll((node) => node.props["data-ops-preview-hash"] !== undefined).length, 0);
    await act(async () => {
      buttonNamed(renderer, "预览（零写入）").props.onClick();
      await flush();
    });
    assert.equal(renderer.root.find((node) => node.props["data-ops-preview-hash"] !== undefined).props["data-ops-preview-hash"], "preview-hash");
    assert.match(text(renderer), /preview-hash/u);
    assert.match(text(renderer), /预览已生成/u);
    assert.deepEqual(harness.observed.map((call) => call.method), ["GET", "POST"]);
  });
});

test("✎ expands an inline editor (prompt / options / 必填 on V2); ⌫ removes and ＋ 添加问题 appends on the V2 track", async () => {
  await withForm(() => Response.json({ data: snapshot(3, { track: "v2" }), success: true }), async (renderer) => {
    assert.equal(renderer.root.findAll((node) => node.props["data-ops-editor"] !== undefined).length, 0);
    const edit = renderer.root.find((node) => node.props["data-ops-edit"] === "target_attendees");
    assert.equal(edit.props["aria-expanded"], false);
    await act(async () => {
      edit.props.onClick();
      await flush();
    });
    const editor = renderer.root.find((node) => node.props["data-ops-editor"] === "target_attendees");
    const prompt = editor.find((node) => node.type === "input" && node.props["data-ops-prompt"] !== undefined);
    assert.equal(prompt.props.value, "Who?");
    await act(async () => {
      prompt.props.onChange({ target: { value: "Who do you want to meet?" } });
      await flush();
    });
    assert.match(text(renderer), /Who do you want to meet\?/u);
    const options = renderer.root.find((node) => node.props["data-ops-editor"] === "target_attendees").findAll((node) => node.type === "input" && node.props["data-ops-option"] !== undefined);
    assert.deepEqual(options.map((node) => node.props.value), ["A", "B"]);
    await act(async () => {
      options[1].props.onChange({ target: { value: "Bee" } });
      await flush();
    });
    assert.match(text(renderer), /Bee/u, "option edits flow into the row + preview");
    const required = renderer.root.find((node) => node.type === "input" && node.props["data-ops-required"] === "target_attendees");
    assert.equal(required.props.checked, false, "V2 questions are optional by default");
    await act(async () => {
      required.props.onChange({ target: { checked: true } });
      await flush();
    });
    const req = renderer.root.findAll((node) => node.props["data-ops-req"] !== undefined);
    assert.deepEqual(req.map((node) => node.children.join("")), ["必填", "选填"]);

    const add = buttonNamed(renderer, "＋ 添加问题");
    assert.equal(add.props.disabled, false);
    await act(async () => {
      add.props.onClick();
      await flush();
    });
    assert.deepEqual(rows(renderer), ["target_attendees", "value_offered", "desired_outcome"]);
    await act(async () => {
      renderer.root.find((node) => node.props["data-ops-remove"] === "value_offered").props.onClick();
      await flush();
    });
    assert.deepEqual(rows(renderer), ["target_attendees", "desired_outcome"]);
    assert.equal(renderer.root.findAll((node) => node.props["data-ops-editor"] !== undefined).length, 0, "removing closes the editor");
  });
});

test("a frozen head shows 已冻结, keeps 保存草稿 / 发布 enabled (display-field edits), disables the question controls and explains", async () => {
  await withForm(() => Response.json({ data: snapshot(3, { frozenAt: "2026-01-01T00:00:00.000Z", published: true, track: "v2" }), success: true }), async (renderer) => {
    assert.equal(chip(renderer).children.join(""), "已冻结");
    assert.deepEqual([chip(renderer).props.style.background, chip(renderer).props.style.color], ["#FBF1E4", "#9A6B22"]);
    assert.equal(buttonNamed(renderer, "保存草稿").props.disabled, false, "README: display-only changes may still be drafted after the deadline");
    assert.equal(buttonNamed(renderer, "发布报名设置").props.disabled, false);
    assert.equal(buttonNamed(renderer, "预览（零写入）").props.disabled, false);
    assert.match(text(renderer), /已到画像编辑截止时间；仍可调整展示字段并保存\/发布，但题集轨道、题目和选项必须与当前已发布版本一致。/u);
    assert.equal(buttonNamed(renderer, "＋ 添加问题").props.disabled, true, "V2 with 2 questions would otherwise allow adding");
    assert.equal(renderer.root.find((node) => node.props["data-ops-remove"] === "target_attendees").props.disabled, true);
    assert.equal(renderer.root.find((node) => node.props["data-ops-track"] !== undefined).props.disabled, true);
    assert.equal(renderer.root.find((node) => node.props["data-ops-accent"] !== undefined).props.disabled, undefined, "accent colour is a display field");
    assert.equal(textarea(renderer).props.disabled, undefined, "introduction is a display field");
    await act(async () => {
      renderer.root.find((node) => node.props["data-ops-edit"] === "target_attendees").props.onClick();
      await flush();
    });
    const editor = renderer.root.find((node) => node.props["data-ops-editor"] === "target_attendees");
    assert.equal(editor.find((node) => node.props["data-ops-prompt"] !== undefined).props.disabled, true);
    assert.deepEqual(editor.findAll((node) => node.props["data-ops-option"] !== undefined).map((node) => node.props.disabled), [true, true]);
    assert.equal(editor.find((node) => node.props["data-ops-required"] !== undefined).props.disabled, true);
    assert.equal(buttonNamed(renderer, "＋ 添加选项").props.disabled, true);
  });
});

test("＋ 添加选项 pushes a blank option that blocks 保存 / 预览 / 发布 until it is filled or dropped on blur", async () => {
  await withForm(() => Response.json({ data: snapshot(3, { track: "v2" }), success: true }), async (renderer) => {
    await act(async () => {
      renderer.root.find((node) => node.props["data-ops-edit"] === "value_offered").props.onClick();
      await flush();
    });
    await act(async () => {
      buttonNamed(renderer, "＋ 添加选项").props.onClick();
      await flush();
    });
    const options = () => renderer.root.find((node) => node.props["data-ops-editor"] === "value_offered").findAll((node) => node.props["data-ops-option"] !== undefined);
    assert.deepEqual(options().map((node) => node.props.value), ["A", "B", ""]);
    assert.equal(buttonNamed(renderer, "保存草稿").props.disabled, true);
    assert.equal(buttonNamed(renderer, "发布报名设置").props.disabled, true);
    assert.equal(buttonNamed(renderer, "预览（零写入）").props.disabled, true);
    assert.match(text(renderer), /有选项为空：请填写或删除空白选项后再保存、预览或发布。/u);
    await act(async () => {
      options()[2].props.onChange({ target: { value: "  Cee " } });
      await flush();
    });
    assert.equal(buttonNamed(renderer, "保存草稿").props.disabled, false);
    await act(async () => {
      options()[2].props.onBlur();
      await flush();
    });
    assert.deepEqual(options().map((node) => node.props.value), ["A", "B", "Cee"], "blur trims");
    await act(async () => {
      buttonNamed(renderer, "＋ 添加选项").props.onClick();
      await flush();
    });
    await act(async () => {
      options()[3].props.onBlur();
      await flush();
    });
    assert.deepEqual(options().map((node) => node.props.value), ["A", "B", "Cee"], "blank dropped on blur (old comma-split trim/filter behaviour)");
    assert.equal(buttonNamed(renderer, "保存草稿").props.disabled, false);
    assert.doesNotMatch(text(renderer), /有选项为空/u);
  });
});

test("experience page gates on experience.configure before reading the event and mounts the form screen inside the ops-0918 shell", () => {
  const page = readFileSync(join(projectRoot, "app/(app)/app/events/[id]/operations/experience/page.tsx"), "utf8");
  const screen = readFileSync(join(projectRoot, "app/(app)/app/events/ops-0918/ops-form.tsx"), "utf8");
  const hook = readFileSync(join(projectRoot, "app/(app)/app/events/ops-0918/use-experience-editor.ts"), "utf8");
  assert.match(page, /await Promise\.all\(\[params, auth\(\)\]\)/u);
  assert.match(page, /redirect\(`\/app\/account\/login\?next=/u);
  assert.match(page, /requireEventCapability\(\{[^}]*capability: "experience\.configure"/u);
  assert.match(page, /createConfiguredEventAccessService\(\)/u);
  assert.ok(page.indexOf("requireEventCapability({") < page.indexOf("await loadEventOperationsPageEvent("), "gate runs before the event read");
  assert.match(page, /title="没有报名设置权限"/u);
  assert.match(page, /href="\/app\/events\/center">返回运营活动中心/u);
  assert.match(page, /operations\/experience`\}>重试/u);
  assert.match(page, /data-orbit-real-page="ops-0918"/u);
  assert.match(page, /<AccountTopNav active="events" \/>/u);
  assert.match(page, /view="form"/u);
  assert.match(page, /label: "导出 CSV"/u);
  assert.doesNotMatch(page, /EventExperienceEditor/u);
  // 原 app-event-experience.test.ts 的 JSX 侧断言（意图不变）
  assert.match(screen, /useExperienceEditor\(event\.id\)/u);
  assert.match(screen, /预览（零写入）/u);
  assert.match(screen, /V1.*两题必答/u);
  assert.match(screen, /V2.*0–4/u);
  assert.match(screen, /introduction/u);
  assert.match(screen, /accentColor/u);
  assert.match(screen, /preview\.hash/u);
  assert.match(screen, /活动封面继续由活动本身的可信内容提供/u);
  assert.doesNotMatch(screen, /asset:event-cover/u);
  assert.doesNotMatch(screen, /https?:\/\//u);
  assert.match(hook, /method: "PUT"/u);
  assert.match(hook, /method: "POST"/u);
  assert.match(hook, /expectedRevision/u);
  assert.match(hook, /活动已冻结/u);
  assert.doesNotMatch(hook, /asset:event-cover/u);
  assert.doesNotMatch(hook, /https?:\/\//u);
});
