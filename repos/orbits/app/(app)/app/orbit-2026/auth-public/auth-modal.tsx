"use client";

import { useCallback, useRef, type MouseEvent } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { useOrbitModalA11y } from "../../orbit-modal-a11y";
import { Icon, Orbit2026Scope } from "../ui";
import { AuthForgot } from "./auth-forgot";
import { AuthLogin } from "./auth-login";
import { authTitleId, type AuthView } from "./auth-model";
import { AuthRegister } from "./auth-register";
import { AuthReset } from "./auth-reset";
import { navigate } from "./use-account-auth";
import s from "./AuthDialog.module.css";

export type AuthModalView = AuthView;

export function AuthModal({
  defaultNext = "/app/home",
  oauthProviders = [],
  view,
}: {
  defaultNext?: string;
  oauthProviders?: readonly string[];
  view: AuthModalView;
}) {
  const { language, t } = useOrbitLanguage();
  const handleClose = useCallback(() => navigate("/"), []);
  const cardRef = useOrbitModalA11y(handleClose);
  const pressedOnOverlay = useRef(false);

  function onOverlayMouseDown(event: MouseEvent<HTMLDivElement>) {
    pressedOnOverlay.current = event.target === event.currentTarget;
  }
  function onOverlayClick(event: MouseEvent<HTMLDivElement>) {
    const pressed = pressedOnOverlay.current;
    pressedOnOverlay.current = false;
    if (pressed && event.target === event.currentTarget) handleClose();
  }

  return <Orbit2026Scope language={language} className={s.overlayRoot}>
    <div className="au-overlay" onMouseDown={onOverlayMouseDown} onClick={onOverlayClick}>
      <div aria-labelledby={authTitleId(view)} aria-modal="true" className="au-panel" ref={cardRef} role="dialog" tabIndex={-1}>
        {/* b1 #2–#5 .lbtn: the close button sits on the title row (top-right), no wordmark. */}
        <button aria-label={t({ ja: "閉じる", zh: "关闭", en: "Close" })} className="btn au-lbtn au-close" onClick={handleClose} type="button"><Icon name="x" size={16} /></button>
        {view === "register" ? <AuthRegister defaultNext={defaultNext} oauthProviders={oauthProviders} />
          : view === "forgot" ? <AuthForgot defaultNext={defaultNext} oauthProviders={oauthProviders} />
          : view === "reset" ? <AuthReset />
          : <AuthLogin defaultNext={defaultNext} oauthProviders={oauthProviders} />}
      </div>
    </div>
  </Orbit2026Scope>;
}
