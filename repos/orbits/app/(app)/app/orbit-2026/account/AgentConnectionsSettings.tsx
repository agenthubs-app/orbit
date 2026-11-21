"use client";

/**
 * agent-design AG17 (approved visual draft, boards 7–8): settings › 外部 AI 助手. One card per connection — what it may
 * see and propose, when it was connected and last used, «它提的 N 项修改等你确认 · 去看» (D10) — and «断开连接» (D4)
 * with its three-line confirmation; in this version settings can only disconnect (D5). With no connection, the three
 * steps and the address to copy (D11). Under both, the card that says what is never given.
 *
 * Read through orbit-last-answer like 连接 (FRESH.list: the waiting count and last use change); until the first answer
 * the cards are bones of the same size, never an empty state that turns into cards.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { agentConnectionListSchema } from "../../../../../shared/api-schema/agent-v1";
import type { AgentConnectionContract, AgentConnectionListContract } from "../../../../../shared/contract/agent-v1";
import { FRESH, answerFresh, lastAnswer, rememberAnswer } from "../../orbit-last-answer";
import { useOrbitLanguage } from "../../orbit-language-context";
import { agentConnectionsWords } from "../copy/agent-connections";
import { ClientTile, dateText, domainNames, LocalTime, whenText } from "../agent-connections/parts";
import { Bone, Button, Chip, Icon, Kbd, Modal, ModalIcon, useToast } from "../ui";
import s from "../agent-connections/agent-connections.module.css";

export const AGENT_CONNECTIONS_KEY = "settings:agentConnections";

async function readConnections(): Promise<AgentConnectionListContract> {
  const response = await fetch("/api/agent/connections", { cache: "no-store", credentials: "same-origin" });
  const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
  const parsed = agentConnectionListSchema.safeParse(body?.data);
  if (!response.ok || !parsed.success) throw new Error("connections");
  return parsed.data;
}

/** «orbitailink.com/connect»: what the user reads; the copy carries the whole address. */
const shortAddress = (address: string) => address.replace(/^https?:\/\//u, "");

export function AgentConnectionsSettings() {
  const { language } = useOrbitLanguage();
  const t = agentConnectionsWords(language);
  const toast = useToast();
  const [list, setList] = useState<AgentConnectionListContract | null>(() => lastAnswer<AgentConnectionListContract>(AGENT_CONNECTIONS_KEY) ?? null);
  const [failed, setFailed] = useState(false);
  const [removing, setRemoving] = useState<AgentConnectionContract | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const reload = async () => {
    try {
      const next = await readConnections();
      setList(next);
      rememberAnswer(AGENT_CONNECTIONS_KEY, next);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };
  useEffect(() => { if (!answerFresh(AGENT_CONNECTIONS_KEY, FRESH.list)) void reload(); }, []);

  const disconnect = async () => {
    const connection = removing;
    if (!connection) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/agent/connections/${encodeURIComponent(connection.id)}`, { credentials: "same-origin", method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { data?: { voidedProposals?: number } } | null;
      if (!response.ok) throw new Error("disconnect");
      const voided = body?.data?.voidedProposals ?? 0;
      setRemoving(null);
      toast.success(voided ? t("disconnectedVoided", { client: connection.clientName, n: voided }) : t("disconnected", { client: connection.clientName }));
      await reload();
    } catch {
      toast.error(t("disconnectFailed"));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The address stays selectable on the page.
    }
  };

  const same = (
    <section className={s.sameCard}>
      <h3>{t("sameForAll")}</h3>
      <div className={s.sameGrid}>
        <div className={s.sameYes}><b>{t("gives")}</b><br />{t("givesOne")}<br />{t("givesTwo")}</div>
        <div className={s.sameNo}><b>{t("never")}</b><br />{t("neverOne")}<br />{t("neverTwo")}</div>
      </div>
    </section>
  );

  if (!list) {
    return <>
      {failed ? <p role="alert" style={{ margin: 0 }}>{t("loadFailed")} <button type="button" className={`btn ${s.linkButton}`} onClick={() => void reload()}>{t("retry")}</button></p> : null}
      <div className={s.connGrid} aria-busy="true">
        {[0, 1].map((index) => (
          <section key={index} className={s.connCard}>
            <div className={s.connHead}><Bone width={44} height={44} /><Bone width={64} height={24} round /></div>
            <span className={s.connName}><Bone width={90} height={18} /></span>
            <span className={s.connMeta}><Bone width={180} height={13} /></span>
            <div className={s.connRows}><Bone width={40} height={14} /><Bone width={140} height={14} /><Bone width={56} height={14} /><Bone width={60} height={14} /></div>
            <div className={s.connFoot}><Bone width={72} height={30} round /></div>
          </section>
        ))}
        {same}
      </div>
    </>;
  }

  const address = list.connectAddress;
  return <>
    <div className={s.connGrid} data-orbit-agent-connections={list.connections.length ? "list" : "empty"}>
      {list.connections.length ? list.connections.map((connection) => {
        const sees = domainNames(list.options, connection.scopes, "read", language);
        const proposes = domainNames(list.options, connection.scopes, "propose", language);
        return (
          <section key={connection.id} className={s.connCard} data-orbit-agent-connection={connection.clientName}>
            <div className={s.connHead}><ClientTile name={connection.clientName} /><Chip label={t("connected")} tone="teal" /></div>
            <h2 className={s.connName}>{connection.clientName}</h2>
            <p className={s.connMeta}><LocalTime width={190} render={() => `${t("connectedOn", { date: dateText(connection.createdAt, language) })} · ${connection.lastUsedAt ? t("lastUsed", { time: whenText(connection.lastUsedAt, language) }) : t("neverUsed")}`} /></p>
            <dl className={s.connRows}>
              <dt>{t("canSee")}</dt><dd>{sees.length ? sees.join("、") : t("cannot")}</dd>
              <dt>{t("canPropose")}</dt><dd>{proposes.length ? proposes.join("、") : t("cannot")}</dd>
            </dl>
            {connection.waitingProposals ? <Link prefetch className={s.waiting} href="/app/inbox">{t("waiting", { n: connection.waitingProposals })}<span>{t("goLook")} ›</span></Link> : null}
            <div className={s.connFoot}><button type="button" className={`btn ${s.release}`} onClick={() => setRemoving(connection)} disabled={busy}>{t("disconnect")}</button></div>
          </section>
        );
      }) : (
        <section className={s.emptyCard} data-orbit-agent-connections-empty="">
          <div className={s.connHead}><span className={s.emptyTile} aria-hidden><Icon name="chat" size={21} /></span><Chip label={t("emptyChip")} tone="neutral" /></div>
          <h2 className={s.connName}>{t("emptyTitle")}</h2>
          <p className={s.connMeta}>{t("emptyLead")}</p>
          <ol className={s.steps}>
            <li><span className={s.stepNum}>1</span><div>{t("stepOne")}{address ? <><br /><span className={s.address}><code>{shortAddress(address)}</code><button type="button" className={`btn ${s.copy}`} onClick={() => void copy(address)}>{copied ? t("copied") : t("copy")}</button></span></> : null}</div></li>
            <li><span className={s.stepNum}>2</span><div>{t("stepTwo")}</div></li>
            <li><span className={s.stepNum}>3</span><div>{t("stepThree")}</div></li>
          </ol>
        </section>
      )}
      {same}
    </div>
    <Modal open={removing !== null} onClose={() => setRemoving(null)} title={removing ? t("disconnectTitle", { client: removing.clientName }) : ""} icon={<ModalIcon icon="x-circle" />} closable={false} closeOnScrim={false} role="alertdialog"
      hint={<><Kbd>Esc</Kbd> {t("cancel")}</>}
      actions={<><Button label={t("cancel")} variant="secondary" onClick={() => setRemoving(null)} /><Button label={t("disconnect")} variant="danger" loading={busy} onClick={() => void disconnect()} /></>}>
      {removing ? (
        <ul className={s.dialogList} data-orbit-disconnect-lines="">
          <li><b>{t("disconnectNowLabel")}</b>{t("disconnectNow", { client: removing.clientName })}</li>
          {removing.waitingProposals ? <li><b>{t("disconnectVoidLabel")}</b>{t("disconnectVoid", { n: removing.waitingProposals })}</li> : null}
          <li><b>{t("disconnectKeepLabel")}</b>{t("disconnectKeep")}</li>
        </ul>
      ) : null}
    </Modal>
  </>;
}
