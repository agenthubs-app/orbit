/**
 * Events（Orbit_0918）报名弹窗壳：遮罩 / 面板 / 标题行 / 关闭，正文 = 不变的
 * `EventRegistrationWorkspace`（children）。JSX 逐元素来自
 * docs/designs/Orbit_0918/Events.dc.html 653（遮罩）、654（面板）、655（标题行 + ×）。
 * 设计 656 活动卡（封面/日期/地点）与 669 底部「取消 / 提交报名」省略：页面不新增
 * 数据 import，工作区自带提交按钮（样式在 EVENTS_STYLES 的 ev-reg-* 里对齐）。
 * 关闭 = 回活动详情（`closeHref`）：× 链接、Esc（可编辑目标除外）；点遮罩空白**不**关闭（终审 I2：避免误触丢失报名内容）。
 * 离开守卫：面板内有未提交的报名输入（非空 textarea / input，或 aria-pressed="true" 选项）时，× / Esc 先显示
 * 内联确认条「离开将丢失未提交的报名内容」（继续填写 / 离开），并挂 beforeunload；否则直接导航。
 */
"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

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

/** 与 DOM 解耦的最小查询面（测试用假对象即可）。 */
export interface RegistrationInputRoot {
  querySelectorAll: (selector: string) => ArrayLike<{ getAttribute?: (name: string) => string | null; type?: string; value?: unknown }>;
}

const VALUE_INPUT_SELECTOR = "textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=reset])";

/** 面板内是否有进行中的报名输入：任一非空 textarea / 文本类 input，或任一 aria-pressed="true" 的选项。 */
export function hasRegistrationInput(root: RegistrationInputRoot | null | undefined): boolean {
  if (!root) return false;
  const fields = root.querySelectorAll(VALUE_INPUT_SELECTOR);
  for (let index = 0; index < fields.length; index += 1) {
    const value = fields[index]?.value;
    if (typeof value === "string" && value.trim()) return true;
  }
  return root.querySelectorAll('[aria-pressed="true"]').length > 0;
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
  const panelRef = useRef<HTMLDivElement | null>(null);
  const leavingRef = useRef(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  /** × / Esc 共用的离开守卫：有未提交输入 → 内联确认条；否则直接回详情。 */
  const requestClose = useCallback(() => {
    if (hasRegistrationInput(panelRef.current)) {
      setConfirmLeave(true);
      return;
    }
    leavingRef.current = true;
    window.location.assign(closeHref);
  }, [closeHref]);

  const leave = useCallback(() => {
    leavingRef.current = true;
    window.location.assign(closeHref);
  }, [closeHref]);

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if (!shouldCloseOnKeydown(event)) return;
      event.preventDefault();
      requestClose();
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [requestClose]);

  // 未提交输入存在期间拦截整页离开（刷新 / 前进后退 / 其它链接）；用户在确认条上选「离开」后不再拦截。
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leavingRef.current || !hasRegistrationInput(panelRef.current)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const onCloseClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    requestClose();
  };

  return (
    <div className="ev-reg-overlay" data-events-modal="register">
      {/* 本路由无顶栏（字体 link 挂在 OrbitTopNav 上），弹窗自带同源字体 link；React 会去重。 */}
      <link
        href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@700;900&family=Noto+Sans+SC:wght@400;500;700&display=swap"
        rel="stylesheet"
      />
      <style>{EVENTS_STYLES}</style>
      <div aria-labelledby="ev-reg-title" aria-modal="true" className="ev-reg-panel" ref={panelRef} role="dialog">
        <div className="ev-reg-head">
          <span className="ev-reg-head-copy">
            <strong className="ev-reg-title" id="ev-reg-title">{title}</strong>
            <span className="ev-reg-sub">{eventName}</span>
          </span>
          <a aria-label={closeLabel} className="btn ev-modal-close" href={closeHref} onClick={onCloseClick}>×</a>
        </div>
        {confirmLeave ? (
          <div className="ev-reg-leave" data-events-register-leave role="alertdialog" aria-live="assertive">
            <span className="ev-reg-leave-copy">{language === "en" ? "Leaving now discards your unsubmitted registration." : "离开将丢失未提交的报名内容"}</span>
            <span className="ev-reg-leave-actions">
              <button autoFocus className="btn ev-reg-leave-stay" data-events-register-leave-action="stay" onClick={() => setConfirmLeave(false)} type="button">{language === "en" ? "Keep editing" : "继续填写"}</button>
              <button className="btn ev-reg-leave-go" data-events-register-leave-action="leave" onClick={leave} type="button">{language === "en" ? "Leave" : "离开"}</button>
            </span>
          </div>
        ) : null}
        <div className="ev-reg-body">{children}</div>
      </div>
    </div>
  );
}
