'use client';
import {NotificationDeliverySettings} from '../settings/notification-delivery-settings';
import { useEffect, useRef, useState } from 'react';
import { useOrbitLanguage } from '../orbit-language-context';
import { formatOrbitDateTime } from '../orbit-datetime';
import { Avatar } from '../orbit-reference-primitives';
import { toContactMessageInbox, type ContactMessageInboxItem } from './inbox-panel-view-model';
import type { RelationshipConversationListDTO, RelationshipConversationDTO, RelationshipDeliveryReceiptDTO, RelationshipReadReceiptDTO } from '../../../../shared/contract/relationship-communication';

export async function readContactMessageActor(signal?: AbortSignal): Promise<string> {
  const data = await communicationRequest('/api/account/me', { signal });
  const actor = (data as { account?: { id?: unknown } })?.account?.id;
  if (typeof actor !== 'string' || !actor.trim()) throw new Error('No account');
  return actor;
}

export async function communicationRequest(path: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(path, { ...options, cache: 'no-store', headers: { 'content-type': 'application/json', ...options.headers } });
  const envelope = await response.json();
  if (!response.ok || envelope.success !== true) throw new Error(envelope.error?.code ?? 'Communication request failed');
  return envelope.data;
}

export function ContactMessagesTab({ actorId, onIdentityChanged }: { actorId: string; onIdentityChanged: () => void }) {
  const { t, language } = useOrbitLanguage();
  const [items, setItems] = useState<ContactMessageInboxItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(false);
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const [error, setError] = useState(false);
  const [readError, setReadError] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<{ id: string; body: string; conversationId: string } | null>(null);
  const writeLock = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  const readAttempt = useRef('');
  const detail = items.find(item => item.id === selected);
  const changed = useRef(onIdentityChanged); changed.current = onIdentityChanged;
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    return () => { controller.abort(); lifetime.current = null; };
  }, [actorId]);
  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    async function refresh() {
      if (loading || document.visibilityState === 'hidden') return;
      loading = true;
      try {
        const account = await readContactMessageActor(controller.signal);
        if (controller.signal.aborted) return;
        if (account !== actorId) { changed.current(); return; }
        const data = await communicationRequest('/api/relationship-communication/conversations', { signal: controller.signal }) as RelationshipConversationListDTO;
        const next = toContactMessageInbox(data, actorId);
        if (selectedRef.current && !next.some(item => item.id === selectedRef.current)) {
          const selectedConversation = await communicationRequest('/api/relationship-communication/conversations/' + encodeURIComponent(selectedRef.current), { signal: controller.signal }) as RelationshipConversationDTO;
          next.push(...toContactMessageInbox({ conversations: [selectedConversation], refreshedAt: data.refreshedAt }, actorId));
        }
        if (!controller.signal.aborted) { setItems(next); setNextCursor(data.nextCursor ?? null); setReady(true); setError(false); }
      } catch { if (!controller.signal.aborted) { setItems([]); setReady(false); setError(true); } }
      finally { loading = false; }
    }
    void refresh(); const timer = setInterval(() => void refresh(), 15_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [actorId, attempt]);
  useEffect(() => {
    if (!detail || detail.unreadCount === 0) return;
    const remote = [...detail.conversation.messages].reverse().find(message => message.senderAccountId !== actorId);
    if (!remote) return;
    const key = `${detail.id}:${remote.messageId}`;
    if (readAttempt.current === key) return;
    readAttempt.current = key;
    const controller = new AbortController();
    void (async () => {
      try {
        if (await readContactMessageActor(controller.signal) !== actorId) { changed.current(); return; }
        const receipt = await communicationRequest(`/api/relationship-communication/conversations/${encodeURIComponent(detail.id)}/read`, {
          signal: controller.signal, method: 'POST', body: JSON.stringify({ lastReadMessageId: remote.messageId }),
        }) as RelationshipReadReceiptDTO;
        if (controller.signal.aborted) return;
        if (receipt.conversationId !== detail.id || receipt.lastReadMessageId !== remote.messageId || !Number.isFinite(Date.parse(receipt.readAt))) throw new Error('Invalid read receipt');
        setReadError(false); setAttempt(value => value + 1);
      } catch { if (!controller.signal.aborted) { readAttempt.current = ''; setReadError(true); } }
    })();
    return () => {
      controller.abort();
      if (readAttempt.current === key) readAttempt.current = '';
    };
  }, [actorId, detail]);
  async function loadMore() {
    const controller = lifetime.current;
    if (!nextCursor || loadingMore || !controller || controller.signal.aborted) return;
    setLoadingMore(true); setPageError(false);
    try {
      if (await readContactMessageActor(controller.signal) !== actorId) { changed.current(); return; }
      const data = await communicationRequest('/api/relationship-communication/conversations?cursor=' + encodeURIComponent(nextCursor), { signal: controller.signal }) as RelationshipConversationListDTO;
      const next = toContactMessageInbox(data, actorId);
      if (controller.signal.aborted) return;
      setItems(previous => [...new Map([...previous, ...next].map(item => [item.id, item])).values()]);
      setNextCursor(data.nextCursor ?? null);
    } catch { if (!controller.signal.aborted) setPageError(true); }
    finally { if (!controller.signal.aborted) setLoadingMore(false); }
  }
  async function send() {
    if (!detail || writeLock.current || (!body.trim() && !pending.current)) return;
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted) return;
    const request = pending.current ?? { id: crypto.randomUUID(), body: body.trim(), conversationId: detail.id };
    pending.current = request; writeLock.current = true; setSending(true); setSendFailed(false);
    try {
      if (await readContactMessageActor(controller.signal) !== actorId) { changed.current(); return; }
      const receipt = await communicationRequest(`/api/relationship-communication/conversations/${encodeURIComponent(request.conversationId)}/messages`, {
        method: 'POST', signal: controller.signal, body: JSON.stringify({ body: request.body, requestId: request.id, qualificationVersion: detail.conversation.qualificationVersion }),
      }) as RelationshipDeliveryReceiptDTO;
      if (controller.signal.aborted) return;
      if (receipt.conversationId !== request.conversationId || receipt.deliveryState !== 'delivered' || receipt.message?.body !== request.body || receipt.message.senderAccountId !== actorId) throw new Error('Invalid delivery receipt');
      pending.current = null; setBody(''); setAttempt(value => value + 1);
    } catch { if (!controller.signal.aborted) setSendFailed(true); }
    finally { writeLock.current = false; if (!controller.signal.aborted) setSending(false); }
  }
  if (error) return <div role="alert">{t({ zh: '消息读取失败，请重试。', en: 'Could not load messages. Please retry.', ja: 'メッセージを読み込めませんでした。' })}<button type="button" className="btn btn-ghost" onClick={() => setAttempt(value => value + 1)}>{t({ zh: '重试', en: 'Retry', ja: '再試行' })}</button></div>;
  if (!ready) return <p role="status">{t({ zh: '正在读取消息…', en: 'Loading messages…', ja: 'メッセージを読み込み中…' })}</p>;
  return <div className={`ri-thread-workspace${detail ? ' has-open-thread' : ''}`}>
    <aside className="ri-thread-list"><div className="ri-thread-scroll scroll">
      {!items.length ? <p>{t({ zh: '暂无消息', en: 'No messages yet', ja: 'メッセージはありません' })}</p> : null}
      {items.map(item => <button type="button" className="ri-row" key={item.id} disabled={sending || !!pending.current} onClick={() => { if (selected === item.id) return; setSelected(item.id); setBody(''); setSendFailed(false); readAttempt.current = ''; }}>
        <Avatar letter={Array.from(item.name)[0] || '?'} g="g-violet" size={38} />
        <span className="ri-row-main"><span className="ri-row-name">{item.name}</span><span className="ri-row-preview">{item.preview}</span><span className="ri-row-time">{formatOrbitDateTime(item.conversation.updatedAt, language)}</span></span>
        {item.unreadCount > 0 ? <span className="ri-row-unread">{item.unreadCount}</span> : null}
      </button>)}
      {pageError ? <p role="alert">{t({ zh: '加载失败，请重试。', en: 'Could not load more messages. Retry.', ja: '読み込めませんでした。再試行してください。' })}</p> : null}
      {nextCursor ? <button type="button" className="btn btn-ghost" disabled={loadingMore} onClick={() => void loadMore()}>{t({ zh: '加载更多消息', en: 'Load more messages', ja: 'メッセージをさらに読み込む' })}</button> : null}
    </div></aside>
    <section className="ri-thread-main" style={{ gridColumn: '2 / -1' }}>
      {detail ? <div className="ri-detail"><div className="ri-detail-head"><button type="button" className="btn btn-ghost" onClick={() => setSelected(null)} disabled={sending || !!pending.current}>{t({ zh: '返回消息', en: 'Back to messages', ja: 'メッセージに戻る' })}</button><h3 className="ri-detail-subject">{detail.name}</h3></div>
        <NotificationDeliverySettings key={detail.id} conversationId={detail.id}/>
        {readError ? <p role="alert">{t({ zh: '已读状态尚未保存，下次刷新会重试。', en: 'Read state was not saved. Refresh to retry.', ja: '既読状態を保存できませんでした。更新して再試行してください。' })}</p> : null}
        <div className="ri-msgs">{detail.conversation.messages.map(message => <article className={`ri-msg${message.senderAccountId === actorId ? ' is-me' : ''}`} key={message.messageId}><div className="ri-msg-meta"><strong className="ri-msg-sender">{message.senderDisplayName}</strong><time className="ri-msg-time">{formatOrbitDateTime(message.sentAt, language)}</time></div><p className="ri-msg-body" style={{ overflowWrap: 'anywhere' }}>{message.body}</p>{message.senderAccountId === actorId ? <span className="ri-msg-time">{t({ zh: '已送达', en: 'Delivered', ja: '送信済み' })}</span> : null}</article>)}</div>
        <div className="ri-composer"><label className="ri-composer-label">{t({ zh: '回复消息', en: 'Reply', ja: '返信' })}</label>
        <textarea className="field ri-composer-input" aria-label={t({ zh: '回复消息', en: 'Reply', ja: '返信' })} placeholder={t({ zh: '输入消息…', en: 'Write a message…', ja: 'メッセージを入力…' })} disabled={sending || !!pending.current} value={body} onChange={event => setBody(event.target.value)} />
        {sendFailed ? <p role="alert">{t({ zh: '尚未确认送达，重试不会重复发送。', en: 'Delivery is unconfirmed. Retrying will not duplicate the message.', ja: '送信を確認できません。再試行しても重複しません。' })}</p> : null}
        <button type="button" className="btn btn-primary" disabled={sending || (!body.trim() && !pending.current)} onClick={() => void send()}>{sending ? t({ zh: '发送中…', en: 'Sending…', ja: '送信中…' }) : sendFailed ? t({ zh: '重试发送', en: 'Retry send', ja: '送信を再試行' }) : t({ zh: '发送', en: 'Send', ja: '送信' })}</button>
        </div>
      </div> : <p style={{ padding: 24 }}>{t({ zh: '选择联系人查看对话。', en: 'Choose a contact to view messages.', ja: '連絡先を選択してください。' })}</p>}
    </section>
  </div>;
}
