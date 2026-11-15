"use client";

// 「记一笔交流」弹层（docs/designs/contact-log-2026-11 ②③④；App 版 ⑤ 是底部弹出，不在这里）。
// 方式 4 选 1（默认面谈）· 日期（默认东京今天）· 选「活动上遇到」时列当天活动（可不选）·
// 聊到了：对方行业 → 对方能提供 → 对方在找 → 我能提供 → 我在找 → 我想聊的话题（空组隐藏，每组先显示 4 个）·
// 补充 · 「会记为」预览。保存 = PATCH /api/contacts/:id 的 memo 写入（带 channel／topics）。
// 读取：自己的资料走设置页共用的 /api/profile 读取缓存（新鲜就不再读）；活动列表只在选「活动上遇到」时读一次。
import { useEffect, useMemo, useState } from "react";

import type { ProfilePayload } from "../../../../../features/profile/contract";
import { FRESH, answerFresh, lastAnswer, rememberAnswer } from "../../orbit-last-answer";
import { PROFILE_ANSWER_KEY } from "../account/profile-model";
import { Modal, useToast } from "../ui";
import type { NetworkT } from "./ContactDrawer";
import {
  CONTACT_LOG_CHANNELS, CONTACT_LOG_GROUP_VISIBLE, buildContactLogPatch, contactLogCanSave, contactLogEventsOn, contactLogGroups, tokyoToday,
  type ContactLogChannel, type ContactLogEventOption, type ContactLogGroupKey,
} from "./contact-log-model";
import { networkApi } from "./network-api";
import styles from "./network.module.css";

type MyProfile = { offering: string[]; seeking: string[]; topics: string[] };
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const myProfileOf = (payload: ProfilePayload | undefined): MyProfile | null =>
  payload?.profile ? { offering: strings(payload.profile.offering), seeking: strings(payload.profile.seeking), topics: strings(payload.profile.topics) } : null;

let profileRead: Promise<MyProfile | null> | null = null;
/** One /api/profile read at a time; a fresh cached answer needs none. The drawer calls this on open so the chips are ready before 「＋ 记一笔交流」. */
function readMyProfile(): Promise<MyProfile | null> {
  const cached = myProfileOf(lastAnswer<ProfilePayload>(PROFILE_ANSWER_KEY));
  if (cached && answerFresh(PROFILE_ANSWER_KEY, FRESH.slow)) return Promise.resolve(cached);
  profileRead ??= fetch("/api/profile", { cache: "no-store" }).then((response) => (response.ok ? response.json() : null)).then((body: { success?: boolean; data?: ProfilePayload } | null) => {
    if (body?.success && body.data?.profile) rememberAnswer(PROFILE_ANSWER_KEY, body.data);
    return myProfileOf(body?.data ?? undefined) ?? cached;
  }).catch(() => cached).finally(() => { profileRead = null; });
  return profileRead;
}
export function warmMyProfile(): void { void readMyProfile(); }

// undefined = still reading: the chip area holds skeleton pills instead of the 「我」 groups popping in later.
function useMyProfile(): MyProfile | null | undefined {
  const [profile, setProfile] = useState<MyProfile | null | undefined>(() => myProfileOf(lastAnswer<ProfilePayload>(PROFILE_ANSWER_KEY)) ?? undefined);
  useEffect(() => {
    let alive = true;
    void readMyProfile().then((next) => { if (alive) setProfile((current) => next ?? current ?? null); });
    return () => { alive = false; };
  }, []);
  return profile;
}

const CHANNEL_KEY = { meeting: "logChannelMeeting", call: "logChannelCall", event: "logChannelEvent", other: "logChannelOther" } as const;
const GROUP_KEY = { theirIndustry: "logGroupIndustry", theirOffering: "logGroupOffering", theirSeeking: "logGroupSeeking", myOffering: "logGroupOffering", mySeeking: "logGroupSeeking", myTopics: "logGroupTopics" } as const;

export interface ContactLogTarget { id: string; displayName: string; industry: string; offering: readonly string[]; seeking: readonly string[] }

export function ContactLogModal({ open, contact, t, onClose, onSaved }: { open: boolean; contact: ContactLogTarget; t: NetworkT; onClose: () => void; onSaved: () => void }) {
  if (!open) return null;
  return <ContactLogSession contact={contact} t={t} onClose={onClose} onSaved={onSaved} />;
}

function ContactLogSession({ contact, t, onClose, onSaved }: { contact: ContactLogTarget; t: NetworkT; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const me = useMyProfile();
  const [channel, setChannel] = useState<ContactLogChannel>("meeting");
  const [today] = useState(() => tokyoToday());
  const [date, setDate] = useState(today);
  const [eventId, setEventId] = useState<string | null>(null);
  const [events, setEvents] = useState<ContactLogEventOption[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<ReadonlySet<ContactLogGroupKey>>(new Set());
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // 活动列表只在第一次选「活动上遇到」时读；读失败只隐藏这一行。
  useEffect(() => {
    if (channel !== "event" || events !== null) return;
    let alive = true;
    void networkApi.memoEventOptions().then((result) => { if (alive) setEvents(result.ok ? result.data.options : []); });
    return () => { alive = false; };
  }, [channel, events]);
  useEffect(() => { setEventId(null); }, [date]);

  const groups = useMemo(() => contactLogGroups({
    theirIndustry: [contact.industry], theirOffering: contact.offering, theirSeeking: contact.seeking,
    myOffering: me?.offering ?? [], mySeeking: me?.seeking ?? [], myTopics: me?.topics ?? [],
  }), [contact.industry, contact.offering, contact.seeking, me]);
  const noChips = me !== undefined && groups.length === 0;
  const dayEvents = channel === "event" ? contactLogEventsOn(events ?? [], date) : [];
  const copy = { bodyPrefix: t("logBodyPrefix"), joiner: t("logBodyJoiner") };
  const patch = buildContactLogPatch({ channel, date, topics: picked, extra, eventId, copy });
  const canSave = !busy && contactLogCanSave({ topics: picked, extra, date });
  const toggle = (chip: string) => setPicked((current) => current.includes(chip) ? current.filter((item) => item !== chip) : [...current, chip]);

  const save = async () => {
    if (!canSave) return;
    setBusy(true); setFailed(false);
    const result = await networkApi.updateDetail(contact.id, patch as unknown as Record<string, unknown>);
    setBusy(false);
    if (!result.ok) { setFailed(true); return; }
    toast.success(t("logSaved"));
    onSaved();
  };

  const side = (who: "them" | "me") => groups.filter((group) => group.side === who);
  const renderGroup = (group: (typeof groups)[number]) => {
    const open = expanded.has(group.key);
    // 已点中的 chip 即使在「+N」里也一直显示。
    const shown = open ? group.chips : group.chips.filter((chip, index) => index < CONTACT_LOG_GROUP_VISIBLE || picked.includes(chip));
    const hidden = group.chips.length - shown.length;
    return (
      <div key={group.key} className={styles.logGroup} data-contact-log-group={group.key}>
        <div className={styles.logGroupLabel}><span className={styles.logWho}>{t(group.side === "them" ? "logWhoThem" : "logWhoMe")}</span>{t(GROUP_KEY[group.key])}</div>
        <div className={styles.logChips}>
          {shown.map((chip) => <button key={chip} type="button" className={`btn ${styles.logChip}`} title={chip} aria-pressed={picked.includes(chip)} onClick={() => toggle(chip)}>{chip}</button>)}
          {hidden > 0 ? <button type="button" className={`btn ${styles.logChip} ${styles.logChipMore}`} onClick={() => setExpanded((current) => new Set([...current, group.key]))}>{t("logMore", { count: hidden })}</button> : null}
        </div>
      </div>
    );
  };

  return (
    <Modal open onClose={busy ? () => undefined : onClose} title={t("logTitle", { name: contact.displayName })} size={560}
      actions={<>
        <button type="button" className={`btn ${styles.btn}`} onClick={onClose} disabled={busy}>{t("logCancel")}</button>
        <button type="button" className={`btn ${styles.btn} ${styles.primary}`} onClick={() => void save()} disabled={!canSave} data-contact-log-save="">{t("logSave")}</button>
      </>}>
      <div data-contact-log="">
        <div className={styles.logField}>
          <span className={styles.lbl}>{t("logChannel")}</span>
          <div className={styles.logSeg} role="group" aria-label={t("logChannel")}>
            {CONTACT_LOG_CHANNELS.map((key) => <button key={key} type="button" className={`btn ${styles.logSegBtn}`} aria-pressed={channel === key} onClick={() => setChannel(key)}>{t(CHANNEL_KEY[key])}</button>)}
          </div>
        </div>
        <div className={styles.logField}>
          <label className={styles.lbl} htmlFor="contact-log-date">{t("logDate")}</label>
          <div className={styles.logDate}>
            <input id="contact-log-date" type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} />
            {date === today ? <em>{t("logToday")}</em> : null}
          </div>
        </div>
        {dayEvents.length ? (
          <div className={styles.logField} data-contact-log-events="">
            <span className={styles.lbl}>{t("logEvent")}</span>
            <div className={styles.logChips}>
              {dayEvents.map((item) => <button key={item.eventId} type="button" className={`btn ${styles.logChip}`} title={item.title} aria-pressed={eventId === item.eventId} onClick={() => setEventId(eventId === item.eventId ? null : item.eventId)}>{item.title}</button>)}
            </div>
          </div>
        ) : null}
        {me === undefined ? (
          <div className={styles.logField} aria-hidden="true" data-contact-log-loading="">
            <span className={styles.lbl}>{t("logTopics")}</span>
            <div className={styles.logSide}>
              {[0, 1].map((column) => <div key={column}><div className={styles.logGroup}><div className={styles.logGroupLabel}><i className={styles.logLabelBone} /></div><div className={styles.logChips}>{[0, 1, 2].map((pill) => <i key={pill} className={styles.logChipBone} />)}</div></div></div>)}
            </div>
          </div>
        ) : noChips ? (
          <div className={styles.logField}>
            <span className={styles.lbl}>{t("logTopicsPlain")}</span>
            <div className={styles.logEmpty} data-contact-log-empty="">{t("logEmpty")}<a href="/app/profile?edit=tags">{t("logCompleteProfile")}</a></div>
          </div>
        ) : groups.length ? (
          <div className={styles.logField}>
            <span className={styles.lbl}>{t("logTopics")}</span>
            <div className={styles.logSide}>
              {(["them", "me"] as const).map((who) => side(who).length ? <div key={who}>{side(who).map(renderGroup)}</div> : null)}
            </div>
          </div>
        ) : null}
        <div className={styles.logField}>
          <label className={styles.lbl} htmlFor="contact-log-extra">{t(noChips ? "logContent" : "logExtra")}</label>
          <textarea id="contact-log-extra" className={styles.logTextarea} value={extra} maxLength={2000} placeholder={t(noChips ? "logContentPlaceholder" : "logExtraPlaceholder")}
            onChange={(event) => { setExtra(event.target.value); if (failed) setFailed(false); }} />
        </div>
        {patch.note.body ? (
          <div className={styles.logPreview} data-contact-log-preview="">{t("logPreview")}<b>{t(CHANNEL_KEY[channel])}</b>{` · ${patch.note.body.replace(/\n/g, "　")}`}</div>
        ) : null}
        {failed ? <p className={styles.logError} role="alert">{t("logSaveFailed")}</p> : null}
      </div>
    </Modal>
  );
}
