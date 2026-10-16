"use client";

// R17 共同運営に参加 `/app/host/join/[code]`（b12 #414）与输码 `/app/host/join`；host DESIGN §2.8。
// 未登录也能看邀请预览（公开接口 GET /api/host/cohost-invites/[code]，proxy 已放行；无效 / 过期 / 已用一律同一回答）；
// 登录后「参加する」= POST …/[code]/accept（服务端以邀请为凭证授予），成功后去 result.href（受付 → kiosk，其余 → 运营台）。
// 未登录时没有壳，页头照画板用公开顶栏（ログイン / 無料で始める）。b12 #396–#475 待用户过目（§38），不进门禁。
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { HostCohostInvitePreview, HostCohostRole } from "../../../../../shared/contract/host-cohosts";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { ShellPage } from "../shell/slots";
import { Orbit2026Scope, ToastProvider, useToast } from "../ui";
import { failureCode, failureOf, hostEventApi } from "./host-api";
import { hostDateShort, hostTranslator, JOIN_HREF, type HostT } from "./host-model";
import j from "./join.module.css";
import s from "./host.module.css";

const ROLE_LABEL = { check_in: "rCheckIn", manager: "rManager", read_only_analyst: "rReadOnly" } as const;
const ROLE_DESC = { check_in: "jnRoleCheckIn", manager: "jnRoleManager", read_only_analyst: "jnRoleReader" } as const;

/** 招待コードの入力を正規化（全角・小文字・空白を許す；`H-` 前缀可省）。 */
export function normalizeInviteCode(value: string): string {
  const raw = value.normalize("NFKC").toUpperCase().replace(/[\s-]/gu, "");
  const body = raw.startsWith("H") && raw.length === 9 ? raw.slice(1) : raw;
  return /^[0-9A-Z]{8}$/u.test(body) ? `H-${body.slice(0, 4)}-${body.slice(4)}` : value.trim();
}

export const joinLoginHref = (code: string) => `/app/account/login?next=${encodeURIComponent(`${JOIN_HREF}/${encodeURIComponent(code)}`)}`;

function PublicTop({ t, next }: { t: HostT; next: string }) {
  return (
    <nav className={j.top}>
      <a className={j.brand} href="/"><span className={`${s.emo} ${j.logo}`}>O</span><b>Orbit</b></a>
      <div className={s.row} style={{ gap: 8 }}>
        <a className={`btn ${s.btn} ${s.ghost}`} href={`/app/account/login?next=${encodeURIComponent(next)}`}>{t("pubLogin")}</a>
        <a className={`btn ${s.btn} ${s.primary}`} href={`/app/account/signup?next=${encodeURIComponent(next)}`}>{t("jnFree")}</a>
      </div>
    </nav>
  );
}

export type HostJoinViewProps = {
  code: string | null;
  preview: HostCohostInvitePreview | null;
  signedIn: boolean;
  language: OrbitLanguage;
  busy?: boolean;
  entry?: string;
  onEntry?: (value: string) => void;
  onSubmitCode?: () => void;
  onJoin?: () => void;
};

/** 純粋な描画（b12 #414：邀请卡 / 无效 / 输码）。 */
export function HostJoinView({ code, preview, signedIn, language, busy = false, entry = "", onEntry, onSubmitCode, onJoin }: HostJoinViewProps) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const role = (preview?.role ?? null) as HostCohostRole | null;
  let card;
  if (!code) {
    card = (
      <form className={`${s.card} ${j.card}`} data-host-join="code" onSubmit={(ev) => { ev.preventDefault(); onSubmitCode?.(); }}>
        <div className={s.lbl}>{t("jnInvite")}</div>
        <b className={j.title}>{t("jnCodeTitle")}</b>
        <div className={s.lbl}>{t("jnCodeSub")}</div>
        <label className={j.input}><input value={entry} maxLength={16} autoComplete="off" autoCapitalize="characters" placeholder={t("jnCodePh")} aria-label={t("jnCodeTitle")} onChange={(ev) => onEntry?.(ev.target.value)} /></label>
        <div className={j.acts}><button type="submit" className={`btn ${s.btn} ${s.primary}`} disabled={!entry.trim()}>{t("jnNext")}</button></div>
      </form>
    );
  } else if (!preview) {
    card = <div className={`${s.card} ${j.card} ${j.loading}`} data-host-join="loading" aria-busy="true" />;
  } else if (!preview.valid || !role) {
    card = (
      <div className={`${s.card} ${j.card}`} data-host-join="invalid">
        <div className={s.lbl}>{t("jnInvite")}</div>
        <b className={j.title}>{t("jnInvalidTitle")}</b>
        <div className={`${s.sub} ${j.body}`}>{t("jnInvalidSub")}</div>
        <div className={j.acts}><a className={`btn ${s.btn}`} href={JOIN_HREF}>{t("jnEnterCode")}</a></div>
      </div>
    );
  } else {
    card = (
      <div className={`${s.card} ${j.card} ${j.invite}`} data-host-join="valid">
        <div className={s.lbl}>{t("jnInvite")}</div>
        <b className={j.title}>{preview.eventTitle}</b>
        <div className={s.lbl}>{t("jnFrom", { name: preview.inviterName ?? "—", org: preview.organizerName ?? "" }).replace(/^ · /u, "")}</div>
        <div className={`${s.row} ${j.role}`}><span className={`${s.chip} ${s.c_lav}`}>{t("jnRole", { role: t(ROLE_LABEL[role]) })}</span><span className={s.lbl}>{t(ROLE_DESC[role])}</span></div>
        <div className={j.acts}>
          {signedIn
            ? <button type="button" className={`btn ${s.btn} ${s.primary}`} disabled={busy} onClick={onJoin} data-host-join-accept="">{t("jnJoin")}</button>
            : <a className={`btn ${s.btn} ${s.primary}`} href={joinLoginHref(code)}>{t("jnLoginJoin")}</a>}
          <a className={`btn ${s.btn}`} href={JOIN_HREF}>{t("jnEnterCode")}</a>
        </div>
        {preview.expiresAt ? <div className={`${s.lbl} ${j.valid}`}>{t("jnValid", { d: hostDateShort(preview.expiresAt, t) })}</div> : null}
      </div>
    );
  }
  return (
    <div className={signedIn ? undefined : j.bare}>
      {signedIn ? <ShellPage title={t("jnInvite")} rightRail={false} /> : <PublicTop t={t} next={code ? `${JOIN_HREF}/${code}` : JOIN_HREF} />}
      <div className={j.wrap}>{card}</div>
    </div>
  );
}

function JoinInner({ code, signedIn, language }: { code: string | null; signedIn: boolean; language: OrbitLanguage }) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const toast = useToast();
  const router = useRouter();
  const [preview, setPreview] = useState<HostCohostInvitePreview | null>(null);
  const [entry, setEntry] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!code) return;
    const res = await hostEventApi.invitePreview(code);
    if (res.ok) { setPreview(res.data); return; }
    if (failureOf(res) === "rate_limited") toast.error(t("jnLimited"));
    setPreview({ eventId: null, eventTitle: null, expiresAt: null, inviterName: null, organizerName: null, role: null, valid: false });
  }, [code, t, toast]);
  useEffect(() => { void load(); }, [load]);
  const join = async () => {
    if (!code) return;
    setBusy(true);
    const res = await hostEventApi.acceptInvite(code);
    setBusy(false);
    if (!res.ok) {
      const reason = failureOf(res);
      if (reason === "rate_limited") { toast.error(t("jnLimited")); return; }
      if (reason === "forbidden" || failureCode(res) === "INVITE_ACCOUNT_MISMATCH") { toast.error(t("jnMismatch")); return; }
      if (reason === "sample") { toast.error(t("evSample")); return; }
      setPreview({ eventId: null, eventTitle: null, expiresAt: null, inviterName: null, organizerName: null, role: null, valid: false });
      return;
    }
    toast.success(t("jnJoined"));
    router.push(res.data.href);
  };
  return <HostJoinView code={code} preview={preview} signedIn={signedIn} language={language} busy={busy} entry={entry} onEntry={setEntry}
    onSubmitCode={() => router.push(`${JOIN_HREF}/${encodeURIComponent(normalizeInviteCode(entry))}`)} onJoin={() => void join()} />;
}

export function HostJoin({ code = null, signedIn, language }: { code?: string | null; signedIn: boolean; language: OrbitLanguage }) {
  return (
    <Orbit2026Scope language={language} className={signedIn ? s.page : undefined}>
      <ToastProvider>
        <JoinInner code={code} signedIn={signedIn} language={language} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}
