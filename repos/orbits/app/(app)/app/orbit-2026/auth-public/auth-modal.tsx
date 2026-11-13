"use client";

import { useCallback, useRef, type MouseEvent } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { useOrbitModalA11y } from "../../orbit-modal-a11y";
import { Icon, Orbit2026Scope } from "../ui";
import { AuthChangePassword, AUTH_CHANGE_PASSWORD_TITLE_ID } from "./auth-change-password";
import { AuthForgot } from "./auth-forgot";
import { AuthLogin } from "./auth-login";
import { authTitleId, type AuthView } from "./auth-model";
import { AuthRegister } from "./auth-register";
import { AuthReset } from "./auth-reset";
import { navigate } from "./use-account-auth";
import s from "./AuthDialog.module.css";

export type AuthModalView = AuthView | "change-password";

/** 改密屏（已登录）：账号邮箱、改完要去的 next、是否首次登录改初始密码。 */
export interface AuthModalChangePassword {
  email: string;
  first: boolean;
  next: string;
}

export function AuthModal({
  changePassword,
  closeHref = "/",
  defaultNext = "/app/home",
  oauthProviders = [],
  view,
}: {
  changePassword?: AuthModalChangePassword;
  /** 关闭去哪；未登录四态回落地页，改密屏回 next。 */
  closeHref?: string;
  defaultNext?: string;
  oauthProviders?: readonly string[];
  view: AuthModalView;
}) {
  const { language, t } = useOrbitLanguage();
  const handleClose = useCallback(() => navigate(closeHref), [closeHref]);
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
    <div className="au-overlay">
      {/* The backdrop takes the outside click on its own pointer-only layer (as the kit Overlay does). */}
      <div aria-hidden="true" className="au-scrim" onMouseDown={onOverlayMouseDown} onClick={onOverlayClick} />
      <div aria-labelledby={view === "change-password" ? AUTH_CHANGE_PASSWORD_TITLE_ID : authTitleId(view)} aria-modal="true" className="au-panel" ref={cardRef} role="dialog" tabIndex={-1}>
        {/* b1 #2–#5 .lbtn: the close button sits on the title row (top-right), no wordmark. */}
        <button aria-label={t({ ja: "閉じる", zh: "关闭", en: "Close" })} className="btn au-lbtn au-close" onClick={handleClose} type="button"><Icon name="x" size={16} /></button>
        {view === "register" ? <AuthRegister defaultNext={defaultNext} oauthProviders={oauthProviders} />
          : view === "forgot" ? <AuthForgot defaultNext={defaultNext} oauthProviders={oauthProviders} />
          : view === "reset" ? <AuthReset />
          : view === "change-password" ? <AuthChangePassword email={changePassword?.email ?? ""} first={changePassword?.first ?? false} next={changePassword?.next ?? defaultNext} />
          : <AuthLogin defaultNext={defaultNext} oauthProviders={oauthProviders} />}
      </div>
    </div>
  </Orbit2026Scope>;
}
