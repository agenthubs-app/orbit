"use client";

import { Modal, useScopeLanguage } from "../ui";
import { taskCopy } from "../copy/task";
import { pickCopy } from "../copy/types";
import styles from "./meeting-proposal.module.css";

export interface MeetingProposalModalProps {
  open: boolean;
  contactId: string;
  onClose: () => void;
  onSent?: (appointmentId: string) => void;
  appointmentId?: string;
  initialCandidates?: readonly { startsAt: string; endsAt: string }[];
}

/** R20a SC-11a: stable R11 integration surface; proposal behavior follows in SC-11. */
export function MeetingProposalModal({ open, onClose }: MeetingProposalModalProps) {
  const language = useScopeLanguage();
  return (
    <Modal open={open} onClose={onClose} title={pickCopy(taskCopy.proposalTitle, language)} size={560}>
      <ol className={styles.steps}>
        <li><h3 className={styles.step}>{pickCopy(taskCopy.proposalCandidates, language)}</h3></li>
        <li><h3 className={styles.step}>{pickCopy(taskCopy.proposalFormat, language)}</h3></li>
        <li><h3 className={styles.step}>{pickCopy(taskCopy.proposalReview, language)}</h3></li>
      </ol>
    </Modal>
  );
}
