"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOrbitLanguage } from "../orbit-language-context";
import { formatOrbitDateTime } from "../orbit-datetime";
import { NotificationDeliverySettings } from "../settings/notification-delivery-settings";
import { Avatar, Icon, MacTile, Orbit2026Scope, SearchField } from "../orbit-2026/ui";
import { ShellPage } from "../orbit-2026/shell/slots";
import shellStyles from "../orbit-2026/shell/shell.module.css";
import ws from "./inbox-workspace.module.css";
import { inboxListTime } from "./inbox-list-time";
import { BoundedMessageReadError, filterMessageCards, readMessageCards, readMessageWindow, confirmMessageWindowRead, readReplyDraft, saveReplyDraft, type MessageCardPageView, type MessageWindowView } from "./bounded-contact-messages-view-model";

/** List summaries and one selected history window are independent resources. */
export function BoundedContactMessagesTab({ actorId, onIdentityChanged }: { actorId: string; onIdentityChanged: () => void }) {
  const { t, language } = useOrbitLanguage();
  const [cards, setCards] = useState<MessageCardPageView | null>(null);
  const [search, setSearch] = useState("");
  const [listCursor, setListCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [detail, setDetail] = useState<MessageWindowView | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [listError, setListError] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [readError, setReadError] = useState(false);
  const [body, setBody] = useState("");
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const bodyEdited = useRef(false);
  // "Saved" is bound to the exact text and conversation of one save request
  // (Sprint 0122, Codex 104-A); one save is in flight at a time.
  const draftSave = useRef<{ conversationId: string; body: string } | null>(null);
  const [draftSaveInFlight, setDraftSaveInFlight] = useState(false);
  const currentBody = useRef(body); currentBody.current = body;
  const currentSelected = useRef(selected); currentSelected.current = selected;
  const changed = useRef(onIdentityChanged); changed.current = onIdentityChanged;
  const lifetime = useRef<AbortController | null>(null);
  const readKey = useRef("");
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
  // Load the saved reply draft once per opened conversation, unless the user
  // already started typing.
  useEffect(() => {
    bodyEdited.current = false; setDraftState("idle"); draftSave.current = null; setDraftSaveInFlight(false);
    if (!selected) return;
    const controller = new AbortController();
    void readReplyDraft(actorId, selected, controller.signal)
      .then(draft => { if (!controller.signal.aborted && !bodyEdited.current && draft.body) setBody(draft.body); })
      .catch(error => {
        if (controller.signal.aborted) return;
        if (error instanceof BoundedMessageReadError && [401,403].includes(error.status)) changed.current();
      });
    return () => controller.abort();
  }, [actorId, selected]);
  async function saveDraft() {
    const controller = lifetime.current;
    if (!detail || detail.id !== selected || !controller || controller.signal.aborted || draftSave.current) return;
    const request = { conversationId: detail.id, body };
    draftSave.current = request; setDraftSaveInFlight(true); setDraftState("saving");
    let failure: unknown = null;
    try { await saveReplyDraft(actorId, request.conversationId, request.body, controller.signal); }
    catch (error) { failure = error ?? new Error("Reply draft not saved"); }
    if (controller.signal.aborted || draftSave.current !== request) return;
    draftSave.current = null; setDraftSaveInFlight(false);
    if (failure instanceof BoundedMessageReadError && [401,403].includes(failure.status)) changed.current();
    // Text edited during the save stays unsaved; the edit already reset the status.
    if (currentSelected.current !== request.conversationId || currentBody.current !== request.body) return;
    setDraftState(failure ? "error" : "saved");
  }
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
  const retry = <button className="btn btn-ghost" onClick={() => setAttempt(n => n + 1)}>{t({ zh: "重试", en: "Retry", ja: "再試行" })}</button>;
  const visibleCards = filterMessageCards(cards?.items ?? [], search);
  const card = cards?.items.find(item => item.id === selected) ?? null;
  const unread = (cards?.items ?? []).reduce((sum, item) => sum + item.unread, 0);
  const unreadThreads = (cards?.items ?? []).filter(item => item.unread > 0).length;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dayOf = (at: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
  const today = dayOf(new Date().toISOString());
  const timeOf = (at: string) => new Intl.DateTimeFormat(language, { hour: "numeric", minute: "2-digit" }).format(new Date(at));
  const dayLabel = (at: string) => dayOf(at) === today ? t({ zh: "今天", en: "Today", ja: "今日" }) : new Intl.DateTimeFormat(language, { month: "long", day: "numeric", weekday: "short" }).format(new Date(at));
  const pick = (id: string) => { setSelected(id); setHistoryCursor(null); setBody(""); readKey.current = ""; };
  // b5 D05 rail: この相手 for the open thread (only what the conversation itself knows), otherwise メッセージについて.
  const railName = card?.name ?? detail?.name ?? null;
  const rail = useMemo(() => <Orbit2026Scope language={language}><div className={`${shellStyles.railBody} ${ws.rail}`}>{selected && railName ? <>
      <h2 className={ws.railHead}><Icon name="users" size={16}/>{t({ zh: "对方", en: "This contact", ja: "この相手" })}</h2>
      <section className={ws.railCard}><div className={ws.person}><Avatar name={railName} size="md"/><div><b>{railName}</b>{card ? <span className={ws.lbl}>{t({ zh: "最近往来", en: "Last exchange", ja: "最後のやり取り" })} · {formatOrbitDateTime(card.updatedAt, language)}</span> : null}</div></div></section>
    </> : <>
      <h2 className={ws.railHead}><Icon name="mail" size={16}/>{t({ zh: "关于消息", en: "About messages", ja: "メッセージについて" })}</h2>
      <section className={ws.railCard}><div className={ws.railList}>
        {([["🤝", "teal", { zh: "只和在 Orbit 上建立联系的人往来", en: "Only with people you are connected to", ja: "つながった人とだけやり取りします" }], ["📝", "lav", { zh: "回复只到草稿，不会发送", en: "Replies stay drafts; nothing is sent", ja: "返信は下書きまで。送信はしません" }], ["🔔", "apricot", { zh: "每个会话可以单独开关通知", en: "Turn notifications on or off per thread", ja: "通知はスレッドごとに切り替えられます" }]] as const).map(([emoji, tone, line]) => <div key={emoji}><MacTile emoji={emoji} tone={tone} size="sm"/><span>{t(line)}</span></div>)}
      </div></section>
      {unread > 0 ? <section className={ws.railCard}><div className={ws.lbl}>{t({ zh: "未读", en: "Unread", ja: "未読" })}</div><div className={ws.railNum}><b>{unread}</b><span className={ws.lbl}>{t({ zh: "条 · {n} 个会话", en: "· {n} threads", ja: "件 · {n} スレッド" }).replace("{n}", String(unreadThreads))}</span></div></section> : null}
    </>}</div></Orbit2026Scope>,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [language, selected, railName, card?.updatedAt, unread, unreadThreads]);
  let previousDay = "";
  return <div>
    <ShellPage rightRail={rail}/>
    <section className={`${ws.card}${selected ? " " + ws.open : ""}`} aria-label={t({ zh: "消息", en: "Messages", ja: "メッセージ" })}>
      <div className={ws.list}>
        <div className={ws.tool}><SearchField value={search} onChange={setSearch} placeholder={t({zh:"搜索会话",en:"Search conversations",ja:"スレッドを検索"})}/></div>
        {listError ? <p role="alert" className={ws.listNote}>{t({ zh: "消息列表读取失败。", en: "Could not load conversations.", ja: "メッセージを読み込めませんでした。" })}{retry}</p> : !cards ? <p role="status" className={ws.listNote}>{t({ zh: "正在读取消息…", en: "Loading messages…", ja: "メッセージを読み込み中…" })}</p> : !cards.items.length ? <p className={ws.listNote}>{t({ zh: "还没有会话", en: "No threads yet", ja: "スレッドはまだありません" })}</p> : search.trim()&&!visibleCards.length ? <p className={ws.listNote}>{t({zh:"没有匹配的会话",en:"No matching conversations",ja:"一致するスレッドはありません"})}</p> : null}
        {visibleCards.length ? <div className={ws.rows}>
          {visibleCards.map(item => <button key={item.id} type="button" aria-pressed={item.id === selected} className={`${ws.row} ${ws.msgRow}${item.unread > 0 ? " " + ws.unread : ""}${item.id === selected ? " " + ws.sel : ""}`} onClick={() => pick(item.id)}>
            <Avatar name={item.name} size="md"/>
            <span style={{minWidth:0}}><span className={ws.rowTitle}>{item.name}</span><span className={`${ws.lbl} ${ws.rowSub}`}>{item.preview}</span></span>
            <span className={ws.rowEnd}><span className={ws.lbl}>{inboxListTime(item.updatedAt,new Date().toISOString(),zone,language,t({zh:"昨天",en:"Yesterday",ja:"昨日"}))}</span>{item.unread>0?<span className={ws.badge} aria-label={t({zh:"未读 {n}",en:"{n} unread",ja:"未読 {n}"}).replace("{n}",String(item.unread))}>{item.unread}</span>:null}</span>
          </button>)}
          {listCursor && <button className={`btn ${ws.btn} ${ws.sm} ${ws.more}`} onClick={() => setListCursor(null)}>{t({ zh: "最新会话", en: "Latest conversations", ja: "最新のスレッド" })}</button>}
          {cards?.nextCursor && <button className={`btn ${ws.btn} ${ws.sm} ${ws.more}`} onClick={() => setListCursor(cards.nextCursor)}>{t({ zh: "下一页会话", en: "Next conversations", ja: "次のスレッド" })}</button>}
        </div> : null}
      </div>
      <div className={ws.pane}>
        {!selected ? cards && !cards.items.length ? <div className={ws.empty}>
          <span className={ws.emptyTile} style={{background:"var(--mac-teal)"}} aria-hidden>💬</span>
          <h3>{t({ zh: "暂无消息", en: "No messages yet", ja: "メッセージはまだありません" })}</h3>
          <p>{t({ zh: "在 Orbit 上建立联系的人发来的消息会出现在这里。回复可以先写成草稿。", en: "Messages from people you are connected to on Orbit appear here. You can draft replies.", ja: "Orbit でつながった人から届いたメッセージが、ここに並びます。返信は下書きまで作れます。" })}</p>
          <a className={`btn ${ws.btn}`} style={{marginTop:20}} href="/app/contacts"><Icon name="users" size={16}/>{t({ zh: "打开人脉", en: "Open network", ja: "人脈を開く" })}</a>
        </div> : <div className={ws.hint}><span className={ws.hintIcon}><Icon name="mail" size={22}/></span><b>{t({ zh: "选择会话，往来消息会显示在这里", en: "Choose a thread to see it here", ja: "スレッドを選ぶと、ここにやり取りが出ます" })}</b>{unread > 0 ? <span>{t({ zh: "未读 {n} 条", en: "{n} unread", ja: "未読 {n}件" }).replace("{n}", String(unread))}</span> : null}</div>
        : detailError ? <p role="alert" className={ws.listNote}>{t({ zh: "对话不可用，请重新加载。", en: "Conversation unavailable. Reload to continue.", ja: "この会話を開けません。再読み込みしてください。" })}{retry}</p> : !detail ? <p role="status" className={ws.listNote}>{t({ zh: "正在读取对话…", en: "Loading conversation…", ja: "会話を読み込み中…" })}</p> : <>
          <div className={ws.threadHead}>
            <button className={`btn ${ws.btn} ${ws.sm} ${ws.back}`} onClick={() => setSelected(null)} aria-label={t({ zh: "返回消息", en: "Back to messages", ja: "メッセージに戻る" })}><Icon name="left" size={16}/></button>
            <Avatar name={detail.name} size="md"/><h3 style={{margin:0}}><b>{detail.name}</b></h3>
            <span className={ws.spacer}/>
            <NotificationDeliverySettings key={detail.id} conversationId={detail.id} compact/>
          </div>
          <div className={ws.msgs}>
            {detail.nextCursor && <button className={`btn ${ws.older}`} onClick={() => setHistoryCursor(detail.nextCursor)}><Icon name="clock" size={14}/>{t({ zh: "更早的消息", en: "Earlier messages", ja: "過去のメッセージ" })}</button>}
            {historyCursor && <button className={`btn ${ws.older}`} onClick={() => setHistoryCursor(null)}>{t({ zh: "返回最新消息", en: "Latest messages", ja: "最新のメッセージに戻る" })}</button>}
            {readError && <p role="alert" className={ws.lbl}>{t({ zh: "已读状态尚未保存，下次刷新会重试。", en: "Read state was not saved. It will retry.", ja: "既読を保存できませんでした。次の更新時に再試行します。" })}</p>}
            {detail.messages.map(message => {
              const day = dayOf(message.at), divider = day !== previousDay; previousDay = day;
              const me = message.authorId === actorId;
              return [divider ? <span key={"d:" + day} className={ws.dateDiv}>{dayLabel(message.at)}</span> : null,
                <article key={message.id} className={`${ws.msg}${me ? " " + ws.me : ""}`}><p className={ws.bubble} style={{margin:0}}>{message.body}</p><span className={ws.lbl}>{me ? t({ zh: "你", en: "You", ja: "あなた" }) : message.author} · <time dateTime={message.at}>{timeOf(message.at)}</time></span></article>];
            })}
          </div>
          <div className={ws.composer}>
            <div className={ws.composerHead}><Icon name="pen" size={16}/>{t({ zh: "回复草稿", en: "Reply draft", ja: "返信の下書き" })}<span className={ws.lbl}>{t({ zh: "只有你能看到", en: "Only you can see it", ja: "自分だけに表示" })}</span></div>
            <textarea aria-label={t({ zh: "回复消息", en: "Reply", ja: "返信" })} value={body} onChange={e => { bodyEdited.current = true; setDraftState("idle"); setBody(e.target.value); }} />
            <div className={ws.composerFoot}>
              {draftState === "saved" ? <p role="status" className={ws.lbl} style={{margin:0}}><Icon name="check" size={14}/>{t({ zh: "草稿已保存，只有你能看到。", en: "Draft saved. Only you can see it.", ja: "下書きを保存しました。自分だけに表示されます。" })}</p>
                : draftState === "error" ? <p role="alert" className={ws.lbl} style={{margin:0}}>{t({ zh: "草稿没有保存，请重试。", en: "Draft was not saved. Try again.", ja: "下書きを保存できませんでした。再試行してください。" })}</p>
                : <span className={ws.lbl}>{t({ zh: "Orbit 不会替你发出", en: "Orbit does not send it", ja: "Orbit からは送信しません" })}</span>}
              <button className={`btn ${ws.btn} ${ws.sm} ${ws.primary}`} disabled={draftSaveInFlight} onClick={() => void saveDraft()}>{t({ zh: draftSaveInFlight ? "保存中…" : "保存草稿", en: draftSaveInFlight ? "Saving…" : "Save draft", ja: draftSaveInFlight ? "保存中…" : "下書きを保存" })}</button>
            </div>
          </div>
        </>}
      </div>
    </section>
  </div>;
}
