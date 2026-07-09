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

  const events: { recipient?: string; organization?: string }[] = [];
  const handler = (event: Event) => {
    events.push((event as CustomEvent).detail);
  };
  target.addEventListener(mod.RELATIONSHIP_INBOX_COMPOSE_EVENT, handler);
  mod.openRelationshipInboxCompose({ recipient: "曾伟", organization: "味道餐饮" });
  target.removeEventListener(mod.RELATIONSHIP_INBOX_COMPOSE_EVENT, handler);
  (globalThis as { window?: unknown }).window = previousWindow;

  assert.equal(events.length, 1);
  assert.equal(events[0].recipient, "曾伟");
  assert.equal(events[0].organization, "味道餐饮");
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
  assert.match(source, /recipient: contact\.displayName/);
});
