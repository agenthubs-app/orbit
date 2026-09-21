"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { INGEST_V2_MAX_ITEMS, INGEST_V2_MAX_RAW_BYTES } from "../../../../../features/acquisition/business-card-ingest-v2/contract";
import { useOrbitLanguage } from "../../orbit-language-context";
import {
  createInitialPairing,
  freezeManifestSubmission,
  pairPhotoAsBack,
  removePairingPhoto,
  unpairBackPhoto,
  type FrozenManifestSubmission,
  type PairingCard,
  type PairingPhoto,
} from "./ingest-v2-route-view-model";
import { INGEST_V2_COPY } from "./ingest-v2-copy";
import { IngestV2PrivateImage } from "./ingest-v2-private-image";
import {
  INGEST_V2_API_BASE,
  resolveUploadMimeType,
  sha256OfFile,
  stashPendingFiles,
} from "./ingest-v2-client";

const RECOMMENDED_MAX = 50;
const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

interface GuideCard {
  good: boolean;
  emoji: string;
  title: { en: string; zh: string; ja: string };
  detail: { en: string; zh: string; ja: string };
}

const GUIDE_CARDS: readonly GuideCard[] = [
  {
    good: true,
    emoji: "🪪",
    title: { en: "One card per photo", zh: "一卡一照", ja: "1枚の写真に1枚の名刺" },
    detail: {
      en: "Shoot each card separately — multiple cards in one photo confuse recognition.",
      zh: "每张名片单独拍一张。一张照片拍多张名片，识别很可能不准确。",
      ja: "名刺は1枚ずつ撮影してください。複数枚を写すと認識が不正確になります。",
    },
  },
  {
    good: true,
    emoji: "📐",
    title: { en: "Fill the frame, face-on", zh: "正对名片、填满画面", ja: "正面からフレームいっぱいに" },
    detail: {
      en: "Hold the phone parallel to the card and let it fill most of the frame.",
      zh: "手机与名片平行，让名片占据画面大部分，不歪斜。",
      ja: "スマートフォンを名刺と平行に持ち、画面の大部分に収めてください。",
    },
  },
  {
    good: true,
    emoji: "💡",
    title: { en: "Good light, no glare", zh: "光线充足、避免反光", ja: "明るく、反射を避ける" },
    detail: {
      en: "Even lighting beats flash — tilt slightly if the card is glossy.",
      zh: "均匀光线优于闪光灯；名片反光时稍微倾斜避开高光。",
      ja: "フラッシュより均一な光を使い、光沢がある場合は少し傾けてください。",
    },
  },
  {
    good: false,
    emoji: "🚫",
    title: { en: "Avoid: piles & backgrounds", zh: "避免：多卡合拍、杂乱背景", ja: "避ける：重ね撮りと雑然とした背景" },
    detail: {
      en: "No card stacks, no busy desks, no fingers over the text.",
      zh: "不要一次拍一摞名片，不要杂乱桌面，不要手指遮挡文字。",
      ja: "名刺の束や散らかった机、文字を隠す指が写らないようにしてください。",
    },
  },
];

function newPhotoId(): string {
  return `photo:${crypto.randomUUID()}`;
}

function formatCount(
  value: number,
  singular: { en: string; zh: string; ja: string },
  plural: { en: string; zh: string; ja: string },
  t: ReturnType<typeof useOrbitLanguage>["t"],
): string {
  return `${value} ${t(value === 1 ? singular : plural)}`;
}

function availableBackPhotos(cards: readonly PairingCard[], targetCardId: string): PairingPhoto[] {
  return cards.flatMap((card) => {
    if (card.cardId === targetCardId) return [];
    if (card.back) return [card.back];
    return [card.front];
  });
}

export function BusinessCardIngestV2Start() {
  const { preserveHref, t } = useOrbitLanguage();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const startBusyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [pairingCards, setPairingCards] = useState<PairingCard[]>([]);
  const [filesByPhotoId, setFilesByPhotoId] = useState<Map<string, File>>(new Map());
  const [pairChoices, setPairChoices] = useState<Record<string, string>>({});
  const [frozenSubmission, setFrozenSubmission] = useState<FrozenManifestSubmission | null>(null);

  async function fileToPhoto(file: File): Promise<PairingPhoto> {
    return {
      id: newPhotoId(),
      fileName: file.name,
      mimeType: resolveUploadMimeType(file),
      rawSize: file.size,
      clientDigest: await sha256OfFile(file),
    };
  }

  async function readPhotos(fileList: FileList | null, append: boolean): Promise<void> {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    setError(null);
    if (filesByPhotoId.size + files.length > INGEST_V2_MAX_ITEMS) {
      setError(t(INGEST_V2_COPY.tooManyPhotos));
      return;
    }
    const oversize = files.find((file) => file.size > INGEST_V2_MAX_RAW_BYTES);
    if (oversize) {
      setError(`${oversize.name} ${t(INGEST_V2_COPY.exceedsLimit)}`);
      return;
    }

    setPreparing(true);
    try {
      const photos: PairingPhoto[] = [];
      const nextFiles = new Map(filesByPhotoId);
      for (const file of files) {
        const photo = await fileToPhoto(file);
        photos.push(photo);
        nextFiles.set(photo.id, file);
      }
      const newCards = createInitialPairing(photos, (photo) => `card:${photo.id}`);
      setFilesByPhotoId(nextFiles);
      setPairingCards((previous) => (append ? [...previous, ...newCards] : newCards));
      setFrozenSubmission(null);
      setPairChoices({});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t(INGEST_V2_COPY.unableToPrepare));
    } finally {
      setPreparing(false);
    }
  }

  async function replaceSlot(cardId: string, side: "front" | "back", fileList: FileList | null): Promise<void> {
    const file = fileList?.[0];
    if (!file || preparing || frozenSubmission) return;
    setError(null);
    if (file.size > INGEST_V2_MAX_RAW_BYTES) {
      setError(`${file.name} ${t(INGEST_V2_COPY.exceedsLimit)}`);
      return;
    }
    const target = pairingCards.find((card) => card.cardId === cardId);
    if (!target) return;
    const replaced = side === "front" ? target.front : target.back;
    if (!replaced && filesByPhotoId.size >= INGEST_V2_MAX_ITEMS) {
      setError(t(INGEST_V2_COPY.tooManyPhotos));
      return;
    }
    setPreparing(true);
    try {
      const photo = await fileToPhoto(file);
      setFilesByPhotoId((previous) => {
        const next = new Map(previous);
        next.set(photo.id, file);
        if (replaced) next.delete(replaced.id);
        return next;
      });
      setPairingCards((previous) => previous.map((card) => {
        if (card.cardId !== cardId) return card;
        return side === "front" ? { ...card, front: photo } : { ...card, back: photo };
      }));
      setFrozenSubmission(null);
      setPairChoices({});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t(INGEST_V2_COPY.unableToPrepare));
    } finally {
      setPreparing(false);
    }
  }

  function clearSubmissionAfterPairingChange(): void {
    if (preparing || startBusyRef.current) return;
    setFrozenSubmission(null);
    setError(null);
  }

  async function startBatch(): Promise<void> {
    if (pairingCards.length === 0 || preparing || startBusyRef.current) return;
    startBusyRef.current = true;
    setError(null);
    setPreparing(true);
    const submission = frozenSubmission ?? freezeManifestSubmission(pairingCards, crypto.randomUUID());
    setFrozenSubmission(submission);
    try {
      const byDigest = new Map<string, File>();
      for (const entry of pairingCards.flatMap((card) => [card.front, card.back].filter((photo): photo is PairingPhoto => photo !== null))) {
        const file = filesByPhotoId.get(entry.id);
        if (!file) throw new Error(`missing_file:${entry.fileName}`);
        byDigest.set(entry.clientDigest, file);
      }
      const response = await fetch(INGEST_V2_API_BASE, {
        body: JSON.stringify({ idempotencyKey: submission.idempotencyKey, manifest: submission.manifest }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as { data?: { batch?: { id: string } }; error?: { message?: string } } | null;
      if (!response.ok || !body?.data?.batch) {
        setError(body?.error?.message ?? `HTTP ${response.status}`);
        return;
      }
      stashPendingFiles(body.data.batch.id, byDigest);
      // 批次详情由 /app/contacts/new?job= 承载（batch2 路由待删）；id 含冒号，须编码。
      router.push(preserveHref(`/app/contacts/new?job=${encodeURIComponent(body.data.batch.id)}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start upload");
    } finally {
      setPreparing(false);
      startBusyRef.current = false;
    }
  }

  function removePhoto(photoId: string): void {
    if (preparing || frozenSubmission) return;
    setPairingCards((previous) => removePairingPhoto(previous, photoId));
    setFilesByPhotoId((previous) => {
      const next = new Map(previous);
      next.delete(photoId);
      return next;
    });
    clearSubmissionAfterPairingChange();
  }

  const photoCount = filesByPhotoId.size;
  const controlsDisabled = preparing || frozenSubmission !== null;

  return (
    <section className="bci-start">
      <style>{START_STYLE}</style>
      <div className="eyebrow">{t(INGEST_V2_COPY.batchImport)}</div>
      <h2>{t({ en: "Photograph your cards", zh: "拍好名片，再一次导入", ja: "名刺を撮影して一括インポート" })}</h2>
      <p className="bci-lede">
        {t({
          en: `Pick up to ${INGEST_V2_MAX_ITEMS} photos (${RECOMMENDED_MAX} or fewer works best). Each photo starts as its own card.`,
          zh: `一次最多选择 ${INGEST_V2_MAX_ITEMS} 张（建议每批 20–${RECOMMENDED_MAX} 张）。每张照片默认各自成卡。`,
          ja: `最大 ${INGEST_V2_MAX_ITEMS} 枚まで選べます（${RECOMMENDED_MAX} 枚以下がおすすめ）。写真は最初は別々のカードです。`,
        })}
      </p>
      {pairingCards.length === 0 ? (
        <>
          <div className="bci-guide">
            {GUIDE_CARDS.map((card) => (
              <div className={card.good ? "bci-guide-card" : "bci-guide-card bci-guide-bad"} key={card.emoji}>
                <span aria-hidden className="bci-guide-emoji">{card.emoji}</span>
                <strong>{t(card.title)}</strong>
                <span className="bci-guide-detail">{t(card.detail)}</span>
              </div>
            ))}
          </div>
          <div className="bci-multicard-note">{t(INGEST_V2_COPY.pairBeforeUpload)}</div>
        </>
      ) : (
        <div className="bci-pairing" data-ingest-pairing>
          <div className="bci-pairing-summary">
            <strong>{formatCount(pairingCards.length, INGEST_V2_COPY.card, INGEST_V2_COPY.cards, t)}</strong>
            <span>{formatCount(photoCount, INGEST_V2_COPY.photo, INGEST_V2_COPY.photos, t)}</span>
            <span>{t(INGEST_V2_COPY.pairBeforeUpload)}</span>
          </div>
          <div className="bci-pairing-cards">
            {pairingCards.map((card, index) => {
              const choice = pairChoices[card.cardId] ?? "";
              const options = availableBackPhotos(pairingCards, card.cardId);
              return (
                <article className="bci-pair-card" data-card-id={card.cardId} key={card.cardId}>
                  <div className="bci-pair-card-title"><strong>{t(INGEST_V2_COPY.card)} #{index + 1}</strong><span>{card.back ? t(INGEST_V2_COPY.twoSided) : t(INGEST_V2_COPY.singleSided)}</span></div>
                  <div className="bci-slot">
                    <span className="bci-slot-label">{t(INGEST_V2_COPY.front)}</span>
                    <div className="bci-slot-main">
                      {filesByPhotoId.get(card.front.id) ? <IngestV2PrivateImage alt={card.front.fileName} className="bci-slot-preview" errorLabel={t(INGEST_V2_COPY.imageUnavailable)} expiredLabel={t(INGEST_V2_COPY.imageExpired)} loadingLabel={t({ en: "Loading photo…", zh: "正在加载照片…", ja: "写真を読み込み中…" })} sizes="52px" src={filesByPhotoId.get(card.front.id)!} /> : <span className="bci-slot-empty">{t(INGEST_V2_COPY.waitingFile)}</span>}
                      <span title={card.front.fileName}>{card.front.fileName}</span>
                    </div>
                    <div className="bci-slot-actions">
                      <label aria-disabled={controlsDisabled} className="btn btn-quiet btn-sm bci-slot-picker" data-disabled={controlsDisabled} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (!controlsDisabled) (event.currentTarget.querySelector("input") as HTMLInputElement | null)?.click(); } }} role="button" tabIndex={controlsDisabled ? -1 : 0}>
                        {t(INGEST_V2_COPY.replacePhoto)}
                        <input accept={ACCEPTED_IMAGE_TYPES} capture="environment" disabled={controlsDisabled} hidden onChange={(event) => { void replaceSlot(card.cardId, "front", event.target.files); event.target.value = ""; }} type="file" />
                      </label>
                      <button aria-label={`${t(INGEST_V2_COPY.removePhoto)} ${card.front.fileName}`} className="btn btn-quiet btn-sm" disabled={controlsDisabled} onClick={() => removePhoto(card.front.id)} type="button">×</button>
                    </div>
                  </div>
                  <div className="bci-slot">
                    <span className="bci-slot-label">{t(INGEST_V2_COPY.back)}</span>
                    <div className="bci-slot-main">
                      {card.back && filesByPhotoId.get(card.back.id) ? <IngestV2PrivateImage alt={card.back.fileName} className="bci-slot-preview" errorLabel={t(INGEST_V2_COPY.imageUnavailable)} expiredLabel={t(INGEST_V2_COPY.imageExpired)} loadingLabel={t({ en: "Loading photo…", zh: "正在加载照片…", ja: "写真を読み込み中…" })} sizes="52px" src={filesByPhotoId.get(card.back.id)!} /> : <span className="bci-slot-empty">{t(INGEST_V2_COPY.emptyBack)}</span>}
                      <span title={card.back?.fileName ?? ""}>{card.back?.fileName ?? t(INGEST_V2_COPY.emptyBack)}</span>
                    </div>
                    {card.back ? <div className="bci-slot-actions">
                      <label aria-disabled={controlsDisabled} className="btn btn-quiet btn-sm bci-slot-picker" data-disabled={controlsDisabled} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (!controlsDisabled) (event.currentTarget.querySelector("input") as HTMLInputElement | null)?.click(); } }} role="button" tabIndex={controlsDisabled ? -1 : 0}>
                        {t(INGEST_V2_COPY.replacePhoto)}
                        <input accept={ACCEPTED_IMAGE_TYPES} capture="environment" disabled={controlsDisabled} hidden onChange={(event) => { void replaceSlot(card.cardId, "back", event.target.files); event.target.value = ""; }} type="file" />
                      </label>
                      <button className="btn btn-quiet btn-sm" disabled={controlsDisabled} onClick={() => { setPairingCards((previous) => unpairBackPhoto(previous, card.cardId)); clearSubmissionAfterPairingChange(); }} type="button">{t(INGEST_V2_COPY.removeBack)}</button>
                    </div> : <div className="bci-slot-actions">
                      <label aria-disabled={controlsDisabled} className="btn btn-quiet btn-sm bci-slot-picker" data-disabled={controlsDisabled} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (!controlsDisabled) (event.currentTarget.querySelector("input") as HTMLInputElement | null)?.click(); } }} role="button" tabIndex={controlsDisabled ? -1 : 0}>
                        {t(INGEST_V2_COPY.replacePhoto)}
                        <input accept={ACCEPTED_IMAGE_TYPES} capture="environment" disabled={controlsDisabled} hidden onChange={(event) => { void replaceSlot(card.cardId, "back", event.target.files); event.target.value = ""; }} type="file" />
                      </label>
                    </div>}
                  </div>
                  {options.length > 0 && !card.back ? (
                    <div className="bci-pair-action">
                      <select aria-label={t(INGEST_V2_COPY.selectPhoto)} disabled={controlsDisabled} onChange={(event) => setPairChoices((previous) => ({ ...previous, [card.cardId]: event.target.value }))} value={choice}>
                        <option value="">{t(INGEST_V2_COPY.selectPhoto)}</option>
                        {options.map((photo) => <option key={photo.id} value={photo.id}>{photo.fileName}</option>)}
                      </select>
                      <button className="btn btn-ghost btn-sm" disabled={!choice || controlsDisabled} onClick={() => { setPairingCards((previous) => pairPhotoAsBack(previous, choice, card.cardId)); setPairChoices({}); clearSubmissionAfterPairingChange(); }} type="button">{t(INGEST_V2_COPY.useAsBack)}</button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
          <p className="bci-pairing-footnote">{frozenSubmission ? t(INGEST_V2_COPY.requestFrozen) : t({ en: "Review the pairing before upload. The server will use exactly these sides.", zh: "上传前请复核配对；服务端只会使用你确认的正反面。", ja: "アップロード前にペアを確認してください。サーバーは確定した表裏だけを使います。" })}</p>
          {frozenSubmission ? <button className="btn btn-ghost btn-sm bci-adjust-pairing" disabled={preparing} onClick={clearSubmissionAfterPairingChange} type="button">{t(INGEST_V2_COPY.adjustPairing)}</button> : null}
        </div>
      )}
      {error ? <div className="bci-warn" role="alert">{error}</div> : null}
      <div className="bci-start-actions">
        <input accept={ACCEPTED_IMAGE_TYPES} hidden multiple onChange={(event) => { void readPhotos(event.target.files, true); event.target.value = ""; }} ref={addInputRef} type="file" />
        <input accept={ACCEPTED_IMAGE_TYPES} hidden multiple onChange={(event) => { void readPhotos(event.target.files, false); event.target.value = ""; }} ref={inputRef} type="file" />
        {pairingCards.length > 0 ? <button className="btn btn-ghost" disabled={controlsDisabled} onClick={() => addInputRef.current?.click()} type="button">{t(INGEST_V2_COPY.addPhotos)}</button> : null}
        <button className="btn btn-primary" disabled={preparing} onClick={() => (pairingCards.length === 0 ? inputRef.current?.click() : void startBatch())} type="button">
          {preparing ? t(INGEST_V2_COPY.preparing) : pairingCards.length === 0 ? t(INGEST_V2_COPY.choosePhotos) : frozenSubmission ? t(INGEST_V2_COPY.retryUpload) : t(INGEST_V2_COPY.confirmPairing)}
        </button>
      </div>
    </section>
  );
}

const START_STYLE = `
.bci-start { display: flex; flex-direction: column; gap: 14px; }
.bci-start h2 { color: var(--ink); font-family: var(--ff-display); font-size: clamp(20px, 2.6vw, 28px); letter-spacing: -.03em; margin: 0; }
.bci-lede { color: var(--text-2); font-size: 14px; line-height: 1.6; margin: 0; }
.bci-guide { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
.bci-guide-card { background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; display: flex; flex-direction: column; gap: 5px; padding: 13px 14px; }
.bci-guide-card strong { color: var(--ink); font-size: 13.5px; }
.bci-guide-bad { border-style: dashed; }
.bci-guide-emoji { font-size: 22px; }
.bci-guide-detail { color: var(--text-3); font-size: 12.5px; line-height: 1.5; }
.bci-multicard-note, .bci-pairing-footnote { background: var(--accent-softer); border-radius: 11px; color: var(--text-2); font-size: 12.5px; line-height: 1.5; padding: 10px 12px; }
.bci-warn { background: var(--amber-soft); border-radius: 10px; color: var(--amber-text); font-size: 12.5px; line-height: 1.5; padding: 10px 12px; }
.bci-pairing { display: flex; flex-direction: column; gap: 12px; }
.bci-pairing-summary { align-items: baseline; color: var(--text-2); display: flex; flex-wrap: wrap; gap: 10px; font-size: 12.5px; }
.bci-pairing-summary strong { color: var(--ink); font-size: 14px; }
.bci-pairing-cards { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.bci-pair-card { background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 12px; }
.bci-pair-card-title { align-items: baseline; display: flex; justify-content: space-between; gap: 8px; }
.bci-pair-card-title span { color: var(--text-3); font-size: 11px; }
.bci-slot { align-items: center; display: grid; gap: 8px; grid-template-columns: 42px minmax(0, 1fr); font-size: 12px; min-width: 0; }
.bci-slot-label { color: var(--text-3); font-weight: 700; }
.bci-slot-main { align-items: center; display: flex; gap: 8px; min-width: 0; }
.bci-slot-main > span:last-child { min-width: 0; overflow-wrap: anywhere; }
.bci-slot-preview { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; flex: 0 0 52px; height: 38px; min-width: 52px; overflow: hidden; }
.bci-slot-preview > div { height: 100%; }
.bci-slot-preview img { height: 100%; width: 100%; }
.bci-slot-empty { color: var(--text-3); font-style: italic; }
.bci-slot-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 5px; grid-column: 2; grid-row: 2; justify-content: flex-start; }
.bci-slot-picker[data-disabled="true"] { opacity: .55; pointer-events: none; }
.bci-pair-action { display: flex; flex-wrap: wrap; gap: 7px; }
.bci-pair-action select { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; color: var(--text); flex: 1; min-width: 140px; padding: 6px 8px; }
.bci-start-actions { display: flex; flex-wrap: wrap; gap: 10px; }
`;
