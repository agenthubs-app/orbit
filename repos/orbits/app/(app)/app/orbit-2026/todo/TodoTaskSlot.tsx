"use client";

import { useEffect, useState } from "react";
import { localParts } from "../../../../../features/tasks/local-date-time";
import { useOrbitLanguage } from "../../orbit-language-context";
import { pickCopy } from "../copy/types";
import { taskCopy } from "../copy/task";
import { Orbit2026Scope, RetryCard, Skeleton } from "../ui";
import { TodoWorkspace } from "./TodoWorkspace";

/** Device-zone selection is explicit; no SSR assumption about the browser's day. */
export function TodoTaskSlot({ actorId, initialAdd = false }: { actorId?: string; initialAdd?: boolean }) {
  const { language } = useOrbitLanguage();
  const [context, setContext] = useState<{ date: string; timeZone: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const update = () => {
      try {
        const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
        const date = localParts(new Date(), timeZone).date;
        setContext(current => current?.date === date && current.timeZone === timeZone ? current : { date, timeZone });
        setFailed(false);
      } catch { setFailed(true); }
    };
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [retry]);
  if (failed || !context) return <Orbit2026Scope language={language}>{failed ? <RetryCard title={pickCopy(taskCopy.todoReadFailed, language)} onRetry={() => setRetry(value => value + 1)} /> : <Skeleton lines={5} />}</Orbit2026Scope>;
  return <TodoWorkspace actorId={actorId} language={language} timeZone={context.timeZone} date={context.date} initialAdd={initialAdd} />;
}
