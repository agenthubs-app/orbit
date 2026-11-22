/**
 * 名片批量导入界面（新用户引导第 5 步 / 人脉「导入人脉」/ 全站提醒共用），新 UI 浅紫色版：
 *   - 上传：新用户引导.dc.html「批量上传名片照片」（CardBatchUploader）
 *   - 正在解析：06b 名片解析中
 *   - 确认：Network v2「10 名片确认」；全部处理后显示本批小结
 *   - 提醒：新用户引导.dc.html 621–650 行（解析中胶囊 / 完成弹窗 / 待确认胶囊）
 * 设计稿按「置信度 %」着色，识别管线不产出逐字段置信度，这里只用真实依据（reviewIssues、正反面冲突、空字段、是否改过）。
 */
"use client";

import { useEffect, useRef } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { INDUSTRY_CATALOG, isIndustryIdCode, listSecondaryIndustries } from "../../../../../shared/domain/industries";
import { REGION_CITY_ALIASES, REGION_COMMON_COUNTRY_CODES, countryDisplayName, regionDisplayName } from "../../../../../shared/domain/regions";
import { SENIORITY_GROUP_LABELS, SENIORITY_LEVELS, SENIORITY_LEVEL_LABELS, seniorityGroup } from "../../../../../shared/domain/seniority";
import { INGEST_V2_API_BASE, postAction } from "../ingest-v2/ingest-v2-client";
import { IngestV2PrivateImage } from "../ingest-v2/ingest-v2-private-image";
import {
  fieldCandidates,
  industryCandidates,
  initialCardDraft,
  regionCandidates,
  seniorityCandidates,
  setDraftFieldSource,
  setDraftIndustry,
  setDraftRegion,
  setDraftSeniority,
  setManualDraftField,
  setManualDraftNotes,
  type IngestV2CardDraft,
  type IngestV2CardViewModel,
  type IngestV2Field,
} from "../ingest-v2/ingest-v2-route-view-model";
import {
  INGEST_V2_FIELDS,
  cardReason,
  fieldTag,
  flaggedFields,
  isCardSkipped,
  type Copy,
} from "./card-batch-model";
import { CARD_BATCH_STYLES } from "./card-batch-styles";
import { CardBatchUploader } from "./card-batch-uploader";
import type { CardBatch, CardBatchAttributionEvent, ContactCandidate } from "./use-card-batch";

type T = (copy: Copy) => string;
export type BrowseTarget = "home" | "events";

const FIELD_LABELS: Record<IngestV2Field, Copy> = {
  displayName: { ja: "名前", zh: "姓名", en: "Name" },
  organization: { ja: "会社", zh: "公司", en: "Company" },
  role: { ja: "役職", zh: "职位", en: "Title" },
  email: { ja: "メール", zh: "邮箱", en: "Email" },
  phone: { ja: "電話", zh: "电话", en: "Phone" },
  address: { ja: "住所", zh: "地址", en: "Address" },
};

function industryPairLabel(pair: { primaryIndustryId: string; secondaryIndustryId: string | null }, t: T): string {
  const primary = INDUSTRY_CATALOG.find(industry => industry.id === pair.primaryIndustryId);
  const secondary = isIndustryIdCode(pair.primaryIndustryId)
    ? listSecondaryIndustries(pair.primaryIndustryId).find(industry => industry.id === pair.secondaryIndustryId)
    : undefined;
  return [primary ? t(primary.labels) : pair.primaryIndustryId, secondary ? t(secondary.labels) : null].filter(Boolean).join(" › ");
}

type EnterTarget = { tagName?: string; getAttribute?: (name: string) => string | null; closest?: (selector: string) => unknown } | null;

/**
 * 回车确认（设计稿 ↵）只在单行输入框和页面空白处生效：多行文本、按钮、勾选框、下拉框（含 combobox /
 * listbox 角色及其选项）里的回车属于控件本身——在行业下拉上按回车是选中选项，不能顺手把整张名片确认掉。
 */
export function enterConfirmsReview(event: { key: string; isComposing?: boolean; target: unknown }): boolean {
  if (event.key !== "Enter" || event.isComposing) return false;
  const target = event.target as EnterTarget;
  const tag = target?.tagName?.toUpperCase();
  if (tag === "TEXTAREA" || tag === "BUTTON" || tag === "SELECT" || tag === "OPTION") return false;
  // 勾选框（活动归属询问）上的回车不能顺手确认整张名片。
  const type = target?.getAttribute?.("type")?.toLowerCase();
  if (tag === "INPUT" && (type === "checkbox" || type === "radio")) return false;
  const role = target?.getAttribute?.("role");
  if (role === "combobox" || role === "listbox" || role === "option") return false;
  return !target?.closest?.('[role="listbox"], [role="combobox"]');
}

export function useReviewEnterConfirm(enabled: boolean, confirm: () => void): void {
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;
  useEffect(() => {
    if (!enabled) return;
    function onKey(event: KeyboardEvent) {
      if (!enterConfirmsReview(event)) return;
      event.preventDefault();
      confirmRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/**
 * 「行业」一行（一级 › 二级）：初值是识别时 AI 按受控分类给出的行业，可改可清空；
 * 换一级时清空二级，与联系人行业编辑器同一规则。
 */
export function IndustryField({ baseline, busy, candidates = [], draft, onChange, t }: {
  baseline: IngestV2CardDraft;
  busy: boolean;
  /** 各面识别出的行业；正反面冲突时作为「可能是」选项。 */
  candidates?: readonly { primaryIndustryId: string; secondaryIndustryId: string | null }[];
  draft: IngestV2CardDraft;
  onChange: (selection: { primaryIndustryId: string | null; secondaryIndustryId: string | null }) => void;
  t: T;
}) {
  const primary = draft.industry.primaryIndustryId;
  const secondary = draft.industry.secondaryIndustryId;
  const edited = draft.industry.edited
    && (primary !== baseline.industry.primaryIndustryId || secondary !== baseline.industry.secondaryIndustryId);
  // 正反面行业不一致：不预选，标「请核对」，直到用户选定或清空（选「未分类」也算处理过）。
  const tag = fieldTag({ edited, flagged: draft.industry.conflicted, value: primary ?? "" });
  const primaryLabel = t({ ja: "業界（大分類）", zh: "一级行业", en: "Primary industry" });
  const secondaryLabel = t({ ja: "業界（小分類）", zh: "二级行业", en: "Secondary industry" });
  return (
    <div className={`cb-rfield cb-rfield-${tag.kind}`} data-review-field="industry">
      <span className="cb-rfield-head"><span>{t({ ja: "業界", zh: "行业", en: "Industry" })}</span><span className={`cb-rtag cb-rtag-${tag.kind}`}>{t(tag.label)}</span></span>
      <span className="cb-rindustry">
        <select
          aria-label={primaryLabel}
          className="cb-rinput"
          disabled={busy}
          onChange={event => onChange({ primaryIndustryId: event.target.value || null, secondaryIndustryId: event.target.value === primary ? secondary : null })}
          value={primary ?? ""}
        >
          <option value="">{t({ ja: "未分類", zh: "未分类", en: "Unclassified" })}</option>
          {INDUSTRY_CATALOG.map(industry => <option key={industry.id} value={industry.id}>{t(industry.labels)}</option>)}
        </select>
        <span aria-hidden className="cb-rindustry-sep">›</span>
        <select
          aria-label={secondaryLabel}
          className="cb-rinput"
          disabled={busy || !primary}
          onChange={event => onChange({ primaryIndustryId: primary, secondaryIndustryId: event.target.value || null })}
          value={secondary ?? ""}
        >
          <option value="">{t({ ja: "小分類は未入力", zh: "二级未填写", en: "Not set" })}</option>
          {isIndustryIdCode(primary) ? listSecondaryIndustries(primary).map(industry => <option key={industry.id} value={industry.id}>{t(industry.labels)}</option>) : null}
        </select>
      </span>
      {draft.industry.conflicted ? (
        <span className="cb-alts" data-industry-conflict>
          {t({ ja: "表と裏で業界が違います。候補：", zh: "正反面行业不一致，可能是", en: "The sides disagree — maybe" })}
          {candidates.map(candidate => (
            <button className="btn cb-alt" key={`${candidate.primaryIndustryId}|${candidate.secondaryIndustryId}`} onClick={() => onChange(candidate)} type="button">
              {industryPairLabel(candidate, t)}
            </button>
          ))}
          <button className="btn cb-alt" onClick={() => onChange({ primaryIndustryId: null, secondaryIndustryId: null })} type="button">{t({ ja: "どちらも違う。空欄にする", zh: "都不对，留空", en: "Neither — leave empty" })}</button>
        </span>
      ) : null}
    </div>
  );
}

/**
 * W0045「职级」一行：六档下拉 + 派生分组提示（决策层／管理层／执行层）。初值是识别时 AI 按职位推断的职级，
 * 可改可清空；正反面不一致时不预选、标「请核对」。来源（AI／手动）由服务端确认时判定。
 */
export function SeniorityField({ baseline, busy, candidates = [], draft, onChange, t }: {
  baseline: IngestV2CardDraft;
  busy: boolean;
  candidates?: readonly string[];
  draft: IngestV2CardDraft;
  onChange: (value: string | null) => void;
  t: T;
}) {
  const value = draft.seniority?.value ?? null;
  const edited = Boolean(draft.seniority?.edited) && value !== (baseline.seniority?.value ?? null);
  const conflicted = draft.seniority?.conflicted === true;
  const tag = fieldTag({ edited, flagged: conflicted, value: value ?? "" });
  const levelLabel = (level: string) => SENIORITY_LEVEL_LABELS[level as keyof typeof SENIORITY_LEVEL_LABELS] ?? { ja: level, zh: level, en: level };
  return (
    <div className={`cb-rfield cb-rfield-${tag.kind}`} data-review-field="seniority">
      <span className="cb-rfield-head"><span>{t({ ja: "役職層", zh: "职级", en: "Seniority" })}</span><span className={`cb-rtag cb-rtag-${tag.kind}`}>{t(tag.label)}</span></span>
      <span className="cb-rindustry">
        <select aria-label={t({ ja: "役職層", zh: "职级", en: "Seniority" })} className="cb-rinput" disabled={busy} onChange={event => onChange(event.target.value || null)} value={value ?? ""}>
          <option value="">{t({ ja: "未入力", zh: "未填写", en: "Not set" })}</option>
          {SENIORITY_LEVELS.map(level => <option key={level} value={level}>{t(levelLabel(level))}</option>)}
        </select>
        {value ? <span className="cb-rhint" data-seniority-group>{t({ ja: "グループ：", zh: "分组：", en: "Group: " })}{t(SENIORITY_GROUP_LABELS[seniorityGroup(value)])}</span> : null}
      </span>
      {conflicted ? (
        <span className="cb-alts" data-seniority-conflict>
          {t({ ja: "表と裏で役職層が違います。候補：", zh: "正反面职级不一致，可能是", en: "The sides disagree — maybe" })}
          {candidates.map(level => <button className="btn cb-alt" key={level} onClick={() => onChange(level)} type="button">{t(levelLabel(level))}</button>)}
          <button className="btn cb-alt" onClick={() => onChange(null)} type="button">{t({ ja: "どちらも違う。空欄にする", zh: "都不对，留空", en: "Neither — leave empty" })}</button>
        </span>
      ) : null}
    </div>
  );
}

/**
 * W0045「地区」一行：国家（ISO 两位码，显示名由 Intl 生成）+ 城市（规范英文名，可输入；常见城市有提示）。
 * 原始地址文字不变；正反面不一致时不预选、标「请核对」。
 */
export function RegionField({ baseline, busy, candidates = [], draft, onChange, t }: {
  baseline: IngestV2CardDraft;
  busy: boolean;
  candidates?: readonly { countryCode: string; city: string | null }[];
  draft: IngestV2CardDraft;
  onChange: (selection: { countryCode: string | null; city: string | null }) => void;
  t: T;
}) {
  // 国家显示名跟随当前界面语言（Intl.DisplayNames 生成）。
  const picked = t({ ja: "ja", zh: "zh", en: "en" });
  const language: OrbitLanguage = picked === "ja" || picked === "en" ? picked : "zh";
  const countryCode = draft.region?.countryCode ?? null;
  const city = draft.region?.city ?? null;
  const edited = Boolean(draft.region?.edited)
    && (countryCode !== (baseline.region?.countryCode ?? null) || (city ?? "") !== (baseline.region?.city ?? ""));
  const conflicted = draft.region?.conflicted === true;
  const tag = fieldTag({ edited, flagged: conflicted, value: countryCode ?? "" });
  const countries = countryCode && !REGION_COMMON_COUNTRY_CODES.includes(countryCode) ? [countryCode, ...REGION_COMMON_COUNTRY_CODES] : REGION_COMMON_COUNTRY_CODES;
  const cityListId = "cb-region-cities";
  return (
    <div className={`cb-rfield cb-rfield-${tag.kind}`} data-review-field="region">
      <span className="cb-rfield-head"><span>{t({ ja: "地域", zh: "地区", en: "Region" })}</span><span className={`cb-rtag cb-rtag-${tag.kind}`}>{t(tag.label)}</span></span>
      <span className="cb-rindustry">
        <select
          aria-label={t({ ja: "国・地域", zh: "国家／地区", en: "Country" })}
          className="cb-rinput"
          disabled={busy}
          onChange={event => onChange({ countryCode: event.target.value || null, city: event.target.value === countryCode ? city : null })}
          value={countryCode ?? ""}
        >
          <option value="">{t({ ja: "未入力", zh: "未填写", en: "Not set" })}</option>
          {countries.map(code => <option key={code} value={code}>{countryDisplayName(code, language)}</option>)}
        </select>
        <span aria-hidden className="cb-rindustry-sep">›</span>
        <input
          aria-label={t({ ja: "都市", zh: "城市", en: "City" })}
          className="cb-rinput"
          disabled={busy || !countryCode}
          list={cityListId}
          onChange={event => onChange({ countryCode, city: event.target.value })}
          placeholder={t({ ja: "都市（英語。例：Tokyo）", zh: "城市（英文，如 Tokyo）", en: "City (e.g. Tokyo)" })}
          value={city ?? ""}
        />
        <datalist id={cityListId}>
          {REGION_CITY_ALIASES.filter(entry => entry.countryCode === countryCode).map(entry => <option key={entry.city} value={entry.city}>{entry.labels[language]}</option>)}
        </datalist>
      </span>
      {conflicted ? (
        <span className="cb-alts" data-region-conflict>
          {t({ ja: "表と裏で地域が違います。候補：", zh: "正反面地区不一致，可能是", en: "The sides disagree — maybe" })}
          {candidates.map(candidate => (
            <button className="btn cb-alt" key={`${candidate.countryCode}|${candidate.city ?? ""}`} onClick={() => onChange(candidate)} type="button">
              {regionDisplayName(candidate, language)}
            </button>
          ))}
          <button className="btn cb-alt" onClick={() => onChange({ countryCode: null, city: null })} type="button">{t({ ja: "どちらも違う。空欄にする", zh: "都不对，留空", en: "Neither — leave empty" })}</button>
        </span>
      ) : null}
    </div>
  );
}

const ATTRIBUTION_TIME_ZONE = "Asia/Tokyo";

function attributionDate(startsAt: string, t: T): string {
  const date = new Date(startsAt);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "numeric", timeZone: ATTRIBUTION_TIME_ZONE }).formatToParts(date);
  const month = parts.find(part => part.type === "month")?.value ?? "";
  const day = parts.find(part => part.type === "day")?.value ?? "";
  return t({
    ja: `${month}月${day}日`,
    zh: `${month}月${day}日`,
    en: new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: ATTRIBUTION_TIME_ZONE }).format(date),
  });
}

/**
 * W0015 审阅页顶部的活动归属询问：当前这张名片的扫描时间落在本人已报名活动开始日当天或次日（东京时间）
 * 时出现，默认勾选，决定只属于这张名片。勾选时确认后联系人记下「在该活动认识」、计划里这场活动标为已参加；
 * 取消勾选则都不写。有候选的名片不会被自动导入，一定经过这里。
 */
export function EventAttributionPrompt({ busy, event, on, onChange, t }: {
  busy: boolean;
  event: CardBatchAttributionEvent;
  on: boolean;
  onChange: (on: boolean) => void;
  t: T;
}) {
  const date = attributionDate(event.startsAt, t);
  return (
    <label className="cb-attr" data-event-attribution={event.eventId}>
      <input checked={on} disabled={busy} onChange={changeEvent => onChange(changeEvent.target.checked)} type="checkbox" />
      <span className="cb-attr-copy">
        <strong>{t({ ja: `この名刺の人とは「${event.title}」で出会いましたか？`, zh: `这张名片是在「${event.title}」认识的吗？`, en: `Did you meet this person at “${event.title}”?` })}</strong>
        <span>
          {t({
            ja: `このイベント（${date}）に申し込んでいて、名刺は当日か翌日にスキャンされています。チェックすると、確認した連絡先に出会ったイベントとして記録し、プランのこのイベントを参加済みにします。`,
            zh: `你报名了这场活动（${date}），这张名片是在当天或次日扫的。勾选后，确认的联系人会记下来源活动，计划里这场活动标为已参加。`,
            en: `You registered for this event (${date}) and scanned this card that day or the next. If ticked, the confirmed contact records it as where you met, and the event is marked attended in your plan.`,
          })}
        </span>
      </span>
    </label>
  );
}

/** 名片导入区：无批次时是上传区，有批次时依次是正在解析 → 确认 → 小结。自带作用域样式 .cbx。 */
export function CardBatchImport(props: {
  available: boolean;
  batch: CardBatch;
  onBatchStarted: (batchId: string) => void;
  /** 引导页内切到预览；不传时「等待的时候」给出站内真实链接。 */
  onBrowse?: (target: BrowseTarget) => void;
  onReset: () => void;
  t: T;
}) {
  return (
    <div className="cbx">
      <style>{CARD_BATCH_STYLES}</style>
      <CardBatchImportBody {...props} />
    </div>
  );
}

function CardBatchImportBody({
  available, batch, onBatchStarted, onBrowse, onReset, t,
}: {
  available: boolean;
  batch: CardBatch;
  onBatchStarted: (batchId: string) => void;
  onBrowse?: (target: BrowseTarget) => void;
  onReset: () => void;
  t: T;
}) {
  if (!available) {
    return (
      <div className="cb-source cb-source-off">
        <span className="cb-source-glyph" aria-hidden>▭</span>
        <span className="cb-source-body">
          <strong>{t({ ja: "名刺をまとめてスキャン", zh: "扫描名片夹", en: "Scan business cards" })}</strong>
          <span>{t({ ja: "名刺の読み取りはまだ使えません。あとで人脈ページから使えます", zh: "名片识别暂未开放，之后可在人脉页使用", en: "Card recognition isn't available yet — use it later from Network" })}</span>
        </span>
      </div>
    );
  }
  if (!batch.batchId) {
    return (
      <CardBatchUploader onStarted={onBatchStarted} t={t} />
    );
  }
  return <BatchView batch={batch} onBrowse={onBrowse} onReset={onReset} t={t} />;
}

function BatchView({ batch, onBrowse, onReset, t }: { batch: CardBatch; onBrowse?: (target: BrowseTarget) => void; onReset: () => void; t: T }) {
  const {
    act, active, attributed, attribution, attributionDecisions, setAttributionDecision, autoCount, autoRunning, busy, cards, detail, drafts, duplicates, error, finished, isHandled,
    matches, mergedCount, laterCount, laterSet, loadFailed, missing, openCard, pending, pumpUploads, queue, reattach, reviewing, setAside,
    setDrafts, setSide, setZoom, settledCount, side, stage, status, uploadFailed, userCount, zoom,
  } = batch;
  const batchId = batch.batchId!;
  const reattachRef = useRef<HTMLInputElement | null>(null);

  useReviewEnterConfirm(reviewing && !finished, () => void act("confirm"));

  if (!detail) {
    return loadFailed ? (
      <div className="cb-notice cb-notice-warning" role="alert">
        {t({ ja: "この名刺のまとまりを読み込めません（期限切れの可能性があります）。", zh: "这批名片读取不到了（可能已过期）。", en: "This batch can't be loaded (it may have expired)." })}
        <button className="btn cb-btn-soft" onClick={onReset} type="button">{t({ ja: "もう一度アップロード", zh: "重新上传", en: "Upload again" })}</button>
      </div>
    ) : <ParsingPanel autoRunning={false} cards={[]} drafts={{}} missing={0} onBrowse={onBrowse} onReattach={() => undefined} onRetry={() => undefined} settled={0} stage="upload" t={t} total={0} uploadFailed={false} />;
  }

  if (status === "cancelled" || status === "expired") {
    return (
      <div className="cb-notice cb-notice-warning" role="alert">
        {status === "expired" ? t({ ja: "このまとまりは期限切れです。確認済みの連絡先は残っています。", zh: "这批名片已过期，已确认的联系人都保留了。", en: "This batch expired; confirmed contacts were kept." }) : t({ ja: "このまとまりは取り消されました。", zh: "这批名片已取消。", en: "This batch was cancelled." })}
        <button className="btn cb-btn-soft" onClick={onReset} type="button">{t({ ja: "もう一度アップロード", zh: "重新上传", en: "Upload again" })}</button>
      </div>
    );
  }

  if (!reviewing) {
    return (
      <>
        <input accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" className="cb-sr" multiple onChange={event => { void reattach(event.target.files); event.target.value = ""; }} ref={reattachRef} tabIndex={-1} type="file" aria-hidden />
        <ParsingPanel
          autoRunning={autoRunning}
          cards={cards}
          drafts={drafts}
          missing={missing}
          onBrowse={onBrowse}
          settled={settledCount}
          onReattach={() => reattachRef.current?.click()}
          onRetry={() => void pumpUploads()}
          stage={stage}
          t={t}
          total={cards.length}
          uploadFailed={uploadFailed}
        />
      </>
    );
  }

  if (finished || !active) {
    // 按每张名片实际写入的来源活动分组（确认回执里的 metEventId）。
    const attributedByEvent = new Map<string, number>();
    for (const eventId of Object.values(attributed)) attributedByEvent.set(eventId, (attributedByEvent.get(eventId) ?? 0) + 1);
    return (
      <>
        <FinishedPanel autoCount={autoCount} laterCount={laterCount} mergedCount={mergedCount} onReset={onReset} setAside={setAside} t={t} total={cards.length} userCount={userCount} />
        {[...attributedByEvent].map(([eventId, count]) => {
          const title = attribution.events.find(event => event.eventId === eventId)?.title ?? eventId;
          return (
            <p className="cb-attr-done" data-event-attribution-done={eventId} key={eventId}>
              {t({
                ja: `${count} 人を「${title}」で出会った人として記録しました。プランにこのイベントがあれば、参加済みにしました。`,
                zh: `${count} 位联系人记为在「${title}」认识；你的计划里有这场活动时，已标为已参加。`,
                en: `${count} contact(s) recorded as met at “${title}”; if it's in your plan, it's now marked attended.`,
              })}
            </p>
          );
        })}
      </>
    );
  }

  const draft = drafts[active.cardId] ?? initialCardDraft(active);
  const baseline = initialCardDraft(active);
  const flagged = flaggedFields(active, draft);
  const duplicate = duplicates.has(active.cardId);
  const candidate = duplicate ? matches[active.cardId] ?? null : null;
  const handledCount = queue.filter(isHandled).length;
  const remainingAfter = pending.filter(card => card.cardId !== active.cardId).length;
  const unresolved = [...flagged].filter(field => draft.fields[field] === baseline.fields[field]).length
    + (draft.industry?.conflicted ? 1 : 0)
    + (draft.seniority?.conflicted ? 1 : 0)
    + (draft.region?.conflicted ? 1 : 0);
  const shownItem = active.items.find(item => item.side === side) ?? active.items[0]!;
  const reason = cardReason(active, draft, duplicate);
  // 只问当前这张名片自己的候选活动；没有候选就不问（不回落到本批其他名片的活动）。
  const activeEventId = attribution.cards[active.cardId] ?? null;
  const attributionEvent = activeEventId ? attribution.events.find(event => event.eventId === activeEventId) ?? null : null;

  return (
    <div className="cb-review" data-screen-label="10 名片确认">
      <div className="cb-review-top">
        <div className="cb-review-head">
          <h3 className="cb-review-h">{t({ ja: "名刺の読み取り結果を確認", zh: "确认名片识别结果", en: "Confirm the recognized cards" })}</h3>
          <p className="cb-p">
            {autoCount
              ? t({ ja: `今回 ${cards.length} 枚。${autoCount} 枚は確実に読み取れたので自動で取り込みました。下の ${queue.length} 枚は不確かなので、写真と見比べて 1 枚ずつ確認してください。`, zh: `本批 ${cards.length} 张。${autoCount} 张识别可靠，已自动导入；下面 ${queue.length} 张不太确定，请对照照片逐张确认。`, en: `${cards.length} cards. ${autoCount} were clear and imported automatically; please check the ${queue.length} below against the photo.` })
              : t({ ja: `今回 ${cards.length} 枚。下の ${queue.length} 枚は不確かなので、写真と見比べて 1 枚ずつ確認してください。`, zh: `本批 ${cards.length} 张，下面 ${queue.length} 张不太确定，请对照照片逐张确认。`, en: `${cards.length} cards — please check the ${queue.length} below against the photo.` })}
          </p>
        </div>
        <div className="cb-review-stats">
          <span className="cb-stat cb-stat-green"><strong>{autoCount}</strong><span>{t({ ja: "自動で取り込み済み", zh: "已自动导入", en: "Auto-imported" })}</span></span>
          <span className="cb-stat cb-stat-indigo"><strong>{handledCount} / {queue.length}</strong><span>{t({ ja: "確認済み", zh: "已确认", en: "Checked" })}</span></span>
        </div>
      </div>

      {attributionEvent ? (
        <EventAttributionPrompt
          busy={busy}
          event={attributionEvent}
          key={active.cardId}
          on={attributionDecisions[active.cardId] !== false}
          onChange={on => setAttributionDecision(active.cardId, on)}
          t={t}
        />
      ) : null}

      <div className="cb-queue">
        {queue.map((card, index) => {
          const cardDraft = drafts[card.cardId] ?? initialCardDraft(card);
          const on = card.cardId === active.cardId;
          const state = card.allConfirmed
            ? { copy: { ja: "✓ 確認済み", zh: "✓ 已确认", en: "✓ Confirmed" }, tone: "ok" }
            : isCardSkipped(card)
              ? { copy: { ja: "削除済み", zh: "已删除", en: "Removed" }, tone: "muted" }
              : laterSet.has(card.cardId)
                ? { copy: { ja: "あとで", zh: "稍后处理", en: "Later" }, tone: "later" }
                : { copy: cardReason(card, cardDraft, duplicates.has(card.cardId)), tone: "plain" };
          return (
            <button
              className={`btn cb-queue-item${on ? " cb-queue-on" : ""}`}
              disabled={isHandled(card) && !laterSet.has(card.cardId)}
              key={card.cardId}
              onClick={() => openCard(card.cardId)}
              type="button"
            >
              <span className="cb-queue-n">{index + 1}</span>
              <span className="cb-queue-copy">
                <strong>{cardDraft.fields.displayName.trim() || t({ ja: "名前なし", zh: "未识别姓名", en: "No name" })}</strong>
                <span className={`cb-queue-st cb-queue-st-${state.tone}`}>{t(state.copy)}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="cb-review-grid">
        <section className="cb-photo-panel">
          <div className="cb-photo-top">
            <span className="cb-photo-file">{queue.findIndex(card => card.cardId === active.cardId) + 1} / {queue.length} · {shownItem.sourceFileName}</span>
            <span className="cb-photo-reason">⚠ {t(reason)}</span>
          </div>
          <div className="cb-photo-stage">
            <div className="cb-photo-frame" style={{ transform: `scale(${zoom ? 1.35 : 1})` }}>
              {shownItem.derivativeObjectKey && shownItem.imageDigest ? (
                <IngestV2PrivateImage
                  alt={shownItem.sourceFileName}
                  errorLabel={t({ ja: "写真を表示できません", zh: "照片暂时无法显示", en: "Photo unavailable" })}
                  expiredLabel={t({ ja: "写真の期限切れ", zh: "照片已过期", en: "Photo expired" })}
                  key={`${shownItem.id}:${shownItem.version}`}
                  loadingLabel={t({ ja: "写真を読み込み中…", zh: "正在加载照片…", en: "Loading photo…" })}
                  src={`${INGEST_V2_API_BASE}/${batchId}/items/${shownItem.id}/image`}
                />
              ) : <span className="cb-photo-missing">{t({ ja: "この写真には表示できる画像がありません", zh: "这张照片没有可显示的图像", en: "No image to show for this photo" })}</span>}
            </div>
          </div>
          <div className="cb-photo-foot">
            <span>
              {active.isTwoSided ? (
                <span className="cb-side-toggle">
                  {(["front", "back"] as const).map(value => (
                    <button className={`btn cb-side-btn${side === value ? " cb-side-on" : ""}`} key={value} onClick={() => setSide(value)} type="button">{value === "front" ? t({ ja: "表", zh: "正面", en: "Front" }) : t({ ja: "裏", zh: "反面", en: "Back" })}</button>
                  ))}
                </span>
              ) : t({ ja: "写真と見比べて右の項目を確認", zh: "对照照片核对右侧字段", en: "Check the fields against the photo" })}
            </span>
            <button className="btn cb-photo-zoom" onClick={() => setZoom(value => !value)} type="button">{zoom ? t({ ja: "縮小", zh: "缩小", en: "Zoom out" }) : t({ ja: "拡大", zh: "放大查看", en: "Zoom in" })}</button>
          </div>
        </section>

        <section className="cb-fields-panel">
          <div className="cb-fields-head">
            <span className="cb-fields-title">
              <strong>{t({ ja: "読み取った文字", zh: "识别出的文字", en: "Recognized text" })}</strong>
              <span>{duplicate && !unresolved
                ? t({ ja: "人脈に同じ人かもしれない連絡先があります。下をご覧ください。", zh: "人脉里有一位可能是同一个人，见下方。", en: "Someone in your network may be this person — see below." })
                : unresolved
                  ? t({ ja: "黄色の項目は確認が必要です。左の写真と見比べてください。", zh: "黄色字段需要核对，请对照左侧照片。", en: "Check the amber fields against the photo." })
                  : t({ ja: "確認が必要な項目は済みました。確定すると次の名刺に進みます。", zh: "需要核对的字段已处理，确认后进入下一张。", en: "Flagged fields are handled — confirm to move on." })}</span>
            </span>
            <span className={`cb-check-chip${unresolved ? "" : " cb-check-chip-ok"}`}>
              {unresolved ? t({ ja: `要確認 ${unresolved} か所`, zh: `${unresolved} 处需核对`, en: `${unresolved} to check` }) : t({ ja: "確認済み", zh: "已核对", en: "Checked" })}
            </span>
          </div>



          {active.hasTerminalFailure ? (
            <div className="cb-notice cb-notice-warning">
              {t({ ja: "この名刺は読み取れませんでした。読み取り直す、写真を見て手入力する、またはスキップできます。", zh: "这张没有识别出来，可以重新识别、对照照片手动填写，或者跳过。", en: "This one wasn't recognized — retry, type it in from the photo, or skip it." })}
              <button className="btn cb-btn-soft" disabled={busy} onClick={() => void batch.retryRecognition(active)} type="button">{t({ ja: "読み取り直す", zh: "重新识别", en: "Retry" })}</button>
            </div>
          ) : null}

          {INGEST_V2_FIELDS.map(field => {
            const value = draft.fields[field];
            const edited = value !== baseline.fields[field] && draft.fieldSources[field] === null;
            const tag = fieldTag({ edited, flagged: flagged.has(field), value });
            const alternatives = [...new Set(active.items.flatMap(item => fieldCandidates(item).filter(candidate => candidate.field === field).map(candidate => candidate.value)))]
              .filter(candidate => candidate !== value);
            return (
              <div className={`cb-rfield cb-rfield-${tag.kind}`} key={field}>
                <span className="cb-rfield-head"><span>{t(FIELD_LABELS[field])}</span><span className={`cb-rtag cb-rtag-${tag.kind}`}>{t(tag.label)}</span></span>
                <input
                  aria-label={t(FIELD_LABELS[field])}
                  className="cb-rinput"
                  disabled={busy}
                  onChange={event => setDrafts(current => ({ ...current, [active.cardId]: setManualDraftField(current[active.cardId] ?? draft, field, event.target.value) }))}
                  placeholder={value ? "" : t({ ja: "読み取れませんでした。写真を見て入力してください", zh: "未识别到，请对照照片填写", en: "Not found — type it from the photo" })}
                  value={value}
                />
                {alternatives.length && !edited ? (
                  <span className="cb-alts">
                    {t({ ja: "候補", zh: "可能是", en: "Maybe" })}
                    {alternatives.map(alternative => {
                      const candidate = active.items.flatMap(item => fieldCandidates(item)).find(entry => entry.field === field && entry.value === alternative)!;
                      return <button className="btn cb-alt" key={alternative} onClick={() => setDrafts(current => ({ ...current, [active.cardId]: setDraftFieldSource(current[active.cardId] ?? draft, field, candidate) }))} type="button">{alternative}</button>;
                    })}
                  </span>
                ) : null}
              </div>
            );
          })}

          <IndustryField
            baseline={baseline}
            busy={busy}
            candidates={industryCandidates(active)}
            draft={draft}
            onChange={selection => setDrafts(current => ({ ...current, [active.cardId]: setDraftIndustry(current[active.cardId] ?? draft, selection) }))}
            t={t}
          />

          <SeniorityField
            baseline={baseline}
            busy={busy}
            candidates={seniorityCandidates(active)}
            draft={draft}
            onChange={value => setDrafts(current => ({ ...current, [active.cardId]: setDraftSeniority(current[active.cardId] ?? draft, value) }))}
            t={t}
          />

          <RegionField
            baseline={baseline}
            busy={busy}
            candidates={regionCandidates(active)}
            draft={draft}
            onChange={selection => setDrafts(current => ({ ...current, [active.cardId]: setDraftRegion(current[active.cardId] ?? draft, selection) }))}
            t={t}
          />

          <div className="cb-rfield cb-rfield-notes">
            <span className="cb-rfield-head"><span>{t({ ja: "備考", zh: "备注", en: "Notes" })}</span><span className="cb-rtag cb-rtag-ok">{t({ ja: "名刺のその他の情報", zh: "名片上的其他信息", en: "Everything else on the card" })}</span></span>
            <textarea
              aria-label={t({ ja: "備考", zh: "备注", en: "Notes" })}
              className="cb-rinput cb-rnotes"
              disabled={busy}
              onChange={event => setDrafts(current => ({ ...current, [active.cardId]: setManualDraftNotes(current[active.cardId] ?? draft, event.target.value) }))}
              placeholder={t({ ja: "FAX・WeChat・URL など専用欄のない情報はここに入ります。編集できます", zh: "传真、微信、网址等没有单独字段的信息会放在这里，可以修改", en: "Fax, WeChat, website and other details land here — edit freely" })}
              rows={Math.min(8, Math.max(3, draft.fields.notes.split("\n").length))}
              value={draft.fields.notes}
            />
          </div>

          {candidate ? <CandidatePanel candidate={candidate} draft={draft} t={t} /> : null}

          {error ? <div className="cb-notice cb-notice-error" role="alert">{error}</div> : null}

          <div className="cb-review-actions">
            <div className={candidate ? "cb-review-pair" : "cb-review-single"}>
              {candidate ? (
                <button className="btn cb-review-merge" disabled={busy} onClick={() => void act("merge")} type="button">
                  {t({ ja: "既存の連絡先と統合", zh: "已有联系人，合并", en: "Existing contact — merge" })}
                </button>
              ) : null}
              <button className="btn cb-review-confirm" disabled={busy} onClick={() => void act("confirm")} type="button">
                {busy
                  ? t({ ja: "保存中…", zh: "保存中…", en: "Saving…" })
                  : remainingAfter
                    ? unresolved ? t({ ja: "このまま確定して次へ", zh: "照原样确认，下一张", en: "Confirm as is, next" }) : t({ ja: "問題なし、次へ", zh: "确认无误，下一张", en: "Looks right, next" })
                    : t({ ja: "確定してこのまとまりを完了", zh: "确认，完成本批", en: "Confirm and finish" })}
                <span className="cb-kbd" aria-hidden>↵</span>
              </button>
            </div>
            {candidate ? (
              <span className="cb-review-hint">{t({ ja: "「問題なし」で新しい連絡先を作成します。「統合」は名刺の新しい情報を既存の連絡先に追加し、元の内容は上書きしません。", zh: "「确认无误」会新建一位联系人；「合并」把名片上的新信息补进已有联系人，不覆盖原有内容。", en: "“Looks right” adds a new contact; “Merge” adds the card’s new details to the existing one without overwriting anything." })}</span>
            ) : null}
            <div className="cb-review-minor">
              <button className="btn cb-btn-ghost cb-btn-ghost-sm" disabled={busy || queue.length < 2} onClick={() => {
                const index = queue.findIndex(card => card.cardId === active.cardId);
                const previous = [...queue.slice(0, index).reverse(), ...queue.slice(index + 1).reverse()].find(card => !card.allConfirmed && !isCardSkipped(card));
                if (previous) openCard(previous.cardId);
              }} type="button">{t({ ja: "← 前へ", zh: "← 上一张", en: "← Previous" })}</button>
              <span className="cb-review-links">
                <button className="btn cb-text-btn" disabled={busy} onClick={() => void act("later")} type="button">{t({ ja: "あとで", zh: "稍后处理", en: "Later" })}</button>
                <button className="btn cb-text-btn cb-text-danger" disabled={busy} onClick={() => void act("skip")} type="button">{t({ ja: "名刺ではないので削除", zh: "不是名片，删除", en: "Not a card — remove" })}</button>
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );}

// ── 正在解析（设计外新增）：三段进度 + 名片墙，每张卡按真实状态变化 ──
function ParsingPanel({
  autoRunning, cards, drafts, missing, onBrowse, onReattach, onRetry, settled, stage, t, total, uploadFailed,
}: {
  autoRunning: boolean;
  cards: IngestV2CardViewModel[];
  drafts: Record<string, IngestV2CardDraft>;
  missing: number;
  onBrowse?: (target: BrowseTarget) => void;
  onReattach: () => void;
  settled: number;
  onRetry: () => void;
  stage: "upload" | "recognize" | "review";
  t: T;
  total: number;
  uploadFailed: boolean;
}) {
  const itemsAll = cards.flatMap(card => card.items);
  const uploaded = itemsAll.filter(item => item.status !== "awaiting_upload").length;
  const percent = !total ? 4
    : stage === "upload" ? Math.max(4, Math.round((uploaded / Math.max(itemsAll.length, 1)) * 30))
      : stage === "recognize" ? 30 + Math.round((settled / total) * 62)
        : 96;
  const steps: { key: "upload" | "recognize" | "review"; label: Copy }[] = [
    { key: "upload", label: { ja: "写真をアップロード", zh: "上传照片", en: "Upload" } },
    { key: "recognize", label: { ja: "文字を読み取り", zh: "识别文字", en: "Read text" } },
    { key: "review", label: { ja: "整理・確認", zh: "整理核对", en: "Sort & check" } },
  ];
  const order = ["upload", "recognize", "review"];
  // 名片 V2 worker 实测每张约 5–15 秒（并发处理），按 10 秒/张粗估，至少 1 分钟。
  const minutes = Math.max(1, Math.round(((total - settled) * 10) / 60));
  const current = order.indexOf(stage);
  const sub = stage === "upload"
    ? t({ ja: `${itemsAll.length || total} 枚中 ${uploaded} 枚をアップロード中。終わると自動で読み取りを始めます。`, zh: `正在上传 ${uploaded} / ${itemsAll.length || total} 张照片，传完会自动开始识别。`, en: `Uploading ${uploaded} / ${itemsAll.length || total} photos — recognition starts automatically.` })
    : stage === "recognize"
      ? t({ ja: `約 ${minutes} 分かかります。ここで待つ必要はありません。終わったらお知らせします。確認が必要なのは不確かな数枚だけです。`, zh: `大约需要 ${minutes} 分钟，不用等在这里。解析完成后会提醒你——只有识别不确定的几张需要你看一眼。`, en: `About ${minutes} min — no need to wait here. We'll let you know when it's done; only the uncertain cards need a look.` })
      : t({ ja: "確実な名刺はそのまま取り込み中。残りはすぐ確認に回します…", zh: "正在把识别可靠的名片直接导入，其余的马上交给你确认…", en: "Importing the clear cards; the rest are coming to you for a quick check…" });

  return (
    <div className="cb-parse" aria-live="polite" data-screen-label="10a 正在解析">
      <div className="cb-parse-head">
        <span className="cb-kicker">{stage === "upload" ? t({ ja: `アップロード中 · 全 ${total || "…"} 枚`, zh: `正在上传 · 共 ${total || "…"} 张`, en: `Uploading · ${total || "…"} cards` }) : t({ ja: `✓ 名刺の写真 ${total} 枚を受け取りました`, zh: `✓ 已接收 ${total} 张名片照片`, en: `✓ ${total} card photos received` })}</span>
        <h3 className="cb-review-h">{autoRunning ? t({ ja: "もうすぐです。結果を整理しています", zh: "快好了，正在整理结果", en: "Almost there — sorting results" }) : t({ ja: "名刺をバックグラウンドで読み取っています。", zh: "名片正在后台批量解析。", en: "Your cards are being read in the background." })}</h3>
        <p className="cb-p">{sub}</p>
      </div>
      <div className="cb-parse-steps">
        {steps.map((step, index) => (
          <span className={`cb-parse-step${index < current ? " cb-parse-step-done" : index === current ? " cb-parse-step-on" : ""}`} key={step.key}>
            <span className="cb-parse-dot" aria-hidden>{index < current ? "✓" : index + 1}</span>
            {t(step.label)}
          </span>
        ))}
      </div>
      {stage !== "upload" ? (
        <span className="cb-parse-count"><span>{t({ ja: `${settled} / ${total} 枚 読み取り済み`, zh: `已解析 ${settled} / ${total}`, en: `${settled} / ${total} read` })}</span><span>{total ? Math.round((settled / total) * 100) : 0}%</span></span>
      ) : null}
      <span className="cb-parse-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></span>
      {missing > 0 ? (
        <div className="cb-notice cb-notice-warning">
          {t({ ja: `ページが再読み込みされました。写真 ${missing} 枚を選び直してください（同じものを選べば内容で自動的に照合します）。`, zh: `页面刷新过，还有 ${missing} 张照片需要重新选择（选同一批即可，会按内容自动匹配）。`, en: `The page reloaded — re-select ${missing} photo(s) (same ones; they're matched by content).` })}
          <button className="btn cb-btn-soft" onClick={onReattach} type="button">{t({ ja: "写真を選び直す", zh: "重新选择照片", en: "Re-select photos" })}</button>
        </div>
      ) : null}
      {uploadFailed ? (
        <div className="cb-notice cb-notice-warning">
          {t({ ja: "アップロードできなかった写真があります。", zh: "有照片没传上去。", en: "Some photos didn't upload." })}
          <button className="btn cb-btn-soft" onClick={onRetry} type="button">{t({ ja: "アップロードを再試行", zh: "重试上传", en: "Retry upload" })}</button>
        </div>
      ) : null}
      <div className="cb-parse-wall">
        {(cards.length ? cards : Array.from({ length: 3 }, () => null)).map((card, index) => {
          if (!card) return <span className="cb-mini cb-mini-wait" key={`ph-${index}`}><span className="cb-mini-lines" aria-hidden><i /><i /><i /></span></span>;
          const statuses = card.items.map(item => item.status);
          const kind = statuses.every(value => value === "extracted" || value === "confirmed")
            ? "done"
            : statuses.some(value => value === "terminal_failed")
              ? "fail"
              : statuses.some(value => value === "processing")
                ? "reading"
                : statuses.some(value => value === "awaiting_upload")
                  ? "upload"
                  : "wait";
          const fields = drafts[card.cardId]?.fields;
          const label: Copy = kind === "done" ? { ja: "読み取り済み", zh: "已识别", en: "Read" } : kind === "fail" ? { ja: "読み取り失敗", zh: "识别失败", en: "Failed" } : kind === "reading" ? { ja: "読み取り中", zh: "识别中", en: "Reading" } : kind === "upload" ? { ja: "アップロード中", zh: "上传中", en: "Uploading" } : { ja: "待機中", zh: "排队中", en: "Queued" };
          return (
            <span className={`cb-mini cb-mini-${kind}`} key={card.cardId}>
              {kind === "reading" ? <span className="cb-mini-scan" aria-hidden /> : null}
              {kind === "done" && fields?.displayName ? (
                <span className="cb-mini-text"><strong>{fields.displayName}</strong><span>{fields.organization || fields.role || "—"}</span></span>
              ) : <span className="cb-mini-lines" aria-hidden><i /><i /><i /></span>}
              <span className="cb-mini-foot"><span className="cb-mini-name">{card.items[0]?.sourceFileName}</span><span className={`cb-mini-st cb-mini-st-${kind}`}>{t(label)}</span></span>
            </span>
          );
        })}
      </div>
      {stage !== "upload" ? (
        <div className="cb-parse-wait">
          <span>{t({ ja: "待っているあいだに", zh: "等待的时候，可以先", en: "While you wait, you can" })}</span>
          <div className="cb-actions cb-actions-tight">
            {onBrowse ? (
              <>
                <button className="btn cb-btn-dark" onClick={() => onBrowse("events")} type="button">{t({ ja: "近日のイベントを見る", zh: "看看近期活动", en: "Browse upcoming events" })}</button>
                <button className="btn cb-btn-outline" onClick={() => onBrowse("home")} type="button">{t({ ja: "iOrbit で探す", zh: "去 iOrbit 探索", en: "Explore iOrbit" })}</button>
              </>
            ) : (
              <>
                <a className="cb-btn-dark cb-link-btn" href="/app/events">{t({ ja: "近日のイベントを見る", zh: "看看近期活动", en: "Browse upcoming events" })}</a>
                <a className="cb-btn-outline cb-link-btn" href="/app/agent">{t({ ja: "iOrbit で探す", zh: "去 iOrbit 探索", en: "Explore iOrbit" })}</a>
              </>
            )}
          </div>
        </div>
      ) : null}
      <div className="cb-tip cb-tip-sm">
        <span className="cb-spark" aria-hidden>⛨</span>
        <span>{t({ ja: "疑わしい点のない名刺だけを自動で取り込みます。迷うものは 1 枚ずつ確認をお願いします。Orbit があなたの名前で誰かにメッセージを送ることはありません。", zh: "只有没有疑点的名片会自动导入；拿不准的会交给你逐张确认。Orbit 不会以你的名义给任何人发消息。", en: "Only cards with no doubts are imported automatically; anything uncertain comes to you. Orbit never messages anyone on your behalf." })}</span>
      </div>
    </div>
  );
}

// ── 解析提醒（新用户引导.dc.html 621–650 行）：离开解析界面时的进度胶囊、解析完成弹窗、待确认胶囊 ──
/** `hidePendingPill`：只不显示「N 张名片待你确认」胶囊（W0011：iOrbit 首页已把它列为今日要事）；解析进度与完成弹窗照常。 */
export function CardBatchReminders(props: { batch: CardBatch; hidePendingPill?: boolean; onOpen: () => void; t: T; viewingImport: boolean }) {
  return (
    <div className="cbx cbx-float">
      <style>{CARD_BATCH_STYLES}</style>
      <CardBatchRemindersBody {...props} />
    </div>
  );
}

function CardBatchRemindersBody({ batch, hidePendingPill = false, onOpen, t, viewingImport }: { batch: CardBatch; hidePendingPill?: boolean; onOpen: () => void; t: T; viewingImport: boolean }) {
  const { autoCount, autoRunning, cards, markNotified, notified, pending, reviewing, settledCount, status } = batch;
  // 正在看第 5 步时，进度与确认界面就在眼前：进入确认界面即视为已提醒，不再弹窗。
  useEffect(() => {
    if (viewingImport && reviewing && !autoRunning && !notified) markNotified();
  }, [autoRunning, markNotified, notified, reviewing, viewingImport]);
  if (!batch.batchId || !batch.detail || status === "cancelled" || status === "expired" || viewingImport) return null;
  const total = cards.length;
  const parsing = !reviewing;
  const percent = total ? Math.round((settledCount / total) * 100) : 0;
  const showModal = reviewing && !notified && !autoRunning;

  if (showModal) {
    return (
      <div className="cb-modal-scrim" role="dialog" aria-modal="true" aria-labelledby="cb-parse-done-title">
        <div className="cb-modal">
          <button aria-label={t({ ja: "閉じる", zh: "关闭", en: "Close" })} className="btn cb-modal-close" onClick={markNotified} type="button">×</button>
          <span className="cb-modal-badge" aria-hidden>✓</span>
          <div className="cb-head">
            <h2 className="cb-modal-title" id="cb-parse-done-title">{t({ ja: `名刺 ${total} 枚の読み取りが完了`, zh: `${total} 张名片解析完毕`, en: `${total} cards read` })}</h2>
            <p className="cb-p cb-p-sm">{pending.length
              ? t({ ja: "確実なものは自動で取り込みました。不確かなものが数枚あるので、写真と見比べて確認してください。1 分ほどで終わります。", zh: "识别可靠的已自动导入。还有几张不太确定，需要你对照照片看一眼，大约 1 分钟。", en: "The clear ones are already imported. A few are uncertain — check them against the photo, about a minute." })
              : t({ ja: "すべて確実に読み取れたので、人脈に自動で取り込みました。", zh: "全部识别可靠，已自动导入你的人脉。", en: "All of them were clear and are now in your network." })}</p>
          </div>
          <div className="cb-modal-stats">
            <span className="cb-fin-stat"><strong>{autoCount}</strong><span>{t({ ja: "自動で取り込み済み", zh: "已自动导入", en: "Auto-imported" })}</span></span>
            <span className="cb-fin-stat cb-fin-stat-amber"><strong>{pending.length}</strong><span>{t({ ja: "確認が必要", zh: "需要你确认", en: "Need your check" })}</span></span>
          </div>
          <div className="cb-modal-actions">
            <button className="btn cb-review-confirm" onClick={() => { markNotified(); onOpen(); }} type="button">
              {pending.length ? t({ ja: `名刺 ${pending.length} 枚を確認する`, zh: `去确认 ${pending.length} 张名片`, en: `Check ${pending.length} card(s)` }) : t({ ja: "結果を見る", zh: "查看结果", en: "See results" })}
            </button>
            <button className="btn cb-text-btn cb-modal-later" onClick={markNotified} type="button">{t({ ja: "あとで", zh: "稍后再说", en: "Later" })}</button>
          </div>
        </div>
      </div>
    );
  }

  if (parsing) {
    return (
      <button className="btn cb-float-pill" onClick={onOpen} type="button">
        <span className="cb-spark" aria-hidden>✦</span>
        <span className="cb-float-copy">
          <span>{status === "collecting" ? t({ ja: "名刺をアップロード中", zh: "正在上传名片", en: "Uploading cards" }) : t({ ja: `名刺を読み取り中 ${settledCount}/${total}`, zh: `正在解析名片 ${settledCount}/${total}`, en: `Reading cards ${settledCount}/${total}` })}</span>
          <span className="cb-float-track"><span style={{ width: `${status === "collecting" ? 8 : percent}%` }} /></span>
        </span>
      </button>
    );
  }

  if (pending.length > 0 && !hidePendingPill) {
    return (
      <button className="btn cb-float-pill cb-float-pill-dark" onClick={onOpen} type="button">
        {t({ ja: `確認待ちの名刺 ${pending.length} 枚 →`, zh: `${pending.length} 张名片待你确认 →`, en: `${pending.length} card(s) to check →` })}
      </button>
    );
  }
  return null;
}

// R12：同名候选（DESIGN §2.3，只提示不统合）。
const SAME_NAME_REASON = { ja: "同じ名前", zh: "同名", en: "Same name" };
const MATCH_REASON: Record<ContactCandidate["matchedOn"][number], Copy> = {
  email: { ja: "同じメール", zh: "同邮箱", en: "Same email" },
  name: SAME_NAME_REASON,
  name_organization: { ja: "同じ名前・会社", zh: "同名同公司", en: "Same name & company" },
  phone: { ja: "同じ電話番号", zh: "同电话", en: "Same phone" },
};

const CANDIDATE_ROWS: readonly { field: "displayName" | "organization" | "role" | "phone" | "email" | "address"; label: Copy }[] = [
  { field: "displayName", label: { ja: "名前", zh: "姓名", en: "Name" } },
  { field: "organization", label: { ja: "会社", zh: "公司", en: "Company" } },
  { field: "role", label: { ja: "役職", zh: "职位", en: "Title" } },
  { field: "phone", label: { ja: "電話", zh: "电话", en: "Phone" } },
  { field: "email", label: { ja: "メール", zh: "邮箱", en: "Email" } },
  { field: "address", label: { ja: "住所", zh: "地址", en: "Address" } },
];

function sameValue(field: string, left: string, right: string): boolean {
  if (field === "phone") return left.replace(/\D/g, "") === right.replace(/\D/g, "");
  const norm = (value: string) => value.normalize("NFKC").replace(/\s+/g, field === "displayName" ? "" : " ").trim().toLowerCase();
  return norm(left) === norm(right);
}

/** 「可能是同一个联系人」：已有联系人的结构化信息，逐项标出与名片相同 / 不同 / 名片可补充。 */
function CandidatePanel({ candidate, draft, t }: { candidate: ContactCandidate; draft: IngestV2CardDraft; t: T }) {
  return (
    <div className="cb-match">
      <div className="cb-match-head">
        <span className="cb-match-title"><span className="cb-spark" aria-hidden>✦</span><strong>{t({ ja: "同じ連絡先かもしれません", zh: "可能是同一个联系人", en: "Possibly the same person" })}</strong></span>
        <span className="cb-match-why">{candidate.matchedOn.map(reason => t(MATCH_REASON[reason])).join(" · ")}</span>
      </div>
      <dl className="cb-match-grid">
        {CANDIDATE_ROWS.map(({ field, label }) => {
          const existing = candidate[field].trim();
          const card = draft.fields[field].trim();
          const state = !existing && !card ? "none" : !existing ? "fill" : !card ? "keep" : sameValue(field, existing, card) ? "same" : "diff";
          const tag: Record<string, Copy | null> = {
            diff: { ja: "名刺と違う", zh: "与名片不同", en: "Differs" },
            fill: { ja: "名刺で補える", zh: "名片可补充", en: "Card adds this" },
            keep: null,
            none: null,
            same: { ja: "一致", zh: "一致", en: "Same" },
          };
          return (
            <div className={`cb-match-row cb-match-${state}`} key={field}>
              <dt>{t(label)}</dt>
              <dd>
                <span className="cb-match-val">{existing || "—"}</span>
                {tag[state] ? <span className="cb-match-tag">{t(tag[state]!)}</span> : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function FinishedPanel({ autoCount, laterCount, mergedCount, onReset, setAside, t, total, userCount }: { autoCount: number; laterCount: number; mergedCount: number; onReset: () => void; setAside: number; t: T; total: number; userCount: number }) {
  return (
    <section className="cb-fin">
      <div className="cb-head">
        <span className="cb-fin-kicker">{t({ ja: "✓ このまとまりはすべて処理しました", zh: "✓ 本批名片已全部处理", en: "✓ This batch is done" })}</span>
        <h3 className="cb-review-h">{mergedCount
          ? t({ ja: `今回の名刺 ${total} 枚。新しい連絡先 ${autoCount + userCount} 人を人脈に追加し、${mergedCount} 枚を既存の連絡先に統合しました。`, zh: `本批 ${total} 张名片，${autoCount + userCount} 位新联系人已进入你的人脉，${mergedCount} 张并入了已有联系人。`, en: `${total} cards — ${autoCount + userCount} new contacts added, ${mergedCount} merged into existing ones.` })
          : t({ ja: `今回の名刺 ${total} 枚。${autoCount + userCount} 人が人脈に追加されました。`, zh: `本批 ${total} 张名片，${autoCount + userCount} 位联系人已进入你的人脉。`, en: `${total} cards — ${autoCount + userCount} contacts are now in your network.` })}</h3>
      </div>
      <div className="cb-fin-stats">
        <span className="cb-fin-stat"><strong>{autoCount}</strong><span>{t({ ja: "自動で取り込み", zh: "自动导入", en: "Auto-imported" })}</span></span>
        <span className="cb-fin-stat cb-fin-stat-indigo"><strong>{userCount}</strong><span>{t({ ja: "あなたが確認", zh: "经你确认", en: "Confirmed by you" })}</span></span>
        {mergedCount ? <span className="cb-fin-stat cb-fin-stat-indigo"><strong>{mergedCount}</strong><span>{t({ ja: "既存の連絡先に統合", zh: "并入已有联系人", en: "Merged into existing" })}</span></span> : null}
        <span className="cb-fin-stat"><strong>{setAside}</strong><span>{t({ ja: "あとで・削除", zh: "稍后处理 / 已删除", en: "Later / removed" })}</span></span>
      </div>
      {laterCount ? <span className="cb-label-note cb-privacy">{t({ ja: `「あとで」にした名刺 ${laterCount} 枚は「人脈 → 人脈を取り込む」に残ります。いつでも確認を続けられます。`, zh: `${laterCount} 张「稍后处理」的名片会留在人脉 → 导入人脉里，随时可以继续确认。`, en: `${laterCount} card(s) set aside stay under Network → Import, ready whenever you are.` })}</span> : null}
      <div className="cb-actions">
        <button className="btn cb-link-under cb-link-under-strong" onClick={onReset} type="button">{t({ ja: "別の名刺をアップロード", zh: "再上传一批名片", en: "Upload another batch" })}</button>
      </div>
    </section>
  );
}
