"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { Orbit2026Scope } from "../../orbit-2026/ui";
import s from "./MobileGoogleAuth.module.css";

const copy = {
  en: { opening: "Opening Google sign-in…", openingDetail: "Orbit will reopen when sign-in finishes.", unavailable: "Google sign-in is unavailable", unavailableDetail: "Sign in with your email instead.", back: "Back to email sign-in" },
  ja: { opening: "Google ログインを開いています…", openingDetail: "ログイン後、Orbit に戻ります。", unavailable: "Google ログインは利用できません", unavailableDetail: "メールアドレスでログインしてください。", back: "メールでログインに戻る" },
  zh: { opening: "正在打开 Google 登录…", openingDetail: "登录完成后会自动回到 Orbit。", unavailable: "Google 登录暂时不可用", unavailableDetail: "请使用邮箱登录。", back: "返回邮箱登录" },
} as const;

export function MobileGoogleAuth({
  brokerRequest,
  language,
  reauth = false,
}: {
  brokerRequest?: string;
  language: OrbitLanguage;
  reauth?: boolean;
}) {
  useEffect(() => {
    if (!brokerRequest) return;
    void signIn("google", {
      callbackUrl: `/api/auth/mobile/google/complete?request=${encodeURIComponent(
        brokerRequest,
      )}`,
    }, reauth ? { prompt: "login", max_age: "0", claims: JSON.stringify({ id_token: { auth_time: { essential: true } } }) } : undefined);
  }, [brokerRequest, reauth]);

  const text = copy[language];
  return (
    <Orbit2026Scope as="main" language={language} className={s.page}>
      <section aria-live="polite" className={s.card} data-orbit-mobile-google role={brokerRequest ? "status" : "alert"}>
        <span className={s.brand}>Orbit</span>
        <h1>{brokerRequest ? text.opening : text.unavailable}</h1>
        <p>{brokerRequest ? text.openingDetail : text.unavailableDetail}</p>
        <a className={s.back} href="/app/account/login">{text.back}</a>
      </section>
    </Orbit2026Scope>
  );
}
