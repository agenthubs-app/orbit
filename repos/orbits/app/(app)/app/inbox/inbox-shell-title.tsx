"use client";

import { useOrbitLanguage } from "../orbit-language-context";
import { pickCopy } from "../orbit-2026/copy/types";
import { shellCopy } from "../orbit-2026/copy/shell";
import { ShellPage } from "../orbit-2026/shell/slots";

export function InboxShellTitle() {
  const { language } = useOrbitLanguage();
  return <ShellPage title={pickCopy(shellCopy.inboxTitle, language)} />;
}
