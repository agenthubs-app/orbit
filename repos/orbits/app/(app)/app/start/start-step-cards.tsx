/**
 * 引导第 1 步「名片」（W0006）。三个名片槽位：已确认 ✓ / 待确认 / 空（虚线）；
 * 「已确认 x / 3」；扫名片进入 B 线的批次上传与确认路由。W0054（RN-12）：第 1 步只认 3 位已确认联系人，不能跳过；「扫名片」旁常驻
 * 「导入人脉」（W0053 的 CSV／vCard 导入，W54-2），识别不可用时它升为主按钮；导入的已确认联系人照样计入。
 */
"use client";

import { START_REQUIRED_CONTACTS, type StartContactSample } from "../../../../features/guide/start-steps";
import { useOrbitLanguage } from "../orbit-language-context";

/** W54-2：「导入人脉」去 W0053 的导入页（CSV／vCard 一栏）。 */
export const START_IMPORT_HREF = "/app/contacts/new?method=csv";
export const START_SCAN_HREF = "/app/contacts/new/scan";

interface Slot {
  kind: "confirmed" | "empty";
  name: string;
  sub: string;
}

export function StepCards({
  cardScanAvailable,
  confirmedContacts,
  done,
  onNext,
  samples,
}: {
  cardScanAvailable: boolean;
  confirmedContacts: number;
  done: boolean;
  onNext: () => void;
  samples: readonly StartContactSample[];
}) {
  const { t } = useOrbitLanguage();
  const confirmedShown = Math.min(confirmedContacts, START_REQUIRED_CONTACTS);

  const slots: Slot[] = [];
  for (let index = 0; index < confirmedShown; index += 1) {
    const sample = samples[index];
    slots.push({
      kind: "confirmed",
      name: sample?.displayName ?? t({ en: `Contact ${index + 1}`, zh: `第 ${index + 1} 位联系人` }),
      sub: sample ? [sample.organization, sample.role].filter(Boolean).join(" · ") : "",
    });
  }
  while (slots.length < START_REQUIRED_CONTACTS) {
    const index = slots.length + 1;
    slots.push({ kind: "empty", name: "", sub: t({ en: `Card ${index}`, zh: `第 ${index} 张` }) });
  }

  const why = done
    ? t({
        en: `${confirmedContacts} contacts confirmed — enough for the plan to see who can help.`,
        zh: `已确认 ${confirmedContacts} 位联系人，计划能看出谁帮得上忙了。`,
      })
    : t({
          en: "Your plan looks at who in your network can help. One card per photo — you can pick several at once.",
          zh: "计划要分析你现有的人脉能帮上什么。一张照片一张名片，可以一次选多张。",
        });

  return (
    <article className="sg-lead" data-start-module="1">
      <div className="sg-meta">
        <span className="sg-pill">{t({ en: "Step 1 · Cards", zh: "第 1 步 · 名片" })}</span>
        {done ? <span className="sg-pill sg-pill-good">{t({ en: "✓ Done", zh: "✓ 已完成" })}</span> : null}
      </div>
      <h2>{t({ en: "Add at least 3 business cards", zh: "放进至少 3 张名片" })}</h2>
      <p className="sg-why">{why}</p>
      <div className="sg-slots" data-start-slots>
        {slots.map((slot, index) => (
          <div className="sg-slot" data-slot={slot.kind} key={`${slot.kind}-${index}`}>
            {slot.kind === "confirmed" ? <i>{t({ en: "✓ Confirmed", zh: "✓ 已确认" })}</i> : null}
            {slot.name ? <b>{slot.name}</b> : null}
            {slot.sub ? <span>{slot.sub}</span> : null}
          </div>
        ))}
      </div>
      <div className="sg-count" data-start-card-count>
        <span>
          {t({ en: "Confirmed ", zh: "已确认 " })}
          <b>
            {confirmedShown} / {START_REQUIRED_CONTACTS}
          </b>
        </span>
      </div>

      <div className="sg-acts">
        {cardScanAvailable ? (
          <a className="btn sg-primary" data-start-scan href={START_SCAN_HREF}>
            {t({ en: "Scan cards", zh: "扫名片" })}
          </a>
        ) : null}
        {/* W54-2：导入人脉常驻（CSV／vCard，W0053）；名片识别不可用（且这一步还没完成）时升为主按钮。 */}
        <a
          className={`btn ${cardScanAvailable || done ? "sg-secondary" : "sg-primary"}`}
          data-start-import
          href={START_IMPORT_HREF}
        >
          {t({ en: "Import contacts", zh: "导入人脉" })}
        </a>
        {done ? (
          <button className="btn sg-primary" data-start-next onClick={onNext} type="button">
            {t({ en: "Next →", zh: "下一步 →" })}
          </button>
        ) : null}
      </div>
    </article>
  );
}
