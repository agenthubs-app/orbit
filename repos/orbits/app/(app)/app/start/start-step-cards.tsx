/**
 * 引导第 1 步「名片」（W0006）。三个名片槽位：已确认 ✓ / 待确认 / 空（虚线）；
 * 「已确认 x / 3」与待确认张数；扫名片直接复用人脉导入的批量上传与确认界面（CardBatchImport，
 * 状态机由引导页顶层持有）；不够 3 位时可以「先这样，继续」，并说明代价。
 */
"use client";

import { START_REQUIRED_CONTACTS, type StartContactSample } from "../../../../features/guide/start-steps";
import { CardBatchImport } from "../contacts/card-batch-0918/card-batch-ui";
import type { CardBatch } from "../contacts/card-batch-0918/use-card-batch";
import { useOrbitLanguage } from "../orbit-language-context";

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
  onSkip,
  samples,
  scanOpen,
  skipError,
  skipped,
  skipping,
}: {
  batch: CardBatch;
  cardScanAvailable: boolean;
  confirmedContacts: number;
  done: boolean;
  onBatchStarted: (batchId: string) => void;
  onNext: () => void;
  onReset: () => void;
  onScan: () => void;
  onSkip: () => void;
  samples: readonly StartContactSample[];
  scanOpen: boolean;
  skipError: string;
  skipped: boolean;
  skipping: boolean;
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
    ? skipped && confirmedContacts < START_REQUIRED_CONTACTS
      ? t({
          en: "You chose to continue for now. Cards you scan later still count toward your network analysis.",
          zh: "你选择了先继续。之后扫的名片，照样会补进计划里的人脉分析。",
        })
      : t({
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
        {done ? (
          <button className="btn sg-primary" data-start-next onClick={onNext} type="button">
            {t({ en: "Next →", zh: "下一步 →" })}
          </button>
        ) : null}
      </div>

      {done ? null : (
        <div className="sg-skip" data-start-skip>
          <span>
            {confirmedContacts > 0
              ? t({
                  en: `You can continue with ${confirmedContacts} contact(s), but the "who in your network can help" part of the plan will be thin.`,
                  zh: `只有 ${confirmedContacts} 位联系人也可以继续，但计划里「现有人脉能帮上什么」会比较单薄。`,
                })
              : t({
                  en: `You can continue without contacts, but the "who in your network can help" part of the plan will be empty.`,
                  zh: "还没有联系人也可以继续，但计划里「现有人脉能帮上什么」这部分会是空的。",
                })}
          </span>
          <button
            aria-busy={skipping ? "true" : undefined}
            className="btn sg-link sg-muted"
            data-start-skip-button
            disabled={skipping}
            onClick={onSkip}
            type="button"
          >
            {t({ en: "Continue for now →", zh: "先这样，继续 →" })}
          </button>
        </div>
      )}
      <p className="sg-error" role="alert">
        {skipError}
      </p>
    </article>
  );
}
