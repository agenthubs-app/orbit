/**
 * Events（Orbit_0918）报名弹窗壳：遮罩 / 面板 / 标题行 / 关闭，正文 = 不变的
 * `EventRegistrationWorkspace`（children）。JSX 逐元素来自
 * docs/designs/Orbit_0918/Events.dc.html 653（遮罩）、654（面板）、655（标题行 + ×）。
 * 设计 656 活动卡（封面/日期/地点）与 669 底部「取消 / 提交报名」省略：页面不新增
 * 数据 import，工作区自带提交按钮（样式在 EVENTS_STYLES 的 ev-reg-* 里对齐）。
 * 关闭 = 回活动详情（`closeHref`）：× 链接、Esc（可编辑目标除外）、点遮罩空白。
 */
"use client";

import { useEffect, type MouseEvent, type ReactNode } from "react";

import { EVENTS_STYLES } from "./events-shell";

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  if (typeof element.tagName === "string" && EDITABLE_TAGS.has(element.tagName)) return true;
  return element.isContentEditable === true;
}

export function shouldCloseOnKeydown(event: { key: string; target: EventTarget | null; defaultPrevented?: boolean }): boolean {
  if (event.defaultPrevented) return false;
  if (event.key !== "Escape" && event.key !== "Esc") return false;
  return !isEditableEventTarget(event.target);
}

export function EventRegisterModal({
  eventName,
  closeHref,
  language = "zh",
  children,
}: {
  eventName: string;
  closeHref: string;
  language?: "en" | "zh";
  children: ReactNode;
}) {
  const title = language === "en" ? "Register for event" : "报名参加活动";
  const closeLabel = language === "en" ? "Close" : "关闭";

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if (!shouldCloseOnKeydown(event)) return;
      event.preventDefault();
      window.location.assign(closeHref);
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [closeHref]);

  const onOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) window.location.assign(closeHref);
  };

  return (
    <div className="ev-reg-overlay" data-events-modal="register" onClick={onOverlayClick}>
      {/* 本路由无顶栏（字体 link 挂在 OrbitTopNav 上），弹窗自带同源字体 link；React 会去重。 */}
      <link
        href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@700;900&family=Noto+Sans+SC:wght@400;500;700&display=swap"
        rel="stylesheet"
      />
      <style>{EVENTS_STYLES}</style>
      <div aria-labelledby="ev-reg-title" aria-modal="true" className="ev-reg-panel" role="dialog">
        <div className="ev-reg-head">
          <span className="ev-reg-head-copy">
            <strong className="ev-reg-title" id="ev-reg-title">{title}</strong>
            <span className="ev-reg-sub">{eventName}</span>
          </span>
          <a aria-label={closeLabel} className="btn ev-modal-close" href={closeHref}>×</a>
        </div>
        <div className="ev-reg-body">{children}</div>
      </div>
    </div>
  );
}
