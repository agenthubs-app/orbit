"use client";

import { useRouter } from "next/navigation";

import { GUIDE_START_HREF, useDemoMode } from "../../_demo/demo-mode-core";
import { useOrbitLanguage } from "../../orbit-language-context";
import { addManualCopy as m } from "../copy/add";
import { Button, Modal } from "../ui";
import { translator } from "./add-parts";
import styles from "./add.module.css";

/**
 * b12 N12b (b1 A4 写操作拦截 Web): a save while the sample is showing (403 `SAMPLE_READ_ONLY`) —
 * 「これはサンプルです」 with サンプルを見続ける / ガイドを続ける（n / total）. The count comes from the
 * page's demo state when there is one; without it the button has no count.
 */
export function SampleBlockedDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { language, preserveHref } = useOrbitLanguage();
  const router = useRouter();
  const demo = useDemoMode();
  const t = translator(language);
  const total = demo ? Object.keys(demo.view.steps).length : 0;
  const guide = total ? t(m.sampleGuide, { done: Math.min(total, (demo?.view.completed ?? 0) + 1), total }) : t(m.sampleGuidePlain);
  return (
    <Modal open={open} onClose={onClose} title={t(m.sampleTitle)} size={480} header={(
      <div className={styles.sampleHead} data-manual-sample-dialog="">
        <span className={styles.sampleEmo} aria-hidden>🧪</span>
        <b className={styles.sampleTitle}>{t(m.sampleTitle)}</b>
        <p className={styles.sampleBody}>{t(m.sampleBlocked)}<br />{t(m.sampleAsk)}</p>
      </div>
    )}>
      <div className={styles.sampleActs}>
        <Button block className={styles.xl} label={t(m.sampleStay)} onClick={onClose} />
        <Button block variant="primary" className={styles.xl} label={guide} onClick={() => router.push(preserveHref(GUIDE_START_HREF))} />
      </div>
    </Modal>
  );
}
