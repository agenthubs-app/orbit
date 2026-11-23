"use client";

/**
 * agent-design AG17 (approved visual draft, boards 5, 6 and 9): a proposal of an outside assistant, as the confirm page
 * and the inbox's right column show it — who proposed it and until when above, the card of AG07 itself (unchanged:
 * ConfirmationCard), two small lines under it while it waits. Every other state says in one line what happened:
 * expired after 24 hours (no «重新生成»: shared/compute/agent-card-view.ts), already confirmed, the connection
 * disconnected, declined. Deciding goes through the ledger's decision interface with this session, like any card.
 */
import Link from "next/link";
import { useState } from "react";

import type { AgentActionPreviewContract, AgentProposalViewContract } from "../../../../../shared/contract/agent-v1";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { useOrbitLanguage } from "../../orbit-language-context";
import { signOutAndForget } from "../../orbit-sign-out";
import { decideAgentCard } from "../iorbit/action-preview-client";
import { ConfirmationCard } from "../iorbit/confirmation-card";
import { ShellPage } from "../shell/slots";
import { Icon, Orbit2026Scope } from "../ui";
import { agentConnectionsWords } from "../copy/agent-connections";
import { ClientTile, LocalTime, whenText } from "./parts";
import s from "./agent-connections.module.css";

const MARK = "\u0000";
/** «<b>今天 14:20</b> 提的»: the time in bold inside the sentence of the copy table (board 5). */
const boldTime = (sentence: string, time: string) => {
  const [before, after = ""] = sentence.split(MARK);
  return <>{before}<b>{time}</b>{after}</>;
};

const WAITING = new Set(["awaiting_confirmation", "deferred", "approved", "executing", "partially_failed", "failed"]);

export function useProposalCard(view: AgentProposalViewContract) {
  const [card, setCard] = useState<AgentActionPreviewContract>(view.card);
  const decide = async (decision: "confirm" | "reject" | "retry" | "mark_done" | "abandon", operationId?: string) => {
    const result = await decideAgentCard(card, decision, operationId);
    if (result.card) setCard(result.card);
    return result.ok;
  };
  return { card, decide };
}

/** The part above the card and the card: the same on the confirm page and in the inbox. */
export function ProposalBody({ view, language, place }: { view: AgentProposalViewContract; language: OrbitLanguage; place: "page" | "inbox" }) {
  const t = agentConnectionsWords(language);
  const { card, decide } = useProposalCard(view);
  const client = view.clientName;
  const count = Math.max(1, card.operations.length);
  const waiting = WAITING.has(card.status);
  const proposed = () => whenText(view.createdAt, language);
  const until = () => (card.expiresAt ? whenText(card.expiresAt, language) : "");
  const decided = () => whenText(card.updatedAt, language);
  const state = card.status === "expired" ? { title: t("expiredTitle"), box: { icon: "clock" as const, title: t("expiredBoxTitle"), body: t("expiredBox", { client }), tone: "" } }
    : card.status === "completed" ? { title: t("doneTitle"), box: { icon: "check" as const, title: () => t("doneBoxTitle", { time: decided() }), body: t("doneBox", { client }), tone: s.guaranteeYes } }
    : card.status === "canceled" ? { title: t("revokedTitle"), box: { icon: "x-circle" as const, title: () => t("revokedBoxTitle", { client, time: decided() }), body: t("revokedBox"), tone: "" } }
    : card.status === "rejected" ? { title: t("rejectedTitle"), box: { icon: "x-circle" as const, title: t("rejectedBoxTitle"), body: t("rejectedBox"), tone: "" } }
    : null;
  return (
    <>
      {place === "inbox" ? (
        <div className={s.inboxPane} data-orbit-proposal-pane="">
          <div className={s.inboxTop}><ClientTile name={client} size="sm" /><span className={s.inboxChip}>{t("waitingChip")}</span><LocalTime width={150} render={() => `${proposed()}${card.expiresAt ? ` · ${t("validUntil", { time: until() })}` : ""}`} /></div>
          <h2>{t("wantsToChange", { client, n: count })}</h2>
          <p>{t("inboxHead", { client })}</p>
        </div>
      ) : (
        <div className={s.who} data-orbit-proposal-who="">
          <ClientTile name={client} />
          <div>
            <h2>{state ? state.title : t("wantsToChange", { client, n: count })}</h2>
            <p className={s.whoMeta}>
              {state ? <LocalTime width={150} render={() => t("expiredWhen", { client, time: proposed() })} />
                : <LocalTime width={220} render={() => <>{boldTime(t("proposedAt", { time: MARK }), proposed())}{card.expiresAt ? <> · {boldTime(t("validUntil", { time: MARK }), until())}</> : null}</>} />}
            </p>
          </div>
        </div>
      )}
      {state && place === "page" ? (
        <div className={`${s.stateBox} ${state.box.tone}`} role="status">
          <Icon name={state.box.icon} size={16} />
          <b>{typeof state.box.title === "function" ? <LocalTime width={160} render={state.box.title} /> : state.box.title}</b>
          <span>{state.box.body}</span>
        </div>
      ) : null}
      <div style={place === "inbox" ? { padding: "0 22px" } : undefined}>
        <ConfirmationCard card={card} language={language} online onDecide={decide} onRegenerate={async () => false} />
      </div>
      {waiting && place === "page" ? <p className={s.small}>{t("afterConfirm", { client })}<br />{t("notYours", { client })}</p> : null}
    </>
  );
}

export type ProposalPageInitial =
  | { kind: "found"; view: AgentProposalViewContract }
  /** Another account's proposal and a mistyped link read the same (D7): nothing about the proposal. */
  | { kind: "not_here"; account: { name: string | null; email: string | null } }
  | { kind: "unavailable" };

/** The confirm page (board 5, 6) inside Orbit's navigation (D6); on a phone «‹ 确认修改», back to the inbox. */
export function ProposalConfirmPage({ initial }: { initial: ProposalPageInitial }) {
  const { language } = useOrbitLanguage();
  const t = agentConnectionsWords(language);
  const signedInAs = initial.kind === "not_here" ? initial.account.name || initial.account.email || "" : "";
  return (
    <Orbit2026Scope language={language}>
      <ShellPage title={t("confirmTitle")} rightRail={false} phoneFold phoneBare phoneBack="/app/inbox" />
      <div className={s.confirmPage} data-orbit-proposal-page={initial.kind}>
        <div className={s.phoneTop}><Link className={`btn ${s.phoneBack}`} href="/app/inbox" aria-label={t("backToInbox")}><Icon name="left" size={20} /></Link><b>{t("confirmTitle")}</b><span /></div>
        {initial.kind === "found" ? <ProposalBody view={initial.view} language={language} place="page" />
          : initial.kind === "not_here" ? (
            <section className={s.lockCard} data-orbit-proposal-elsewhere="">
              <span className={s.lockTile} aria-hidden><Icon name="lock" size={21} /></span>
              <h2>{t("otherAccountTitle")}</h2>
              <p>{t("otherAccountLine", { b: signedInAs })}</p>
              <div className={s.lockButtons}>
                <button type="button" className={`btn ${s.pill} ${s.pillDark}`} onClick={() => void signOutAndForget(`/app/account/login?next=${encodeURIComponent(window.location.pathname)}`)}>{t("switchAccount")}</button>
                <Link className={`${s.pill} ${s.pillLight}`} href="/app/home">{t("goHome")}</Link>
              </div>
            </section>
          ) : (
            <section className={s.lockCard}><h2>{t("loadFailed")}</h2><div className={s.lockButtons}><button type="button" className={`btn ${s.pill} ${s.pillDark}`} onClick={() => window.location.reload()}>{t("retry")}</button></div></section>
          )}
      </div>
    </Orbit2026Scope>
  );
}
