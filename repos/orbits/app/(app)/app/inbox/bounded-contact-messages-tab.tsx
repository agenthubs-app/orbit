"use client";
import { useEffect, useRef, useState } from "react";
import { useOrbitLanguage } from "../orbit-language-context";
import { formatOrbitDateTime } from "../orbit-datetime";
import { NotificationDeliverySettings } from "../settings/notification-delivery-settings";
import { Avatar } from "../orbit-reference-primitives";
import { BoundedMessageReadError, readMessageCards, readMessageWindow, confirmMessageWindowRead, sendWindowMessage, type MessageCardPageView, type MessageWindowView } from "./bounded-contact-messages-view-model";

/** List summaries and one selected history window are independent resources. */
export function BoundedContactMessagesTab({ actorId, onIdentityChanged }: { actorId: string; onIdentityChanged: () => void }) {
  const { t, language } = useOrbitLanguage();
  const [cards, setCards] = useState<MessageCardPageView | null>(null);
  const [listCursor, setListCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [detail, setDetail] = useState<MessageWindowView | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [listError, setListError] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [readError, setReadError] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const changed = useRef(onIdentityChanged); changed.current = onIdentityChanged;
  const pending = useRef<{ conversationId: string; body: string; id: string; version: string } | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const readKey = useRef("");
  const sendLock = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    return () => { controller.abort(); lifetime.current = null; };
  }, [actorId]);
  useEffect(() => {
    const controller = new AbortController(); let busy = false;
    setCards(null); setListError(false);
    const refresh = async () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      try { const result = await readMessageCards(actorId, controller.signal, listCursor); if (!controller.signal.aborted) { setCards(result); setListError(false); } }
      catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof BoundedMessageReadError && [401,403].includes(error.status)) changed.current();
        setCards(null); setListError(true);
      } finally { busy = false; }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [actorId, listCursor, attempt]);
  useEffect(() => {
    setDetail(null); setDetailError(false);
    if (!selected) return;
    const controller = new AbortController(); let busy = false;
    const refresh = async () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      try { const result = await readMessageWindow(actorId, selected, controller.signal, historyCursor); if (!controller.signal.aborted) { setDetail(result); setDetailError(false); } }
      catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof BoundedMessageReadError && [401,403].includes(error.status)) changed.current();
        setDetail(null); setDetailError(true);
      } finally { busy = false; }
    };
    void refresh();
    // Browsing an older page must not jump to the latest window or mark a
    // backwards read pointer. Foreground latest windows still refresh in 15s.
    const timer = historyCursor ? undefined : setInterval(() => void refresh(), 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [actorId, selected, historyCursor, attempt]);
  useEffect(() => {
    if (!detail || detail.id !== selected || historyCursor) return;
    const remote = [...detail.messages].reverse().find(message => message.authorId !== actorId);
    if (!remote) return;
    const key = `${detail.id}:${remote.id}`;
    if (readKey.current === key) return;
    readKey.current = key;
    const controller = new AbortController();
    let confirmed = false;
    void confirmMessageWindowRead(actorId, detail.id, remote.id, controller.signal)
      .then(() => { if (!controller.signal.aborted) { confirmed = true; setReadError(false); } })
      .catch(error => {
        if (controller.signal.aborted) return;
        readKey.current = ""; setReadError(true);
        if (error instanceof BoundedMessageReadError && [401,403].includes(error.status)) changed.current();
      });
    return () => { controller.abort(); if (!confirmed && readKey.current === key) readKey.current = ""; };
  }, [actorId, detail, selected, historyCursor]);
  async function send() {
    const controller = lifetime.current;
    if (!detail || detail.id !== selected || sendLock.current || !controller || controller.signal.aborted || (!body.trim() && !pending.current)) return;
    const request = pending.current ?? { conversationId: detail.id, body: body.trim(), id: crypto.randomUUID(), version: detail.version };
    pending.current = request; sendLock.current = true; setSending(true); setSendError(false);
    try {
      await sendWindowMessage(actorId, request, controller.signal);
      if (controller.signal.aborted) return;
      pending.current = null; setBody(""); setHistoryCursor(null); setAttempt(n => n + 1);
    } catch (error) {
      if (!controller.signal.aborted) {
        setSendError(true);
        if (error instanceof BoundedMessageReadError && [401,403].includes(error.status)) { setDetail(null); setCards(null); changed.current(); }
      }
    }
    finally { sendLock.current = false; if (!controller.signal.aborted) setSending(false); }
  }
  const retry = <button className="btn btn-ghost" onClick={() => setAttempt(n => n + 1)}>{t({ zh: "重试", en: "Retry" })}</button>;
  return <div className={`ri-thread-workspace${selected ? " has-open-thread" : ""}`}>
    <aside className="ri-thread-list"><div className="ri-thread-scroll scroll">
      {listError ? <p role="alert">{t({ zh: "消息列表读取失败。", en: "Could not load conversations." })}{retry}</p> : !cards ? <p role="status">{t({ zh: "正在读取消息…", en: "Loading messages…" })}</p> : !cards.items.length ? <p>{t({ zh: "暂无消息", en: "No messages yet" })}</p> : null}
      {cards?.items.map(item => <button type="button" className="ri-row" key={item.id} disabled={sending || Boolean(pending.current)} onClick={() => { setSelected(item.id); setHistoryCursor(null); setBody(""); setSendError(false); readKey.current = ""; }}>
        <Avatar letter={Array.from(item.name)[0] || "?"} g="g-violet" size={38}/><span className="ri-row-main"><span className="ri-row-name">{item.name}</span><span className="ri-row-preview">{item.preview}</span><span className="ri-row-time">{formatOrbitDateTime(item.updatedAt,language)}</span></span>{item.unread>0 && <span className="ri-row-unread">{item.unread}</span>}
      </button>)}
      {listCursor && <button className="btn btn-ghost" onClick={() => setListCursor(null)}>{t({ zh: "最新会话", en: "Latest conversations" })}</button>}
      {cards?.nextCursor && <button className="btn btn-ghost" onClick={() => setListCursor(cards.nextCursor)}>{t({ zh: "下一页会话", en: "Next conversations" })}</button>}
    </div></aside>
    <section className="ri-thread-main" style={{ gridColumn: "2 / -1" }}>
      {!selected ? <p>{t({ zh: "选择联系人查看对话。", en: "Choose a contact to view messages." })}</p> : detailError ? <p role="alert">{t({ zh: "对话不可用，请重新加载。", en: "Conversation unavailable. Reload to continue." })}{retry}</p> : !detail ? <p role="status">{t({ zh: "正在读取对话…", en: "Loading conversation…" })}</p> : <div className="ri-detail">
        <div className="ri-detail-head"><button className="btn btn-ghost" disabled={sending || Boolean(pending.current)} onClick={() => setSelected(null)}>{t({ zh: "返回消息", en: "Back to messages" })}</button><h3 className="ri-detail-subject">{detail.name}</h3></div>
        <NotificationDeliverySettings key={detail.id} conversationId={detail.id}/>
        <div>{detail.nextCursor && <button className="btn btn-ghost" onClick={() => setHistoryCursor(detail.nextCursor)}>{t({ zh: "更早的消息", en: "Earlier messages" })}</button>}{historyCursor && <button className="btn btn-ghost" onClick={() => setHistoryCursor(null)}>{t({ zh: "返回最新消息", en: "Latest messages" })}</button>}</div>
        {readError && <p role="alert">{t({ zh: "已读状态尚未保存，下次刷新会重试。", en: "Read state was not saved. It will retry." })}</p>}
        <div className="ri-msgs">{detail.messages.map(message => <article className={`ri-msg${message.authorId===actorId ? " is-me" : ""}`} key={message.id}><div className="ri-msg-meta"><strong className="ri-msg-sender">{message.author}</strong><time className="ri-msg-time">{formatOrbitDateTime(message.at,language)}</time></div><p className="ri-msg-body" style={{overflowWrap:"anywhere"}}>{message.body}</p></article>)}</div>
        <div className="ri-composer"><label className="ri-composer-label">{t({ zh: "回复消息", en: "Reply" })}</label><textarea className="field ri-composer-input" aria-label={t({ zh: "回复消息", en: "Reply" })} value={body} onChange={e => setBody(e.target.value)} disabled={sending || Boolean(pending.current)} />
          {sendError && <p role="alert">{t({ zh: "尚未确认送达，重试不会重复发送。", en: "Delivery unconfirmed. Retrying will not duplicate it." })}</p>}
          <button className="btn btn-primary" disabled={sending || (!body.trim() && !pending.current)} onClick={() => void send()}>{t({ zh: sending ? "发送中…" : sendError ? "重试发送" : "发送", en: sending ? "Sending…" : sendError ? "Retry send" : "Send" })}</button>
        </div>
      </div>}
    </section>
  </div>;
}
