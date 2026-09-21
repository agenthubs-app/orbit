/**
 * Orbit_0918 报名弹窗壳（events-0918/event-register-modal.tsx，设计 652–672）。
 * 壳只提供遮罩 / 面板 / 标题行 / 关闭；正文 = children（不变的报名工作区）；
 * 设计 669 的「取消 / 提交报名」底部按钮省略（工作区自带提交按钮）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import {
  EventRegisterModal,
  hasRegistrationInput,
  isEditableEventTarget,
  shouldCloseOnKeydown,
} from "../../app/(app)/app/events/events-0918/event-register-modal";
import { EVENTS_STYLES } from "../../app/(app)/app/events/events-0918/events-shell";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const closeHref = "/app/events/10000000-0000-4000-8000-000000000001";

function render(language?: "en" | "zh") {
  return renderToStaticMarkup(
    <div data-orbit-real-page="events-0918">
      <EventRegisterModal closeHref={closeHref} eventName="东京 AI 落地伙伴对接会" language={language}>
        <section data-registration-stage="interview">workspace-body</section>
      </EventRegisterModal>
    </div>,
  );
}

test("modal shell renders overlay, panel, title row, close link and the children body", () => {
  const html = render();

  assert.match(html, /class="ev-reg-overlay"/);
  assert.match(html, /<div[^>]*class="ev-reg-panel"[^>]*role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /<strong class="ev-reg-title" id="ev-reg-title">报名参加活动<\/strong>/);
  assert.match(html, /<span class="ev-reg-sub">东京 AI 落地伙伴对接会<\/span>/);
  assert.match(
    html,
    /<a aria-label="关闭" class="btn ev-modal-close" href="\/app\/events\/10000000-0000-4000-8000-000000000001">×<\/a>/,
  );
  assert.match(html, /<div class="ev-reg-body"><section data-registration-stage="interview">workspace-body<\/section><\/div>/);
  // EVENTS_STYLES 随壳一起输出（本路由不经过 EventsShell）。
  assert.match(html, /\.ev-reg-overlay \{ position: fixed; inset: 0; z-index: 100;/);
});

test("modal shell omits the design footer buttons and any mock copy", () => {
  // 去掉随壳输出的 <style>（其注释里引用了设计原文），只断言可见 DOM。
  const stripStyles = (markup: string) => markup.replace(/<style>[\s\S]*?<\/style>/gu, "");
  const html = stripStyles(render());

  assert.doesNotMatch(html, /<button/);
  assert.doesNotMatch(html, /提交报名|取消<\/|Submit registration/);
  assert.doesNotMatch(html, /邮件通知|山本健|Sakana AI|Tokyo Innovation Hub/);
  assert.match(stripStyles(render("en")), /Register for event/);
  assert.doesNotMatch(stripStyles(render("en")), /报名参加活动/);
});

test("Esc closes only when the target is not editable", () => {
  const textarea = { tagName: "TEXTAREA" } as unknown as EventTarget;
  const input = { tagName: "INPUT" } as unknown as EventTarget;
  const editable = { tagName: "DIV", isContentEditable: true } as unknown as EventTarget;
  const button = { tagName: "BUTTON" } as unknown as EventTarget;

  assert.equal(isEditableEventTarget(textarea), true);
  assert.equal(isEditableEventTarget(input), true);
  assert.equal(isEditableEventTarget(editable), true);
  assert.equal(isEditableEventTarget(button), false);
  assert.equal(isEditableEventTarget(null), false);

  assert.equal(shouldCloseOnKeydown({ key: "Escape", target: button }), true);
  assert.equal(shouldCloseOnKeydown({ key: "Escape", target: null }), true);
  assert.equal(shouldCloseOnKeydown({ key: "Escape", target: textarea }), false);
  assert.equal(shouldCloseOnKeydown({ key: "Escape", target: editable }), false);
  assert.equal(shouldCloseOnKeydown({ key: "Enter", target: button }), false);
  assert.equal(shouldCloseOnKeydown({ key: "Escape", target: button, defaultPrevented: true }), false);
});

test("modal source wires Esc / × through the leave guard, drops overlay-click close, adds beforeunload, and keeps the shell pixel rules scoped", () => {
  const source = readFileSync(
    join(projectRoot, "app/(app)/app/events/events-0918/event-register-modal.tsx"),
    "utf8",
  );

  assert.match(source, /^"use client";/mu);
  assert.match(source, /window\.location\.assign\(closeHref\)/);
  assert.match(source, /shouldCloseOnKeydown\(event\)/);
  assert.match(source, /window\.addEventListener\("beforeunload", onBeforeUnload\)/);
  assert.doesNotMatch(source, /onOverlayClick|event\.target === event\.currentTarget/, "overlay click must not navigate away");
  assert.doesNotMatch(source, /\bconfirm\(/, "no native confirm()");
  assert.doesNotMatch(source, /fontSize:|fontWeight:|gap: \d/);

  for (const rule of [
    ".ev-reg-overlay",
    ".ev-reg-panel",
    ".ev-reg-head",
    ".ev-reg-title",
    ".ev-reg-sub",
    ".btn.ev-modal-close",
    ".btn.ev-modal-close:hover",
    ".btn.ev-modal-close:active { transform: none; }",
    '.ev-reg-body .registration-portrait-7a .btn:not([data-orbit-registration-profile-guide="register"] *) {',
    ".ev-reg-body .registration-portrait-7a .btn.portrait-link",
    ".ev-reg-body .registration-portrait-7a .btn.portrait-entry",
    '.ev-reg-body .registration-portrait-7a [role="alertdialog"] .btn:not([data-orbit-registration-profile-guide="register"] *) { all: revert;',
    ".ev-reg-body .registration-portrait-7a .btn[aria-pressed]",
    ".ev-reg-body .registration-portrait-7a textarea",
    ".ev-reg-body .registration-portrait-7a .btn.portrait-primary",
    ".ev-reg-leave",
    ".btn.ev-reg-leave-stay",
    ".btn.ev-reg-leave-go:active { transform: none; }",
  ]) {
    assert.ok(
      EVENTS_STYLES.includes(`[data-orbit-real-page="events-0918"] ${rule}`),
      `EVENTS_STYLES 缺少 ${rule}`,
    );
  }
});

test("register page wraps the unchanged workspace in the modal shell without new data imports", () => {
  const source = readFileSync(
    join(projectRoot, "app/(app)/app/events/[id]/register/page.tsx"),
    "utf8",
  );
  const workspaceSource = readFileSync(
    join(projectRoot, "app/(app)/app/events/[id]/register/event-registration-workspace.tsx"),
    "utf8",
  );

  assert.match(source, /import \{ EventRegisterModal \} from "\.\.\/\.\.\/events-0918\/event-register-modal";/);
  assert.match(source, /<div data-orbit-real-page="events-0918"[^>]*>\s*<EventRegisterModal/);
  // 与工作区自己的「活动」链接同口径：保留 ?language=<已解析语言>。
  assert.match(source, /closeHref=\{`\/app\/events\/\$\{encodeURIComponent\(localizedEvent\.id\)\}\?language=\$\{language\}`\}/);
  assert.match(source, /eventName=\{localizedEvent\.title\}/);
  assert.match(source, /<EventRegisterModal[\s\S]*?<EventRegistrationWorkspace[\s\S]*?\/>\s*<\/EventRegisterModal>/);
  // 本页无顶栏；弹窗盖住静态底。
  assert.doesNotMatch(source, /AccountTopNav|PublicTopNav/);
  // 工作区文件零改动的旁证：壳所依赖的钩子仍在工作区里。
  assert.match(workspaceSource, /data-orbit-registration-profile-guide="register"/);
  assert.match(workspaceSource, /RegistrationPortraitWorkspace/);
});

test("hasRegistrationInput: non-empty textarea / text input or an aria-pressed=true option counts as in-progress input", () => {
  type Node = { getAttribute?: (name: string) => string | null; type?: string; value?: unknown };
  const root = (fields: Node[], pressed: Node[] = []) => ({
    querySelectorAll: (selector: string) => (selector.startsWith("[aria-pressed") ? pressed : fields),
  });
  assert.equal(hasRegistrationInput(null), false);
  assert.equal(hasRegistrationInput(root([])), false);
  assert.equal(hasRegistrationInput(root([{ value: "" }, { value: "   " }])), false);
  assert.equal(hasRegistrationInput(root([{ value: "" }, { value: "想认识做硬件的创始人" }])), true);
  assert.equal(hasRegistrationInput(root([], [{ getAttribute: () => "true" }])), true);
});

test("× with no input navigates immediately; with input it shows the inline leave bar (继续填写 keeps, 离开 navigates)", async () => {
  const assigned: string[] = [];
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    location: { assign: (href: string) => { assigned.push(href); } },
  };
  let dirty = false;
  const fakePanel = { querySelectorAll: () => (dirty ? [{ value: "draft answer" }] : []) };
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(
        <EventRegisterModal closeHref={closeHref} eventName="东京 AI 落地伙伴对接会">
          <section>workspace-body</section>
        </EventRegisterModal>,
        { createNodeMock: (element) => (element.props.role === "dialog" ? fakePanel : null) },
      );
    });
    const close = () => renderer.root.find((node) => node.type === "a" && node.props["aria-label"] === "关闭");
    const prevented: boolean[] = [];
    const click = () => close().props.onClick({ preventDefault: () => prevented.push(true) });

    await act(async () => { click(); });
    assert.deepEqual(assigned, [closeHref], "clean form → navigate to the detail page");
    assert.equal(renderer.root.findAll((node) => node.props["data-events-register-leave"] !== undefined).length, 0);

    dirty = true;
    await act(async () => { click(); });
    assert.equal(assigned.length, 1, "dirty form → no navigation yet");
    const bar = renderer.root.find((node) => node.props["data-events-register-leave"] !== undefined);
    assert.match(JSON.stringify(renderer.toJSON()), /离开将丢失未提交的报名内容/);
    assert.equal(bar.props.role, "alertdialog");
    const stay = renderer.root.find((node) => node.type === "button" && node.props["data-events-register-leave-action"] === "stay");
    const leave = renderer.root.find((node) => node.type === "button" && node.props["data-events-register-leave-action"] === "leave");
    assert.match(String(stay.props.children), /继续填写/);
    assert.match(String(leave.props.children), /离开/);

    await act(async () => { stay.props.onClick(); });
    assert.equal(renderer.root.findAll((node) => node.props["data-events-register-leave"] !== undefined).length, 0, "继续填写 dismisses the bar");
    assert.equal(assigned.length, 1);

    await act(async () => { click(); });
    const leaveAgain = renderer.root.find((node) => node.type === "button" && node.props["data-events-register-leave-action"] === "leave");
    await act(async () => { leaveAgain.props.onClick(); });
    assert.deepEqual(assigned, [closeHref, closeHref], "离开 navigates");
    assert.equal(prevented.length, 3, "the × link default is always prevented (guard decides)");
  } finally {
    if (renderer) await act(async () => { renderer.unmount(); });
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

test("beforeunload is armed while input is in progress and released once the user chooses 离开", async () => {
  const listeners = new Map<string, (event: unknown) => void>();
  const assigned: string[] = [];
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    addEventListener: (name: string, fn: (event: unknown) => void) => { listeners.set(name, fn); },
    removeEventListener: (name: string) => { listeners.delete(name); },
    location: { assign: (href: string) => { assigned.push(href); } },
  };
  let dirty = false;
  const fakePanel = { querySelectorAll: () => (dirty ? [{ value: "draft" }] : []) };
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(
        <EventRegisterModal closeHref={closeHref} eventName="x"><section /></EventRegisterModal>,
        { createNodeMock: (element) => (element.props.role === "dialog" ? fakePanel : null) },
      );
    });
    const beforeunload = listeners.get("beforeunload");
    assert.ok(beforeunload, "beforeunload listener registered");
    const fire = () => { const event = { prevented: false, returnValue: "x", preventDefault() { this.prevented = true; } }; beforeunload!(event); return event; };
    assert.equal(fire().prevented, false, "clean form does not block unload");
    dirty = true;
    const blocked = fire();
    assert.equal(blocked.prevented, true, "dirty form blocks unload");
    assert.equal(blocked.returnValue, "");

    // Esc → guard → bar → 离开 → assign; afterwards beforeunload no longer blocks the navigation it caused.
    const keydown = listeners.get("keydown");
    assert.ok(keydown);
    await act(async () => { keydown!({ key: "Escape", target: { tagName: "BUTTON" }, preventDefault: () => undefined }); });
    const leave = renderer.root.find((node) => node.type === "button" && node.props["data-events-register-leave-action"] === "leave");
    await act(async () => { leave.props.onClick(); });
    assert.deepEqual(assigned, [closeHref]);
    assert.equal(fire().prevented, false, "after 离开 the unload is not blocked");
  } finally {
    if (renderer) await act(async () => { renderer.unmount(); });
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});
