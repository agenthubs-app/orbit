"use client";

// < 768 全屏子页（b13 .topbar ‹ 标题 / 副标题 + 内容 + 可选底部按钮）。申込設定的各子页、议程並べ替え、导入名单共用。
import type { ReactNode } from "react";

import { Icon } from "../ui";
import sp from "./setup-phone.module.css";

/** 全屏子页（b13 .topbar ← 标题 / 副标题）；导入名单也用。 */
export function SubPage({ title, sub, onBack, right, foot, children, testId }: { title: string; sub?: string; onBack?: () => void; right?: ReactNode; foot?: ReactNode; children: ReactNode; testId: string }) {
  return (
    <div className={sp.subPage} role="dialog" aria-modal="true" aria-label={title} data-host-setup-sub={testId}>
      <div className={sp.top}>
        {onBack ? <button type="button" className={`btn ${sp.rbtn}`} aria-label={title} onClick={onBack}><Icon name="left" size={20} /></button> : <span />}
        <div className={sp.topT}><b>{title}</b>{sub ? <small>{sub}</small> : null}</div>
        {right ?? <span />}
      </div>
      <div className={sp.subBody}>{children}</div>
      {foot ? <div className={sp.subFoot}>{foot}</div> : null}
    </div>
  );
}
