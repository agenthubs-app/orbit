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

import {
  EventRegisterModal,
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

test("modal source wires Esc to window.location.assign(closeHref) and keeps the shell pixel rules scoped", () => {
  const source = readFileSync(
    join(projectRoot, "app/(app)/app/events/events-0918/event-register-modal.tsx"),
    "utf8",
  );

  assert.match(source, /^"use client";/mu);
  assert.match(source, /window\.location\.assign\(closeHref\)/);
  assert.match(source, /shouldCloseOnKeydown\(event\)/);
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
    ".ev-reg-body .registration-portrait-7a .btn[aria-pressed]",
    ".ev-reg-body .registration-portrait-7a textarea",
    ".ev-reg-body .registration-portrait-7a .btn.portrait-primary",
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
  assert.match(source, /closeHref=\{`\/app\/events\/\$\{encodeURIComponent\(localizedEvent\.id\)\}`\}/);
  assert.match(source, /eventName=\{localizedEvent\.title\}/);
  assert.match(source, /<EventRegisterModal[\s\S]*?<EventRegistrationWorkspace[\s\S]*?\/>\s*<\/EventRegisterModal>/);
  // 本页无顶栏；弹窗盖住静态底。
  assert.doesNotMatch(source, /AccountTopNav|PublicTopNav/);
  // 工作区文件零改动的旁证：壳所依赖的钩子仍在工作区里。
  assert.match(workspaceSource, /data-orbit-registration-profile-guide="register"/);
  assert.match(workspaceSource, /RegistrationPortraitWorkspace/);
});
