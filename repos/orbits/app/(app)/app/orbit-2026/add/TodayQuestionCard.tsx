"use client";

import { useEffect, useRef, useState } from "react";

import type { ContactCompletionQuestion, ContactCompletionResult } from "../../../../../shared/contract/contact-completion";
import { contactCompletionQuestionSchema, contactCompletionResultSchema } from "../../../../../shared/api-schema/contact-completion";
import { useOrbitLanguage } from "../../orbit-language-context";
import { lastAnswer, rememberAnswer } from "../../orbit-last-answer";
import { useSharedReadAccount } from "../../orbit-shared-read-account";
import { completionCopy as q } from "../copy/add-import";
import { Bone, useToast } from "../ui";
import { translator } from "./add-parts";
import { CompletionQuestionCard } from "./CompletionQuestionCard";
import completionStyles from "./completion.module.css";

const ANSWER_KEY = "contacts:completion-question";

function key(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function post(path: string, body: unknown): Promise<ContactCompletionResult> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await response.json().catch(() => null)) as { success?: boolean; data?: unknown } | null;
  if (!response.ok || !json?.success) throw new Error(`HTTP ${response.status}`);
  return contactCompletionResultSchema.parse(json.data);
}

/**
 * The live card for To-do (R20) / 人脈 right rail (R11) / ホーム (R10): reads today's question
 * (`GET /api/contacts/completion-question`), answers or skips it, then hides for the day. Renders
 * nothing when there is no question or when the contract is not live (503). While the first read is out the
 * "rail" variant holds a skeleton of the card (same .card.rail padding / radius) so the rail is not patched later;
 * the other variants render nothing. Back on the page the last answer (question or none) shows at once.
 */
export function TodayQuestionCard({ onSettled, variant }: { onSettled?: () => void; variant?: "flat" | "rail" } = {}) {
  const { language } = useOrbitLanguage();
  const t = translator(language);
  const toast = useToast();
  useSharedReadAccount();
  // undefined = not read yet; null = no question today.
  const [question, setQuestion] = useState<ContactCompletionQuestion | null | undefined>(() => lastAnswer<ContactCompletionQuestion | null>(ANSWER_KEY));
  const [busy, setBusy] = useState(false);
  // One key per question and action: a retry after a timeout replays the same request (idempotent).
  const keys = useRef<Record<string, string>>({});
  const keyFor = (id: string, action: string) => (keys.current[`${id}:${action}`] ??= key());
  useEffect(() => {
    let live = true;
    void fetch("/api/contacts/completion-question").then(async (response) => {
      const json = (await response.json().catch(() => null)) as { success?: boolean; data?: unknown } | null;
      if (!live) return;
      if (!response.ok || !json?.success) { setQuestion((current) => current ?? null); return; }
      const parsed = json.data ? contactCompletionQuestionSchema.safeParse(json.data) : null;
      const next = parsed?.success ? parsed.data : null;
      setQuestion(next);
      rememberAnswer<ContactCompletionQuestion | null>(ANSWER_KEY, next);
    }).catch(() => { if (live) setQuestion((current) => current ?? null); });
    return () => { live = false; };
  }, []);
  if (question === undefined) {
    return variant === "rail" ? (
      <div className={`${completionStyles.card} ${completionStyles.rail}`} data-completion-question-loading="" aria-hidden>
        <div className={completionStyles.head}><Bone width={30} height={30} round /><div className={completionStyles.meta}><Bone width="80%" height={14} /></div></div>
        <div className={completionStyles.options}><Bone width={72} height={32} round /><Bone width={88} height={32} round /><Bone width={64} height={32} round /></div>
      </div>
    ) : null;
  }
  if (!question) return null;
  const settle = async (action: () => Promise<ContactCompletionResult>, message: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(message);
      setQuestion(null);
      rememberAnswer<ContactCompletionQuestion | null>(ANSWER_KEY, null);
      onSettled?.();
    } catch {
      toast.error(t(q.failed));
    } finally {
      setBusy(false);
    }
  };
  const base = `/api/contacts/completion-question/${encodeURIComponent(question.id)}`;
  return (
    <CompletionQuestionCard question={question} t={t} busy={busy} variant={variant}
      onAnswer={(answer) => void settle(() => post(`${base}/answer`, { answer, idempotencyKey: keyFor(question.id, `answer:${answer}`) }), t(q.answered, { name: question.contactName ?? "" }))}
      onSkip={() => void settle(() => post(`${base}/skip`, { idempotencyKey: keyFor(question.id, "skip") }), t(q.skipped))} />
  );
}
