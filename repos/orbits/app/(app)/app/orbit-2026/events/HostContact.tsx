"use client";

// 主催者の連絡先（2026-11-14 用户）：申込後に主催者の WeChat / LINE を追加 → 主催者がグループに招待・参加費を受け取る →
// 「参加者」で承認。申込済みの人だけにサーバーが返す（EventOverviewResponse.hostContact / EventJoinResult.hostContact）。
// 各 ID の横にコピー（navigator.clipboard；失敗したら ID を選択状態にして手動コピーを促す）。ID が無ければ「まだありません」。
import { useRef } from "react";

import { hostContactHasId } from "../../../../../shared/compute/host-contact";
import type { EventOverviewRegistrationStatus } from "../../../../../shared/contract/event-overview";
import type { HostEventContact } from "../../../../../shared/contract/host-events";
import { Icon, Modal, useToast } from "../ui";
import type { JourneyT } from "./DiscoverTab";
import styles from "./events.module.css";
import c from "./contact.module.css";

type Row = { key: "wechat" | "line"; label: string; value: string };
/** 右栏（ShellPage rightRail）在 ToastProvider 之外渲染：从页面传进来的 toast 优先。 */
type Toast = ReturnType<typeof useToast>;

function rowsOf(contact: HostEventContact | null | undefined, t: JourneyT): Row[] {
  const rows: Row[] = [];
  if (contact?.wechatId) rows.push({ key: "wechat", label: t("contactWechat"), value: contact.wechatId });
  if (contact?.lineId) rows.push({ key: "line", label: t("contactLine"), value: contact.lineId });
  return rows;
}

/** 審査中で連絡先（ID）があるとき：主催者に連絡 → 確認後に承認、の一文（参加費があれば支払いにも触れる）。 */
export function contactReviewLine(contact: HostEventContact | null | undefined, priceYen: number | null | undefined, t: JourneyT): string | null {
  if (!hostContactHasId(contact)) return null;
  return t(priceYen && priceYen > 0 ? "reviewWaitContact" : "reviewWaitContactFree");
}

function IdRow({ row, t, toast: given }: { row: Row; t: JourneyT; toast?: Toast }) {
  const own = useToast();
  const toast = given ?? own;
  const ref = useRef<HTMLSpanElement | null>(null);
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(row.value);
      toast.success(t("copied"));
    } catch {
      // 書き込めない（権限・非 HTTPS）：ID を選択状態にして、そのまま手動でコピーできるようにする。
      const node = ref.current;
      const selection = typeof window === "undefined" ? null : window.getSelection();
      if (node && selection) {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      toast.error(t("contactCopyFailed"));
    }
  };
  return (
    <div className={c.row} data-host-contact-row={row.key}>
      <span className={`${styles.lbl} ${c.label}`}>{row.label}</span>
      <span ref={ref} className={c.value}>{row.value}</span>
      <button type="button" className={`btn ${c.copy}`} aria-label={t("contactCopyAria", { label: row.label })} onClick={() => void copy()}><Icon name="copy" size={16} /></button>
    </div>
  );
}

function ContactBody({ contact, t, reviewLine, toast }: { contact: HostEventContact | null | undefined; t: JourneyT; reviewLine?: string | null; toast?: Toast }) {
  const rows = rowsOf(contact, t);
  return (
    <>
      {reviewLine ? <div className={`${styles.sub} ${c.review}`} data-host-contact-review="">{reviewLine}</div> : null}
      {rows.length ? <div className={c.rows}>{rows.map((row) => <IdRow key={row.key} row={row} t={t} toast={toast} />)}</div> : <div className={`${styles.lbl} ${c.none}`} data-host-contact-none="">{t("contactNone")}</div>}
      {contact?.note ? <div className={`${styles.sub} ${c.note}`} data-host-contact-note="">{contact.note}</div> : null}
    </>
  );
}

/** 申込済みのイベント詳細・申込完了ページの小さなカード。`status` が審査中なら連絡→承認の一文を足す。 */
export function HostContactCard({ contact, t, status, priceYen, className, toast }: { contact: HostEventContact | null | undefined; t: JourneyT; status?: EventOverviewRegistrationStatus | "registered" | "pending_review"; priceYen?: number | null; className?: string; toast?: Toast }) {
  const reviewLine = status === "pending_review" ? contactReviewLine(contact, priceYen, t) : null;
  return (
    <div className={`${styles.card} ${c.card} ${className ?? ""}`} data-host-contact={hostContactHasId(contact) ? "set" : "none"}>
      <b className={c.title}>{t("contactTitle")}</b>
      <ContactBody contact={contact} t={t} reviewLine={reviewLine} toast={toast} />
    </div>
  );
}

/** 申込完了直後の弾窗（ID があるときだけ開く）。閉じたあとは完了ページのカードに同じ内容が残る。 */
export function HostContactModal({ open, contact, t, reviewLine, onClose }: { open: boolean; contact: HostEventContact | null | undefined; t: JourneyT; reviewLine?: string | null; onClose: () => void }) {
  if (!open || !hostContactHasId(contact)) return null;
  return (
    <Modal open onClose={onClose} title={t("contactTitle")} size={420}
      actions={<button type="button" className={`btn ${styles.btn} ${styles.primary}`} onClick={onClose}>{t("close")}</button>}>
      <div className={c.modalBody} data-host-contact-modal="">
        <ContactBody contact={contact} t={t} reviewLine={reviewLine} />
      </div>
    </Modal>
  );
}
