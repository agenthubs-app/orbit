import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { exportCsvHref } from "../../app/(app)/app/events/ops-0918/ops-model";
import { OpsPeople } from "../../app/(app)/app/events/ops-0918/ops-people";
import { OpsConsoleShell } from "../../app/(app)/app/events/ops-0918/ops-shell";
import type {
  EventAdmissionApplication,
  EventAdmissionPolicy,
} from "../../features/events/admission/contract";
import {
  BASE,
  buttonNamed,
  buttonsNamed,
  EVENT,
  EVENT_ID,
  flush,
  generation,
  install,
  type Observed,
  participant,
  publishedResult,
  text,
  unmount,
  workspace,
} from "../support/ops-console-fixture";

// 运营台 任务 4：参会者屏（设计 211–251 行；`/operations/admission`）。
// 特征化用例自 tests/pages/event-admission-review-workspace.test.tsx（6 例）改指本屏：审核队列 / 详情 / 版本化决定 /
// 重试与空态 / 政策面板 ×3（审阅修订 15）/ 页面结构；另加 SSR 结构、筛选 / 搜索 / 统计 / chip、403 只显示准入区块。

const APPLICANT_ID = "user:p:a";
const REVIEWS = `/api/events/${encodeURIComponent(EVENT_ID)}/admission/reviews`;
const POLICY = `/api/events/${encodeURIComponent(EVENT_ID)}/admission/policy`;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function completeApplication(): EventAdmissionApplication {
  return {
    actorId: APPLICANT_ID,
    applicationVersion: 1,
    decidedAt: null,
    decisionActorId: null,
    eventId: EVENT_ID,
    policyVersion: 1,
    profilePayload: {
      answers: {
        desiredOutcome: "形成两个可落地的合作实验，并明确下一次约谈负责人",
        energyStyle: "小组深聊、先听后问、偏好基于事实交换观点",
        experienceHighlight: "负责过跨日本、东南亚三地的企业 AI 产品商业化",
        followUpPreference: "两天内邮件同步重点，下周安排 30 分钟 Meet",
        industry: "企业 AI、制造业数字化与气候科技",
        positioning: "跨境产品负责人兼产业生态建设者",
        targetAttendees: "制造集团创新负责人、渠道伙伴和行业研究者",
        valueOffered: "真实采购路径经验、双语产品落地方法和产业资源引荐",
      },
      displayName: "Alice",
      interviewResponses: [
        {
          answer: { customText: "制造集团创新负责人", displayText: "制造集团创新负责人", selectedOptionIds: [] },
          answerSource: "participant",
          answeredAt: "2026-08-05T10:00:00.000Z",
          field: "targetAttendees",
          generation: { method: "orbit-agent-model-adaptive", model: "gemini-2.5-pro", promptVersion: 3, provider: "google" },
          question: {
            fieldLabel: { en: "Who to meet", zh: "希望认识的人" },
            inputKind: "single_choice_with_custom",
            language: "zh",
            options: [{ id: "custom", label: "具体说明" }],
            prompt: "你希望对方现在正在解决什么具体问题？",
          },
          questionId: "question:target",
          questionSource: "ai_adaptive",
          responseId: "response:target",
          visibility: "matching_only",
        },
        {
          answer: { customText: null, displayText: "两天内邮件同步重点", selectedOptionIds: ["email"] },
          answerSource: "participant",
          answeredAt: "2026-08-05T10:01:00.000Z",
          field: "followUpPreference",
          generation: { method: "orbit-agent-model-adaptive", model: "gemini-2.5-pro", promptVersion: 3, provider: "google" },
          question: {
            fieldLabel: { en: "Follow-up preference", zh: "后续沟通偏好" },
            inputKind: "single_choice_with_custom",
            language: "zh",
            options: [{ id: "email", label: "邮件" }],
            prompt: "什么时间和沟通方式最适合你？",
          },
          questionId: "question:follow-up",
          questionSource: "ai_adaptive",
          responseId: "response:follow-up",
          visibility: "event_attendees",
        },
      ],
    },
    status: "pending_review",
    submittedAt: "2026-08-05T10:05:00.000Z",
    updatedAt: "2026-08-05T10:05:00.000Z",
  };
}

function listData(items = [completeApplication()], view = "pending") {
  return {
    items: items.map((item) => ({
      actorId: item.actorId,
      applicationVersion: item.applicationVersion,
      decidedAt: item.decidedAt,
      decisionActorId: item.decisionActorId,
      displayName: item.profilePayload.displayName ?? null,
      status: item.status,
      submittedAt: item.submittedAt,
      updatedAt: item.updatedAt,
    })),
    nextCursor: null,
    total: items.length,
    view,
  };
}

function policyData(overrides: Partial<EventAdmissionPolicy> = {}) {
  const policy: EventAdmissionPolicy = {
    admissionMode: "approval_required",
    capacity: 36,
    eventId: EVENT_ID,
    policyVersion: 3,
    profileEditDeadlineAt: "2026-09-02T10:00:00.000Z",
    registrationClosesAt: "2026-09-03T10:00:00.000Z",
    registrationOpensAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-08-05T10:00:00.000Z",
    waitlistEnabled: true,
    ...overrides,
  };
  return { policy, policyVersion: policy.policyVersion };
}

/** 默认桩：工作区 / 待审核列表（Alice）/ 政策；`respond` 可按请求覆盖。 */
function respondDefault(call: Observed, data = workspace()): Response {
  if (call.url === `${BASE}`) return Response.json({ data, success: true });
  if (call.url === POLICY) return Response.json({ data: policyData(), success: true });
  if (call.url.startsWith(`${REVIEWS}?`)) return Response.json({ data: listData(), success: true });
  if (call.url === `${REVIEWS}/${encodeURIComponent(APPLICANT_ID)}`) return Response.json({ data: completeApplication(), success: true });
  throw new Error(`Unexpected request ${call.method} ${call.url}`);
}

async function mountPeople(props: { canConfigurePolicy?: boolean; canReview?: boolean } = {}): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<OpsPeople canConfigurePolicy={props.canConfigurePolicy} canReview={props.canReview} event={EVENT} />);
    await flush();
  });
  return renderer;
}

async function withPeople(
  run: (renderer: ReactTestRenderer, harness: ReturnType<typeof install>) => Promise<void> | void,
  options: { canConfigurePolicy?: boolean; canReview?: boolean; data?: ReturnType<typeof workspace>; respond?: (call: Observed) => Response | null } = {},
): Promise<void> {
  const harness = install((call) => options.respond?.(call) ?? respondDefault(call, options.data));
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mountPeople(options);
    await run(renderer, harness);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
}

function rows(renderer: ReactTestRenderer) {
  return renderer.root.findAll((node) => typeof node.props["data-ops-person"] === "string").map((node) => node.props["data-ops-person"] as string);
}

function detailButton(renderer: ReactTestRenderer, participantId: string) {
  return renderer.root.find((node) => node.type === "button" && node.props["data-ops-person-detail"] === participantId);
}

test("people SSR renders the console head with the 参会者 tab active, four filters, the search box, the policy fold and no design mock", () => {
  const html = renderToStaticMarkup(
    <OpsConsoleShell event={EVENT} more={[{ href: exportCsvHref(EVENT.id), label: "导出 CSV" }]} view="people">
      <OpsPeople canConfigurePolicy event={EVENT} />
    </OpsConsoleShell>,
  );
  assert.match(html, /<h1 class="op-h1">参会者<\/h1>/u);
  assert.match(html, /aria-current="page" class="op-tab op-tab-on" href="[^"]+\/operations\/admission" role="tab">参会者</u);
  assert.match(html, /活动中心<\/a> \/ <a class="op-crumb-link" href="[^"]+">屏级替换夹具活动<\/a> \/ <a class="op-crumb-link" href="[^"]+">运营台<\/a> \/ 参会者/u);
  assert.match(html, new RegExp(`href="${BASE}/export" role="menuitem">导出 CSV`, "u"));
  assert.doesNotMatch(html, /管理角色/u, "roles.manage is not resolved on this page");
  for (const label of ["全部", "资料完整", "资料待补充", "已参与匹配"]) assert.match(html, new RegExp(`class="btn op-pfilter"[^>]*>${label}</button>`, "u"));
  assert.match(html, /placeholder="搜索姓名、公司或职位…"/u);
  assert.match(html, /建议优先补齐：/u);
  assert.match(html, /报名政策与时间设置/u);
  assert.doesNotMatch(html, /田中惠子|山本健|Google \/ 产品经理|Tokyo AI Meetup/u);
  assert.doesNotMatch(html, /data-ops-person=/u, "rows wait for the workspace");
});

test("people table: real rows with org / 资料状态 / 匹配状态 chips, alternating avatars, filters + search, three stats", async () => {
  const data = workspace({
    generations: [generation("published")],
    participants: [
      participant("p:a", "Alice"),
      { ...participant("p:b", "Bob", "partial"), company: "SoftBank", role: null },
      { ...participant("p:c", "Cai", "minimal"), company: null, role: null },
    ],
    publishedResult: publishedResult({ directory: [participant("p:a", "Alice")] }),
  });
  await withPeople(async (renderer) => {
    assert.deepEqual(rows(renderer), ["p:a", "p:b", "p:c"]);
    const body = text(renderer);
    assert.match(body, /AliceOrbit \/ Founder/u);
    assert.match(body, /BobSoftBank/u, "缺一取有的一项");
    const chip = (participantId: string, kind: "doc" | "match") => renderer.root.find((node) => node.props["data-ops-chip"] === `${kind}:${participantId}`);
    assert.equal(chip("p:a", "doc").children.join(""), "● 完整");
    assert.deepEqual([chip("p:a", "doc").props.style.background, chip("p:a", "doc").props.style.color], ["#E6F1EC", "#2F6B4F"]);
    assert.equal(chip("p:c", "doc").children.join(""), "● 待补充");
    assert.deepEqual([chip("p:c", "doc").props.style.background, chip("p:c", "doc").props.style.color], ["#FBF1E4", "#9A6B22"]);
    assert.equal(chip("p:a", "match").children.join(""), "● 已参与匹配");
    assert.deepEqual([chip("p:a", "match").props.style.background, chip("p:a", "match").props.style.color], ["#ECEEFB", "#4B4FC7"]);
    assert.equal(chip("p:b", "match").children.join(""), "● 待补充");
    assert.deepEqual([chip("p:b", "match").props.style.background, chip("p:b", "match").props.style.color], ["#F1F1FA", "#6B6F99"]);
    const avatars = renderer.root.findAll((node) => node.props["data-ops-avatar"] !== undefined).map((node) => node.props.style.background);
    assert.deepEqual(avatars, ["#DDDEFA", "#ECEEFB", "#DDDEFA"]);
    const stat = (key: string) => renderer.root.find((node) => node.props["data-ops-stat"] === key).children.join("");
    assert.equal(stat("total"), "3");
    assert.equal(stat("complete"), "2");
    assert.equal(stat("incomplete"), "1");

    const filter = (label: string) => buttonNamed(renderer, label);
    assert.deepEqual([filter("全部").props.style.background, filter("全部").props.style.color], ["#2E3270", "#FFFFFF"]);
    assert.deepEqual([filter("资料完整").props.style.background, filter("资料完整").props.style.borderColor], ["#FFFFFF", "#DDDEFA"]);
    await act(async () => {
      filter("资料待补充").props.onClick();
      await flush();
    });
    assert.deepEqual(rows(renderer), ["p:c"]);
    assert.equal(filter("资料待补充").props["aria-pressed"], true);
    await act(async () => {
      filter("已参与匹配").props.onClick();
      await flush();
    });
    assert.deepEqual(rows(renderer), ["p:a"]);
    await act(async () => {
      filter("全部").props.onClick();
      await flush();
    });
    const search = renderer.root.find((node) => node.type === "input" && node.props.placeholder === "搜索姓名、公司或职位…");
    await act(async () => {
      search.props.onChange({ target: { value: "softbank" } });
      await flush();
    });
    assert.deepEqual(rows(renderer), ["p:b"]);
    await act(async () => {
      search.props.onChange({ target: { value: "zzz" } });
      await flush();
    });
    assert.deepEqual(rows(renderer), []);
    assert.match(text(renderer), /没有匹配的参会者/u);
  }, { data });
});

test("reviewer opens 查看详情 on a real row, sees every profile answer and adaptive response inline, then sends a versioned decision", async () => {
  const writes: Observed[] = [];
  let decided = false;
  await withPeople(async (renderer) => {
    const detail = detailButton(renderer, "p:a");
    assert.equal(detail.props.disabled, false);
    await act(async () => {
      detail.props.onClick();
      await flush();
    });
    assert.equal(renderer.root.findAll((node) => node.props["data-admission-review-detail"] === APPLICANT_ID).length, 1);
    assert.equal(renderer.root.findAll((node) => typeof node.props["data-admission-profile-field"] === "string").length, 8);
    assert.equal(renderer.root.findAll((node) => typeof node.props["data-admission-adaptive-response"] === "string").length, 2);
    const rendered = JSON.stringify(renderer.toJSON());
    assert.match(rendered, /跨境产品负责人兼产业生态建设者/u);
    assert.match(rendered, /只有 Event Core 中的当前活动负责人可以修改报名政策/u);
    assert.match(rendered, /你希望对方现在正在解决什么具体问题/u);
    assert.match(rendered, /什么时间和沟通方式最适合你/u);
    // 详情只挂一处：行下展开时队列区块不再重复
    assert.equal(renderer.root.findAll((node) => node.props["data-admission-review-detail-empty"] !== undefined).length, 0);

    const approve = renderer.root.find((node) => node.props["data-admission-review-decision"] === "approve");
    await act(async () => {
      approve.props.onClick();
      await flush();
    });
    assert.equal(writes.length, 1);
    assert.equal(writes[0]?.method, "POST");
    assert.equal(writes[0]?.body, JSON.stringify({ decision: "approve", expectedApplicationVersion: 1 }));
    assert.match(JSON.stringify(renderer.toJSON()), /报名已批准/u);
    assert.equal(renderer.root.findAll((node) => node.props["data-admission-review-empty"] === "pending").length, 1);
  }, {
    respond: (call) => {
      if (call.url.startsWith(`${REVIEWS}?`)) return Response.json({ data: listData(decided ? [] : [completeApplication()]), success: true });
      if (call.url === `${REVIEWS}/${encodeURIComponent(APPLICANT_ID)}/decision`) {
        writes.push(call);
        decided = true;
        return Response.json({
          data: { ...completeApplication(), applicationVersion: 2, decidedAt: "2026-08-05T10:10:00.000Z", decisionActorId: "actor:reviewer", status: "admitted", updatedAt: "2026-08-05T10:10:00.000Z" },
          success: true,
        });
      }
      return null;
    },
  });
});

test("查看详情 is disabled without review capability; the queue card still hosts the detail when the row is not on screen", async () => {
  await withPeople((renderer) => {
    assert.equal(detailButton(renderer, "p:a").props.disabled, true);
    assert.equal(detailButton(renderer, "p:a").props.style.cursor, "default");
  }, { canReview: false });

  await withPeople(async (renderer) => {
    const applicant = renderer.root.find((node) => node.props["data-admission-review-applicant"] === APPLICANT_ID);
    await act(async () => {
      applicant.props.onClick();
      await flush();
    });
    assert.equal(renderer.root.findAll((node) => node.props["data-admission-review-detail"] === APPLICANT_ID).length, 1);
    assert.equal(renderer.root.findAll((node) => typeof node.props["data-admission-profile-field"] === "string").length, 8);
  }, { data: workspace({ participants: [participant("p:b", "Bob")] }) });
});

test("review queue exposes retry and both empty states without stale applicant details", async () => {
  let fail = true;
  await withPeople(async (renderer) => {
    assert.equal(renderer.root.findAll((node) => node.props.role === "alert" && node.props["data-ops-queue-error"] !== undefined).length, 1);
    const retry = renderer.root.find((node) => node.type === "button" && node.props["data-ops-queue-retry"] !== undefined);
    await act(async () => {
      retry.props.onClick();
      await flush();
    });
    assert.equal(renderer.root.findAll((node) => node.props["data-ops-queue-error"] !== undefined).length, 0);
    assert.equal(renderer.root.findAll((node) => node.props["data-admission-review-empty"] === "pending").length, 1);
    const processed = renderer.root.findAll((node) => node.props.role === "tab" && node.type === "button").find((node) => node.children.join("") === "已处理");
    assert.ok(processed);
    await act(async () => {
      processed.props.onClick();
      await flush();
    });
    assert.equal(processed.props["aria-selected"], true);
    assert.equal(renderer.root.findAll((node) => node.props["data-admission-review-empty"] === "processed").length, 1);
    assert.equal(renderer.root.findAll((node) => typeof node.props["data-admission-review-detail"] === "string").length, 0);
  }, {
    respond: (call) => {
      if (!call.url.startsWith(`${REVIEWS}?`)) return null;
      if (fail) {
        fail = false;
        return Response.json({ error: { message: "审核服务暂时不可用" }, success: false }, { status: 503 });
      }
      return Response.json({ data: listData([], call.url.includes("view=processed") ? "processed" : "pending"), success: true });
    },
  });
});

test("a 403 on the operations workspace hides the filter bar, table and stats, keeps the admission queue and explains in Chinese (审阅修订 3)", async () => {
  await withPeople((renderer) => {
    assert.deepEqual(rows(renderer), []);
    assert.equal(renderer.root.findAll((node) => node.props["data-ops-people-table"] !== undefined).length, 0);
    assert.equal(renderer.root.findAll((node) => node.type === "button" && node.props.className === "btn op-pfilter").length, 0, "filter bar hidden");
    assert.equal(renderer.root.findAll((node) => node.type === "input" && node.props["aria-label"] === "搜索参会者").length, 0, "search hidden");
    assert.equal(renderer.root.findAll((node) => node.props["data-ops-stat"] !== undefined).length, 0, "stats card hidden");
    assert.doesNotMatch(text(renderer), /总报名|建议优先补齐/u);
    const notice = renderer.root.find((node) => node.props["data-ops-people-reviewer-only"] !== undefined);
    assert.equal(notice.props.className, "op-notice");
    assert.equal(notice.props.role, "status");
    assert.equal(notice.children.join(""), "当前身份仅有审核权限，参会者表格与统计不可见。");
    assert.doesNotMatch(text(renderer), /Event operations access required/u, "raw English 403 message not surfaced");
    assert.equal(renderer.root.findAll((node) => node.props.role === "alert").length, 0);
    assert.equal(renderer.root.findAll((node) => node.props["data-admission-review-applicant"] === APPLICANT_ID).length, 1, "admission queue still rendered");
  }, {
    respond: (call) => call.url === BASE ? Response.json({ error: { message: "Event operations access required" }, success: false }, { status: 403 }) : null,
  });
});

test("organizer policy panel shows the current version and saves only the versioned canonical fields", async () => {
  const writes: Observed[] = [];
  await withPeople(async (renderer) => {
    assert.equal(renderer.root.find((node) => node.props["data-admission-policy-version"] === true).children.join(""), "当前版本 v3");
    const form = renderer.root.find((node) => node.props["data-admission-policy-form"] === true);
    await act(async () => {
      form.props.onSubmit({ preventDefault() {} });
      await flush();
    });
    assert.equal(writes.length, 1);
    assert.equal(writes[0]?.method, "PUT");
    assert.equal(writes[0]?.body, JSON.stringify({
      admissionMode: "approval_required",
      capacity: 36,
      expectedPolicyVersion: 3,
      profileEditDeadlineAt: "2026-09-02T10:00:00.000Z",
      registrationClosesAt: "2026-09-03T10:00:00.000Z",
      registrationOpensAt: "2026-09-01T10:00:00.000Z",
      waitlistEnabled: true,
    }));
    assert.match(JSON.stringify(renderer.toJSON()), /报名政策已保存为 v4/u);
  }, {
    canConfigurePolicy: true,
    respond: (call) => {
      if (call.url === POLICY && call.method === "PUT") {
        writes.push(call);
        return Response.json({ data: policyData({ policyVersion: 4, updatedAt: "2026-08-06T10:00:00.000Z" }), success: true });
      }
      return null;
    },
  });
});

test("organizer policy panel makes conflict and unavailable states visible", async () => {
  let policyReads = 0;
  await withPeople(async (renderer) => {
    const form = renderer.root.find((node) => node.props["data-admission-policy-form"] === true);
    await act(async () => {
      form.props.onSubmit({ preventDefault() {} });
      await flush();
    });
    assert.equal(renderer.root.findAll((node) => node.props["data-admission-policy-status"] === "conflict").length, 1);
    assert.match(JSON.stringify(renderer.toJSON()), /其他负责人更新/u);
    assert.equal(renderer.root.find((node) => node.props["data-admission-policy-version"] === true).children.join(""), "当前版本 v4");
  }, {
    canConfigurePolicy: true,
    respond: (call) => {
      if (call.url !== POLICY) return null;
      if (call.method === "PUT") return Response.json({ error: { message: "Admission policy changed. Refresh and try again." }, success: false }, { status: 409 });
      policyReads += 1;
      return Response.json({ data: policyData({ policyVersion: policyReads > 1 ? 4 : 3 }), success: true });
    },
  });

  await withPeople((renderer) => {
    assert.equal(renderer.root.findAll((node) => node.props["data-admission-policy-status"] === "unavailable").length, 1);
  }, {
    respond: () => Response.json({ error: { message: "政策服务暂时不可用" }, success: false }, { status: 503 }),
  });
});

test("organizer policy panel explains Event Operations activation prerequisites", async () => {
  await withPeople(async (renderer) => {
    const form = renderer.root.find((node) => node.props["data-admission-policy-form"] === true);
    await act(async () => {
      form.props.onSubmit({ preventDefault() {} });
      await flush();
    });
    assert.equal(renderer.root.findAll((node) => node.props["data-admission-policy-status"] === "conflict").length, 1);
    assert.match(JSON.stringify(renderer.toJSON()), /先配置活动运营时间/u);
    assert.match(JSON.stringify(renderer.toJSON()), /完成迁移/u);
  }, {
    canConfigurePolicy: true,
    respond: (call) => call.url === POLICY && call.method === "PUT"
      ? Response.json({ error: { message: "Configure the event operations schedule before activating admission policy." }, success: false }, { status: 409 })
      : null,
  });
});

test("admission page stays canonical-only and mounts the people screen inside the ops-0918 shell", () => {
  const page = readFileSync(join(projectRoot, "app/(app)/app/events/[id]/operations/admission/page.tsx"), "utf8");
  const screen = readFileSync(join(projectRoot, "app/(app)/app/events/ops-0918/ops-people.tsx"), "utf8");
  assert.match(page, /createConfiguredEventCoreService/u);
  assert.match(page, /getPublishedEvent/u);
  assert.match(page, /capability: "admission\.read"/u);
  assert.match(page, /capability: "roles\.manage"/u);
  assert.match(page, /redirect\(`\/app\/account\/login\?next=/u);
  assert.doesNotMatch(page, /mockEventRecords|readPublicEventCatalogue|legacyEvent/u);
  assert.match(page, /loadEventOperationsPageEvent/u);
  assert.match(page, /data-orbit-real-page="ops-0918"/u);
  assert.match(page, /<AccountTopNav active="events" \/>/u);
  assert.match(page, /view="people"/u);
  assert.match(screen, /EVENT_PARTICIPANT_PROFILE_FIELDS\.map/u);
  assert.match(screen, /interviewResponses \?\? \[\]/u);
  assert.match(screen, /EventAdmissionPolicyPanel/u);
  assert.match(screen, /canConfigurePolicy/u);
  assert.match(screen, /useEventOperations\(event\)/u);
});

// 让 buttonsNamed 的导入保持有意义：筛选按钮名唯一
test("people filter labels are unique buttons", async () => {
  await withPeople((renderer) => {
    for (const label of ["全部", "资料完整", "资料待补充", "已参与匹配"]) assert.equal(buttonsNamed(renderer, label).length, 1);
  });
});
