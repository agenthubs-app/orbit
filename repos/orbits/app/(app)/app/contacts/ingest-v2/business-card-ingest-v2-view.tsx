"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  IngestBatchDTO,
  IngestItemDTO,
} from "../../../../../features/acquisition/business-card-ingest-v2/contract";
import { aggregateBusinessCardNotes } from "../../../../../features/acquisition/business-card-notes-aggregation";
import { useOrbitLanguage } from "../../orbit-language-context";
import { ORBIT_Z } from "../../orbit-z";
import {
  EMPTY_EXTRACTION_NOTICE_COPY,
  NAME_REQUIRED_HINT_COPY,
  hasNoFixedFields,
} from "./business-card-batch-view";
import { contentUploadErrorCopy } from "./ingest-v2-upload-feedback";
import { INGEST_V2_COPY } from "./ingest-v2-copy";
import { IngestV2PrivateImage } from "./ingest-v2-private-image";
import {
  INGEST_V2_API_BASE,
  fetchBatchDetail,
  getPendingFiles,
  postAction,
  replaceItemContent,
  sha256OfFile,
  uploadItemContent,
  type IngestBatchDetail,
} from "./ingest-v2-client";
import {
  buildConfirmationPayload,
  collectingProgressForItems,
  completionCountsForItems,
  fieldCandidates,
  groupIngestItemsByCardId,
  initialCardDraft,
  INGEST_V2_FIELDS,
  progressForItems,
  readConfirmationReceipt,
  reconcileCardDraft,
  setDraftFieldSource,
  setManualDraftField,
  setManualDraftNotes,
  type IngestV2CardDraft,
  type IngestV2CardViewModel,
  type IngestV2Field,
  type IngestV2FieldCandidate,
} from "./ingest-v2-route-view-model";

type Translate = (copy: { en: string; zh: string; ja?: string }) => string;

const UPLOAD_CONCURRENCY = 3;

interface FixedFields {
  displayName: string;
  organization: string;
  role: string;
  email: string;
  phone: string;
  relationshipContext: string;
  notes: string;
}

// 日中韩名片以突出印刷的原文姓名为主显示名；模型的 fullName 常给罗马字，
// 用它当主名会把「渡辺」变成 "Watanabe"。原文含 CJK 时优先 nativeFullName。
const CJK_CHAR_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

function preferredDisplayName(
  extraction: IngestItemDTO["extraction"],
): string {
  const native = extraction?.nativeFullName ?? "";
  if (native && CJK_CHAR_RE.test(native)) {
    return native;
  }
  return extraction?.fullName ?? native;
}

function initialFields(item: IngestItemDTO): FixedFields {
  const extraction = item.extraction;
  const email = extraction?.emails[0]?.value ?? "";
  // 主电话只认 phone/mobile：contactPoints 现在还装着微信/LINE/网站等通用
  // 联系方式，"非传真即电话" 的旧写法会把微信号填进电话框。
  const phone =
    extraction?.contactPoints.find(
      (point) => point.type === "phone" || point.type === "mobile",
    )?.value ?? "";
  return {
    displayName: preferredDisplayName(extraction),
    email,
    notes: extraction
      ? aggregateBusinessCardNotes(extraction, {
          email: email || null,
          phone: phone || null,
        })
      : "",
    organization: extraction?.organization ?? "",
    phone,
    relationshipContext: `批量导入 · ${item.sourceFileName}`,
    role: extraction?.title ?? "",
  };
}

/**
 * V2 adapter for the shared "nothing was read" rule: judge the V2 prefill
 * (CJK-first name, phone/mobile-only phone) rather than the V1 one.
 */
export function ingestExtractionHasNoFields(item: IngestItemDTO): boolean {
  return hasNoFixedFields(initialFields(item));
}

const EMPTY_FIELDS: FixedFields = {
  displayName: "",
  email: "",
  notes: "",
  organization: "",
  phone: "",
  relationshipContext: "",
  role: "",
};

type UploadPhaseState =
  | { kind: "waiting_file" }
  | { kind: "uploading" }
  | { kind: "failed"; code: string };

const ITEM_STATUS_COPY: Record<IngestItemDTO["status"], { en: string; zh: string; ja: string }> = {
  awaiting_upload: { en: "Preparing", zh: "准备中", ja: "準備中" },
  confirmed: { en: "Confirmed", zh: "已收录", ja: "登録済み" },
  excluded: { en: "Excluded", zh: "已排除", ja: "除外済み" },
  extracted: { en: "Recognized", zh: "已识别", ja: "認識済み" },
  processing: { en: "Reading", zh: "识别中", ja: "認識中" },
  queued: { en: "Waiting", zh: "排队中", ja: "待機中" },
  skipped: { en: "Skipped", zh: "已跳过", ja: "スキップ済み" },
  terminal_failed: { en: "Failed", zh: "识别失败", ja: "失敗" },
  uploaded: { en: "Uploaded", zh: "已上传", ja: "アップロード済み" },
};

function itemImageUrl(batchId: string, item: IngestItemDTO): string {
  return `${INGEST_V2_API_BASE}/${batchId}/items/${item.id}/image`;
}

// worker 早就把 reviewIssues 算好了，此前 view 一个都没渲染——用户只能肉眼
// 从头找差异。这里按 code 给用户语言的说明；未知 code 落回服务端原文。
const REVIEW_ISSUE_COPY: Record<string, { en: string; zh: string; ja: string }> = {
  IDENTITY_MISSING: { en: "No name was recognized on this card.", zh: "没有识别到姓名。", ja: "名前を認識できませんでした。" },
  INVALID_EMAIL: { en: "An email address looks invalid — check it against the card.", zh: "有邮箱格式可疑，请对照图片核对。", ja: "メールアドレスの形式を確認してください。" },
  INVALID_PHONE: { en: "A phone number looks invalid — check it against the card.", zh: "有电话号码可疑，请对照图片核对。", ja: "電話番号を画像と照合してください。" },
  MULTIPLE_OFFICES: { en: "Multiple offices are printed — confirm the primary one.", zh: "名片上有多个办公地点，请确认主要地点。", ja: "複数の拠点があります。主な拠点を確認してください。" },
  SHARED_CONTACT_VALUE: { en: "The same number appears under more than one label.", zh: "同一号码出现在多个标签下，请确认归属。", ja: "同じ番号が複数のラベルにあります。用途を確認してください。" },
  NATIVE_ROMANIZED_NAME_CONFLICT: { en: "Native and romanized names differ — confirm which is primary.", zh: "原文姓名与罗马字拼写不同，请确认主名。", ja: "原文とローマ字の名前が異なります。主名を確認してください。" },
  ORG_SUFFIX_MISSING: { en: "The company name may be missing a legal suffix (株式会社 / Inc. …).", zh: "公司名可能丢失了「株式会社／Inc.」等后缀，请对照图片补全。", ja: "会社名の法人格表記が欠けている可能性があります。" },
  VERIFICATION_MISMATCH: { en: "A second character-level read disagrees with a field — verify it character by character.", zh: "二次逐字符识别与结果不一致，请对照图片逐字核对标出的字段。", ja: "二度目の文字認識と一致しません。画像を一文字ずつ確認してください。" },
};

function ReviewIssueList({ issues, t }: { issues: IngestItemDTO["reviewIssues"]; t: Translate }) {
  if (issues.length === 0) {
    return null;
  }
  return (
    <ul className="bci-issues" data-ingest-review-issues>
      {issues.map((issue, index) => (
        <li key={`${issue.code}-${index}`}>
          {REVIEW_ISSUE_COPY[issue.code] ? t(REVIEW_ISSUE_COPY[issue.code]) : issue.message}
        </li>
      ))}
    </ul>
  );
}

const CONTACT_POINT_TYPE_LABELS: Record<string, { en: string; zh: string; ja: string }> = {
  phone: { en: "Phone", zh: "电话", ja: "電話" },
  mobile: { en: "Mobile", zh: "手机", ja: "携帯" },
  fax: { en: "Fax", zh: "传真", ja: "FAX" },
  wechat: { en: "WeChat", zh: "微信", ja: "WeChat" },
  line: { en: "LINE", zh: "LINE", ja: "LINE" },
  whatsapp: { en: "WhatsApp", zh: "WhatsApp", ja: "WhatsApp" },
  website: { en: "Website", zh: "网站", ja: "Webサイト" },
  other: { en: "Other", zh: "其他", ja: "その他" },
};

// 固定表单只有一个邮箱/电话槽位，识别出的其余联系方式此前只沉在备注里。
// 这里把它们列成可见的行：邮箱/电话可一键填入对应字段，其余（微信等）保证可见。
function ExtraContactSignals({
  extraction,
  fields,
  onChange,
  t,
}: {
  extraction: NonNullable<IngestItemDTO["extraction"]>;
  fields: FixedFields;
  onChange: (next: FixedFields) => void;
  t: Translate;
}) {
  const extraEmails = extraction.emails.filter((email) => email.value !== fields.email);
  const extraPoints = extraction.contactPoints.filter((point) => point.value !== fields.phone);
  if (extraEmails.length === 0 && extraPoints.length === 0) {
    return null;
  }
  return (
    <div className="bci-signals" data-ingest-extra-signals>
      <span className="bci-signals-label">{t({ en: "Also recognized", zh: "还识别到", ja: "追加で認識" })}</span>
      {extraEmails.map((email, index) => (
        <button
          className="bci-signal"
          key={`email-${index}`}
          onClick={() => onChange({ ...fields, email: email.value })}
          title={t({ en: "Use as the email", zh: "填入邮箱", ja: "メールに使う" })}
          type="button"
        >
          {t({ en: "Email", zh: "邮箱", ja: "メール" })}{email.label ? ` · ${email.label}` : ""}：{email.value}
        </button>
      ))}
      {extraPoints.map((point, index) => {
        const fillable = point.type === "phone" || point.type === "mobile";
        const label = CONTACT_POINT_TYPE_LABELS[point.type] ?? CONTACT_POINT_TYPE_LABELS.other;
        return (
          <button
            className="bci-signal"
            disabled={!fillable}
            key={`point-${index}`}
            onClick={fillable ? () => onChange({ ...fields, phone: point.value }) : undefined}
            title={fillable ? t({ en: "Use as the phone", zh: "填入电话", ja: "電話に使う" }) : undefined}
            type="button"
          >
            {t(label)}{point.label ? ` · ${point.label}` : ""}：{point.value}
          </button>
        );
      })}
    </div>
  );
}

function FieldEditor({
  fields,
  onChange,
  t,
}: {
  fields: FixedFields;
  onChange: (next: FixedFields) => void;
  t: Translate;
}) {
  return (
    <>
      {(
        [
          ["displayName", { en: "Name", zh: "姓名" }],
          ["organization", { en: "Company", zh: "公司" }],
          ["role", { en: "Title", zh: "职位" }],
          ["email", { en: "Email", zh: "邮箱" }],
          ["phone", { en: "Phone", zh: "电话" }],
          ["relationshipContext", { en: "How you met", zh: "认识场景" }],
        ] as const
      ).map(([key, label]) => (
        <label className="bci-field" key={key}>
          <span>{t(label)}</span>
          <input
            onChange={(event) => onChange({ ...fields, [key]: event.target.value })}
            value={fields[key]}
          />
        </label>
      ))}
      <label className="bci-field">
        <span>{t({ en: "Notes (nothing gets lost)", zh: "备注（其余信息都在这里）", ja: "メモ（情報を残します）" })}</span>
        <textarea
          className="bci-notes"
          onChange={(event) => onChange({ ...fields, notes: event.target.value })}
          rows={6}
          value={fields.notes}
        />
      </label>
    </>
  );
}

export function BusinessCardIngestV2View({ batchId }: { batchId: string }) {
  const { t, preserveHref } = useOrbitLanguage();
  const [detail, setDetail] = useState<IngestBatchDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [duplicateCardId, setDuplicateCardId] = useState<string | null>(null);
  const [manualCardId, setManualCardId] = useState<string | null>(null);
  const [cardDrafts, setCardDrafts] = useState<Record<string, IngestV2CardDraft>>({});
  const confirmationIntentIds = useRef<Record<string, string>>({});
  const confirmationPayloadSeeds = useRef<Record<string, string>>({});
  const [uploadStates, setUploadStates] = useState<Record<string, UploadPhaseState>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const pendingFilesRef = useRef<Map<string, File>>(new Map());
  const uploadingRef = useRef(false);
  const actionBusyRef = useRef(false);
  const reattachRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<IngestItemDTO | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchBatchDetail(batchId);
      if (next) {
        setDetail(next);
      }
    } catch {
      // 网络抖动时保留上一次状态，下一轮轮询恢复。
    }
  }, [batchId]);

  useEffect(() => {
    pendingFilesRef.current = getPendingFiles(batchId);
    void refresh();
  }, [batchId, refresh]);

  const status = detail?.batch.status;
  const cards = useMemo(
    () => groupIngestItemsByCardId(detail?.items ?? []),
    [detail?.items],
  );
  const cardsFingerprint = useMemo(
    () => cards.map((card) => `${card.cardId}:${card.items.map((item) => `${item.id}:${item.version}:${item.imageDigest ?? ""}:${item.status}`).join(",")}`).join("|"),
    [cards],
  );
  useEffect(() => {
    if (!detail || cards.length === 0) return;
    setCardDrafts((previous) => {
      const next: Record<string, IngestV2CardDraft> = {};
      let changed = Object.keys(previous).length !== cards.length;
      for (const card of cards) {
        const prior = previous[card.cardId];
        const draft = prior ? reconcileCardDraft(prior, card) : initialCardDraft(card);
        next[card.cardId] = draft;
        if (!prior || JSON.stringify(prior) !== JSON.stringify(draft)) changed = true;
      }
      return changed ? next : previous;
    });
  }, [cardsFingerprint]);
  useEffect(() => {
    if (status !== "collecting" && status !== "processing") {
      return;
    }
    const timer = setInterval(() => void refresh(), 3_000);
    return () => clearInterval(timer);
  }, [status, refresh]);

  const pumpUploads = useCallback(async () => {
    if (uploadingRef.current) {
      return;
    }
    uploadingRef.current = true;
    try {
      for (;;) {
        const current = await fetchBatchDetail(batchId);
        if (!current || current.batch.status !== "collecting") {
          break;
        }
        setDetail(current);
        const neededDigests = new Set(
          current.items.filter((item) => item.status === "awaiting_upload").map((item) => item.clientDigest),
        );
        for (const digest of pendingFilesRef.current.keys()) {
          if (!neededDigests.has(digest)) pendingFilesRef.current.delete(digest);
        }
        const uploadable = current.items.filter(
          (item) =>
            item.status === "awaiting_upload" &&
            pendingFilesRef.current.has(item.clientDigest),
        );
        if (uploadable.length === 0) {
          break;
        }
        const wave = uploadable.slice(0, UPLOAD_CONCURRENCY);
        setUploadStates((previous) => {
          const next = { ...previous };
          for (const item of wave) {
            next[item.id] = { kind: "uploading" };
          }
          return next;
        });
        let failed = false;
        await Promise.all(
          wave.map(async (item) => {
            const file = pendingFilesRef.current.get(item.clientDigest);
            if (!file) {
              return;
            }
            const result = await uploadItemContent({ batchId, itemId: item.id, file });
            if (!result.ok) failed = true;
            setUploadStates((previous) => {
              const next = { ...previous };
              if (result.ok) {
                delete next[item.id];
              } else {
                next[item.id] = { kind: "failed", code: result.errorCode ?? "UPLOAD_FAILED" };
              }
              return next;
            });
            // Keep a successful digest in memory until every manifest item using
            // it has left awaiting_upload. One file may intentionally appear on
            // several explicit card sides; deleting it after the first upload
            // would strand the remaining rows after a wave.
            if (result.errorCode?.startsWith("IMAGE_INVALID")) {
              pendingFilesRef.current.delete(item.clientDigest);
            }
          }),
        );
        if (failed) break;
      }
    } finally {
      uploadingRef.current = false;
      await refresh();
    }
  }, [batchId, refresh]);

  useEffect(() => {
    if (status === "collecting" && pendingFilesRef.current.size > 0) {
      void pumpUploads();
    }
  }, [status, pumpUploads]);

  async function attachFiles(fileList: FileList | null): Promise<void> {
    const files = Array.from(fileList ?? []);
    for (const file of files) {
      const digest = await sha256OfFile(file);
      pendingFilesRef.current.set(digest, file);
    }
    void pumpUploads();
  }

  async function withBusy(action: () => Promise<void>): Promise<void> {
    if (actionBusyRef.current) return;
    actionBusyRef.current = true;
    setBusy(true);
    setGlobalError(null);
    try {
      await action();
      await refresh();
    } catch {
      setGlobalError(t({
        en: "The request could not be completed. Your edits are still here; try again.",
        zh: "请求未完成，你的编辑仍在这里；请重试。",
        ja: "リクエストを完了できませんでした。入力内容は保持されています。もう一度お試しください。",
      }));
    } finally {
      setBusy(false);
      actionBusyRef.current = false;
    }
  }

  async function postActionChecked(path: string, body?: unknown): Promise<Response> {
    const response = await postAction(path, body);
    if (!response.ok) {
      throw new Error(`action_failed:${response.status}`);
    }
    return response;
  }

  async function submitReplace(item: IngestItemDTO, file: File): Promise<void> {
    await withBusy(async () => {
      const result = await replaceItemContent({ batchId, itemId: item.id, expectedVersion: item.version, file });
      if (!result.ok) setGlobalError(t(contentUploadErrorCopy(result.errorCode)));
    });
  }

  function confirmationBlockedCopy(reason: ReturnType<typeof buildConfirmationPayload>["blockedReason"]): { en: string; zh: string; ja: string } {
    switch (reason) {
      case "conflicting_fields": return { en: "Choose a source or enter a value for every conflicting field before confirming.", zh: "确认前请为每个冲突字段选择来源或手工填写。", ja: "確認する前に、競合する項目ごとに出典を選ぶか手入力してください。" };
      case "missing_image_digest": return INGEST_V2_COPY.noDigest;
      case "source_expired": return INGEST_V2_COPY.sourceExpired;
      case "name_required": return { en: "Add a name before confirming.", zh: "请先填写姓名再确认。", ja: "確認する前に名前を入力してください。" };
      default: return { en: "This card is still being prepared. Try again when both sides finish.", zh: "这张卡还在准备中，请等待正反面完成后再试。", ja: "このカードはまだ準備中です。両面の処理が終わってから再試行してください。" };
    }
  }

  async function submitCardConfirm(
    card: IngestV2CardViewModel,
    draft: IngestV2CardDraft,
    allowDuplicate: boolean,
    manual: boolean,
  ): Promise<void> {
    const seed = JSON.stringify({
      allowDuplicate,
      card: card.items.map((item) => ({ id: item.id, version: item.version, imageDigest: item.imageDigest })),
      draft,
      manual,
    });
    let intent = confirmationIntentIds.current[card.cardId];
    if (!intent || confirmationPayloadSeeds.current[card.cardId] !== seed) {
      intent = crypto.randomUUID();
      confirmationIntentIds.current[card.cardId] = intent;
      confirmationPayloadSeeds.current[card.cardId] = seed;
    }
    const prepared = buildConfirmationPayload(card, draft, intent, allowDuplicate, manual);
    if (!prepared.payload || prepared.blockedReason) {
      setGlobalError(t(confirmationBlockedCopy(prepared.blockedReason)));
      return;
    }
    const item = card.items[0];
    await withBusy(async () => {
      const response = await postAction(
        `/${batchId}/items/${item.id}/${manual ? "manual-entry" : "confirm"}`,
        prepared.payload,
      );
      const body = (await response.json().catch(() => null)) as {
        data?: { state?: string; contactId?: string; duplicateContactId?: string; item?: IngestItemDTO; items?: IngestItemDTO[] };
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        setGlobalError(body?.error?.message ?? `HTTP ${response.status}`);
        return;
      }
      if (body?.data?.state === "duplicate_review") {
        setDuplicateCardId(card.cardId);
      } else {
        const receipt = readConfirmationReceipt(body?.data ?? {}, card);
        if (!receipt.ok) {
          setGlobalError(t(receipt.reason === "wrong_contact"
            ? { en: "The server returned a different contact. Refresh before confirming again.", zh: "服务端返回了不同联系人，请刷新后再确认。", ja: "サーバーが別の連絡先を返しました。更新してから再確認してください。" }
            : { en: "The confirmation receipt was incomplete. Refresh and check both sides.", zh: "确认回执不完整，请刷新并检查正反面。", ja: "確認結果が不完全です。更新して両面を確認してください。" }));
          return;
        }
        setDuplicateCardId(null);
        setManualCardId(null);
      }
    });
  }

  if (!detail) {
    return null;
  }
  const { batch, items } = detail;

  return (
    <section className="bci-shell">
      <style>{VIEW_STYLE}</style>
      <input
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        hidden
        multiple
        onChange={(event) => {
          void attachFiles(event.target.files);
          event.target.value = "";
        }}
        ref={reattachRef}
        type="file"
      />
      <input
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && replaceTarget) {
            void submitReplace(replaceTarget, file);
          }
          setReplaceTarget(null);
          event.target.value = "";
        }}
        ref={replaceRef}
        type="file"
      />
      <div className="bci-headline">
        <div className="eyebrow">
          {t({ en: "BATCH IMPORT", zh: "批量导入", ja: "一括インポート" })} ·{" "}
          <span className="bci-batch-id">{batch.id.slice(0, 13)}</span>
        </div>
      </div>
      {globalError ? <div className="bci-warn">{globalError}</div> : null}
      {renderPhase()}
      <div className="bci-privacy">
        {t({
          en: "Originals are stored temporarily for import and scheduled for cleanup. Recognition images are hidden after you confirm or skip.",
          zh: "原件会临时保存用于导入，并安排自动清理；确认或跳过后不再展示识别图片。",
          ja: "原本画像はインポートのため一時保存され、後で削除されます。確認またはスキップ後は認識画像を表示しません。",
        })}
      </div>
    </section>
  );

  function renderPhase() {
    if (batch.status === "cancelled" || batch.status === "expired") {
      return (
        <>
          <h2>
            {batch.status === "cancelled"
              ? t({ en: "Batch cancelled", zh: "批次已取消", ja: "バッチをキャンセルしました" })
              : t({ en: "Batch expired", zh: "批次已过期", ja: "バッチの有効期限が切れました" })}
          </h2>
          <p className="bci-lede">
            {t({
              en: "Confirmed contacts are kept; everything else was cleaned up.",
              zh: "已确认的联系人会保留，其余项目与图片均已清理。",
              ja: "確認済みの連絡先は保持され、それ以外は整理されました。",
            })}
          </p>
          <a className="btn btn-primary" href={preserveHref("/app/contacts/new")}>
            {t({ en: "Back to import center", zh: "返回导入中心", ja: "インポートセンターに戻る" })}
          </a>
        </>
      );
    }

    if (batch.status === "completed") {
      const { confirmed, skipped } = completionCountsForItems(items);
      return (
        <>
          <h2>{t({ en: "Batch completed", zh: "批次已完成", ja: "バッチが完了しました" })}</h2>
          <p className="bci-lede">
            {t({ en: "Confirmed", zh: "已收录", ja: "登録済み" })} {confirmed} ·{" "}
            {t({ en: "Skipped", zh: "已跳过", ja: "スキップ済み" })} {skipped}
          </p>
          <a className="btn btn-primary" href={preserveHref("/app/contacts")}>
            {t({ en: "Open contacts", zh: "查看名片夹", ja: "連絡先を開く" })}
          </a>
        </>
      );
    }

    if (batch.status === "collecting") {
      return renderCollecting();
    }
    if (batch.status === "processing") {
      return renderProcessing();
    }
    return renderReview();
  }

  function renderCollecting() {
    const progress = collectingProgressForItems(items);
    const uploaded = items.filter((item) => item.status === "uploaded").length;
    const excluded = items.filter((item) => item.status === "excluded").length;
    const awaiting = items.filter((item) => item.status === "awaiting_upload");
    const readyToFinalize = awaiting.length === 0 && uploaded > 0;
    const missingFiles = awaiting.filter(
      (item) =>
        !pendingFilesRef.current.has(item.clientDigest),
    );
    const canRetry = awaiting.some((item) => uploadStates[item.id]?.kind === "failed" && pendingFilesRef.current.has(item.clientDigest));

    return (
      <>
        <h2>{t({ en: "Uploading photos…", zh: "正在上传照片…", ja: "写真をアップロード中…" })}</h2>
        <p className="bci-lede">
          {progress.photoSettled}/{progress.photoCount} {t(INGEST_V2_COPY.photoCount)} · {progress.cardSettled}/{progress.cardCount} {t(INGEST_V2_COPY.cardCount)} {t({ en: "ready", zh: "已就绪", ja: "準備完了" })}
          {excluded > 0 ? ` · ${t({ en: "excluded", zh: "已排除", ja: "除外" })} ${excluded}` : ""}
        </p>
        <div className="bci-progress">
          <div
            className="bci-progress-fill"
            style={{
              width: `${batch.expectedItems ? ((uploaded + excluded) / batch.expectedItems) * 100 : 0}%`,
            }}
          />
        </div>
        {missingFiles.length > 0 ? (
          <div className="bci-warn">
            {t({
              en: `${missingFiles.length} photo(s) need to be re-attached (the page was reloaded). Choose the same photos again — they are matched by content.`,
              zh: `${missingFiles.length} 张照片需要重新挂载（页面曾刷新）。重新选择同一批照片即可，系统按内容自动匹配。`,
              ja: `${missingFiles.length} 枚の写真を再選択してください（ページが再読み込みされました）。同じ内容で照合します。`,
            })}
          </div>
        ) : null}
        <div className="bci-rows">
          {cards.map((card) => {
            const pending = card.items.filter((item) => item.status === "awaiting_upload");
            const excludeable = card.items.some((item) => item.status === "awaiting_upload" || item.status === "uploaded");
            const statuses = card.items.map((item) => item.status);
            const allExcluded = statuses.every((itemStatus) => itemStatus === "excluded");
            const allUploaded = statuses.every((itemStatus) => itemStatus === "uploaded");
            const activeItem = card.items[0]!;
            const uploadState = pending.map((item) => uploadStates[item.id]).find(Boolean);
            const statusCopy = allExcluded
              ? ITEM_STATUS_COPY.excluded
              : allUploaded
                ? ITEM_STATUS_COPY.uploaded
                : uploadState?.kind === "uploading"
                  ? { en: "Uploading…", zh: "上传中…", ja: "アップロード中…" }
                  : uploadState?.kind === "failed"
                    ? contentUploadErrorCopy(uploadState.code)
                    : { en: "Waiting for file", zh: "等待文件", ja: "ファイル待ち" };
            return (
              <div className={`bci-row bci-row-${activeItem.status}`} key={card.cardId}>
                <span className="bci-row-seq">#{activeItem.seq}</span>
                <span className="bci-row-name">{card.items.map((item) => `${item.side === "front" ? t(INGEST_V2_COPY.front) : t(INGEST_V2_COPY.back)} · ${item.sourceFileName}`).join(" / ")}</span>
                <span className="bci-row-status">{t(statusCopy)}</span>
                {excludeable ? (
                  <button
                    className="btn btn-ghost bci-row-action"
                    disabled={busy}
                    onClick={() =>
                      void withBusy(async () => {
                        await postActionChecked(`/${batchId}/items/${activeItem.id}/exclude`);
                      })
                    }
                    type="button"
                  >
                    {t(INGEST_V2_COPY.skipCard)}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="bci-actions">
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() =>
              void withBusy(async () => {
                await postActionChecked(`/${batchId}/cancel`);
              })
            }
            type="button"
          >
            {t({ en: "Cancel batch", zh: "取消批次", ja: "バッチをキャンセル" })}
          </button>
          {missingFiles.length > 0 ? (
            <button
              className="btn btn-ghost"
              onClick={() => reattachRef.current?.click()}
              type="button"
            >
              {t({ en: "Re-attach photos", zh: "重新选择照片", ja: "写真を再選択" })}
            </button>
          ) : null}
          {canRetry ? (
            <button className="btn btn-ghost" type="button"
              disabled={busy || Object.values(uploadStates).some((state) => state.kind === "uploading")}
              onClick={() => void pumpUploads()}
            >
              {t({ en: "Retry upload", zh: "重试上传", ja: "アップロードを再試行" })}
            </button>
          ) : null}
          <button
            className="btn btn-primary"
            disabled={busy || !readyToFinalize}
            onClick={() =>
              void withBusy(async () => {
                await postActionChecked(`/${batchId}/finalize`);
              })
            }
            type="button"
          >
            {t({ en: "Start recognition", zh: "开始识别", ja: "認識を開始" })}
          </button>
        </div>
      </>
    );
  }

  function renderProcessing() {
    const progress = progressForItems(items);
    return (
      <>
        <h2>{t({ en: "Recognizing your cards…", zh: "正在识别名片…", ja: "名刺を認識中…" })}</h2>
        <p className="bci-lede">
          {t({
            en: "You can leave this page — processing continues in the background.",
            zh: "可以离开本页，识别在后台继续；回来时进度自动恢复。",
            ja: "このページを離れても処理は続きます。戻ると進捗が復元されます。",
          })}
        </p>
        <div className="bci-progress">
          <div
            className="bci-progress-fill"
            style={{ width: `${progress.photoCount ? (progress.photoSettled / progress.photoCount) * 100 : 0}%` }}
          />
        </div>
        <div className="bci-progress-label">
          {progress.photoSettled}/{progress.photoCount} {t(INGEST_V2_COPY.photoCount)} · {progress.cardSettled}/{progress.cardCount} {t(INGEST_V2_COPY.cardCount)}
        </div>
        <div className="bci-rows">
          {cards.map((card) => {
            const item = card.items[0]!;
            const status = card.items.every((entry) => entry.status === "extracted")
              ? "extracted"
              : card.items.some((entry) => entry.status === "processing")
                ? "processing"
                : item.status;
            return <div className={`bci-row bci-row-${status}`} key={card.cardId}>
              <span className="bci-row-seq">#{item.seq}</span>
              <span className="bci-row-name">{card.items.map((entry) => `${entry.side === "front" ? t(INGEST_V2_COPY.front) : t(INGEST_V2_COPY.back)} · ${entry.sourceFileName}`).join(" / ")}</span>
              <span className="bci-row-status">
                {t(ITEM_STATUS_COPY[status])}
                {item.status === "queued" && item.attemptCount > 0
                  ? ` · ${t({ en: "retrying", zh: "等待重试", ja: "再試行待ち" })}`
                  : ""}
              </span>
            </div>;
          })}
        </div>
      </>
    );
  }

  function renderReview() {
    const incompleteReceiptCard = cards.find((card) =>
      !card.allConfirmed
      && card.items.some((item) => item.status === "confirmed")
      && !card.items.every((item) => item.status === "skipped" || item.status === "excluded"),
    );
    if (incompleteReceiptCard) {
      return (
        <>
          <h2>{t({ en: "Confirmation needs a refresh", zh: "确认结果需要刷新", ja: "確認結果を更新してください" })}</h2>
          <div className="bci-warn" role="alert">
            {t({ en: "The two sides do not share one confirmed contact yet. Refresh to verify the receipt before continuing.", zh: "正反面还没有共同的确认联系人，请刷新确认回执后再继续。", ja: "表裏が同じ連絡先に確定されていません。結果を更新して確認してから続けてください。" })}
          </div>
          <button className="btn btn-primary" disabled={busy} onClick={() => void refresh()} type="button">{t({ en: "Refresh", zh: "刷新", ja: "更新" })}</button>
        </>
      );
    }
    const currentCard = cards.find((card) => !card.allConfirmed && (card.reviewable || card.invalidStructure)) ?? null;
    if (!currentCard) {
      const confirmed = cards.filter((card) => card.allConfirmed).length;
      const skipped = cards.filter((card) => card.items.length > 0 && card.items.every((item) => item.status === "skipped" || item.status === "excluded")).length;
      return (
        <>
          <h2>{t({ en: "All cards reviewed", zh: "全部卡片已处理", ja: "すべての名刺を確認しました" })}</h2>
          <p className="bci-lede">
            {t(INGEST_V2_COPY.cardCount)} {cards.length} · {t({ en: "Confirmed", zh: "已收录", ja: "登録済み" })} {confirmed} ·{" "}
            {t({ en: "Skipped", zh: "已跳过", ja: "スキップ済み" })} {skipped}
          </p>
        </>
      );
    }
    const draft = cardDrafts[currentCard.cardId] ?? initialCardDraft(currentCard);
    return (
      <CardReviewPane
        batchId={batchId}
        busy={busy}
        card={currentCard}
        draft={draft}
        duplicate={duplicateCardId === currentCard.cardId}
        manual={manualCardId === currentCard.cardId}
        onConfirm={(allowDuplicate, manual) => void submitCardConfirm(currentCard, draft, allowDuplicate, manual)}
        onDraftChange={(next) => setCardDrafts((previous) => ({ ...previous, [currentCard.cardId]: next }))}
        onManualToggle={() =>
          setManualCardId((previous) => (previous === currentCard.cardId ? null : currentCard.cardId))
        }
        onReplace={(item) => {
          setReplaceTarget(item);
          replaceRef.current?.click();
        }}
        onRetry={() =>
          void withBusy(async () => {
            await Promise.all(currentCard.items.filter((item) => item.status === "terminal_failed").map((item) => postActionChecked(`/${batchId}/items/${item.id}/retry`)));
          })
        }
        onSkip={() =>
          void withBusy(async () => {
            await postActionChecked(`/${batchId}/items/${currentCard.items[0]!.id}/skip`);
            setDuplicateCardId(null);
            setManualCardId(null);
          })
        }
        remaining={
          cards.filter((card) => !card.allConfirmed && (card.reviewable || card.invalidStructure)).length
        }
        t={t}
      />
    );
  }
}

const CARD_FIELD_LABELS: Record<IngestV2Field, { en: string; zh: string; ja: string }> = {
  displayName: { en: "Name", zh: "姓名", ja: "名前" },
  organization: { en: "Company", zh: "公司", ja: "会社" },
  role: { en: "Title", zh: "职位", ja: "役職" },
  email: { en: "Email", zh: "邮箱", ja: "メール" },
  phone: { en: "Phone", zh: "电话", ja: "電話" },
};

function CardReviewPane({
  batchId,
  busy,
  card,
  draft,
  duplicate,
  manual,
  onConfirm,
  onDraftChange,
  onManualToggle,
  onReplace,
  onRetry,
  onSkip,
  remaining,
  t,
}: {
  batchId: string;
  busy: boolean;
  card: IngestV2CardViewModel;
  draft: IngestV2CardDraft;
  duplicate: boolean;
  manual: boolean;
  onConfirm: (allowDuplicate: boolean, manual: boolean) => void;
  onDraftChange: (draft: IngestV2CardDraft) => void;
  onManualToggle: () => void;
  onReplace: (item: IngestItemDTO) => void;
  onRetry: () => void;
  onSkip: () => void;
  remaining: number;
  t: Translate;
}) {
  const candidateMap = useMemo(() => {
    const map = new Map<IngestV2Field, IngestV2FieldCandidate[]>();
    for (const field of INGEST_V2_FIELDS) {
      map.set(field, card.items.flatMap((item) => fieldCandidates(item).filter((candidate) => candidate.field === field)));
    }
    return map;
  }, [card]);

  function updateManual(field: IngestV2Field, value: string): void {
    onDraftChange(setManualDraftField(draft, field, value));
  }

  function updateAuxiliary(field: "relationshipContext" | "notes", value: string): void {
    onDraftChange(field === "notes"
      ? setManualDraftNotes(draft, value)
      : { ...draft, fields: { ...draft.fields, relationshipContext: value } });
  }

  const nameMissing = !draft.fields.displayName.trim();
  const canConfirmNormally = card.reviewable && card.allExtracted && !manual;
  const canConfirmManually = card.reviewable && manual;
  const hasTerminalFailure = card.hasTerminalFailure;

  return (
    <>
      <div className="eyebrow">
        {t(INGEST_V2_COPY.review)} · {remaining} {t({ en: "cards left", zh: "张待处理", ja: "枚残り" })}
      </div>
      <h2>
        {t(INGEST_V2_COPY.cardTitle)} #{card.items[0]?.seq ?? ""}
      </h2>
      {card.invalidStructure ? (
        <div className="bci-warn" data-ingest-invalid-card role="alert">
          {t({ en: "This card has an invalid front/back combination. It cannot be confirmed until the batch is corrected.", zh: "这张卡的正反面组合无效，修正批次后才能确认。", ja: "このカードの表裏の組み合わせが無効です。バッチを修正するまで確認できません。" })}
        </div>
      ) : null}
      {card.hasMissingImageDigest ? <div className="bci-warn" data-ingest-no-image-digest role="status">{t(INGEST_V2_COPY.noDigest)}</div> : null}
      {draft.staleFields.length > 0 ? <div className="bci-warn" data-ingest-source-expired role="status">{t(INGEST_V2_COPY.sourceExpired)} {draft.staleFields.map((field) => t(CARD_FIELD_LABELS[field])).join(", ")}</div> : null}
      {draft.notesSourceUpdated && draft.notesDirty ? <div className="bci-warn" data-ingest-notes-source-updated role="status">{t(INGEST_V2_COPY.previousSourceInvalidated)}</div> : null}
      {draft.conflictedFields.length > 0 ? <div className="bci-warn" data-ingest-source-conflict role="alert">{t({ en: "The two sides disagree. Choose a source or enter a value for:", zh: "正反面识别结果不一致，请选择来源或手工填写：", ja: "表裏の認識結果が異なります。出典を選ぶか入力してください：" })} {draft.conflictedFields.map((field) => t(CARD_FIELD_LABELS[field])).join(", ")}</div> : null}
      <div className="bci-card-images">
        {card.items.map((item) => (
          <figure className="bci-card-image" key={item.id}>
            {item.derivativeObjectKey && item.imageDigest ? (
              <IngestV2PrivateImage
                key={`${item.id}:${item.version}:${item.imageDigest ?? "missing"}`}
                alt={t(item.side === "front" ? INGEST_V2_COPY.front : INGEST_V2_COPY.back)}
                errorLabel={t(INGEST_V2_COPY.imageUnavailable)}
                expiredLabel={t(INGEST_V2_COPY.imageExpired)}
                loadingLabel={t({ en: "Loading photo…", zh: "正在加载照片…", ja: "写真を読み込み中…" })}
                src={itemImageUrl(batchId, item)}
              />
            ) : (
              <div className="bci-image-missing">{t(item.imageDigest ? INGEST_V2_COPY.imageUnavailable : INGEST_V2_COPY.noDigest)}</div>
            )}
            <figcaption>
              <strong>{t(item.side === "front" ? INGEST_V2_COPY.front : INGEST_V2_COPY.back)}</strong>
              <span title={item.sourceFileName}>{item.sourceFileName}</span>
              {item.status === "terminal_failed" ? <em>{t({ en: "Recognition failed", zh: "识别失败", ja: "認識に失敗" })}</em> : null}
              <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => onReplace(item)} type="button">{t({ en: "Replace photo", zh: "替换图片", ja: "写真を置換" })}</button>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="bci-review-form">
        {card.items.filter((item) => item.status === "extracted").map((item) => item.extraction ? (
          <div key={`${item.id}-review-context`}>
            {ingestExtractionHasNoFields(item) ? <div className="bci-warn" data-batch-notice="empty-extraction" role="status">{t({ en: "Recognition did not find any fields. Fill the form against the card image.", zh: "识别没有读到任何字段，请对照卡图手工填写。", ja: "認識で項目を読み取れませんでした。画像を見ながら入力してください。" })}</div> : null}
            <ReviewIssueList issues={item.reviewIssues} t={t} />
            <ExtraContactSignals
              extraction={item.extraction}
              fields={draft.fields}
              onChange={(next) => {
                let changed = draft;
                if (next.email !== draft.fields.email) changed = setManualDraftField(changed, "email", next.email);
                if (next.phone !== draft.fields.phone) changed = setManualDraftField(changed, "phone", next.phone);
                onDraftChange(changed);
              }}
              t={t}
            />
          </div>
        ) : null)}
        {hasTerminalFailure ? <div className="bci-warn">{t({ en: "One side needs a manual value or another recognition attempt.", zh: "有一面识别失败，请手工填写或重新识别。", ja: "片面の認識に失敗しました。手入力するか、もう一度認識してください。" })}</div> : null}
        {INGEST_V2_FIELDS.map((field) => {
          const candidates = candidateMap.get(field) ?? [];
          const sourceId = draft.fieldSources[field];
          return (
            <label className="bci-field" key={field}>
              <span>{t(CARD_FIELD_LABELS[field])}</span>
              {field === "displayName" ? (
                <input className="bci-field-value" onChange={(event) => updateManual(field, event.target.value)} value={draft.fields[field]} />
              ) : (
                <textarea className="bci-field-value" onChange={(event) => updateManual(field, event.target.value)} rows={2} value={draft.fields[field]} />
              )}
              <span className="bci-source-state">
                {sourceId ? t({ en: `Source: ${card.items.find((item) => item.id === sourceId)?.side === "back" ? "back" : "front"}`, zh: `来源：${card.items.find((item) => item.id === sourceId)?.side === "back" ? "反面" : "正面"}`, ja: `出典：${card.items.find((item) => item.id === sourceId)?.side === "back" ? "裏面" : "表面"}` }) : t(INGEST_V2_COPY.sourceManual)}
              </span>
              {candidates.length > 1 ? (
                <span className="bci-source-options">
                  {candidates.map((candidate) => {
                    const sourceItem = card.items.find((item) => item.id === candidate.itemId);
                    return <button className={sourceId === candidate.itemId ? "bci-source-choice bci-source-choice-selected" : "bci-source-choice"} key={`${candidate.itemId}-${candidate.value}`} onClick={() => onDraftChange(setDraftFieldSource(draft, field, candidate))} type="button">{candidate.side === "back" ? t(INGEST_V2_COPY.back) : t(INGEST_V2_COPY.front)} · {sourceItem?.sourceFileName ?? candidate.itemId} · {candidate.value}</button>;
                  })}
                  <button className={!sourceId ? "bci-source-choice bci-source-choice-selected" : "bci-source-choice"} onClick={() => updateManual(field, draft.fields[field])} type="button">{t(INGEST_V2_COPY.sourceManual)}</button>
                </span>
              ) : null}
            </label>
          );
        })}
        <label className="bci-field">
          <span>{t({ en: "How you met", zh: "认识场景", ja: "出会ったきっかけ" })}</span>
          <input onChange={(event) => updateAuxiliary("relationshipContext", event.target.value)} value={draft.fields.relationshipContext} />
        </label>
        <label className="bci-field">
          <span>{t({ en: "Notes (nothing gets lost)", zh: "备注（其余信息都在这里）", ja: "メモ（情報を残します）" })}</span>
          <textarea className="bci-notes" onChange={(event) => updateAuxiliary("notes", event.target.value)} rows={5} value={draft.fields.notes} />
        </label>
        {nameMissing ? <p className="bci-hint" data-batch-hint="name-required">{t(NAME_REQUIRED_HINT_COPY)}</p> : null}
        {duplicate ? <div className="bci-warn" role="alert">{t(INGEST_V2_COPY.duplicate)}</div> : null}
        <div className="bci-actions bci-actions-review">
          <button className="btn btn-ghost" disabled={busy} onClick={onSkip} type="button">{t(INGEST_V2_COPY.skipCard)}</button>
          {hasTerminalFailure && !manual ? <>
            <button className="btn btn-ghost" disabled={busy} onClick={onManualToggle} type="button">{t({ en: "Type it in", zh: "手工录入", ja: "手入力する" })}</button>
            <button className="btn btn-primary" disabled={busy} onClick={onRetry} type="button">{t({ en: "Retry recognition", zh: "重试识别", ja: "認識を再試行" })}</button>
          </> : null}
          {hasTerminalFailure && manual ? <button className="btn btn-ghost" disabled={busy} onClick={onManualToggle} type="button">{t({ en: "Back", zh: "返回", ja: "戻る" })}</button> : null}
          {canConfirmNormally || canConfirmManually ? <button className="btn btn-primary" disabled={busy || nameMissing} onClick={() => onConfirm(duplicate, manual)} type="button">{duplicate ? t(INGEST_V2_COPY.createAnyway) : t({ en: "Confirm and next", zh: "确认并下一张", ja: "確認して次へ" })}</button> : null}
        </div>
      </div>
    </>
  );
}

export function ReviewPane({
  batchId,
  busy,
  duplicate,
  item,
  manual,
  onConfirm,
  onManualToggle,
  onReplace,
  onRetry,
  onSkip,
  remaining,
  t,
}: {
  batchId: string;
  busy: boolean;
  duplicate: boolean;
  item: IngestItemDTO;
  manual: boolean;
  onConfirm: (fields: FixedFields, allowDuplicate: boolean, manual: boolean) => void;
  onManualToggle: () => void;
  onReplace: () => void;
  onRetry: () => void;
  onSkip: () => void;
  remaining: number;
  t: Translate;
}) {
  const initial = useMemo(
    () => (item.status === "extracted" ? initialFields(item) : EMPTY_FIELDS),
    [item],
  );
  const [fields, setFields] = useState<FixedFields>(initial);
  const [editedItemId, setEditedItemId] = useState(item.id);
  useEffect(() => {
    if (item.id !== editedItemId) {
      setFields(item.status === "extracted" ? initialFields(item) : EMPTY_FIELDS);
      setEditedItemId(item.id);
    }
  }, [item, editedItemId]);

  const failed = item.status === "terminal_failed";
  const editing = item.status === "extracted" || (failed && manual);
  const emptyExtraction =
    item.status === "extracted" && ingestExtractionHasNoFields(item);
  // Mirrors the server: confirm/manual-entry forward displayName untouched and
  // the contact write service rejects a blank one.
  const nameMissing = !fields.displayName.trim();

  return (
    <>
      <div className="eyebrow">
        {t({ en: "REVIEW", zh: "逐张确认", ja: "確認" })} · {remaining}{" "}
        {t({ en: "left", zh: "张待处理", ja: "枚残り" })}
      </div>
      <h2>
        #{item.seq} · {item.sourceFileName}
      </h2>
      <div className="bci-review">
        <div className="bci-review-image">
          {item.derivativeObjectKey ? (
            <img alt={t({ en: "Card image", zh: "名片图片", ja: "名刺画像" })} src={itemImageUrl(batchId, item)} />
          ) : (
            <div className="bci-image-missing">
              {t({ en: "Image removed", zh: "图片已删除", ja: "画像は削除されました" })}
            </div>
          )}
        </div>
        <div className="bci-review-form">
          {failed ? (
            <div className="bci-warn">
              {t({ en: "Recognition failed", zh: "识别失败", ja: "認識に失敗" })}
              {item.errorCode ? ` · ${item.errorCode}` : ""}
              {item.errorCode === "LEASE_EXHAUSTED"
                ? ` · ${t({ en: "the photo may be too hard to read", zh: "照片可能过难识别", ja: "写真を読み取れない可能性があります" })}`
                : ""}
            </div>
          ) : null}
          {emptyExtraction ? (
            <div className="bci-warn" data-batch-notice="empty-extraction" role="status">
              {t(EMPTY_EXTRACTION_NOTICE_COPY)}
            </div>
          ) : null}
          {item.status === "extracted" ? (
            <ReviewIssueList issues={item.reviewIssues} t={t} />
          ) : null}
          {editing ? (
            <FieldEditor fields={fields} onChange={setFields} t={t} />
          ) : null}
          {item.status === "extracted" && item.extraction ? (
            <ExtraContactSignals extraction={item.extraction} fields={fields} onChange={setFields} t={t} />
          ) : null}
          {duplicate ? (
            <div className="bci-warn">
              {t({
                en: "Looks like this person already exists in your contacts.",
                zh: "该联系人似乎已存在于你的名片夹。",
              })}
            </div>
          ) : null}
          {editing && nameMissing ? (
            <p className="bci-hint" data-batch-hint="name-required">
              {t(NAME_REQUIRED_HINT_COPY)}
            </p>
          ) : null}
          <div className="bci-actions bci-actions-review">
            <button className="btn btn-ghost" disabled={busy} onClick={onSkip} type="button">
              {duplicate
                ? t({ en: "Skip this card", zh: "跳过此卡", ja: "この名刺をスキップ" })
                : t({ en: "Skip", zh: "跳过", ja: "スキップ" })}
            </button>
            {item.status === "extracted" ? (
              <button
                className="btn btn-primary"
                disabled={busy || nameMissing}
                onClick={() => onConfirm(fields, duplicate, false)}
                type="button"
              >
                {duplicate
                  ? t({ en: "Create anyway", zh: "仍然创建", ja: "続行して作成" })
                  : t({ en: "Confirm and next", zh: "确认并下一张", ja: "確認して次へ" })}
              </button>
            ) : manual ? (
              <>
                <button className="btn btn-ghost" disabled={busy} onClick={onManualToggle} type="button">
                  {t({ en: "Back", zh: "返回", ja: "戻る" })}
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy || nameMissing}
                  onClick={() => onConfirm(fields, duplicate, true)}
                  type="button"
                >
                  {t({ en: "Save manual entry", zh: "保存手工录入", ja: "手入力を保存" })}
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost" disabled={busy} onClick={onReplace} type="button">
                  {t({ en: "Replace photo", zh: "替换图片", ja: "写真を置換" })}
                </button>
                <button className="btn btn-ghost" disabled={busy} onClick={onManualToggle} type="button">
                  {t({ en: "Type it in", zh: "手工录入", ja: "手入力する" })}
                </button>
                <button className="btn btn-primary" disabled={busy} onClick={onRetry} type="button">
                  {t({ en: "Retry recognition", zh: "重试识别", ja: "認識を再試行" })}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const VIEW_STYLE = `
.bci-shell { display: flex; flex-direction: column; gap: 12px; }
.bci-shell h2 { color: var(--ink); font-family: var(--ff-display); font-size: clamp(20px, 2.6vw, 28px); letter-spacing: -.03em; margin: 0; }
.bci-lede { color: var(--text-2); font-size: 14px; line-height: 1.6; margin: 0; }
.bci-batch-id { font-family: var(--mono); text-transform: none; }
.bci-privacy { background: var(--accent-softer); border-radius: 11px; color: var(--text-2); font-size: 12px; line-height: 1.5; padding: 10px 12px; }
.bci-warn { background: var(--amber-soft); border-radius: 10px; color: var(--amber-text); font-size: 12.5px; line-height: 1.5; padding: 10px 12px; }
.bci-issues { background: var(--amber-soft); border-radius: 10px; color: var(--amber-text); display: grid; font-size: 12.5px; gap: 5px; line-height: 1.5; list-style: none; margin: 0; padding: 10px 12px; }
.bci-issues li { padding-left: 14px; position: relative; }
.bci-issues li::before { content: "•"; left: 2px; position: absolute; }
.bci-signals { align-items: baseline; display: flex; flex-wrap: wrap; gap: 6px; }
.bci-signals-label { color: var(--text-3); font-size: 12px; }
.bci-signal { background: var(--surface-2); border: 1px solid var(--border); border-radius: 16px; color: var(--text-2); cursor: pointer; font: inherit; font-size: 12px; padding: 3px 10px; }
.bci-signal:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.bci-signal:disabled { cursor: default; }
.bci-progress { background: var(--surface-3); border-radius: 999px; height: 8px; overflow: hidden; }
.bci-progress-fill { background: var(--accent); border-radius: 999px; height: 100%; transition: width .4s ease; }
.bci-progress-label { color: var(--text-3); font-family: var(--mono); font-size: 12px; }
.bci-rows { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
.bci-row { align-items: baseline; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; display: flex; flex-wrap: wrap; font-size: 11.5px; gap: 6px; padding: 8px 10px; }
.bci-row-seq { color: var(--text-4); font-family: var(--mono); }
.bci-row-name { color: var(--text-2); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bci-row-status { font-weight: 600; }
.bci-row-extracted .bci-row-status, .bci-row-confirmed .bci-row-status, .bci-row-uploaded .bci-row-status { color: var(--live-text); }
.bci-row-terminal_failed .bci-row-status { color: var(--amber-text); }
.bci-row-awaiting_upload .bci-row-status, .bci-row-queued .bci-row-status, .bci-row-processing .bci-row-status { color: var(--text-3); }
.bci-row-excluded .bci-row-status, .bci-row-skipped .bci-row-status { color: var(--text-4); }
.bci-row-action { font-size: 11px; padding: 2px 8px; }
.bci-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; margin-top: 4px; }
.bci-review { align-items: start; display: grid; gap: 18px; grid-template-columns: minmax(180px, 320px) 1fr; }
@media (max-width: 760px) { .bci-review { grid-template-columns: 1fr; } }
.bci-card-images { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin-bottom: 2px; }
.bci-card-image { background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; margin: 0; min-width: 0; overflow: hidden; }
.bci-card-image > [data-ingest-private-image] { border-radius: 0; }
.bci-card-image figcaption { display: grid; gap: 3px; padding: 8px 10px 10px; }
.bci-card-image figcaption strong { color: var(--text-2); font-size: 11px; text-transform: uppercase; }
.bci-card-image figcaption span { color: var(--text-3); font-size: 11px; min-width: 0; overflow-wrap: anywhere; }
.bci-card-image figcaption em { color: var(--amber-text); font-size: 11px; font-style: normal; }
.bci-source-state { color: var(--text-4); font-size: 11px !important; font-weight: 400 !important; letter-spacing: 0 !important; text-transform: none !important; }
.bci-source-options { display: flex; flex-wrap: wrap; gap: 5px; }
.bci-source-choice { background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; color: var(--text-2); cursor: pointer; font: inherit; font-size: 11px; max-width: 100%; overflow-wrap: anywhere; padding: 5px 7px; text-align: left; }
.bci-source-choice-selected { border-color: var(--accent); color: var(--accent); }
.bci-card-image .btn { justify-self: start; }
.bci-review-image img { border: 1px solid var(--border); border-radius: 12px; max-width: 100%; }
.bci-image-missing { background: var(--surface-3); border-radius: 12px; color: var(--text-3); font-size: 12.5px; padding: 30px 12px; text-align: center; }
.bci-review-form { display: flex; flex-direction: column; gap: 10px; }
.bci-field { display: flex; flex-direction: column; gap: 4px; }
.bci-field > span { color: var(--text-3); font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.bci-field input, .bci-field textarea { background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; color: var(--ink); font: inherit; font-size: 14px; padding: 9px 11px; resize: vertical; }
.bci-field-value { min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.bci-field textarea { line-height: 1.5; }
.bci-hint { color: var(--amber-text); font-size: 12.5px; line-height: 1.5; margin: 0; }
/* Narrow screens: pin the per-card action row to the viewport, and shorten the
   notes box so the fields stay in view (3 rows = 4.5em + padding). Mirrors the V1
   batch view rule; only the review row is pinned — the batch-level .bci-actions
   (cancel batch / re-attach photos) stays in flow.

   Why fixed and not sticky: .bci-actions-review is the LAST child of
   .bci-review-form, so its sticky containing block ends at its own bottom edge —
   "position: sticky; bottom: 0" has zero travel there and can only stop an element
   from scrolling away, never lift it up. Measured on a 375x812 viewport the
   equivalent V1 row sat at top=937 (off-screen) until the page was scrolled to the
   very bottom.

   iOS Safari caveat: a fixed bar is anchored to the LAYOUT viewport, so while the
   software keyboard is open the bar can end up behind the keyboard. Correcting for
   that needs VisualViewport JS, which is deliberately left out here because it is
   not testable in this environment. */
@media (max-width: 760px) {
  .bci-field textarea.bci-notes { height: calc(4.5em + 20px); min-height: calc(4.5em + 20px); }
  /* Reserve the pinned bar's height at the END of the scrollable content, so the
     last field and anything below the review pane can be scrolled clear of the bar.
     It has to sit on the shell, not inside the review form: padding inside the form
     only moves the tail down together with the extra scroll range, leaving the last
     elements just as trapped (measured). 118px = two 44px button rows (the row wraps
     at 375px with English labels) + 10px row gap + 20px padding; +12px breathing room. */
  /* 与 V1 同一套契约：底栏高度声明在 body 上，全局 iOrbit 悬浮球据此上移。 */
  body:has(.bci-actions-review) { --orbit-pinned-bar-h: calc(54px + max(12px, env(safe-area-inset-bottom, 0px))); }
  .bci-shell:has(.bci-actions-review) { padding-bottom: calc(var(--orbit-pinned-bar-h) + 12px); }
  .bci-actions-review { background: var(--bg); border-top: 1px solid var(--border); bottom: 0; left: 0; margin: 0; padding: 10px 20px max(12px, env(safe-area-inset-bottom, 0px)); position: fixed; right: 0; z-index: ${ORBIT_Z.sticky}; }
}
`;
