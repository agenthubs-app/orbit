"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { addDoorsCopy as d } from "../copy/add";
import { ShellPage } from "../shell/slots";
import { Orbit2026Scope, ToastProvider } from "../ui";
import { AddContactDoors } from "./AddContactDoors";
import { InviteCodeModal, InviteRailCard } from "./invite/InviteCodeModal";
import { ManualContactDrawer } from "./ManualContactDrawer";
import { translator } from "./add-parts";
import styles from "./add.module.css";
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
 * `/app/contacts/new` — 人脈を追加 (R12, DESIGN §2.1 Web): the doors in the shell (左栏
 * 「人脈」), the 手入力 drawer on `?add=manual`, the 招待コード dialog on `?add=invite` (R15) and
 * the right rail いちばん早い方法 (招待コードを 3人に送る).
 */
export function AddContactScreen({ manualOpen = false, inviteOpen = false }: { manualOpen?: boolean; inviteOpen?: boolean }) {
  const { language, preserveHref } = useOrbitLanguage();
  const router = useRouter();
  const t = translator(language);
  const [panel, setPanelState] = useState<AddPanel>(manualOpen ? "manual" : inviteOpen ? "invite" : null);
  const setPanel = useCallback((next: AddPanel) => {
    setPanelState(next);
    try {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${addSearchFor(window.location.search, next)}`);
    } catch {
      // The address is a convenience (reload keeps the panel); the panel itself works without it.
    }
  }, []);
  const rail = useMemo(() => <InviteRailCard language={language} onCreate={() => setPanel("invite")} />, [language, setPanel]);
  return (
    <Orbit2026Scope language={language} className={`${styles.page} ${inviteStyles.scope}`}>
      <ToastProvider>
        <ShellPage title={t(d.pageTitle)} subtitle={t(d.pageSubtitle)} rightRail={rail} />
        <div className={styles.fade} data-add-page="">
          <AddContactDoors language={language} href={preserveHref} onManual={() => setPanel("manual")} onInvite={() => setPanel("invite")} />
        </div>
        <ManualContactDrawer open={panel === "manual"} onClose={() => setPanel(null)} navigate={(href) => router.push(preserveHref(href))} />
        <InviteCodeModal open={panel === "invite"} onClose={() => setPanel(null)} language={language} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}
