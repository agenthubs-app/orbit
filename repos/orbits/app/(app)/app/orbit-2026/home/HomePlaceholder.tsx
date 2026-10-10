"use client";

import { useOrbitLanguage } from "../../orbit-language-context";
import { pickCopy } from "../copy/types";
import { shellCopy } from "../copy/shell";
import { ShellPage } from "../shell/slots";
import { Button, EmptyState, IconButton, Orbit2026Scope, useStandardCopy, useToast } from "../ui";
import styles from "./home.module.css";

// R07 home placeholder (web.html:407 header: 🔔 + 編集). R10 replaces the body.
export function HomePlaceholder() {
  const { language } = useOrbitLanguage();
  return (
    <>
      <ShellPage title={useStandardCopy().nav.home} right={<HomeHeaderActions />} rightRail />
      <Orbit2026Scope language={language} className={styles.body}>
        <EmptyState title={pickCopy(shellCopy.homeEmptyTitle, language)} message={pickCopy(shellCopy.homeEmptyBody, language)} ghostRows={3} />
      </Orbit2026Scope>
    </>
  );
}

function HomeHeaderActions() {
  const copy = useStandardCopy();
  const toast = useToast();
  return (
    <>
      <IconButton icon="bell" label={copy.nav.inbox} onClick={() => { window.location.href = "/app/inbox"; }} />
      <Button label={copy.homeEdit.edit} size="sm" onClick={() => toast.info(copy.homeEdit.comingSoon)} />
    </>
  );
}
