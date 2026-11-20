'use client';

/**
 * agent-design AG17 (approved visual draft, board 9): the inbox line of a proposal an outside assistant made —
 * «Claude 想改 2 项，等你确认», the card's count line and until when, the client's initial in the tile. On a phone the
 * line opens the confirm page (the same page as the link); on the desktop the right column shows who proposed it and
 * the same card, confirmable there. Kept in its own file: AG15 builds the inbox's other new rows in parallel.
 */
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { agentProposalViewSchema } from '../../../../shared/api-schema/agent-v1';
import type { AgentProposalViewContract } from '../../../../shared/contract/agent-v1';
import { useOrbitLanguage } from '../orbit-language-context';
import { agentConnectionsWords } from '../orbit-2026/copy/agent-connections';
import { ClientTile, LocalTime, whenText } from '../orbit-2026/agent-connections/parts';
import { ProposalBody } from '../orbit-2026/agent-connections/ProposalConfirm';
import { ConfirmPageSkeleton } from '../orbit-2026/agent-connections/skeletons';
import { inboxListTime } from './inbox-list-time';
import ws from './inbox-workspace.module.css';
import s from '../orbit-2026/agent-connections/agent-connections.module.css';
import type { NotificationRow } from './notification-inbox-view-model';

const PROPOSAL_HREF = /^\/app\/agent\/proposals\/(prop_[A-Za-z0-9_-]{16,80})$/u;

export function isExternalProposal(n: NotificationRow): boolean {
  return n.sources[0]?.sourceKind === 'external_proposal' && PROPOSAL_HREF.test(n.target.href ?? '');
}

const proposalIdOf = (n: NotificationRow) => PROPOSAL_HREF.exec(n.target.href ?? '')?.[1] ?? null;

const phoneWidth = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches;

/** The list line (the inbox's own row style). */
export function ExternalProposalRow({ notification: n, onSelect, selected, now, zone }: { notification: NotificationRow; onSelect: () => void; selected: boolean; now: string; zone: string }) {
  const { language } = useOrbitLanguage();
  const t = agentConnectionsWords(language);
  const router = useRouter();
  const unread = !n.readAt && n.disposition === 'open';
  const client = n.object?.name ?? '';
  const open = () => {
    onSelect();
    // A phone has no right column: the line opens the confirm page.
    if (phoneWidth() && n.target.href) router.push(n.target.href);
  };
  // The shared `btn` class; the inbox sits in an old page whose unscoped `.btn` is restated back to the row (`inboxRow`).
  return <button type="button" aria-pressed={selected} className={`btn ${ws.row} ${s.inboxRow}${unread ? ' ' + ws.unread : ''}${selected ? ' ' + ws.sel : ''}`} onClick={open} data-orbit-inbox-external-proposal="">
    <ClientTile name={client} size="sm" />
    <span style={{ minWidth: 0 }}><span className={ws.rowTitle}>{n.title}</span><span className={`${ws.lbl} ${ws.rowSub}`}>{n.expiresAt ? <LocalTime width={160} render={() => t('inboxLine', { summary: n.reason, time: whenText(n.expiresAt!, language) })} /> : n.reason}</span></span>
    <span className={ws.rowEnd}><span className={ws.lbl}>{inboxListTime(n.occurredAt, now, zone, language, t('yesterday'))}</span>{unread ? <i className={ws.dot} aria-label={t('waitingChip')} /> : null}</span>
  </button>;
}

/** The right column on the desktop: who proposed it and the card itself, read from the confirm page's interface. */
export function ExternalProposalPane({ notification: n }: { notification: NotificationRow }) {
  const { language } = useOrbitLanguage();
  const t = agentConnectionsWords(language);
  const proposalId = proposalIdOf(n);
  const [view, setView] = useState<AgentProposalViewContract | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!proposalId) return;
    const controller = new AbortController();
    setView(null);
    setMissing(false);
    // Not cached: the card's state is read for this account each time it is opened (it may have been decided elsewhere).
    void fetch(`/api/agent/proposals/${encodeURIComponent(proposalId)}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const parsed = agentProposalViewSchema.safeParse(((await response.json().catch(() => null)) as { data?: unknown } | null)?.data);
        if (parsed.success) setView(parsed.data);
        else setMissing(true);
      })
      .catch(() => { if (!controller.signal.aborted) setMissing(true); });
    return () => controller.abort();
  }, [proposalId]);
  if (missing) return <div className={ws.hint}><b>{t('otherAccountTitle')}</b></div>;
  if (!view) return <div style={{ padding: '18px 22px' }}><ConfirmPageSkeleton label={t('waitingChip')} /></div>;
  return <div style={{ display: 'grid', gap: 12, paddingBottom: 22 }}><ProposalBody key={view.proposalId} view={view} language={language} place="inbox" /></div>;
}
