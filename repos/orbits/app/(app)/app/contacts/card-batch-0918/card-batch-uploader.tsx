/**
 * 名片批量上传区（新用户引导.dc.html 224–261 行「批量上传名片照片」，新 UI 浅紫色版）。
 * 一张照片一张名片；先在这里暂存、可删可加，点「上传完毕，开始解析」才建批次。
 * 建批次后照片同时放进内存与 IndexedDB，并登记为「进行中批次」——用户随即离开页面，
 * 全站 CardBatchHost 也能接着上传；最后一张传完服务端自动开始识别。
 */
"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";

import {
  INGEST_V2_MAX_ITEMS,
  INGEST_V2_MAX_RAW_BYTES,
} from "../../../../../features/acquisition/business-card-ingest-v2/contract";
import {
  INGEST_V2_API_BASE,
  resolveUploadMimeType,
  sha256OfFile,
  stashPendingFiles,
} from "../ingest-v2/ingest-v2-client";
import {
  createInitialPairing,
  freezeManifestSubmission,
  type PairingPhoto,
} from "../ingest-v2/ingest-v2-route-view-model";
import type { Copy } from "./card-batch-model";
import { registerActiveBatch, savePendingFiles } from "./card-batch-store";

type T = (copy: Copy) => string;

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

interface Staged {
  id: string;
  file: File;
  url: string;
}

function isImage(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type.startsWith("image/") || name.endsWith(".heic") || name.endsWith(".heif");
}

export function CardBatchUploader({ onStarted, t }: { onStarted: (batchId: string) => void; t: T }) {
  const [staged, setStaged] = useState<Staged[]>([]);
  const [dragging, setDragging] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const stagedRef = useRef(staged);
  stagedRef.current = staged;

  // 卸载时释放缩略图 object URL。
  useEffect(() => () => stagedRef.current.forEach(entry => URL.revokeObjectURL(entry.url)), []);

  function add(list: FileList | File[] | null) {
    const files = Array.from(list ?? []).filter(isImage);
    if (!files.length) return;
    setError("");
    const oversize = files.find(file => file.size > INGEST_V2_MAX_RAW_BYTES);
    if (oversize) {
      setError(t({ zh: `${oversize.name} 超过 10MB，请压缩后再选。`, en: `${oversize.name} is over 10MB — please compress it first.` }));
      return;
    }
    setStaged(current => {
      const room = INGEST_V2_MAX_ITEMS - current.length;
      if (files.length > room) setError(t({ zh: `一批最多 ${INGEST_V2_MAX_ITEMS} 张，多出的没有加入。`, en: `Up to ${INGEST_V2_MAX_ITEMS} photos per batch; extras were left out.` }));
      return [...current, ...files.slice(0, Math.max(0, room)).map(file => ({ file, id: crypto.randomUUID(), url: URL.createObjectURL(file) }))];
    });
  }

  function remove(id: string) {
    setStaged(current => {
      const hit = current.find(entry => entry.id === id);
      if (hit) URL.revokeObjectURL(hit.url);
      return current.filter(entry => entry.id !== id);
    });
  }

  async function start() {
    if (!staged.length || starting) return;
    setStarting(true);
    setError("");
    try {
      // 同一张照片选了两次只算一张（按内容去重）。
      const byDigest = new Map<string, File>();
      const photos: PairingPhoto[] = [];
      for (const entry of staged) {
        const digest = await sha256OfFile(entry.file);
        if (byDigest.has(digest)) continue;
        byDigest.set(digest, entry.file);
        photos.push({ clientDigest: digest, fileName: entry.file.name, id: entry.id, mimeType: resolveUploadMimeType(entry.file), rawSize: entry.file.size });
      }
      const submission = freezeManifestSubmission(createInitialPairing(photos, photo => `card:${photo.id}`), crypto.randomUUID());
      const response = await fetch(INGEST_V2_API_BASE, {
        body: JSON.stringify({ idempotencyKey: submission.idempotencyKey, manifest: submission.manifest }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as { data?: { batch?: { id: string } }; error?: { message?: string } } | null;
      const batchId = body?.data?.batch?.id;
      if (!response.ok || !batchId) {
        setError(body?.error?.message ?? t({ zh: "没能开始上传，请重试。", en: "Couldn't start the upload — please try again." }));
        return;
      }
      stashPendingFiles(batchId, byDigest);
      await savePendingFiles(batchId, byDigest);
      registerActiveBatch(batchId);
      onStarted(batchId);
    } catch {
      setError(t({ zh: "没能开始上传，请重试。", en: "Couldn't start the upload — please try again." }));
    } finally {
      setStarting(false);
    }
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    add(event.dataTransfer.files);
  }

  const dropProps = {
    onDragLeave: () => setDragging(false),
    onDragOver: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragging(true);
    },
    onDrop,
  };

  return (
    <div className="cb-up" data-card-uploader>
      <input accept={ACCEPT} aria-hidden className="cb-sr" multiple onChange={event => { add(event.target.files); event.target.value = ""; }} ref={inputRef} tabIndex={-1} type="file" />
      <div className="cb-up-head">
        <span className="cb-up-title">
          <strong>{t({ zh: "批量上传名片照片", en: "Upload business card photos" })}</strong>
          <span>{t({ zh: "一张照片一张名片。可以分几次选，全部选好后统一在后台解析。", en: "One photo per card. Add them in as many rounds as you like; they're read together in the background." })}</span>
        </span>
        {staged.length ? <span className="cb-up-badge">{t({ zh: `已暂存 ${staged.length} 张`, en: `${staged.length} staged` })}</span> : null}
      </div>

      {staged.length === 0 ? (
        <button className={`btn cb-drop${dragging ? " cb-drop-on" : ""}`} onClick={() => inputRef.current?.click()} type="button" {...dropProps}>
          <span className="cb-drop-icon" aria-hidden>⇪</span>
          <strong>{t({ zh: "选择或拖入名片照片", en: "Choose or drop card photos" })}</strong>
          <span>{t({ zh: `JPG / PNG / HEIC · 一次可选多张 · 每批最多 ${INGEST_V2_MAX_ITEMS} 张`, en: `JPG / PNG / HEIC · multiple at once · up to ${INGEST_V2_MAX_ITEMS} per batch` })}</span>
        </button>
      ) : (
        <div className={`cb-thumbs${dragging ? " cb-thumbs-on" : ""}`} {...dropProps}>
          {staged.map(entry => (
            <span className="cb-thumb" key={entry.id}>
              <img alt="" className="cb-thumb-img" onError={event => { event.currentTarget.style.display = "none"; }} src={entry.url} />
              <span className="cb-thumb-name">{entry.file.name}</span>
              <button aria-label={t({ zh: `移除 ${entry.file.name}`, en: `Remove ${entry.file.name}` })} className="btn cb-thumb-x" disabled={starting} onClick={() => remove(entry.id)} type="button">×</button>
            </span>
          ))}
          {staged.length < INGEST_V2_MAX_ITEMS ? (
            <button className="btn cb-thumb-add" disabled={starting} onClick={() => inputRef.current?.click()} type="button">
              <span aria-hidden>＋</span>{t({ zh: "继续添加", en: "Add more" })}
            </button>
          ) : null}
        </div>
      )}

      {error ? <div className="cb-notice cb-notice-warning" role="alert">{error}</div> : null}

      <div className="cb-up-foot">
        <span>{t({ zh: "一卡一照、正对拍摄、避开反光识别最准。点「开始解析」后才会上传；传完可以直接离开，解析完会提醒你。", en: "One card per photo, shot straight on, no glare. Nothing uploads until you start; you can leave right after — we'll let you know when it's done." })}</span>
        {staged.length ? (
          <button aria-busy={starting || undefined} className="btn cb-btn-dark" disabled={starting} onClick={() => void start()} type="button">
            {starting ? t({ zh: "正在准备…", en: "Preparing…" }) : t({ zh: `上传完毕，开始解析（${staged.length} 张）`, en: `Start reading (${staged.length})` })}
          </button>
        ) : null}
      </div>
    </div>
  );
}
