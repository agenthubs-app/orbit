"use client";

/**
 * agent-design AG17 (approved visual draft, boards 1–4): the consent page. Who asks, which account, six kinds of record
 * at three levels (D1); what the client asked to read pre-set to 只读, «可以提修改» only by the user's own click (D2); the
 * two fixed sentences; allow / refuse at the end of the page on a phone (D9). Already connected: the current choice
 * as it is, only what is new is marked, and a level may be lowered in the same step (board 3). The account changed in
 * another tab: the server refuses the old answer and the page comes again with a line saying so (board 2).
 */
import { useMemo, useState } from "react";

import { agentConnectionConsentSchema } from "../../../../../shared/api-schema/agent-v1";
import type { AgentConnectionConsentContract } from "../../../../../shared/contract/agent-v1";
import { useOrbitLanguage } from "../../orbit-language-context";
import { signOutAndForget } from "../../orbit-sign-out";
import { Avatar, Icon, Orbit2026Scope } from "../ui";
import { agentConnectionsWords, type ConnectionDomain } from "../copy/agent-connections";
import { dateText, levelOf, LocalTime, scopesFrom, type Level } from "./parts";
import s from "./agent-connections.module.css";

export type ConsentInitial =
  | { kind: "ready"; ticket: string; view: AgentConnectionConsentContract }
  | { kind: "stale"; clientName: string | null }
  | { kind: "unsupported" }
  /** Signed in but the services could not be reached: the page reads the request itself. */
  | { kind: "unavailable"; ticket: string };

type Outcome = { kind: "allowed" | "refused" | "kept"; redirectTo: string } | { kind: "failed" } | { kind: "stale" };

const LEVELS: readonly Level[] = ["none", "read", "propose"];

function initialLevels(view: AgentConnectionConsentContract): Record<string, Level> {
  const chosen = new Set(view.preselectedScopes);
  return Object.fromEntries(view.options.map((option) => [option.domain, levelOf(option, chosen)]));
}

export function ConsentPage({ initial }: { initial: ConsentInitial }) {
  const { language } = useOrbitLanguage();
  const t = agentConnectionsWords(language);
  const [view, setView] = useState<AgentConnectionConsentContract | null>(initial.kind === "ready" ? initial.view : null);
  const [levels, setLevels] = useState<Record<string, Level>>(() => (initial.kind === "ready" ? initialLevels(initial.view) : {}));
  const [changedFrom, setChangedFrom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(initial.kind === "stale" ? { kind: "stale" } : null);
  const ticket = initial.kind === "ready" || initial.kind === "unavailable" ? initial.ticket : "";
  const client = view?.clientName ?? (initial.kind === "stale" ? initial.clientName : null);

  const requested = useMemo(() => new Set(view?.requestedScopes ?? []), [view]);
  const current = useMemo(() => new Set(view?.current?.scopes ?? []), [view]);
  const scopes = view ? scopesFrom(view.options, levels, requested.has("proposals:read") || current.has("proposals:read")) : [];
  const more = Boolean(view?.current);

  const submit = async (decision: "allow" | "deny") => {
    if (!view || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/agent/connections/authorize", { body: JSON.stringify({ accountKey: view.account?.key, decision, request: ticket, scopes: decision === "allow" ? scopes : [] }), credentials: "same-origin", headers: { "content-type": "application/json" }, method: "POST" });
      const body = (await response.json().catch(() => null)) as { data?: { redirectTo?: string } & Record<string, unknown>; error?: { context?: { reason?: string } } } | null;
      if (response.status === 409 && body?.error?.context?.reason === "ACCOUNT_CHANGED") {
        const next = agentConnectionConsentSchema.safeParse(body.data);
        if (next.success) {
          setChangedFrom(view.account?.name || view.account?.email || "");
          setView(next.data);
          setLevels(initialLevels(next.data));
          return;
        }
      }
      if (response.status === 400 && body?.error?.context?.reason === "AUTHORIZATION_REQUEST_INVALID") return setOutcome({ kind: "stale" });
      const redirectTo = body?.data?.redirectTo;
      if (!response.ok || typeof redirectTo !== "string") return setOutcome({ kind: "failed" });
      setOutcome({ kind: decision === "allow" ? "allowed" : more ? "kept" : "refused", redirectTo });
      // Back to the client at once: it learns the answer from this address (the page is seen only for a moment).
      window.location.assign(redirectTo);
    } catch {
      setOutcome({ kind: "failed" });
    } finally {
      setBusy(false);
    }
  };

  const switchAccount = () => void signOutAndForget(`/app/account/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);

  return (
    <Orbit2026Scope language={language} className={s.consentPage}>
      <div className={s.consentColumn} data-orbit-consent="">
        <div className={s.brand}><span className={s.brandLogo} aria-hidden>O</span>Orbit</div>
        {initial.kind === "unsupported" ? <ResultCard tone="none" title={t("unsupportedTitle")} line={t("unsupportedLine")} />
          : outcome?.kind === "stale" ? <ResultCard tone="none" title={t("staleTitle")} line={client ? t("staleLine", { client }) : t("staleLineUnknown")} />
          : !view ? <ResultCard tone="none" title={t("failedTitle")} line={t("staleLineUnknown")} action={{ label: t("retry"), onClick: () => window.location.reload() }} />
          : outcome?.kind === "allowed" ? <ResultCard tone="ok" title={t("allowedTitle")} line={t("allowedLine", { client: view.clientName })} back={{ href: outcome.redirectTo, label: t("backTo", { client: view.clientName }), lead: t("allowedFallback") }} />
          : outcome?.kind === "refused" ? <ResultCard tone="none" title={t("refusedTitle")} line={t("refusedLine", { client: view.clientName })} />
          : outcome?.kind === "kept" ? <ResultCard tone="ok" title={t("keepAsIs")} line={t("allowedLine", { client: view.clientName })} back={{ href: outcome.redirectTo, label: t("backTo", { client: view.clientName }), lead: t("allowedFallback") }} />
          : outcome?.kind === "failed" ? <ResultCard tone="none" title={t("failedTitle")} line={more ? t("failedLineMore") : t("failedLine", { client: view.clientName })} action={{ label: t("retry"), onClick: () => setOutcome(null) }} />
          : (
            <section className={s.card} aria-labelledby="consent-title">
              <div className={s.pair} aria-hidden>
                <span className={`${s.bigTile} ${/^claude$/iu.test(view.clientName) ? s.tileApricot : s.tileBlue}`}>{(view.clientName.trim()[0] ?? "?").toUpperCase()}</span>
                <span className={s.dots}>•••</span>
                <span className={s.orbitTile}>O</span>
              </div>
              <h1 className={s.title} id="consent-title">{t(more ? "consentTitleMore" : "consentTitle", { client: view.clientName })}</h1>
              <p className={s.lead}>{more && view.current ? <LocalTime width={240} render={() => t("consentLeadMore", { date: dateText(view.current!.connectedAt, language) })} /> : t("consentLead", { client: view.clientName })}</p>
              {changedFrom !== null ? <div className={s.banner} role="alert"><Icon name="info" size={16} />{t("accountChanged", { a: changedFrom, b: view.account?.name || view.account?.email || "" })}</div> : null}
              <div className={s.account}>
                <Avatar name={view.account?.name || view.account?.email || "?"} tone="lav" />
                <div className={s.accountText}><small>{t("accountRow")}</small><b>{view.account?.name || view.account?.email}</b>{view.account?.name && view.account?.email ? <span>{view.account?.email}</span> : null}</div>
                <button type="button" className={`btn ${s.linkButton}`} onClick={switchAccount}>{t("switchAccount")}</button>
              </div>
              <div className={s.chooseHead}><b>{t("chooseHeading", { client: view.clientName })}</b><span>{t("chooseNote")}</span></div>
              <div className={s.rows}>
                {view.options.map((option) => {
                  const domain = option.domain as ConnectionDomain;
                  const level = levels[domain] ?? "none";
                  const now = levelOf(option, current);
                  const wantsPropose = Boolean(option.propose && requested.has(option.propose) && now !== "propose");
                  const newlyAsked = more && requested.has(option.read) && now === "none";
                  const name = t(`domain_${domain}`);
                  return (
                    <div key={domain} className={s.row} data-consent-domain={domain}>
                      <div className={s.rowText}>
                        <span className={s.rowName}>{name}{wantsPropose ? <span className={s.mark}>{t(more ? "wantsProposeMore" : "wantsPropose", { client: view.clientName })}</span> : newlyAsked ? <span className={`${s.mark} ${s.markNew}`}>{t("newlyAsked")}</span> : null}</span>
                        <span className={s.rowDesc}>{t(`gives_${domain}`)}</span>
                        {option.propose ? null : <span className={s.rowNote}>{t("levelProposeUnavailable")}</span>}
                      </div>
                      <div className={s.levels} role="radiogroup" aria-label={name}>
                        {LEVELS.map((key) => {
                          const on = level === key;
                          const disabled = key === "propose" && !option.propose;
                          return (
                            <button key={key} type="button" role="radio" aria-checked={on} disabled={disabled || busy}
                              className={`btn ${s.level} ${on ? (key === "propose" ? `${s.levelOn} ${s.levelProposeOn}` : s.levelOn) : ""}`}
                              onClick={() => setLevels((before) => ({ ...before, [domain]: key }))} data-level={key}>
                              {t(key === "none" ? "levelNone" : key === "read" ? "levelRead" : "levelPropose")}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className={s.guarantees}>
                <div className={`${s.guarantee} ${s.guaranteeYes}`}><Icon name="check" size={16} /><b>{t("guaranteeOneTitle")}</b><span>{t("guaranteeOne")}</span></div>
                <div className={s.guarantee}><Icon name="lock" size={16} /><b>{t("guaranteeTwoTitle")}</b><span>{t("guaranteeTwo")}</span></div>
              </div>
              <div className={s.buttons}>
                <button type="button" className={`btn ${s.secondary}`} disabled={busy} onClick={() => void submit("deny")} data-consent-deny="">{t(more ? "keepAsIs" : "deny")}</button>
                <button type="button" className={`btn ${s.primary}`} disabled={busy || scopes.length === 0} onClick={() => void submit("allow")} data-consent-allow="">{t(more ? "allowChanges" : "allow")}</button>
              </div>
              <p className={s.footer}>{t(more ? "footerMore" : "footer", { host: view.redirectHost })}</p>
            </section>
          )}
      </div>
    </Orbit2026Scope>
  );
}

function ResultCard({ tone, title, line, back, action }: { tone: "ok" | "none"; title: string; line: string; back?: { href: string; label: string; lead: string }; action?: { label: string; onClick: () => void } }) {
  return (
    <section className={`${s.card} ${s.result}`} role="status">
      <span className={`${s.resultTile} ${tone === "ok" ? s.resultTileOk : ""}`} aria-hidden><Icon name={tone === "ok" ? "check" : "info"} size={21} /></span>
      <h1 className={s.resultTitle}>{title}</h1>
      <p className={s.resultLine}>{line}</p>
      {back ? <p className={s.resultLine}>{back.lead} <a className={s.resultLink} href={back.href}>{back.label}</a></p> : null}
      {action ? <button type="button" className={`btn ${s.pill} ${s.pillDark}`} onClick={action.onClick}>{action.label}</button> : null}
    </section>
  );
}
