"use client";

import { useEffect, useState } from "react";
import { localParts } from "../../../../../features/tasks/local-date-time";
import { useOrbitLanguage } from "../../orbit-language-context";
import { pickCopy } from "../copy/types";
import { taskCopy } from "../copy/task";
import { Orbit2026Scope, RetryCard, Skeleton } from "../ui";
import { CalendarWorkspace } from "./CalendarWorkspace";

/** Match the Task To-do slot: select the device zone after hydration. */
export function CalendarTaskSlot({ actorId, initialDate, initialAdd = false }: { actorId: string; initialDate?: string; initialAdd?: boolean }) {
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
  if (failed || !context) return <Orbit2026Scope language={language}>{failed ? <RetryCard title={pickCopy(taskCopy.calendarReadFailed, language)} onRetry={() => setRetry(value => value + 1)} /> : <Skeleton lines={5} />}</Orbit2026Scope>;
  return <CalendarWorkspace actorId={actorId} language={language} timeZone={context.timeZone} today={context.date} initialDate={initialDate} initialAdd={initialAdd} />;
}
