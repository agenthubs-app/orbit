"use client";
/**
 * W0061（D61）：「TA 能帮你」一句话——首页今日要事人物事项、导入后关联计划候选卡、详情「为什么是 TA」首行三处共用。
 *
 * 只渲染 `contactValueLine` 算好的模型（纯展示，不读数据、不调用 AI）：
 * - ready：「TA 能帮你：{goal_relation}」+「依据」小签（名片／录入／memo 9/28／计划需求『…』）+（计划行动）「为什么现在：…」。
 * - 退化（虚线边）：「{公司 · 职位｜姓名}」+「可能对应：计划需求『…』 · 同属 {行业}」+ 灰字状态尾巴（生成中／暂时没生成出来／
 *   设置关系目标后生成，后者链到目标设置）。永不空白。
 *
 * 样式自带（`.cvl` 作用域），三处宿主各自的作用域不影响它。
 */
import type { ReactNode } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { insightEvidenceKind } from "../../../../../features/contacts/insights/evidence-labels";
import type { ContactValueLineData } from "../../../../../features/contacts/insights/value-lines";
import type { ContactValueLineEvidence, ContactValueLineModel } from "./contact-value";

export const CONTACT_VALUE_LINE_STYLES = `
.cvl { display: flex; flex-direction: column; gap: 4px; margin: 0; font-size: 13px; line-height: 1.55; color: #0E1225; text-align: left; }
.cvl p { margin: 0; }
.cvl .cvl-lead { color: #4B4FC7; font-weight: 600; }
.cvl .cvl-rel { font-size: 14px; }
.cvl .cvl-ev { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; font-size: 12px; color: #6B6F99; }
.cvl .cvl-chip { display: inline-flex; align-items: center; padding: 1px 8px; border-radius: 999px; background: #EEEFFD; color: #3B3F7A; font-size: 11px; text-decoration: none; }
.cvl a.cvl-chip:hover { background: #DDDEFA; color: #0E1225; }
.cvl .cvl-now { font-size: 13px; color: #3B3F7A; }
.cvl.cvl-fallback { border: 1px dashed #C9CBF0; border-radius: 8px; padding: 6px 10px; background: #FBFBFF; }
.cvl .cvl-who { font-size: 13px; color: #6B6F99; }
.cvl .cvl-ctx { font-size: 13px; color: #3B3F7A; }
.cvl .cvl-tail { font-size: 12px; color: #8A8DB3; }
.cvl a.cvl-tail { color: #4B4FC7; text-decoration: underline; }
`;

export function ContactValueLine({
  model,
  evidenceHref,
  showWho = true,
  after = null,
  showTail = true,
}: {
  model: ContactValueLineModel;
  /** 依据小签的链接（详情：跳到时间线那条／计划需求）；缺省不链接。 */
  evidenceHref?: (evidence: ContactValueLineEvidence, index: number) => string | null;
  /** 退化时是否显示「公司 · 职位」（宿主已在标题行显示时传 false）。 */
  showWho?: boolean;
  /** 依据之后追加的内容（候选卡的「对应 需求」行）。 */
  after?: ReactNode;
  /** 退化时是否显示状态尾巴（详情由面板自己的 W0057 状态行承担，传 false）。 */
  showTail?: boolean;
}) {
  const { t } = useOrbitLanguage();
  const whyNow = model.whyNow ? (
    <p className="cvl-now" data-value-line-why-now>
      <span className="cvl-lead">{t({ en: "Why now: ", zh: "为什么现在：" })}</span>
      {model.whyNow}
    </p>
  ) : null;
  if (model.kind === "ready") {
    return (
      <div className="cvl" data-contact-value-line="ready">
        <style>{CONTACT_VALUE_LINE_STYLES}</style>
        <p className="cvl-rel">
          <span className="cvl-lead">{t({ en: "How they can help: ", zh: "TA 能帮你：" })}</span>
          <span data-value-line-relation>{model.relation}</span>
        </p>
        {model.evidence.length > 0 ? (
          <p className="cvl-ev" aria-label={t({ en: "Evidence", zh: "依据" })} data-value-line-evidence>
            <span className="cvl-ev-l">{t({ en: "Based on", zh: "依据" })}</span>
            {model.evidence.map((evidence, index) => {
              const href = evidenceHref?.(evidence, index) ?? null;
              return href ? (
                <a className="cvl-chip" data-value-line-evidence-kind={insightEvidenceKind(evidence.label)} href={href} key={`${evidence.text}:${index}`}>
                  {evidence.text}
                </a>
              ) : (
                <span className="cvl-chip" data-value-line-evidence-kind={insightEvidenceKind(evidence.label)} key={`${evidence.text}:${index}`}>
                  {evidence.text}
                </span>
              );
            })}
          </p>
        ) : null}
        {after}
        {whyNow}
      </div>
    );
  }
  return (
    <div className="cvl cvl-fallback" data-contact-value-line={model.state}>
      <style>{CONTACT_VALUE_LINE_STYLES}</style>
      {showWho ? <p className="cvl-who" data-value-line-who>{model.who}</p> : null}
      {model.context ? <p className="cvl-ctx" data-value-line-context>{model.context}</p> : null}
      {after}
      {!showTail ? null : model.tailHref ? (
        <a className="cvl-tail" data-value-line-tail href={model.tailHref}>
          {model.tail}
        </a>
      ) : (
        <p className="cvl-tail" data-value-line-tail>{model.tail}</p>
      )}
      {whyNow}
    </div>
  );
}

export const CONTACT_VALUE_LINES_URL = "/api/contacts/value-lines";

/** `GET /api/contacts/value-lines` 的一项（与服务端 `ContactValueLineData` 同形）。 */
export type ContactValueLineItem = ContactValueLineData;

/**
 * 一次批量只读请求（≤20 个 id，本人范围）。失败抛错，由调用方决定退回原样显示。
 * 读取 0 次模型调用（服务端只读 `contact_insights` 窄列）。
 */
export async function fetchContactValueLines(
  contactIds: readonly string[],
  language: "zh" | "en",
  signal?: AbortSignal,
  options: { insightOnly?: boolean } = {},
): Promise<ContactValueLineItem[]> {
  const ids = [...new Set(contactIds.filter(Boolean))].slice(0, 20);
  if (!ids.length) return [];
  const fields = options.insightOnly ? "&fields=insight" : "";
  const response = await fetch(`${CONTACT_VALUE_LINES_URL}?ids=${ids.map(encodeURIComponent).join(",")}&lang=${language}${fields}`, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const body = (await response.json().catch(() => null)) as { data?: { lines?: unknown } } | null;
  if (!response.ok || !Array.isArray(body?.data?.lines)) throw new Error(`HTTP ${response.status}`);
  return body.data.lines as ContactValueLineItem[];
}
