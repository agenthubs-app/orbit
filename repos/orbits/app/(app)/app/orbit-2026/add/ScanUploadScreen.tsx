"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type DragEvent } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { addScanCopy as s } from "../copy/add";
import { ShellPage } from "../shell/slots";
import { Button, Card, Icon, IconButton, MacTile, Orbit2026Scope, Segmented, ToastProvider } from "../ui";
import { translator, type Translate } from "./add-parts";
import {
  SCAN_ACCEPT,
  addPhotos,
  canPairWithPrevious,
  isScanImage,
  pairWithPrevious,
  photoCount,
  recordScanGuideVisit,
  scanGuideOpen,
  unpairBack,
  type StagedCard,
  type StagedPhoto,
} from "./upload-model";
import styles from "./add.module.css";

export type ScanStartResult = { ok: true; batchId: string } | { ok: false; message?: string };

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * `/app/contacts/new/scan` (R12, b11 A1 Web): the drop card (📇 drop zone, JPG · PNG · HEIC, up to
 * 100) and はじめての方へ on the right (open on the first three visits, one line after). Once photos
 * are chosen the page becomes the tray (b1 B3 ②「名刺をまとめて追加」: every card with 表＋裏 / 表のみ,
 * 「前の名刺の裏にする」, the bar 読み取りを開始). 読み取りを開始 creates the v2 batch through `onStart`
 * and opens `/app/contacts/new/scan/[batchId]`.
 */
export function ScanUploadScreen({ available, maxPhotos, maxBytes, onStart, activeBatchId = null }: {
  available: boolean;
  maxPhotos: number;
  maxBytes: number;
  onStart: (cards: readonly StagedCard[]) => Promise<ScanStartResult>;
  /** A batch still being read on this device (the site-wide host yields on this page). */
  activeBatchId?: string | null;
}) {
  const { language, preserveHref } = useOrbitLanguage();
  const router = useRouter();
  const t = translator(language);
  const go = (href: string) => router.push(preserveHref(href));
  const stage = useStagedCards(t, maxPhotos, maxBytes);
  const { cards, starting } = stage;
  const back = <IconButton icon="left" label={t(s.back)} onClick={() => (cards.length ? stage.clear() : go("/app/contacts/new"))} />;
  const photos = photoCount(cards);
  const start = async () => {
    const batchId = await stage.start(onStart);
    if (batchId) go(`/app/contacts/new/scan/${encodeURIComponent(batchId)}`);
  };
  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ToastProvider>
        {cards.length ? (
          <>
            <ShellPage title={t(s.trayTitle)} subtitle={t(s.staged, { n: photos, cards: cards.length })} left={back}
              right={<Button icon="plus" label={t(s.addMore)} disabled={starting || photos >= maxPhotos} onClick={stage.choose} />} rightRail={<TrayRail t={t} />} />
            <StagedTray t={t} stage={stage} onStart={() => void start()} />
          </>
        ) : (
          <>
            <ShellPage title={t(s.pageTitle)} subtitle={t(s.pageSubtitle)} left={back} />
            <div className={`${styles.wgrid} ${styles.fade}`} data-scan-upload="">
              <Card className={`${styles.span8} ${styles.uploadCard}`} data-scan-uploader="">
                {activeBatchId ? (
                  <p className={`${styles.notice} ${styles.noticeGap}`} data-scan-active={activeBatchId}>
                    <Icon name="clock" size={16} /><span>{t(s.activeBatch)}</span>
                    <Button size="sm" label={t(s.activeOpen)} onClick={() => go(`/app/contacts/new/scan/${encodeURIComponent(activeBatchId)}`)} />
                  </p>
                ) : null}
                {available ? <DropZone t={t} stage={stage} maxPhotos={maxPhotos} /> : <p className={styles.body} role="status" data-scan-unavailable="">{t(s.unavailable)}</p>}
              </Card>
              <ScanGuide t={t} className={styles.span4} />
            </div>
          </>
        )}
        {stage.input}
      </ToastProvider>
    </Orbit2026Scope>
  );
}

export type StageState = ReturnType<typeof useStagedCards>;

/** The chosen photos (front + optional back per card), the hidden file input and the start call. */
export function useStagedCards(t: Translate, maxPhotos: number, maxBytes: number) {
  const [cards, setCards] = useState<StagedCard[]>([]);
  const [dragging, setDragging] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLInputElement | null>(null);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  // Object URLs of the thumbnails go when the page does.
  useEffect(() => () => cardsRef.current.forEach((card) => { URL.revokeObjectURL(card.front.url); if (card.back) URL.revokeObjectURL(card.back.url); }), []);

  const add = (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setError("");
    const images = files.filter(isScanImage);
    if (images.length < files.length) setError(t(s.unsupported));
    const oversize = images.find((file) => file.size > maxBytes);
    if (oversize) { setError(t(s.tooLarge, { name: oversize.name })); return; }
    if (!images.length) return;
    const photos: StagedPhoto[] = images.map((file) => ({ id: newId(), file, url: URL.createObjectURL(file) }));
    const result = addPhotos(cardsRef.current, photos, maxPhotos);
    photos.slice(photos.length - result.dropped).forEach((photo) => URL.revokeObjectURL(photo.url));
    if (result.dropped) setError(t(s.tooMany, { max: maxPhotos }));
    setCards(result.cards);
  };
  const clear = () => {
    cardsRef.current.forEach((card) => { URL.revokeObjectURL(card.front.url); if (card.back) URL.revokeObjectURL(card.back.url); });
    setCards([]);
    setError("");
  };
  const start = async (onStart: (cards: readonly StagedCard[]) => Promise<ScanStartResult>): Promise<string | null> => {
    if (!cardsRef.current.length || starting) return null;
    setStarting(true);
    setError("");
    const result = await onStart(cardsRef.current).catch((): ScanStartResult => ({ ok: false }));
    setStarting(false);
    if (result.ok === true) return result.batchId;
    setError(result.message || t(s.startFailed));
    return null;
  };
  const dropProps = {
    onDragOver: (event: DragEvent<HTMLElement>) => { event.preventDefault(); setDragging(true); },
    onDragLeave: () => setDragging(false),
    onDrop: (event: DragEvent<HTMLElement>) => { event.preventDefault(); setDragging(false); add(event.dataTransfer.files); },
  };
  const input = <input ref={ref} className={styles.srOnly} type="file" multiple accept={SCAN_ACCEPT} tabIndex={-1} aria-hidden onChange={(event) => { add(event.target.files); event.target.value = ""; }} data-scan-input="" />;
  return { cards, setCards, dragging, starting, error, add, clear, start, dropProps, input, choose: () => ref.current?.click() };
}

/** b11 A1 Web .drop: 📇, 名刺の写真をここにドロップ, the formats, ファイルを選ぶ. */
export function DropZone({ t, stage, maxPhotos }: { t: Translate; stage: StageState; maxPhotos: number }) {
  return (
    <>
      <div className={`${styles.dropZone} ${stage.dragging ? styles.dropOn : ""}`} {...stage.dropProps} data-scan-drop="">
        <div>
          <span className={styles.dropBig} aria-hidden>📇</span>
          <b className={styles.dropTitle}>{t(s.dropTitle)}</b>
          <div className={styles.dropHint}>{t(s.dropHint, { max: maxPhotos })}</div>
          <Button variant="primary" icon="image" className={styles.dropButton} label={t(s.choose)} onClick={stage.choose} data-scan-choose="" />
        </div>
      </div>
      {stage.error ? <p className={styles.error} role="alert" data-scan-error=""><Icon name="alert" size={16} />{stage.error}</p> : null}
    </>
  );
}

type TrayFilter = "all" | "pair" | "front";

/** b1 B3 ②: the chosen cards in a grid (表＋裏 / 表のみ, 裏を外す, 前の名刺の裏にする) and the start bar. */
function StagedTray({ t, stage, onStart }: { t: Translate; stage: StageState; onStart: () => void }) {
  const [filter, setFilter] = useState<TrayFilter>("all");
  const { cards, starting } = stage;
  const pairs = cards.filter((card) => card.back).length;
  const fronts = cards.length - pairs;
  const photos = photoCount(cards);
  const shown = cards.filter((card) => (filter === "all" ? true : filter === "pair" ? Boolean(card.back) : !card.back));
  return (
    <div className={`${styles.wgrid} ${styles.fade}`} data-scan-tray="">
      <Card className={styles.span12} {...stage.dropProps}>
        <div className={styles.trayHead}>
          <Segmented label={t(s.trayTitle)} value={filter} onChange={(key) => setFilter(key as TrayFilter)}
            segments={[{ key: "all", label: t(s.trayAll, { n: cards.length }) }, { key: "pair", label: t(s.trayPair, { n: pairs }) }, { key: "front", label: t(s.trayFront, { n: fronts }) }]} />
          <span className={styles.trayNote}>{t(s.tipBackBody)}</span>
        </div>
        <div className={styles.pairs} data-scan-staged={photos}>
          {shown.map((card) => (
            <div key={card.id} className={styles.pair} data-staged-card={card.id} data-staged-sides={card.back ? 2 : 1}>
              <div className={styles.pairPhotos}>
                {[card.front, card.back].map((photo, index) => (photo
                  ? <img key={photo.id} className={styles.pairImg} src={photo.url} alt="" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
                  : <span key={`none-${index}`} className={styles.pairNone} aria-hidden />))}
              </div>
              <div className={styles.pairMeta}><span>{t(card.back ? s.frontBack : s.frontOnly)}</span><span className={styles.ellipsis}>{fileStem(card.front.file.name)}</span></div>
              {card.back
                ? <button type="button" className={styles.pairLink} disabled={starting} onClick={() => stage.setCards((current) => unpairBack(current, card.id))} data-staged-unpair={card.id}>{t(s.unpair)}</button>
                : canPairWithPrevious(cards, card.id) ? <Button size="sm" variant="ghost" className={styles.pairButton} label={t(s.pairBack)} disabled={starting} onClick={() => stage.setCards((current) => pairWithPrevious(current, card.id))} data-staged-pair={card.id} /> : null}
              <IconButton icon="x" size={34} soft className={styles.pairRemove} label={t(s.remove, { name: card.front.file.name })} disabled={starting} onClick={() => stage.setCards((current) => current.filter((entry) => entry.id !== card.id))} data-staged-remove={card.id} />
            </div>
          ))}
        </div>
        {stage.error ? <p className={styles.error} role="alert" data-scan-error=""><Icon name="alert" size={16} />{stage.error}</p> : null}
      </Card>
      <div className={`${styles.span12} ${styles.stickyBar}`} data-scan-bar="">
        <span className={styles.barEmo} aria-hidden>📇</span>
        <div className={styles.grow}>
          <b className={styles.barTitle}>{t(s.trayBar, { n: photos, cards: cards.length })}</b>
          <div className={styles.label}>{t(s.trayBarSub, { pairs, fronts })}</div>
        </div>
        <Button variant="ghost" className={styles.barCancel} label={t(s.trayCancel)} disabled={starting} onClick={stage.clear} />
        <Button className={styles.xl} loading={starting} label={t(s.trayStart)} onClick={onStart} data-scan-start="" />
      </div>
    </div>
  );
}

/** b1 B3 ② right rail: うまく読み取るコツ and the privacy line. */
function TrayRail({ t }: { t: Translate }) {
  const tips = [[s.trayTipPairTitle, s.trayTipPairBody], [s.trayTipOneTitle, s.trayTipOneBody], [s.trayTipTurnTitle, s.trayTipTurnBody]] as const;
  return (
    <div className={styles.railStack}>
      <h2 className={styles.railH}><MacTile emoji="💡" size="sm" tone="lav" />{t(s.trayRailTitle)}</h2>
      <div className={styles.railCard}>
        {tips.map(([title, body]) => <div key={title.ja} className={styles.railTip}><b>{t(title)}</b><div className={styles.footNote}>{t(body)}</div></div>)}
      </div>
      <div className={`${styles.railCard} ${styles.railFlat}`}>
        <div className={styles.railPrivacy}><MacTile emoji="🔒" size="sm" tone="teal" /><span>{t(s.trayPrivacy)}</span></div>
      </div>
    </div>
  );
}

function fileStem(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

/** はじめての方へ (b11 A1 Web right column): open on the first three visits, then one line. */
export function ScanGuide({ t, className }: { t: Translate; className?: string }) {
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    const previous = recordScanGuideVisit(typeof window === "undefined" ? null : readStorage());
    setOpen(scanGuideOpen(previous));
  }, []);
  if (open === null) return <div className={className} />;
  if (!open) {
    return (
      <Card variant="flat" className={className} data-scan-guide="collapsed">
        <div className={styles.guideCollapsed}>
          <b>{t(s.guideTitle)}</b>
          <Button size="sm" variant="ghost" label={t(s.guideShow)} onClick={() => setOpen(true)} data-scan-guide-show="" />
        </div>
      </Card>
    );
  }
  const tips: [string, typeof s.tipLightTitle, typeof s.tipLightBody][] = [
    ["☀️", s.tipLightTitle, s.tipLightBody],
    ["⬜", s.tipOneTitle, s.tipOneBody],
    ["🔁", s.tipBackTitle, s.tipBackBody],
  ];
  return (
    <Card className={`${className ?? ""} ${styles.guideCard}`} data-scan-guide="open">
      <div className={styles.guideHead}><h3>{t(s.guideTitle)}</h3></div>
      <ul className={styles.tip4}>
        {tips.map(([emoji, title, body]) => (
          <li key={emoji}><span aria-hidden>{emoji}</span><div><b>{t(title)}</b><small>{t(body)}</small></div></li>
        ))}
      </ul>
      <AfterSteps t={t} />
    </Card>
  );
}

/** 撮ったあと 🤖 読み取り › ✅ 例外だけ確認 › 👥 全員 人脈へ and the privacy line (b11 A1 Web). */
export function AfterSteps({ t }: { t: Translate }) {
  const steps: [string, typeof s.afterRead][] = [["🤖", s.afterRead], ["✅", s.afterCheck], ["👥", s.afterAdd]];
  return (
    <>
      <div className={styles.afterLabel}>{t(s.afterTitle)}</div>
      <div className={styles.st3}>
        {steps.map(([emoji, label], index) => (
          <Fragment key={emoji}>
            {index ? <div className={styles.stAr} aria-hidden><Icon name="right" size={16} /></div> : null}
            <div><span className={styles.stE} aria-hidden>{emoji}</span><b>{t(label)}</b></div>
          </Fragment>
        ))}
      </div>
      <div className={styles.privacyCard}>🔒 {t(s.privacy)}</div>
    </>
  );
}
