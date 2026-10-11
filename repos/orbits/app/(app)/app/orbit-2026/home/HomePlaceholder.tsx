"use client";

import { useOrbitLanguage } from "../../orbit-language-context";
import { pickCopy } from "../copy/types";
import { shellCopy } from "../copy/shell";
import { monthHeading } from "../shell/month-heading";
import { ShellBellButton, ShellSearchButton } from "../shell/Orbit2026Shell";
import { ShellPage } from "../shell/slots";
import { Button, EmptyState, Orbit2026Scope, useStandardCopy, useToast } from "../ui";
import styles from "./home.module.css";

// R07 home placeholder. The header is web.html's ホーム: 🔍 · 「10月」 over the month's
// range · 🔔 (unread dot) and ⊞ 編集 (768–1279 the shell adds 次の一手 after them, b12 N07).
// R10 replaces the body.
export function HomePlaceholder() {
  const { language } = useOrbitLanguage();
  const { month, range } = monthHeading(language);
  return (
    <>
      <ShellPage title={month} subtitle={range} left={<ShellSearchButton />} right={<HomeHeaderActions />} rightRail />
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
      <ShellBellButton />
      <Button label={copy.homeEdit.edit} icon="grid" onClick={() => toast.info(copy.homeEdit.comingSoon)} />
    </>
  );
}
