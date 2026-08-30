"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import {
  INGEST_V2_MAX_ITEMS,
  INGEST_V2_MAX_RAW_BYTES,
  type IngestBatchDTO,
  type IngestItemDTO,
} from "../../../../../../features/acquisition/business-card-ingest-v2/contract";
import { useOrbitLanguage } from "../../../orbit-language-context";
import {
  INGEST_V2_API_BASE,
  resolveUploadMimeType,
  sha256OfFile,
  stashPendingFiles,
} from "./ingest-v2-client";

// 拍摄引导 + 选片入口（方案 §二）：manifest 先行，文件本体在批次页逐张上传。

const RECOMMENDED_MAX = 50;

interface GuideCard {
  good: boolean;
  emoji: string;
  title: { en: string; zh: string };
  detail: { en: string; zh: string };
}

const GUIDE_CARDS: GuideCard[] = [
  {
    good: true,
    emoji: "🪪",
    title: { en: "One card per photo", zh: "一卡一照" },
    detail: {
      en: "Shoot each card separately — multiple cards in one photo confuse recognition.",
      zh: "每张名片单独拍一张。一张照片拍多张名片，识别很可能不准确。",
    },
  },
  {
    good: true,
    emoji: "📐",
    title: { en: "Fill the frame, face-on", zh: "正对名片、填满画面" },
    detail: {
      en: "Hold the phone parallel to the card and let it fill most of the frame.",
      zh: "手机与名片平行，让名片占据画面大部分，不歪斜。",
    },
  },
  {
    good: true,
    emoji: "💡",
    title: { en: "Good light, no glare", zh: "光线充足、避免反光" },
    detail: {
      en: "Even lighting beats flash — tilt slightly if the card is glossy.",
      zh: "均匀光线优于闪光灯；名片反光时稍微倾斜避开高光。",
    },
  },
  {
    good: false,
    emoji: "🚫",
    title: { en: "Avoid: piles & backgrounds", zh: "避免：多卡合拍、杂乱背景" },
    detail: {
      en: "No card stacks, no busy desks, no fingers over the text.",
      zh: "不要一次拍一摞名片，不要杂乱桌面，不要手指遮挡文字。",
    },
  },
];

export function BusinessCardIngestV2Start() {
  const { t } = useOrbitLanguage();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  async function startBatch(fileList: FileList | null): Promise<void> {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) {
      return;
    }
    setError(null);
    if (files.length > INGEST_V2_MAX_ITEMS) {
      setError(
        t({
          en: `At most ${INGEST_V2_MAX_ITEMS} photos per batch.`,
          zh: `每批最多 ${INGEST_V2_MAX_ITEMS} 张照片。`,
        }),
      );
      return;
    }
    const oversize = files.find((file) => file.size > INGEST_V2_MAX_RAW_BYTES);
    if (oversize) {
      setError(
        t({
          en: `${oversize.name} exceeds the 10 MiB per-photo limit.`,
          zh: `${oversize.name} 超过单张 10 MiB 上限。`,
        }),
      );
      return;
    }

    setPreparing(true);
    try {
      const byDigest = new Map<string, File>();
      const manifest = [];
      for (const [index, file] of files.entries()) {
        const clientDigest = await sha256OfFile(file);
        byDigest.set(clientDigest, file);
        manifest.push({
          clientDigest,
          fileName: file.name,
          mimeType: resolveUploadMimeType(file),
          rawSize: file.size,
          seq: index + 1,
        });
      }
      const response = await fetch(INGEST_V2_API_BASE, {
        body: JSON.stringify({ idempotencyKey, manifest }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as {
        data?: { batch?: IngestBatchDTO; items?: IngestItemDTO[] };
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.data?.batch) {
        setError(body?.error?.message ?? `HTTP ${response.status}`);
        return;
      }
      stashPendingFiles(body.data.batch.id, byDigest);
      // 客户端导航：整页跳转会清空内存中的待上传文件暂存，落入"重新挂载"恢复路径。
      router.push(`/app/contacts/new/batch2/${body.data.batch.id}`);
    } finally {
      setPreparing(false);
    }
  }

  return (
    <section className="bci-start">
      <style>{START_STYLE}</style>
      <div className="eyebrow">{t({ en: "BATCH IMPORT", zh: "批量导入" })}</div>
      <h2>{t({ en: "Photograph your cards", zh: "拍好名片，再一次导入" })}</h2>
      <p className="bci-lede">
        {t({
          en: `Pick up to ${INGEST_V2_MAX_ITEMS} photos (${RECOMMENDED_MAX} or fewer works best). Each photo should contain exactly one card.`,
          zh: `一次最多选择 ${INGEST_V2_MAX_ITEMS} 张（建议每批 20–${RECOMMENDED_MAX} 张）。请确保一张照片只包含一张名片。`,
        })}
      </p>
      <div className="bci-guide">
        {GUIDE_CARDS.map((card) => (
          <div className={card.good ? "bci-guide-card" : "bci-guide-card bci-guide-bad"} key={card.emoji}>
            <span className="bci-guide-emoji" aria-hidden>
              {card.emoji}
            </span>
            <strong>{t(card.title)}</strong>
            <span className="bci-guide-detail">{t(card.detail)}</span>
          </div>
        ))}
      </div>
      <div className="bci-multicard-note">
        {t({
          en: "One photo, one card — multi-card photos are often recognized incorrectly.",
          zh: "一张照片只拍一张名片，多张合拍可能识别不准确。",
        })}
      </div>
      {error ? <div className="bci-warn">{error}</div> : null}
      <div className="bci-start-actions">
        <input
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          hidden
          multiple
          onChange={(event) => void startBatch(event.target.files)}
          ref={inputRef}
          type="file"
        />
        <button
          className="btn btn-primary"
          disabled={preparing}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          {preparing
            ? t({ en: "Preparing…", zh: "准备中…" })
            : t({ en: "Choose photos", zh: "选择名片照片" })}
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
.bci-multicard-note { background: var(--accent-softer); border-radius: 11px; color: var(--text-2); font-size: 12.5px; line-height: 1.5; padding: 10px 12px; }
.bci-warn { background: var(--amber-soft); border-radius: 10px; color: var(--amber-text); font-size: 12.5px; line-height: 1.5; padding: 10px 12px; }
.bci-start-actions { display: flex; gap: 10px; }
`;
