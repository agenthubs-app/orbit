"use client";

// R27 会場モード（Web 1440：b2 #36；390：b12 #364「会場モードは App で」）。数据：GET /api/events/[id]/venue（只读组合，
// 未报名 = not_registered，页面不调运营路由，所以没有 403）；交换名片走现有 /operations/contact-requests*，
// メモ（自分だけ）走 /venue/memo。示例数据（sample）只在本页里变，不写库。
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import type { EventVenuePerson, EventVenueResponse } from "../../../../../shared/contract/event-venue";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { eventVenueMemoResultSchema } from "../../../../../shared/api-schema/event-venue";
import { ShellPage } from "../shell/slots";
import { Drawer, Icon, Orbit2026Scope, ToastProvider, useToast } from "../ui";
import { translator as assessTranslator } from "./AssessmentDetail";
import { journeyTranslator, type JourneyT } from "./DiscoverTab";
import { WEEK, parts, useWide } from "./EventDetail";
import { eventsCall } from "./events-api";
import { journeyApi } from "./journey-api";
import styles from "./events.module.css";
import d from "./discover.module.css";
import x from "./detail.module.css";
import v from "./venue.module.css";

type SpeechLike = { lang: string; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; start: () => void };
type Tab = "now" | "recs" | "people" | "groups" | "map" | "agenda";
const TABS: readonly { key: Tab; label: "segNow" | "segRecs" | "tabPeople" | "segGroups" | "segMap" | "tabAgenda" }[] = [
  { key: "now", label: "segNow" }, { key: "recs", label: "segRecs" }, { key: "people", label: "tabPeople" },
  { key: "groups", label: "segGroups" }, { key: "map", label: "segMap" }, { key: "agenda", label: "tabAgenda" },
];
const anyData = z.unknown();
const id = (value: string) => encodeURIComponent(value);
const surname = (name: string) => name.trim().split(/\s+/)[0] ?? name;
/** b2 #36：卡片按位置 c1 / c2 / c3（lav / pink / blue）。 */
const VENUE_TONES = ["c1", "c2", "c3"] as const;
const venueTone = (index: number) => x[VENUE_TONES[index % VENUE_TONES.length]!]!;

/** 「20:22」：服务端时钟（now）换成东京时间，页面不自己取 new Date()。 */
function clock(iso: string): string { return parts(iso)?.hm.replace(/^0/, "") ?? ""; }

function exchangeChip(person: EventVenuePerson, t: JourneyT) {
  if (person.exchange === "incoming") return <span className={`${styles.chip} ${styles.c_lav}`}>{t("exIncoming")}</span>;
  if (person.exchange === "requested") return <span className={styles.chip}>{t("exRequested")}</span>;
  if (person.exchange === "exchanged") return <span className={`${styles.chip} ${styles.c_teal}`}>{t("exExchanged")}</span>;
  return null;
}

// ---------- 関係マップ（b2 #36：固定 8 个位置，按关系分组落位；连线 = 我 → 对方 + 共通の知り合い） ----------
const SLOTS: Readonly<Record<EventVenuePerson["relation"], readonly (readonly [number, number])[]>> = {
  exchanged: [[276, 78], [292, 196]],
  known: [[44, 150], [180, 46]],
  other: [[168, 296], [290, 296]],
  wanted: [[78, 82], [66, 236]],
};
const CENTER = [177, 170] as const;
const LINE: Readonly<Record<EventVenuePerson["relation"], { stroke: string; width: number; dash?: string }>> = {
  exchanged: { stroke: "var(--plum-700)", width: 2.2 },
  known: { stroke: "var(--plum-500)", width: 1.5 },
  other: { stroke: "var(--surface-3)", width: 1.2 },
  wanted: { dash: "4 4", stroke: "var(--plum-300)", width: 1.6 },
};

export function RelationMap({ data, t, size = 460 }: { data: EventVenueResponse; t: JourneyT; size?: number }) {
  const used: Record<string, number> = {};
  const nodes = data.attendees.flatMap((person) => {
    const slot = SLOTS[person.relation][used[person.relation] ?? 0];
    if (!slot) return [];
    used[person.relation] = (used[person.relation] ?? 0) + 1;
    return [{ person, x: slot[0], y: slot[1] }];
  });
  const at = (name: string) => nodes.find((node) => surname(node.person.name) === name);
  const mutual = data.mutualHint ? [at(data.mutualHint.via), at(data.mutualHint.name)] : [];
  const tables = nodes.flatMap((a, i) => nodes.slice(i + 1).filter((b) => a.person.table && a.person.table === b.person.table && a.person.relation === "exchanged" && b.person.relation === "exchanged").map((b) => [a, b] as const));
  return (
    <svg width={size} height={size * (340 / 354)} viewBox="0 0 354 340" className={v.map} role="img" aria-label={t("mapTitle")}>
      {tables.map(([a, b]) => <line key={`${a.person.attendeeId}-${b.person.attendeeId}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--surface-3)" strokeWidth={1.2} />)}
      {mutual[0] && mutual[1] ? <line x1={mutual[0].x} y1={mutual[0].y} x2={mutual[1].x} y2={mutual[1].y} stroke="var(--plum-300)" strokeWidth={1.2} /> : null}
      {nodes.map(({ person, x: nx, y: ny }) => { const line = LINE[person.relation]; return <line key={`l-${person.attendeeId}`} x1={CENTER[0]} y1={CENTER[1]} x2={nx} y2={ny} stroke={line.stroke} strokeWidth={line.width} strokeDasharray={line.dash} />; })}
      {nodes.map(({ person, x: nx, y: ny }) => {
        const r = person.relation === "other" ? 15 : 19;
        const fill = person.relation === "exchanged" ? "var(--plum-700)" : person.relation === "known" ? "var(--plum-300)" : person.relation === "wanted" ? "var(--plum-100)" : "var(--surface-3)";
        const ink = person.relation === "exchanged" ? "var(--on-accent)" : person.relation === "known" ? "var(--plum-900)" : person.relation === "wanted" ? "var(--ink)" : "var(--ink-3)";
        return (
          <g key={`n-${person.attendeeId}`}>
            <circle cx={nx} cy={ny} r={r} fill={fill} {...(person.relation === "wanted" ? { stroke: "var(--plum-500)", strokeDasharray: "3 3", strokeWidth: 1.5 } : {})} />
            <text x={nx} y={ny} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={800} fill={ink}>{person.initial}</text>
            <text x={nx} y={ny + 31} textAnchor="middle" fontSize={10} fill="var(--ink-3)">{surname(person.name)}</text>
          </g>
        );
      })}
      <circle cx={CENTER[0]} cy={CENTER[1]} r={27} fill="var(--ink)" />
      <text x={CENTER[0]} y={CENTER[1]} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={800} fill="var(--bg)">{t("mapYou")}</text>
    </svg>
  );
}

function MapLegend({ t }: { t: JourneyT }) {
  const dot = (stroke: string, dashed = false) => <svg width={22} height={6} aria-hidden="true"><line x1={0} y1={3} x2={22} y2={3} stroke={stroke} strokeWidth={2.2} strokeDasharray={dashed ? "4 4" : undefined} /></svg>;
  return (
    <div className={`${styles.row} ${v.legend}`}>
      <span className={styles.row}>{dot("var(--plum-700)")}{t("exExchanged")}</span>
      <span className={styles.row}>{dot("var(--plum-500)")}{t("legendKnown")}</span>
      <span className={styles.row}>{dot("var(--plum-300)", true)}{t("legendWanted")}</span>
      <span className={styles.row}>{dot("var(--surface-3)")}{t("legendOther")}</span>
    </div>
  );
}

function PersonCard({ person, index, selected, t, onSelect, onRequest }: { person: EventVenuePerson; index: number; selected: boolean; t: JourneyT; onSelect: () => void; onRequest: () => void }) {
  return (
    <div role="button" tabIndex={0} className={`${styles.evc} ${styles.span4} ${v.pcard} ${selected ? styles.sel : ""}`} data-venue-person={person.attendeeId}
      onClick={onSelect} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onSelect(); } }}>
      <div className={styles.row} style={{ gap: 12 }}>
        <div className={`${x.av} ${venueTone(index)} ${v.av46}`}>{person.initial}</div>
        <div className={v.nameCol}><b>{person.name}</b><div className={`${styles.lbl} ${d.ell}`}>{[person.org, person.role].filter(Boolean).join(" · ")}</div></div>
        {exchangeChip(person, t)}
      </div>
      {person.why ? <div className={styles.sub}>{person.why}</div> : null}
      <div className={`${styles.row} ${v.pfoot}`}>
        {person.table ? <span className={`${styles.chip} ${styles.c_lav} ${v.tchip}`}><Icon name="pin" size={16} />{t("tableChip", { t: person.table })}</span> : null}
        {person.exchange === "exchanged" ? null : (
          <button type="button" className={`btn ${styles.btn} ${styles.sm} ${styles.primary} ${v.req}`} aria-disabled={person.exchange === "requested"} onClick={(ev) => { ev.stopPropagation(); if (person.exchange !== "requested") onRequest(); }}>{t("requestExchange")}</button>
        )}
      </div>
    </div>
  );
}

function VenueInner({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  const t = useMemo(() => journeyTranslator(language), [language]);
  const at = useMemo(() => assessTranslator(language), [language]);
  const toast = useToast();
  const [data, setData] = useState<EventVenueResponse | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("now");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seatWhy, setSeatWhy] = useState(false);
  const [personWhy, setPersonWhy] = useState(false);
  const [memo, setMemo] = useState("");
  const [openerPage, setOpenerPage] = useState(0);
  const [phone, setPhone] = useState(false);
  const [webAnyway, setWebAnyway] = useState(false);
  // 1024：右栏收起（b12 #362 没有右栏），点人在抽屉里看参加者の詳細。
  const wide = useWide();
  const [drawer, setDrawer] = useState(false);

  const load = () => journeyApi.venue(eventId).then((res) => { if (res.ok) setData(res.data); else setMissing(true); });
  useEffect(() => { void load(); }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const people = useMemo(() => {
    if (!data) return [] as EventVenuePerson[];
    const seen = new Map<string, EventVenuePerson>();
    for (const person of [...data.recommendations, ...data.nextOrder, ...data.attendees]) if (!seen.has(person.attendeeId)) seen.set(person.attendeeId, person);
    return [...seen.values()];
  }, [data]);
  const selected = people.find((person) => person.attendeeId === selectedId) ?? data?.recommendations[0] ?? null;
  useEffect(() => { setMemo(selected?.memo ?? ""); setPersonWhy(false); }, [selected?.attendeeId, selected?.memo]);

  const patchPerson = (attendeeId: string, patch: Partial<EventVenuePerson>) => setData((current) => {
    if (!current) return current;
    const apply = (person: EventVenuePerson) => (person.attendeeId === attendeeId ? { ...person, ...patch } : person);
    return { ...current, attendees: current.attendees.map(apply), nextOrder: current.nextOrder.map(apply), recommendations: current.recommendations.map(apply) };
  });
  const requestSwap = async (person: EventVenuePerson) => {
    if (!data?.sample) {
      const res = await eventsCall(`/api/events/${id(eventId)}/operations/contact-requests`, { body: JSON.stringify({ expectedRevision: null, targetParticipantId: person.participantId }), method: "POST" }, anyData);
      if (!res.ok) { toast.error(at("genericError")); return; }
      void load();
    }
    patchPerson(person.attendeeId, { exchange: "requested" });
    toast.success(t("swapRequested"));
  };
  const respond = async (person: EventVenuePerson, accept: boolean) => {
    if (!data?.sample) {
      if (!person.requestId || person.requestRevision == null) return;
      const res = await eventsCall(`/api/events/${id(eventId)}/operations/contact-requests/${id(person.requestId)}/respond`, { body: JSON.stringify({ accept, expectedRevision: person.requestRevision }), method: "POST" }, anyData);
      if (!res.ok) { toast.error(at("genericError")); return; }
      void load();
    }
    patchPerson(person.attendeeId, accept ? { exchange: "exchanged", relation: "exchanged" } : { exchange: "none" });
    if (accept) toast.success(t("swapped"));
  };
  const saveMemo = async () => {
    if (!selected) return;
    if (!data?.sample) {
      const res = await eventsCall(`/api/events/${id(eventId)}/venue/memo`, { body: JSON.stringify({ attendeeId: selected.attendeeId, text: memo }), method: "POST" }, eventVenueMemoResultSchema);
      if (!res.ok) { toast.error(at("genericError")); return; }
    }
    patchPerson(selected.attendeeId, { memo: memo.trim() || null });
    toast.success(t("memoSaved"));
  };
  // メモは声でも書ける（Web Speech があれば）；Enter / フォーカスが外れたら保存。
  const dictateMemo = () => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechLike; webkitSpeechRecognition?: new () => SpeechLike };
    const Speech = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Speech) { void saveMemo(); return; }
    const recognition = new Speech();
    recognition.lang = language === "zh" ? "zh-CN" : language === "en" ? "en-US" : "ja-JP";
    recognition.onresult = (ev) => setMemo((value) => `${value}${ev.results[0]?.[0]?.transcript ?? ""}`);
    recognition.start();
  };
  const slotParts = (iso: string) => { const p = parts(iso); return p ? { date: `${p.month}/${p.day}(${WEEK[language][p.wd]})`, time: p.hm } : { date: "", time: "" }; };
  const draftMeeting = async () => {
    if (!selected || !data?.meetingSlots?.length) return;
    const slots = data.meetingSlots.map((slot) => { const s = slotParts(slot); return `${s.date} ${s.time}`; }).join(t("listSep"));
    try { await navigator.clipboard.writeText(t("meetDraft", { name: surname(selected.name), slots })); toast.success(t("draftCopied")); } catch { toast.error(at("genericError")); }
  };

  const detailHref = `/app/events/${id(eventId)}`;
  const exit = <a className={`btn ${styles.btn} ${styles.sm}`} href={detailHref}><Icon name="x" size={16} />{t("liveExit")}</a>;

  if (phone && !webAnyway) {
    return (
      <>
        <ShellPage title={t("liveTitle")} subtitle={data?.title ?? ""} left={<a className={`btn ${x.rbtn}`} href={detailHref} aria-label={t("back")}><Icon name="left" size={16} /></a>} rightRail={false} phoneBare />
        <div className={`${styles.card} ${v.appOnly}`} data-venue-app-only="">
          <div className={v.appEmoji}>📱</div>
          <b className={v.appTitle}>{t("appOnlyTitle")}</b>
          <div className={`${styles.sub} ${v.appSub}`}>{t("appOnlySub")}</div>
          <a className={`btn ${styles.btn} ${styles.primary} ${v.xl}`} href={`orbit://events/${id(eventId)}/live`}>{t("openApp")}</a>
          <button type="button" className={`btn ${styles.btn} ${v.ghost}`} onClick={() => setWebAnyway(true)}>{t("continueWeb")}</button>
        </div>
      </>
    );
  }

  if (missing || (data && data.state !== "checked_in")) {
    const message = missing ? t("notFound") : data?.state === "not_registered" ? t("liveNotRegistered") : data?.state === "before_check_in" ? t("liveBeforeCheckIn", { n: data.checkIn?.receptionNumber ?? "—" }) : t("liveEnded");
    return (
      <>
        <ShellPage title={data?.title ?? t("liveTitle")} left={exit} rightRail={false} />
        <div className={`${styles.card} ${x.missing}`} data-venue-state={data?.state ?? "missing"}>
          <b>{message}</b>
          {data?.state === "ended" ? <div className={v.stateAct}><a className={`btn ${styles.btn} ${styles.primary}`} href={`${detailHref}/after`}>{t("toAfter")}</a></div> : null}
        </div>
      </>
    );
  }
  if (!data) return <ShellPage title="" left={exit} rightRail={false} />;

  const round = data.round;
  const openers = data.openers.length > 2 ? [0, 1].map((n) => data.openers[(openerPage * 2 + n) % data.openers.length]!) : data.openers;
  const subtitle = <><span className={v.livedot}>LIVE</span> {round ? t("liveRound", { i: round.index, n: round.total, time: clock(data.now) }) : clock(data.now)}</>;
  const touch = selected ? [selected.why?.split("。")[0], data.mutualHint && surname(selected.name) === data.mutualHint.name ? t("mutualKnown", { name: data.mutualHint.via }) : null].filter(Boolean).join("。") : "";

  const rail = selected ? (
    <div className={`${styles.rail} ${d.rail}`} data-venue-detail={selected.attendeeId}>
      <h4 className={`${styles.railH} ${d.railH}`}><Icon name="user" size={16} />{t("detailTitle")}</h4>
      <div className={styles.row} style={{ gap: 12 }}>
        <div className={`${x.av} ${venueTone(Math.max(0, data.recommendations.findIndex((item) => item.attendeeId === selected.attendeeId)))} ${v.avLg}`}>{selected.initial}</div>
        <div><b className={v.detailName}>{selected.name}</b><div className={styles.lbl}>{[selected.org, selected.role, selected.table].filter(Boolean).join(" · ")}</div></div>
      </div>
      {selected.exchange === "incoming" ? (
        <div className={`${styles.card} ${v.rcard}`}>
          <div className={styles.row} style={{ gap: 8 }}><span className={`${styles.emo} ${styles.t_lav} ${v.emoSm}`}>📇</span><b className={v.rtitle}>{t("incomingTitle")}</b></div>
          <div className={`${styles.row} ${v.ractions}`}>
            <button type="button" className={`btn ${styles.btn} ${styles.sm} ${styles.primary} ${v.grow}`} onClick={() => void respond(selected, true)}>{t("acceptSwap")}</button>
            <button type="button" className={`btn ${styles.btn} ${styles.sm} ${v.grow}`} onClick={() => void respond(selected, false)}>{t("ignoreSwap")}</button>
          </div>
        </div>
      ) : null}
      {touch ? (
        <div className={`${styles.card} ${v.rcard}`}>
          <div className={styles.row} style={{ gap: 6 }}><b className={v.rtitle}>{t("touchpoint")}</b>{selected.whyDetail ? <button type="button" className={`btn ${d.why}`} aria-expanded={personWhy} aria-label={t("whyLabel")} onClick={() => setPersonWhy((value) => !value)}>?</button> : null}</div>
          <div className={`${styles.sub} ${v.touch}`}>{touch}</div>
          {personWhy && selected.whyDetail ? <div className={d.whyBody}>{selected.whyDetail}</div> : null}
        </div>
      ) : null}
      <div className={`${styles.card} ${v.rcard}`}>
        <div className={`${styles.lbl} ${v.memoLbl}`}>{t("memoTitle")}</div>
        <div className={styles.row} style={{ gap: 8 }}>
          <input className={v.input} value={memo} maxLength={200} placeholder={t("memoPlaceholder")} aria-label={t("memoTitle")} onChange={(ev) => setMemo(ev.target.value)} onBlur={() => { if (memo.trim() !== (selected.memo ?? "")) void saveMemo(); }} onKeyDown={(ev) => { if (ev.key === "Enter") void saveMemo(); }} />
          <button type="button" className={`btn ${d.lbtn}`} aria-label={t("voiceAnswer")} onClick={dictateMemo}><Icon name="mic" size={16} /></button>
        </div>
      </div>
      {data.meetingSlots?.length ? (
        <div className={`${styles.card} ${v.rcard}`}>
          <div className={`${styles.lbl} ${v.slotsLbl}`}>{t("meetProposeTitle")}</div>
          {data.meetingSlots.map((slot, index) => { const s = slotParts(slot); return (
            <div key={slot} className={`${styles.row} ${v.slot}`}><span className={`${styles.lbl} ${v.slotN}`}>{t("slotN", { n: index + 1 })}</span><b className={v.grow}>{s.date}</b><b>{s.time}</b></div>
          ); })}
          <button type="button" className={`btn ${styles.btn} ${styles.sm} ${v.draft}`} onClick={() => void draftMeeting()}><Icon name="pen" size={16} />{t("makeDraft")}</button>
          <div className={`${styles.lbl} ${v.draftNote}`}>{selected.isOrbitUser ? t("draftNoteOrbit") : t("draftNoteMail")}</div>
        </div>
      ) : null}
    </div>
  ) : false;

  const recCards = (list: readonly EventVenuePerson[]) => list.map((person, index) => (
    <PersonCard key={person.attendeeId} person={person} index={index} selected={selected?.attendeeId === person.attendeeId} t={t} onSelect={() => { setSelectedId(person.attendeeId); if (!wide) setDrawer(true); }} onRequest={() => void requestSwap(person)} />
  ));
  const agenda = (
    <div className={`${styles.card} ${tab === "agenda" ? styles.span12 : x.span5}`} data-venue-agenda="">
      <div className={styles.cardH}><h3>{t("tabAgenda")}</h3></div>
      {(() => { const nowIndex = data.agenda.findIndex((item) => item.now); return data.agenda.map((item, index) => (
        <div key={`${item.at}-${item.title}`} className={`${x.tline} ${nowIndex >= 0 && index < nowIndex ? v.past : ""}`}>
          <time>{item.at}</time><span className={`${x.dot} ${item.now ? v.dotNow : nowIndex >= 0 && index < nowIndex ? v.dotPast : ""}`} />
          <div><b>{item.title}</b><span className={styles.lbl}>{item.detail ?? ""}</span></div>
        </div>
      )); })()}
    </div>
  );
  const map = (
    <div className={`${styles.card} ${tab === "map" ? styles.span12 : x.span7} ${v.mapcard}`} data-venue-map="">
      <div className={styles.cardH}><h3>{t("mapTitle")}</h3><MapLegend t={t} /></div>
      <div className={v.mapWrap}><RelationMap data={data} t={t} /></div>
    </div>
  );

  return (
    <>
      <ShellPage title={data.title} subtitle={subtitle} left={exit} right={<button type="button" className={`btn ${x.rbtn}`} aria-label={t("checkInQr")}><Icon name="scan" size={20} /></button>} rightRail={wide ? rail : false} />
      {!wide && rail ? <Drawer open={drawer} onClose={() => setDrawer(false)} title={t("detailTitle")} size="sm">{rail}</Drawer> : null}
      <div className={styles.wgrid} data-venue={eventId}>
        <div className={styles.span12}>
          <div className={styles.seg} role="tablist">
            {TABS.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={`btn ${styles.segBtn} ${tab === item.key ? styles.segOn : ""}`} onClick={() => setTab(item.key)}>{t(item.label)}</button>)}
          </div>
        </div>
        {tab === "now" ? (
          <>
            {data.mySeat ? (
              <div className={`${styles.card} ${styles.span4} ${v.seat}`} data-venue-seat="">
                <div className={styles.lbl}>{t("seatLbl", { n: round?.index ?? 1 })}</div>
                <div className={v.big}>{data.mySeat.table}</div>
                <div className={v.rdots}>
                  {(data.seats ?? []).map((seat) => <div key={seat.round} className={round && seat.round < round.index ? v.rdPast : round && seat.round === round.index ? v.rdNow : undefined}><b>{seat.table}</b>R{seat.round}</div>)}
                </div>
                {data.mySeat.why ? (
                  <>
                    <div className={`${styles.row} ${v.seatWhy}`}><span className={`${styles.sub} ${v.grow}`}>{t("seatWhy", { why: data.mySeat.why })}</span>{data.mySeat.whyDetail ? <button type="button" className={`btn ${d.why}`} aria-expanded={seatWhy} aria-label={t("whyLabel")} onClick={() => setSeatWhy((value) => !value)}>?</button> : null}</div>
                    {seatWhy && data.mySeat.whyDetail ? <div className={d.whyBody}>{data.mySeat.whyDetail}</div> : null}
                  </>
                ) : null}
              </div>
            ) : null}
            {round ? (
              <div className={`${styles.card} ${styles.span4}`} data-venue-round="">
                <div className={`${styles.row} ${styles.between}`}><span className={styles.lbl}>{t("nowLbl")}</span><span className={styles.chip}>{t("remainingMin", { m: round.remainingMinutes })}</span></div>
                <b className={v.roundTitle}>{`${round.title} R${round.index}`}</b>
                {round.theme ? <div className={styles.lbl}>{t("themeLine", { theme: round.theme })}</div> : null}
                <div className={`${x.bar} ${v.thin}`}><i style={{ width: `${Math.round(Math.max(0, Math.min(1, 1 - round.remainingMinutes / Math.max(1, (Date.parse(round.endsAt) - Date.parse(round.startsAt)) / 60_000))) * 100)}%` }} /></div>
                <div className={x.mini3}>
                  <div><span className={styles.lbl}>{t("statExchanged")}</span><b>{data.stats.exchanged}</b></div>
                  <div><span className={styles.lbl}>{t("itemTarget")}</span><b>{data.stats.wantedMet}<small className={styles.lbl}>/{data.stats.wantedTotal}</small></b></div>
                  <div><span className={styles.lbl}>{t("statIncoming")}</span><b>{data.stats.incoming}</b></div>
                </div>
              </div>
            ) : null}
            {openers.length ? (
              <div className={`${styles.card} ${styles.span4}`} data-venue-openers="">
                <div className={styles.cardH}><h3>{t("openersTitle")}</h3>{data.openers.length > 2 ? <button type="button" className={`btn ${d.lbtn}`} aria-label={t("openersMore")} onClick={() => setOpenerPage((n) => n + 1)}><Icon name="refresh" size={16} /></button> : null}</div>
                {openers.map((opener) => <div key={opener} className={v.ice}><span>💬</span><span>{t("openerQuote", { text: opener })}</span></div>)}
              </div>
            ) : null}
            <div className={`${styles.span12} ${styles.cardH} ${v.recsHead}`}><h3>{t("recsTitle")}</h3><span className={styles.lbl}>{t("recsHint")}</span></div>
            {recCards(data.recommendations)}
            {map}
            {agenda}
          </>
        ) : tab === "recs" ? recCards(data.nextOrder.length ? data.nextOrder : data.recommendations)
          : tab === "people" ? recCards(data.attendees)
            : tab === "groups" ? (data.groups?.others ?? []).map((group) => (
              <div key={group.table} className={`${styles.card} ${styles.span4}`} data-venue-group={group.table}>
                <div className={`${styles.row} ${styles.between}`}><b>{t("tableChip", { t: group.table })}</b><span className={styles.lbl}>{group.count}</span></div>
                {group.theme ? <div className={styles.sub}>{t("themeLine", { theme: group.theme })}</div> : null}
                <div className={`${x.avs} ${v.groupAvs}`}>{group.initials.map((initial, index) => <span key={`${initial}-${index}`} className={`${x.av} ${venueTone(index)}`}>{initial}</span>)}</div>
              </div>
            ))
              : tab === "map" ? map : agenda}
      </div>
    </>
  );
}

export function VenuePage({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ToastProvider>
        <VenueInner eventId={eventId} language={language} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}
