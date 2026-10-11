"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { addScanCopy as s } from "../copy/add";
import { ShellPage } from "../shell/slots";
import { Button, Card, Chip, Icon, IconButton, Orbit2026Scope, ToastProvider } from "../ui";
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
 * `/app/contacts/new/scan` (R12, b11 A1 Web): the drop zone (JPG · PNG · HEIC, up to 100,
 * a back can be paired with the card before it) and はじめての方へ on the right (open on the
 * first three visits, one line after). 読み取りを開始 creates the v2 batch through `onStart`
 * (the route adapter: same upload, local stash and resume as the card batch state machine)
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
  const back = <IconButton icon="left" label={t(s.back)} soft onClick={() => go("/app/contacts/new")} />;
  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ToastProvider>
        <ShellPage title={t(s.pageTitle)} subtitle={t(s.pageSubtitle)} left={back} />
        <div className={`${styles.columns} ${styles.fade}`} data-scan-upload="">
          <div className={styles.stack}>
            {activeBatchId ? (
              <p className={styles.notice} data-scan-active={activeBatchId}>
                <Icon name="clock" size={16} /><span>{t(s.activeBatch)}</span>
                <Button size="sm" label={t(s.activeOpen)} onClick={() => go(`/app/contacts/new/scan/${encodeURIComponent(activeBatchId)}`)} />
              </p>
            ) : null}
            {available
              ? <Uploader t={t} maxPhotos={maxPhotos} maxBytes={maxBytes} onStart={onStart} onStarted={(batchId) => go(`/app/contacts/new/scan/${encodeURIComponent(batchId)}`)} />
              : <Card><p className={styles.body} role="status" data-scan-unavailable="">{t(s.unavailable)}</p></Card>}
          </div>
          <ScanGuide t={t} />
        </div>
      </ToastProvider>
    </Orbit2026Scope>
  );
}

function Uploader({ t, maxPhotos, maxBytes, onStart, onStarted }: { t: Translate; maxPhotos: number; maxBytes: number; onStart: (cards: readonly StagedCard[]) => Promise<ScanStartResult>; onStarted: (batchId: string) => void }) {
  const [cards, setCards] = useState<StagedCard[]>([]);
  const [dragging, setDragging] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement | null>(null);
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

  const start = async () => {
    if (!cards.length || starting) return;
    setStarting(true);
    setError("");
    const result = await onStart(cards).catch((): ScanStartResult => ({ ok: false }));
    setStarting(false);
    if (result.ok === true) onStarted(result.batchId);
    else setError(result.message || t(s.startFailed));
  };

  const dropProps = {
    onDragOver: (event: DragEvent<HTMLElement>) => { event.preventDefault(); setDragging(true); },
    onDragLeave: () => setDragging(false),
    onDrop: (event: DragEvent<HTMLElement>) => { event.preventDefault(); setDragging(false); add(event.dataTransfer.files); },
  };
  const photos = photoCount(cards);

  return (
    <Card data-scan-uploader="">
      <div className={styles.stack}>
        <input ref={input} className={styles.srOnly} type="file" multiple accept={SCAN_ACCEPT} tabIndex={-1} aria-hidden onChange={(event) => { add(event.target.files); event.target.value = ""; }} data-scan-input="" />
        {cards.length === 0 ? (
          <button type="button" className={`btn ${styles.drop} ${dragging ? styles.dropOn : ""}`} onClick={() => input.current?.click()} {...dropProps} data-scan-drop="">
            <span className={styles.dropEmoji} aria-hidden>📇</span>
            <b className={styles.title}>{t(s.dropTitle)}</b>
            <span className={styles.label}>{t(s.dropHint, { max: maxPhotos })}</span>
            <span className={`btn ${styles.row}`}><Icon name="image" size={16} />{t(s.choose)}</span>
          </button>
        ) : (
          <>
            <div className={styles.rowBetween}>
              <b data-scan-staged={photos}>{t(s.staged, { n: photos, cards: cards.length })}</b>
              <Button size="sm" icon="plus" label={t(s.addMore)} disabled={starting || photos >= maxPhotos} onClick={() => input.current?.click()} />
            </div>
            <div className={`${styles.thumbs} ${dragging ? styles.dropOn : ""}`} {...dropProps}>
              {cards.map((card) => (
                <div key={card.id} className={`${styles.thumb} ${card.back ? styles.thumbPair : ""}`} data-staged-card={card.id} data-staged-sides={card.back ? 2 : 1}>
                  <div className={styles.thumbImages}>
                    {[card.front, card.back].filter((photo): photo is StagedPhoto => Boolean(photo)).map((photo) => (
                      <img key={photo.id} className={styles.thumbImg} src={photo.url} alt="" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
                    ))}
                  </div>
                  <span className={styles.thumbName}>{card.front.file.name}</span>
                  <div className={styles.row}>
                    {card.back ? <Chip label={t(s.frontBack)} tone="lav" /> : null}
                    {card.back
                      ? <Button size="sm" variant="ghost" label={t(s.unpair)} disabled={starting} onClick={() => setCards((current) => unpairBack(current, card.id))} />
                      : canPairWithPrevious(cards, card.id) ? <Button size="sm" variant="ghost" icon="swap" label={t(s.pairBack)} disabled={starting} onClick={() => setCards((current) => pairWithPrevious(current, card.id))} data-staged-pair={card.id} /> : null}
                    <IconButton icon="x" size={34} soft label={t(s.remove, { name: card.front.file.name })} disabled={starting} onClick={() => setCards((current) => current.filter((entry) => entry.id !== card.id))} data-staged-remove={card.id} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {error ? <p className={styles.error} role="alert" data-scan-error=""><Icon name="alert" size={16} />{error}</p> : null}
        {cards.length ? (
          <div className={styles.row}>
            <Button variant="primary" icon="scan" loading={starting} label={t(s.start, { n: photos })} onClick={() => void start()} data-scan-start="" />
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/** はじめての方へ (b11 A1 Web right column): open on the first three visits, then one line. */
export function ScanGuide({ t }: { t: Translate }) {
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    const previous = recordScanGuideVisit(typeof window === "undefined" ? null : readStorage());
    setOpen(scanGuideOpen(previous));
  }, []);
  if (open === null) return <div />;
  if (!open) {
    return (
      <Card variant="flat" data-scan-guide="collapsed">
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
    <Card data-scan-guide="open">
      <div className={styles.stack}>
        <h2 className={styles.title}>{t(s.guideTitle)}</h2>
        <ul className={styles.tips}>
          {tips.map(([emoji, title, body]) => (
            <li key={emoji} className={styles.tip}><span className={styles.tipEmoji} aria-hidden>{emoji}</span><span className={styles.grow}><b>{t(title)}</b><span className={styles.label}>{t(body)}</span></span></li>
          ))}
        </ul>
        <span className={styles.sectionTitle}>{t(s.afterTitle)}</span>
        <div className={styles.steps}>
          <Chip label={`🤖 ${t(s.afterRead)}`} /><Icon name="right" size={16} /><Chip label={`✅ ${t(s.afterCheck)}`} /><Icon name="right" size={16} /><Chip label={`👥 ${t(s.afterAdd)}`} />
        </div>
        <p className={styles.privacy}>🔒 {t(s.privacy)}</p>
      </div>
    </Card>
  );
}
