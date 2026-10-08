/**
 * 引导第 1 步「名片」（W0006）。三个名片槽位：已确认 ✓ / 待确认 / 空（虚线）；
 * 「已确认 x / 3」与待确认张数；扫名片直接复用人脉导入的批量上传与确认界面（CardBatchImport，
 * 状态机由引导页顶层持有）。W0054（RN-12）：第 1 步只认 3 位已确认联系人，不能跳过；「扫名片」旁常驻
 * 「导入人脉」（W0053 的 CSV／vCard 导入，W54-2），识别不可用时它升为主按钮；导入的已确认联系人照样计入。
 */
"use client";

import { START_REQUIRED_CONTACTS, type StartContactSample } from "../../../../features/guide/start-steps";
import { CardBatchImport } from "../contacts/card-batch-0918/card-batch-ui";
import type { CardBatch } from "../contacts/card-batch-0918/use-card-batch";
import { useOrbitLanguage } from "../orbit-language-context";

/** W54-2：「导入人脉」去 W0053 的导入页（CSV／vCard 一栏）。 */
export const START_IMPORT_HREF = "/app/contacts/new?method=csv";

interface Slot {
  kind: "confirmed" | "empty" | "pending";
  name: string;
  sub: string;
}

export function StepCards({
  batch,
  cardScanAvailable,
  confirmedContacts,
  done,
  onBatchStarted,
  onNext,
  onReset,
  onScan,
  samples,
  scanOpen,
}: {
  batch: CardBatch;
  cardScanAvailable: boolean;
  confirmedContacts: number;
  done: boolean;
  onBatchStarted: (batchId: string) => void;
  onNext: () => void;
  onReset: () => void;
  onScan: () => void;
  samples: readonly StartContactSample[];
  scanOpen: boolean;
}) {
  const { t } = useOrbitLanguage();
  // 待确认 = 本批次识别完、还要人看一眼的名片（和导入页的「待确认」同一口径）。
  const pendingCards = batch.reviewing ? batch.pending : [];
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
  for (const card of pendingCards) {
    if (slots.length >= START_REQUIRED_CONTACTS) break;
    const name = batch.drafts[card.cardId]?.fields.displayName?.trim();
    slots.push({
      kind: "pending",
      name: name || t({ en: "Name not read yet", zh: "姓名待确认" }),
      sub: t({ en: "Waiting for your check", zh: "等你确认" }),
    });
  }
  while (slots.length < START_REQUIRED_CONTACTS) {
    const index = slots.length + 1;
    slots.push({ kind: "empty", name: "", sub: t({ en: `Card ${index}`, zh: `第 ${index} 张` }) });
  }

  const showImport = scanOpen || Boolean(batch.batchId) || !cardScanAvailable;
  const why = done
    ? t({
        en: `${confirmedContacts} contacts confirmed — enough for the plan to see who can help.`,
        zh: `已确认 ${confirmedContacts} 位联系人，计划能看出谁帮得上忙了。`,
      })
    : pendingCards.length > 0
      ? t({
          en: `Your plan looks at who in your network can help. You have ${pendingCards.length} card(s) waiting — confirm them to get closer to 3.`,
          zh: `计划要分析你现有的人脉能帮上什么。你有 ${pendingCards.length} 张名片还没确认，确认完就离 3 位更近了。`,
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
            {slot.kind === "pending" ? <i>{t({ en: "To confirm", zh: "待确认" })}</i> : null}
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
        {pendingCards.length > 0 ? (
          <span data-start-pending-count>
            {t({ en: "To confirm ", zh: "待确认 " })}
            <b>{pendingCards.length}</b>
            {t({ en: "", zh: " 张" })}
          </span>
        ) : null}
      </div>

      {showImport ? (
        <CardBatchImport
          available={cardScanAvailable}
          batch={batch}
          onBatchStarted={onBatchStarted}
          onReset={onReset}
          t={t}
        />
      ) : null}

      <div className="sg-acts">
        {!showImport ? (
          <button className="btn sg-primary" data-start-scan onClick={onScan} type="button">
            {t({ en: "Scan cards", zh: "扫名片" })}
          </button>
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
