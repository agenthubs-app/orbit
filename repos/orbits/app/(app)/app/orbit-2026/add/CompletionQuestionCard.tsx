"use client";

import { useState } from "react";

import { COMPLETION_OPTION_LABELS } from "../../../../../shared/compute/completion-question-rules";
import type { ContactCompletionQuestion } from "../../../../../shared/contract/contact-completion";
import { addImportCopy, completionCopy as q } from "../copy/add-import";
import { Button, FilterOption, TextField, avatarTone, initials } from "../ui";
import { DensityDots, type Translate } from "./add-parts";
import { pressProps } from "./press";
import styles from "./completion.module.css";

/** The fixed options the server stores in Japanese (COMPLETION_OPTION_LABELS), shown in the page language. */
const FIXED_OPTIONS: Record<string, typeof q.optionReferral> = {
  [COMPLETION_OPTION_LABELS.intro]: q.optionReferral,
  [COMPLETION_OPTION_LABELS.formerColleague]: q.optionFormerColleague,
  [COMPLETION_OPTION_LABELS.forgot]: q.optionUnknown,
};
const TYPE_IN: string = COMPLETION_OPTION_LABELS.typeIn;

const SOURCE = { linkedin: null, phone: addImportCopy.sourceVcard, meishi: null, manual: null, self: null } as const;

export function completionQuestionText(question: ContactCompletionQuestion, t: Translate): string {
  const name = question.contactName;
  if (!name) return question.question;
  return t(question.kind === "organization" ? q.questionCompany : q.questionMetWhere, { name });
}

/**
 * 今日の 1問 (b9 A7 · DESIGN §2.8): who, the question, the options as chips, the hint and スキップ.
 * Rule-based on the server (no AI), one a day. 「答えると ●●○ に」 only when answering really lifts the
 * person to ●●○ (`densityIfAnswered`); otherwise 「情報が 1つ増えます」. 「自分で入力」 opens a field.
 */
export function CompletionQuestionCard({ question, t, busy = false, onAnswer, onSkip, variant = "flat" }: {
  question: ContactCompletionQuestion;
  /** "rail": web.html #6 人脈 rail — a white .card (padding 16, 13px title, options 10 below) without the hint row. */
  variant?: "flat" | "rail";
  t: Translate;
  busy?: boolean;
  onAnswer: (answer: string) => void;
  onSkip: () => void;
}) {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const name = question.contactName ?? "";
  const source = question.sourceChip ? SOURCE[question.sourceChip] : null;
  // LinkedIn is the same word in every language (brand), so it is not copy.
  const sub = [question.contactSubtitle, question.sourceChip === "linkedin" ? "LinkedIn" : source ? t(source) : ""].filter(Boolean).join(" · ");
  // The server only asks about people at ●○○ (features/contacts/completion: the 「loose」 filter), so any
  // densityIfAnswered above 1 is a real step up; without it nothing is claimed.
  const after = question.densityIfAnswered ?? 1;
  const hint = `${t(q.cardLabel)} · ${after === 3 ? t(q.hint3) : after === 2 ? t(q.hint) : t(q.hintSame)}`;
  const lifts = after > 1;
  return (
    <div className={`${styles.card} ${variant === "rail" ? styles.rail : ""}`} data-completion-question={question.id} data-sample={question.sample ? "" : undefined}>
      <div className={styles.head}>
        {name ? <span className={`${styles.av} ${styles[`av_${avatarTone(name)}`]}`} aria-hidden>{initials(name)}</span> : null}
        <div className={styles.meta}>
          <b className={styles.title}>{completionQuestionText(question, t)}</b>
          {sub ? <div className={styles.sub}>{sub}</div> : null}
        </div>
        <span className={lifts ? styles.up : undefined}><DensityDots level={1} t={t} /></span>
      </div>
      <div className={styles.options} role="group" aria-label={completionQuestionText(question, t)}>
        {question.options.map((option) => (
          option === TYPE_IN
            ? <FilterOption key={option} label={t(q.typeIn)} selected={typing} onToggle={() => setTyping((value) => !value)} />
            : <FilterOption key={option} label={FIXED_OPTIONS[option] ? t(FIXED_OPTIONS[option]!) : option} selected={false} onToggle={() => { if (!busy) onAnswer(option); }} />
        ))}
      </div>
      {typing ? (
        <form className={styles.typeIn} onSubmit={(event) => { event.preventDefault(); if (text.trim() && !busy) onAnswer(text.trim()); }}>
          <TextField label={t(q.typeInLabel)} value={text} onChange={(event) => setText(event.target.value)} />
          <Button type="submit" size="sm" variant="primary" label={t(q.done)} disabled={!text.trim() || busy} />
        </form>
      ) : null}
      {variant === "rail" ? null : <div className={styles.foot}>
        <span className={styles.lbl}>{hint}</span>
        <span role="button" className={styles.skip} {...pressProps(onSkip, busy)} data-completion-skip="">{t(q.skip)}</span>
      </div>}
    </div>
  );
}
