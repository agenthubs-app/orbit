"use client";

// R17 公開主催者ページ `/o/[slug]`（host DESIGN §2.11；b7 #33 空 / #34 少 / #35 大 · 1440，#36–#38 手机，#39 未ログインでフォロー）。
// 未登录可读：数据由页面（server component）读好传进来；关注 = R27 actor 级关注（POST / DELETE /api/organizers/[organizerKey]/follow）。
// 未登录点「フォローする」→ 登录引导（宽屏弹层 / 手机底部 sheet，b7 #39）；登录后回到 /app/o/<slug>（302 回本页）。
// 数字口径（organizer-profile 契约）：開催回数 = 已结束场次；累計参加者 = 受付人数合计；「参加 N名」= 受付人数。
import { signIn } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { OrganizerPublicResponse, OrganizerPublicUpcoming } from "../../../../../shared/contract/organizer-profile";
import { followOrganizer } from "./host-api";
import { eventTone, hostDateDay, hostDateLong, hostTranslator, type HostT } from "./host-model";
import { BottomSheet, Icon, Modal, Orbit2026Scope, ToastProvider, useToast } from "../ui";
import s from "./host.module.css";
import p from "./public.module.css";

const PAST_PREVIEW = 6;

export function feeLabel(item: Pick<OrganizerPublicUpcoming, "feeKind" | "feeAmountYen">, t: HostT): string {
  switch (item.feeKind) {
    case "free": return t("pubFree");
    case "amount": return item.feeAmountYen == null ? t("pubExternal") : `¥${item.feeAmountYen.toLocaleString("ja-JP")}`;
    case "pay_at_door": return item.feeAmountYen == null ? t("pubAtDoor") : `${t("pubAtDoor")} ¥${item.feeAmountYen.toLocaleString("ja-JP")}`;
    case "external_link": return t("pubExternal");
  }
}

/** 公開ページの login / signup の戻り先：`normalizeOrbitAuthReturnPath` は /app 配下だけ通すので、/app/o/<slug>（→ 302 /o/<slug>）を使う。 */
export const organizerReturnPath = (slug: string, follow: boolean) => `/app/o/${encodeURIComponent(slug)}${follow ? "?follow=1" : ""}`;
export const organizerAuthHref = (kind: "login" | "signup", slug: string, follow = true) => `/app/account/${kind}?next=${encodeURIComponent(organizerReturnPath(slug, follow))}`;

const fmt = (value: number) => value.toLocaleString("ja-JP");

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(max-width: 767px)");
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);
  return narrow;
}

export type OrganizerPublicViewProps = {
  data: OrganizerPublicResponse;
  language: OrbitLanguage;
  signedIn: boolean;
  following: boolean;
  busy?: boolean;
  expanded?: boolean;
  onFollow?: () => void;
  onShare?: (item: OrganizerPublicUpcoming) => void;
  onExpand?: () => void;
  onReport?: () => void;
};

/** 純粋な描画（b7 #33–#38）。 */
export function OrganizerPublicView({ data, language, signedIn, following, busy = false, expanded = false, onFollow, onShare, onExpand, onReport }: OrganizerPublicViewProps) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const { profile, stats } = data;
  const empty = data.upcoming.length === 0;
  const past = expanded ? data.past : data.past.slice(0, PAST_PREVIEW);
  const tone = eventTone(profile.emoji, profile.profileId);
  const followIcon = following ? <Icon name="check" size={16} /> : <Icon name="plus" size={16} />;
  const followLabel = following ? t("pubFollowing") : t("pubFollow");
  return (
    <div className={p.pubweb} data-organizer-public={empty ? "empty" : data.past.length > PAST_PREVIEW || data.pastTotal > PAST_PREVIEW ? "many" : "few"}>
      <header className={p.pubtop}>
        <a className={p.logo} href="/" aria-label="Orbit">O</a><b className={p.brand}>Orbit</b>
        <span className={s.grow} />
        {signedIn ? (
          <a className={`btn ${s.btn} ${s.ghost} ${p.topBtn}`} href="/app/home">{t("pubOpenApp")}</a>
        ) : (
          <>
            <a className={`btn ${s.btn} ${s.ghost} ${p.topBtn}`} href={organizerAuthHref("login", profile.slug, false)}>{t("pubLogin")}</a>
            <a className={`btn ${s.btn} ${s.primary} ${p.wideOnly}`} href={organizerAuthHref("signup", profile.slug, false)}>{t("pubStart")}</a>
          </>
        )}
      </header>
      <main className={p.main}>
        <section className={`${s.card} ${p.hero}`} data-organizer-hero="">
          <div className={p.heroRow}>
            <div className={`${p.hostav} ${s[`e_${tone}`]}`} aria-hidden>{profile.emoji ?? "🎪"}</div>
            <div className={p.heroBody}>
              <div className={s.lbl}>{t("pubHost")}</div>
              <h1 className={p.name}>{profile.displayName}</h1>
              {profile.bio ? <div className={`${s.sub} ${p.bio}`}>{profile.bio}</div> : null}
              <div className={p.stats}>
                <div className={p.stat}><span className={s.lbl}>{t("pubHeld")}</span><b>{fmt(stats.eventsHeld)}<small>{t("pubHeldUnit")}</small></b></div>
                <div className={p.stat}><span className={s.lbl}>{t("pubAttendees")}</span><b>{fmt(stats.attendeesTotal)}<small>{t("pubPeopleUnit")}</small></b></div>
                <div className={p.stat}><span className={s.lbl}>{t("pubFollowers")}</span><b>{fmt(stats.followers)}<small /></b></div>
              </div>
            </div>
            <div className={p.followCol}>
              <button type="button" className={`btn ${s.btn} ${following ? "" : s.primary} ${p.xl}`} aria-pressed={following} disabled={busy} onClick={onFollow} data-organizer-follow={following ? "on" : "off"}>
                {followIcon}{followLabel}
              </button>
              <span className={`${s.lbl} ${p.center}`}>{t("pubFollowHint")}</span>
            </div>
          </div>
        </section>
        <div className={`${s.wgrid} ${p.grid}`}>
          <div className={`${s.span12} ${p.secHead}`}><b>{t("pubUpcoming")}</b></div>
          {empty ? (
            <div className={`${s.card} ${s.span12} ${p.none}`} data-organizer-none="">
              <div className={`${s.row} ${p.noneRow}`}>
                <span className={`${s.emo} ${s.e_apricot}`} aria-hidden>🗓️</span>
                <div className={s.grow}><b>{t("pubNoneTitle")}</b><div className={s.lbl}>{t("pubNoneSub")}</div></div>
                {following ? null : <button type="button" className={`btn ${s.btn} ${s.sm}`} disabled={busy} onClick={onFollow}><Icon name="bell" size={16} />{t("pubFollowNotify")}</button>}
              </div>
              <div className={p.grid2}><div className={p.ghostRow}>{t("pubGhost1")}</div><div className={p.ghostRow}>{t("pubGhost2")}</div></div>
            </div>
          ) : data.upcoming.map((item) => (
            <article key={item.eventId} className={p.pev} data-organizer-upcoming={item.eventId}>
              <div className={`${s.row} ${s.between}`}>
                <span className={`${s.emo} ${s[`e_${eventTone(item.emoji, item.eventId)}`]}`} aria-hidden>{item.emoji ?? "🗓️"}</span>
                {item.registrationOpen ? (item.remainingSeats != null ? <span className={`${s.chip} ${s.c_blue}`}>{t("pubSeats", { n: item.remainingSeats })}</span> : null) : <span className={s.chip}>{t("pubNotOpen")}</span>}
              </div>
              <b className={p.pevTitle}>{item.title}</b>
              <div className={`${s.lbl} ${p.pevMeta}`}>{[hostDateLong(item.startsAt, language, t), item.venue, feeLabel(item, t)].filter(Boolean).join(" · ")}</div>
              <div className={`${s.row} ${p.pevActs}`}>
                <a className={`btn ${s.btn} ${s.sm} ${s.primary}`} href={item.href}>{t("pubDetail")}</a>
                <button type="button" className={`btn ${s.btn} ${s.sm} ${s.ghost}`} onClick={() => onShare?.(item)}><Icon name="share" size={16} />{t("pubShare")}</button>
              </div>
            </article>
          ))}
          {data.past.length ? (
            <div className={s.span12} data-organizer-past={data.pastTotal}>
              <div className={`${s.row} ${s.between} ${p.pastHead}`}><b>{t("pubPast")}</b><span className={s.lbl}>{t("pubPastCount", { n: data.pastTotal })}</span></div>
              <div className={`${p.pastGrid} ${expanded ? p.pastAll : ""}`}>
                {past.map((item) => (
                  <a key={item.eventId} className={p.past} href={`/app/events/${encodeURIComponent(item.eventId)}`}>
                    <span className={`${s.emo} ${s.emoSm} ${s[`e_${eventTone(item.emoji, item.eventId)}`]}`} aria-hidden>{item.emoji ?? "🗓️"}</span>
                    <div className={s.grow}><b className={p.pastTitle}>{item.title}</b><div className={s.lbl}>{t("pubPastLine", { d: hostDateDay(item.startsAt, t, language), n: fmt(item.attended) })}</div></div>
                  </a>
                ))}
              </div>
              {data.pastTotal > PAST_PREVIEW && !expanded ? <button type="button" className={`btn ${s.btn} ${s.ghost} ${p.block}`} onClick={onExpand}>{t("pubSeeAll", { n: data.pastTotal })}</button> : null}
            </div>
          ) : null}
        </div>
        <div className={`${s.lbl} ${p.foot}`}>
          {t("pubFooter")}<span className={p.wideOnly}> · <button type="button" className={`btn ${p.linkBtn}`} onClick={onReport}>{t("pubReport")}</button></span>
        </div>
      </main>
    </div>
  );
}

function LoginPrompt({ name, slug, t, google, narrow, onClose }: { name: string; slug: string; t: HostT; google: boolean; narrow: boolean; onClose: () => void }) {
  const body = (
    <div className={p.sheet} data-organizer-login="">
      <b className={p.sheetTitle}>{t("pubLoginTitle")}</b>
      <div className={`${s.lbl} ${p.sheetSub}`}>{t("pubLoginSub", { name })}</div>
      {google ? <button type="button" className={`btn ${s.btn} ${s.primary} ${p.xl} ${p.block}`} onClick={() => void signIn("google", { callbackUrl: organizerReturnPath(slug, true) })}>{t("pubGoogle")}</button> : null}
      <a className={`btn ${s.btn} ${google ? "" : s.primary} ${p.xl} ${p.block} ${google ? p.gap8 : ""}`} href={organizerAuthHref("login", slug)}>{t("pubEmail")}</a>
      <a className={`btn ${s.btn} ${s.ghost} ${p.block} ${p.gap4}`} href={organizerAuthHref("signup", slug)}>{t("pubSignup")}</a>
      <div className={`${s.lbl} ${p.center} ${p.gap8}`}>{t("pubLoginNote")}</div>
    </div>
  );
  return narrow
    ? <BottomSheet open onClose={onClose} label={t("pubLoginTitle")}>{body}</BottomSheet>
    : <Modal open onClose={onClose} title={t("pubLoginTitle")} size={420} header={<span className={`${s.emo} ${s.e_lav}`} aria-hidden>🔔</span>}>{body}</Modal>;
}

function OrganizerPublicInner({ data, language, signedIn, googleEnabled, autoFollow }: { data: OrganizerPublicResponse; language: OrbitLanguage; signedIn: boolean; googleEnabled: boolean; autoFollow: boolean }) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const toast = useToast();
  const narrow = useNarrow();
  const [following, setFollowing] = useState(Boolean(data.following));
  const [followers, setFollowers] = useState(data.stats.followers);
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState(false);
  const [report, setReport] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const toggle = async (next: boolean) => {
    setBusy(true);
    const res = await followOrganizer(data.organizerKey, next);
    setBusy(false);
    if (!res.ok) { toast.error(t("pubFollowError")); return; }
    setFollowing(next);
    setFollowers((value) => Math.max(0, value + (next ? 1 : -1)));
    toast.success(next ? t("pubFollowedToast") : t("pubUnfollowedToast"));
  };
  // 登录回来（?follow=1）：自动关注一次，然后把参数去掉。
  useEffect(() => {
    if (!autoFollow || !signedIn || data.following) return;
    void toggle(true);
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const follow = () => {
    if (!signedIn) { setLogin(true); return; }
    void toggle(!following);
  };
  const copy = async (text: string, done: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(done); } catch { toast.error(t("pubFollowError")); }
  };
  const share = (item: OrganizerPublicUpcoming) => {
    const url = new URL(item.href, window.location.origin).toString();
    if (narrow && typeof navigator.share === "function") { void navigator.share({ title: item.title, url }).catch(() => undefined); return; }
    void copy(url, t("pubShared"));
  };
  const view = { ...data, stats: { ...data.stats, followers } };
  return (
    <>
      <OrganizerPublicView data={view} language={language} signedIn={signedIn} following={following} busy={busy} expanded={expanded}
        onFollow={follow} onShare={share} onExpand={() => setExpanded(true)} onReport={() => setReport(true)} />
      {login ? <LoginPrompt name={data.profile.displayName} slug={data.profile.slug} t={t} google={googleEnabled} narrow={narrow} onClose={() => setLogin(false)} /> : null}
      {report ? (
        <Modal open onClose={() => setReport(false)} title={t("pubReportTitle")} size={420}
          actions={<><button type="button" className={`btn ${s.btn}`} onClick={() => setReport(false)}>{t("cancel")}</button><button type="button" className={`btn ${s.btn} ${s.primary}`} onClick={() => void copy(window.location.href, t("pubCopied"))}>{t("pubCopyUrl")}</button></>}>
          <p className={`${s.sub} ${s.modalBody}`}>{t("pubReportBody")}</p>
        </Modal>
      ) : null}
    </>
  );
}

export function OrganizerPublic(props: { data: OrganizerPublicResponse; language: OrbitLanguage; signedIn: boolean; googleEnabled: boolean; autoFollow?: boolean }) {
  return (
    <Orbit2026Scope language={props.language} className={p.scope}>
      <ToastProvider>
        <OrganizerPublicInner {...props} autoFollow={props.autoFollow ?? false} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}

export function OrganizerPublicMissing({ language }: { language: OrbitLanguage }) {
  const t = hostTranslator(language);
  return (
    <Orbit2026Scope language={language} className={p.scope}>
      <div className={p.pubweb} data-organizer-public="missing">
        <header className={p.pubtop}><a className={p.logo} href="/" aria-label="Orbit">O</a><b className={p.brand}>Orbit</b></header>
        <main className={p.main}><section className={`${s.card} ${p.hero} ${p.center}`}><h1 className={p.name}>{t("pubNotFound")}</h1><div className={`${s.sub} ${p.bio}`}>{t("pubNotFoundSub")}</div></section></main>
      </div>
    </Orbit2026Scope>
  );
}
