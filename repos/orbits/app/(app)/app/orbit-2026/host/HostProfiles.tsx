"use client";

// R17 主催者ページ 一覧と編集 `/app/events/center/profiles`（`/profiles/[id]` = 选中那一份）；b12 #412，host DESIGN §2.11 / A13。
// 一个 actor 可以有多份资料（对标 Peatix / connpass「グループ」）。读 GET /api/host/organizer-profiles；新建 POST、改 PUT …/[id]；
// slug 只在新建时可指定（留空 = 由名称转写，服务端处理冲突），之后不改。预览的三个数字读公开接口 /api/organizers/by-slug/[slug]。
// b12 #396–#475 待用户过目（§38），照画板实现但不进门禁。
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { OrganizerProfile, OrganizerProfileInput, OrganizerProfileStats, OrganizerProfileVisibility } from "../../../../../shared/contract/organizer-profile";
import { ShellPage } from "../shell/slots";
import { Icon, Orbit2026Scope, ToastProvider, useToast } from "../ui";
import { failureCode, failureOf, hostEventApi } from "./host-api";
import { eventTone, hostTranslator } from "./host-model";
import f from "./form.module.css";
import s from "./host.module.css";
import m from "./tabs.module.css";

export const BIO_MAX = 200;
const EMOJIS = ["🥂", "🏭", "💰", "🍱", "📚", "💬", "🚀", "🎤", "🌱", "🎪"] as const;
const NEW = "new";

export type ProfileDraft = { displayName: string; slug: string; emoji: string; bio: string; visibility: OrganizerProfileVisibility };

export const profileDraftOf = (profile: OrganizerProfile | null): ProfileDraft => profile
  ? { bio: profile.bio ?? "", displayName: profile.displayName, emoji: profile.emoji ?? EMOJIS[0], slug: profile.slug, visibility: profile.visibility }
  : { bio: "", displayName: "", emoji: EMOJIS[0], slug: "", visibility: "public" };

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;

/** 入力 → 契約。新建時だけ slug を送る（空 = 自動）。 */
export function profileInput(draft: ProfileDraft, isNew: boolean): OrganizerProfileInput | null {
  const displayName = draft.displayName.trim();
  if (!displayName || [...displayName].length > 60) return null;
  const slug = draft.slug.trim().toLowerCase();
  if (isNew && slug && (slug.length < 3 || slug.length > 48 || !SLUG_RE.test(slug))) return null;
  if ([...draft.bio].length > BIO_MAX) return null;
  return { bio: draft.bio.trim() || null, displayName, emoji: draft.emoji || null, visibility: draft.visibility, ...(isNew && slug ? { slug } : {}) };
}

const host = () => (typeof window === "undefined" ? "orbit.app" : window.location.host);
const fmt = (value: number) => value.toLocaleString("ja-JP");

export type HostProfilesViewProps = {
  profiles: readonly OrganizerProfile[];
  selectedId: string;
  draft: ProfileDraft;
  stats: OrganizerProfileStats | null;
  language: OrbitLanguage;
  busy?: boolean;
  picking?: boolean;
  onSelect?: (profileId: string) => void;
  onChange?: (next: ProfileDraft) => void;
  onSave?: () => void;
  onPick?: (open: boolean) => void;
};

/** 純粋な描画（b12 #412）。 */
export function HostProfilesView({ profiles, selectedId, draft, stats, language, busy = false, picking = false, onSelect, onChange, onSave, onPick }: HostProfilesViewProps) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const isNew = selectedId === NEW;
  const current = profiles.find((item) => item.profileId === selectedId) ?? null;
  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => onChange?.({ ...draft, [key]: value });
  const tone = eventTone(draft.emoji, current?.profileId ?? "new");
  const back = <a className={`btn ${s.btn} ${s.backBtn}`} href="/app/events/center" aria-label={t("back")}><Icon name="left" size={20} /></a>;
  const right = (
    <div className={s.headRight}>
      {current ? <a className={`btn ${s.btn}`} href={`/o/${encodeURIComponent(current.slug)}`} target="_blank" rel="noreferrer"><Icon name="share" size={16} />{t("pfView")}</a> : null}
      <button type="button" className={`btn ${s.btn} ${s.accent}`} disabled={busy} onClick={onSave} data-host-profile-save="">{t("pfSave")}</button>
    </div>
  );
  const bioLength = [...draft.bio].length;
  return (
    <>
      <ShellPage title={t("pfTitle")} subtitle={t("pfCrumb")} left={back} right={right} rightRail={false} />
      <div className={s.wgrid} data-host-profiles={profiles.length}>
        <div className={`${s.card} ${s.span3} ${f.pfList}`} data-host-orglist="">
          <div className={`${s.lbl} ${f.pfListLbl}`}>{t("pfMine")}</div>
          {profiles.map((item) => (
            <button key={item.profileId} type="button" className={`btn ${f.pfItem} ${item.profileId === selectedId ? f.pfItemOn : ""}`} aria-pressed={item.profileId === selectedId} onClick={() => onSelect?.(item.profileId)}>
              <span className={`${s.emo} ${s.emoSm} ${s[`e_${eventTone(item.emoji, item.profileId)}`]}`} aria-hidden>{item.emoji ?? "🎪"}</span>
              <span className={s.minw0}><b className={`${s.clamp1} ${f.pfName}`}>{item.displayName}</b><span className={`${s.lbl} ${f.pfMeta}`}>{t("pfEvents", { n: item.eventCount })}</span></span>
            </button>
          ))}
          {isNew ? <div className={`btn ${f.pfItem} ${f.pfItemOn}`} aria-current="true"><span className={`${s.emo} ${s.emoSm} ${s[`e_${tone}`]}`} aria-hidden>{draft.emoji}</span><span className={s.minw0}><b className={`${s.clamp1} ${f.pfName}`}>{draft.displayName.trim() || t("pfNew")}</b></span></div> : null}
          {profiles.length === 0 && !isNew ? <div className={`${s.lbl} ${f.pfListLbl}`}>{t("pfEmpty")}</div> : null}
          <button type="button" className={`btn ${s.btn} ${s.ghost} ${f.pfAdd}`} onClick={() => onSelect?.(NEW)}><Icon name="plus" size={16} />{t("pfAdd")}</button>
        </div>
        <div className={`${s.card} ${f.span5} ${f.blk}`} data-host-orgform={isNew ? "new" : selectedId}>
          <div className={s.cardH}><h3>{t("pfProfile")}</h3></div>
          <div className={m.setrow}><span className={`${s.lbl} ${f.fl}`}>{t("pfName")}</span><div className={f.input}><input value={draft.displayName} maxLength={60} placeholder={t("pfNamePh")} aria-label={t("pfName")} onChange={(ev) => set("displayName", ev.target.value)} /></div></div>
          <div className={m.setrow}>
            <span className={`${s.lbl} ${f.fl}`}>{t("pfUrl")}</span>
            {isNew ? (
              <div className={f.input}><span className={s.muted}>{host()}/o/</span><input value={draft.slug} maxLength={48} placeholder={t("pfSlugAuto")} aria-label={t("pfUrl")} onChange={(ev) => set("slug", ev.target.value.toLowerCase().replace(/[^a-z0-9-]/gu, ""))} /></div>
            ) : <div className={`${f.input} ${f.readonly}`}>{`${host()}/o/${draft.slug}`}</div>}
          </div>
          {isNew ? <div className={`${s.lbl} ${f.hint}`}>{t("pfSlugHint")}</div> : null}
          <div className={m.setrow}>
            <span className={`${s.lbl} ${f.fl}`}>{t("pfIcon")}</span>
            <span className={`${s.emo} ${s[`e_${tone}`]}`} aria-hidden>{draft.emoji}</span>
            <button type="button" className={`btn ${s.btn} ${s.sm}`} aria-expanded={picking} onClick={() => onPick?.(!picking)}>{t("pfChange")}</button>
          </div>
          {picking ? (
            <div className={f.emojiPick} role="listbox" aria-label={t("pfIcon")}>
              {EMOJIS.map((emoji) => <button key={emoji} type="button" role="option" aria-selected={draft.emoji === emoji} className={`btn ${f.emojiOpt} ${draft.emoji === emoji ? f.emojiOn : ""}`} onClick={() => { set("emoji", emoji); onPick?.(false); }}>{emoji}</button>)}
            </div>
          ) : null}
          <div className={`${s.lbl} ${f.noteLbl} ${f.mt10}`}>{t("pfBio")}</div>
          <label className={`${f.ta} ${f.taSm}`}>
            <textarea value={draft.bio} maxLength={BIO_MAX} placeholder={t("pfBioPh")} aria-label={t("pfBio")} onChange={(ev) => set("bio", ev.target.value)} />
            <span className={`${f.counter} ${bioLength > 180 ? f.counterBad : ""}`}>{`${bioLength} / ${BIO_MAX}`}</span>
          </label>
          <div className={m.setrow}>
            <span className={`${s.lbl} ${f.fl}`}>{t("pfVisibility")}</span>
            <div className={s.seg} role="radiogroup" aria-label={t("pfVisibility")}>
              {(["public", "link_only"] as const).map((value) => (
                <button key={value} type="button" role="radio" aria-checked={draft.visibility === value} className={`btn ${s.segBtn} ${draft.visibility === value ? s.segOn : ""}`} onClick={() => set("visibility", value)}>{t(value === "public" ? "pfPublic" : "pfLinkOnly")}</button>
              ))}
            </div>
          </div>
          {draft.visibility === "link_only" ? <div className={`${s.lbl} ${f.hint}`}>{t("pfLinkOnlyHint")}</div> : null}
        </div>
        <div className={`${s.card} ${s.span4} ${f.blk}`} data-host-orgprev="">
          <div className={s.cardH}><h3>{t("evPreview")}</h3><span className={s.lbl}>{t("pfPreviewSub")}</span></div>
          <div className={f.pfPrev}>
            <span className={`${s.emo} ${f.pfPrevAv} ${s[`e_${tone}`]}`} aria-hidden>{draft.emoji}</span>
            <div className={`${s.lbl} ${f.mt10}`}>{t("pubHost")}</div>
            <b className={f.pfPrevName}>{draft.displayName.trim() || t("pfNew")}</b>
            {draft.bio.trim() ? <div className={`${s.sub} ${f.pfPrevBio}`}>{draft.bio.trim()}</div> : null}
            <div className={f.pfStats}>
              <div><div className={s.lbl}>{t("pubHeld")}</div><b>{fmt(stats?.eventsHeld ?? 0)}{t("pubHeldUnit")}</b></div>
              <div><div className={s.lbl}>{t("pubAttendees")}</div><b>{fmt(stats?.attendeesTotal ?? 0)}{t("pubPeopleUnit")}</b></div>
              <div><div className={s.lbl}>{t("pubFollowers")}</div><b>{fmt(stats?.followers ?? 0)}</b></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ProfilesInner({ language, initialId }: { language: OrbitLanguage; initialId: string | null }) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const toast = useToast();
  const router = useRouter();
  const [profiles, setProfiles] = useState<OrganizerProfile[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>(initialId ?? "");
  const [draft, setDraft] = useState<ProfileDraft>(profileDraftOf(null));
  const [stats, setStats] = useState<OrganizerProfileStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  const select = useCallback((profileId: string, list: readonly OrganizerProfile[]) => {
    setSelectedId(profileId);
    setPicking(false);
    const profile = list.find((item) => item.profileId === profileId) ?? null;
    setDraft(profileDraftOf(profile));
    setStats(null);
    if (profile) void hostEventApi.organizerPublic(profile.slug).then((res) => { if (res.ok) setStats(res.data.stats); });
  }, []);

  const load = useCallback(async () => {
    const res = await hostEventApi.profiles();
    if (!res.ok) { setFailed(true); return; }
    const list = [...res.data.profiles];
    setProfiles(list);
    setFailed(false);
    const start = initialId && list.some((item) => item.profileId === initialId) ? initialId : list[0]?.profileId ?? NEW;
    select(start, list);
  }, [initialId, select]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!profiles) return;
    const isNew = selectedId === NEW;
    const input = profileInput(draft, isNew);
    if (!input) { toast.error(t("pfInvalid")); return; }
    setBusy(true);
    const res = isNew ? await hostEventApi.createProfile(input) : await hostEventApi.updateProfile(selectedId, input);
    setBusy(false);
    if (!res.ok) {
      const reason = failureOf(res);
      toast.error(reason === "conflict" || failureCode(res) === "SLUG_TAKEN" ? t("pfSlugTaken") : reason === "sample" ? t("evSample") : t("saveError"));
      return;
    }
    const saved = res.data;
    const next = isNew ? [...profiles, saved] : profiles.map((item) => (item.profileId === saved.profileId ? saved : item));
    setProfiles(next);
    select(saved.profileId, next);
    if (isNew) router.replace(`/app/events/center/profiles/${encodeURIComponent(saved.profileId)}`, { scroll: false });
    toast.success(isNew ? t("pfCreated") : t("pfSaved"));
  };

  const back = <a className={`btn ${s.btn} ${s.backBtn}`} href="/app/events/center" aria-label={t("back")}><Icon name="left" size={20} /></a>;
  if (failed) {
    return (
      <>
        <ShellPage title={t("pfTitle")} left={back} rightRail={false} />
        <div className={`${s.card} ${s.empty}`} data-host-failure="">{t("loadError")} <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={() => void load()}>{t("retry")}</button></div>
      </>
    );
  }
  if (!profiles) return <ShellPage title={t("pfTitle")} left={back} rightRail={false} />;
  return <HostProfilesView profiles={profiles} selectedId={selectedId} draft={draft} stats={stats} language={language} busy={busy} picking={picking}
    onSelect={(profileId) => select(profileId, profiles)} onChange={setDraft} onSave={() => void save()} onPick={setPicking} />;
}

export function HostProfiles({ language, profileId = null }: { language: OrbitLanguage; profileId?: string | null }) {
  return (
    <Orbit2026Scope language={language} className={s.page}>
      <ToastProvider>
        <ProfilesInner language={language} initialId={profileId} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}
