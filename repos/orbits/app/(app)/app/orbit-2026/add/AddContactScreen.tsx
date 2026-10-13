"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { Orbit2026Scope, ToastProvider } from "../ui";
import { AddContactDialog } from "./AddContactDoors";
import { InviteCodeModal } from "./invite/InviteCodeModal";
import { ManualContactDrawer } from "./ManualContactDrawer";
import inviteStyles from "./invite/invite.module.css";

export type AddPanel = "manual" | "invite" | null;

/**
 * `?add=manual` keeps the 手入力 drawer open across reloads and is shareable (DESIGN §7); `?add=invite`
 * does the same for the 招待コード dialog (R15). `true` / `false` are the R12 form (manual / none).
 */
export function addSearchFor(search: string, panel: boolean | AddPanel): string {
  const params = new URLSearchParams(search);
  const value = panel === true ? "manual" : panel === false ? null : panel;
  if (value) params.set("add", value);
  else params.delete("add");
  const next = params.toString();
  return next ? `?${next}` : "";
}

/**
 * `/app/contacts/new` — 人脈を追加 over 人脈 (R12, D20 / b12 W-R12-01): the five-door dialog, the
 * 手入力 drawer on `?add=manual` (b11 A3 Web) and the 招待コード dialog on `?add=invite` (R15),
 * each over the 人脈 page the route renders underneath. Closing goes back to 人脈.
 */
export function AddContactScreen({ manualOpen = false, inviteOpen = false }: { manualOpen?: boolean; inviteOpen?: boolean }) {
  const { language, preserveHref } = useOrbitLanguage();
  const router = useRouter();
  const [panel, setPanelState] = useState<AddPanel>(manualOpen ? "manual" : inviteOpen ? "invite" : null);
  const setPanel = useCallback((next: AddPanel) => {
    setPanelState(next);
    try {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${addSearchFor(window.location.search, next)}`);
    } catch {
      // The address is a convenience (reload keeps the panel); the panel itself works without it.
    }
  }, []);
  const close = useCallback(() => router.replace(preserveHref("/app/contacts")), [router, preserveHref]);
  return (
    <Orbit2026Scope language={language} className={inviteStyles.scope}>
      <ToastProvider>
        <AddContactDialog open={panel === null} onClose={close} language={language} href={preserveHref} onManual={() => setPanel("manual")} onInvite={() => setPanel("invite")} />
        <ManualContactDrawer open={panel === "manual"} onClose={close} navigate={(href) => router.push(preserveHref(href))} />
        <InviteCodeModal open={panel === "invite"} onClose={close} language={language} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}
