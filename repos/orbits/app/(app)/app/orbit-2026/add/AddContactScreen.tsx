"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { addDoorsCopy as d } from "../copy/add";
import { ShellPage } from "../shell/slots";
import { Orbit2026Scope, ToastProvider } from "../ui";
import { AddContactDoors } from "./AddContactDoors";
import { ManualContactDrawer } from "./ManualContactDrawer";
import { translator } from "./add-parts";
import styles from "./add.module.css";

/** `?add=manual` keeps the 手入力 drawer open across reloads and is shareable (DESIGN §7). */
export function addSearchFor(search: string, manual: boolean): string {
  const params = new URLSearchParams(search);
  if (manual) params.set("add", "manual");
  else params.delete("add");
  const next = params.toString();
  return next ? `?${next}` : "";
}

/**
 * `/app/contacts/new` — 人脈を追加 (R12, DESIGN §2.1 Web): the doors in the shell (左栏
 * 「人脈」), the 手入力 drawer on `?add=manual`. No right rail until R15 adds 招待 there.
 */
export function AddContactScreen({ manualOpen = false }: { manualOpen?: boolean }) {
  const { language, preserveHref } = useOrbitLanguage();
  const router = useRouter();
  const t = translator(language);
  const [manual, setManual] = useState(manualOpen);
  const setManualOpen = useCallback((open: boolean) => {
    setManual(open);
    try {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${addSearchFor(window.location.search, open)}`);
    } catch {
      // The address is a convenience (reload keeps the drawer); the drawer itself works without it.
    }
  }, []);
  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ToastProvider>
        <ShellPage title={t(d.pageTitle)} subtitle={t(d.pageSubtitle)} />
        <div className={styles.fade} data-add-page="">
          <AddContactDoors language={language} href={preserveHref} onManual={() => setManualOpen(true)} />
        </div>
        <ManualContactDrawer open={manual} onClose={() => setManualOpen(false)} navigate={(href) => router.push(preserveHref(href))} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}
