"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";

export function MobileGoogleAuth({
  brokerRequest,
}: {
  brokerRequest: string;
}) {
  useEffect(() => {
    void signIn("google", {
      callbackUrl: `/api/auth/mobile/google/complete?request=${encodeURIComponent(
        brokerRequest,
      )}`,
    });
  }, [brokerRequest]);

  return (
    <main className="orbit-account-auth-page" data-orbit-mobile-google>
      <div className="orbit-account-auth-backdrop" />
      <section
        aria-live="polite"
        className="orbit-account-auth-modal"
        role="status"
      >
        <div className="orbit-account-auth-scroll">
          <div className="orbit-account-auth-head">
            <span className="eyebrow">ORBIT</span>
            <h1 className="h-title">正在打开 Google 登录…</h1>
            <p>登录完成后会自动回到 Orbit。</p>
          </div>
          <a
            className="btn btn-ghost btn-block"
            href="/app/account/login"
          >
            返回邮箱登录
          </a>
        </div>
      </section>
    </main>
  );
}
