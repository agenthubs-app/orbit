import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { RelationshipInboxTrigger } from "../../app/(app)/app/inbox/relationship-inbox-panel";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";

function renderTrigger(props: { unreadCount?: number } = {}): string {
  return renderToStaticMarkup(
    <OrbitLanguageProvider initialLanguage="zh">
      <RelationshipInboxTrigger {...props} />
    </OrbitLanguageProvider>,
  );
}

test("relationship inbox trigger renders a single top-nav entry with an accessible label", () => {
  const html = renderTrigger();

  // 单入口：一个可访问的按钮，aria-haspopup=dialog，默认折叠。
  assert.match(html, /aria-label="打开收件箱"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /aria-expanded="false"/);
  // Step 0 面板未打开，不在 DOM 中。
  assert.doesNotMatch(html, /data-orbit-real-page="relationship-inbox"/);
});

test("relationship inbox panel portals to document.body (escapes the filtered top-nav)", async () => {
  // 顶栏带 backdrop-filter，会成为 fixed 定位的包含块。面板必须 portal 到 body
  // 才能全视口覆盖，否则被困在导航条高度内。用源码断言守护这个修复不被回退。
  const source = await import("node:fs").then((fs) =>
    fs.readFileSync(
      new URL(
        "../../app/(app)/app/inbox/relationship-inbox-panel.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  assert.match(source, /createPortal\(/);
  assert.match(source, /document\.body/);
});

test("relationship inbox trigger shows an unread badge only when there are unread items", () => {
  const withBadge = renderTrigger({ unreadCount: 3 });
  const withoutBadge = renderTrigger({ unreadCount: 0 });

  assert.match(withBadge, />3<\/span>/);
  // 0 未读时不渲染 badge。
  assert.doesNotMatch(withoutBadge, /border-radius:999px[^>]*>0<\/span>/);

  const capped = renderTrigger({ unreadCount: 128 });
  assert.match(capped, />99\+<\/span>/);
});

test("openRelationshipInboxCompose dispatches a compose event with the seed", async () => {
  const mod = await import("../../app/(app)/app/inbox/relationship-inbox-panel");
  // 客户端运行时总有 window；测试提供一个最小 EventTarget 充当 window。
  const target = new EventTarget();
  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = target;

  const events: {
    body?: string;
    contactId?: string;
    recipient?: string;
    organization?: string;
    subject?: string;
  }[] = [];
  const handler = (event: Event) => {
    events.push((event as CustomEvent).detail);
  };
  target.addEventListener(mod.RELATIONSHIP_INBOX_COMPOSE_EVENT, handler);
  mod.openRelationshipInboxCompose({
    body: "曾伟，感谢昨天的交流。",
    contactId: "contact:zeng-wei",
    recipient: "曾伟",
    organization: "味道餐饮",
    subject: "昨天活动的后续",
  });
  target.removeEventListener(mod.RELATIONSHIP_INBOX_COMPOSE_EVENT, handler);
  (globalThis as { window?: unknown }).window = previousWindow;

  assert.equal(events.length, 1);
  assert.equal(events[0].contactId, "contact:zeng-wei");
  assert.equal(events[0].recipient, "曾伟");
  assert.equal(events[0].organization, "味道餐饮");
  assert.equal(events[0].subject, "昨天活动的后续");
  assert.equal(events[0].body, "曾伟，感谢昨天的交流。");
});

test("exact contact identity survives compose seed and create-thread POST", async () => {
  const mod = await import("../../app/(app)/app/inbox/relationship-inbox-panel");
  const previousFetch = globalThis.fetch;
  let submittedBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (_input, init) => {
    submittedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ success: false }), { status: 400 });
  }) as typeof fetch;

  try {
    const created = await mod.createThreadFromDraft(
      {
        body: "很高兴认识你。",
        contactId: "contact:misaki-a",
        organization: "青空商事",
        participantName: "林 美咲",
        requestId: "request:misaki-a:1",
        subject: "活动后续",
      },
      "zh",
    );

    assert.equal(created, null);
    assert.equal(submittedBody?.contactId, "contact:misaki-a");
    assert.equal(submittedBody?.requestId, "request:misaki-a:1");

    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(
        new URL(
          "../../app/(app)/app/inbox/relationship-inbox-panel.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.match(source, /contactId: detail\.contactId/);
    assert.match(source, /contactId: initialContactId/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("responsive compose arbitration ignores a mounted trigger with no rendered area", async () => {
  const mod = await import("../../app/(app)/app/inbox/relationship-inbox-panel");
  const rectangle = (width: number, height: number) => ({
    getBoundingClientRect: () =>
      ({
        bottom: height,
        height,
        left: 0,
        right: width,
        top: 0,
        width,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  });

  assert.equal(mod.hasRenderedComposeTriggerArea(rectangle(0, 0)), false);
  assert.equal(mod.hasRenderedComposeTriggerArea(rectangle(36, 36)), true);

  const source = await import("node:fs").then((fs) =>
    fs.readFileSync(
      new URL(
        "../../app/(app)/app/inbox/relationship-inbox-panel.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.doesNotMatch(source, /offsetParent === null/);
  assert.match(source, /badgeCountRequests\.get\(language\)/);
});

test("contact detail card connection routes 起草邮件 into the inbox compose flow", async () => {
  // 详情页 presenter 使用 openRelationshipInboxCompose 打开发起新对话流程，
  // 不再是本地 toast 占位。
  const source = await import("node:fs").then((fs) =>
    fs.readFileSync(
      new URL(
        "../../app/(app)/app/contacts/orbit-real-card-connection.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  assert.match(source, /openRelationshipInboxCompose\(/);
  assert.match(source, /contactId: contact\.id/);
  assert.match(source, /recipient: contact\.displayName/);
});

test("Chinese relationship inbox draft generation uses the actor-scoped AI API without a local success fallback", async () => {
  const mod = await import("../../app/(app)/app/inbox/relationship-inbox-panel");
  const previousFetch = globalThis.fetch;
  let fetchRequested = false;
  globalThis.fetch = (async (input, init) => {
    fetchRequested = true;
    assert.equal(String(input), "/api/chat/assist/email-draft");
    assert.equal(init?.method, "POST");
    assert.match(String(init?.body), /"contactId":"contact:sato"/);
    assert.match(String(init?.body), /"recipientName":"佐藤 健一"/);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          subject: "关于北星食品的跟进",
          body: "佐藤 健一，您好：\n\n这是基于互动证据生成的人工智能草稿。",
        },
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const draft = await mod.generateMessageDraft({
      contactId: "contact:sato",
      language: "zh",
      organization: "北星食品",
      recipientName: "佐藤 健一",
    });
    const draftText = `${draft?.subject ?? ""}\n${draft?.body ?? ""}`;

    assert.equal(fetchRequested, true);
    assert.equal(draft?.subject, "关于北星食品的跟进");
    assert.match(draft?.body ?? "", /佐藤 健一，您好：/);
    assert.doesNotMatch(draftText, /[A-Za-z]/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("relationship inbox labels AI drafting and local staging honestly", async () => {
  const source = await import("node:fs").then((fs) =>
    fs.readFileSync(
      new URL(
        "../../app/(app)/app/inbox/relationship-inbox-panel.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  assert.doesNotMatch(source, /chineseDemoMessageDraft|AI rewrite/);
  assert.match(source, /AI 起草邮件/);
  assert.match(source, /Rule-based rewrite|规则改写/);
  assert.match(source, /Stage for review|暂存待复核/);
  assert.doesNotMatch(source, /fetchProactiveAlerts|From Orbit AI/);
  assert.match(source, /站内提醒仅保留在 Orbit；未发送外部推送、邮件或短信。/);
  assert.doesNotMatch(source, /没有任何投递 — 未发送推送、邮件、短信或通知。/);
});

test("relationship inbox provides a three-pane conversation workspace with persistent edge resizing", async () => {
  const source = await import("node:fs").then((fs) =>
    fs.readFileSync(
      new URL(
        "../../app/(app)/app/inbox/relationship-inbox-panel.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  assert.match(source, /className="ri-thread-list"/);
  assert.match(source, /className="ri-thread-main"/);
  assert.match(source, /className="ri-thread-context"/);
  assert.match(source, /data-relationship-inbox-resize-handle/);
  assert.match(source, /role="separator"/);
  assert.match(source, /pointermove/);
  assert.match(source, /pointerup/);
  assert.match(source, /localStorage\.(?:getItem|setItem)/);
  assert.match(source, /orbit:relationship-inbox:width/);
  assert.match(source, /aria-valuemin/);
  assert.match(source, /aria-valuemax/);
  assert.match(source, /@container relationship-inbox/);
});
