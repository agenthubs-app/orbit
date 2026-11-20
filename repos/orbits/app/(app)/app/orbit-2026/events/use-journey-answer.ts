"use client";

// 2026-11-21 活动行程页（详情 / 会場 / 会後 / 参加者の詳細）共用的读取：与一级页同一套规则。
// - 先画「上次的结果」（orbit-last-answer，内存、按账号），没有就由页面画骨架；新结果回来原位替换，不回骨架。
// - 新鲜期内（且没被写操作作废）挂载不再发请求；同一资源正在进行的请求共享（orbit-shared-read），
//   连点同一个人、右栏与抽屉同时挂载都只发一次。
// - 读失败时保留已显示的内容；还没有内容时才把失败原因交给页面（not_found → 页面自己的「找不到」，其他 → 重试）。
import { useCallback, useEffect, useRef, useState } from "react";

import { answerFresh, lastAnswer, rememberAnswer } from "../../orbit-last-answer";
import { sharedRead } from "../../orbit-shared-read";
import { useSharedReadAccount } from "../../orbit-shared-read-account";
import type { EventsApiFailure, EventsApiResult } from "./events-api";

export type JourneyAnswer<T> = {
  data: T | null;
  /** 还没有内容时的失败原因；有内容时读失败不报（继续显示上次的）。 */
  failure: EventsApiFailure | null;
  reload: () => Promise<void>;
  /** 本地改动后的新内容（同时记成上次的结果）。 */
  update: (next: T | ((current: T | null) => T | null)) => void;
};

export function useJourneyAnswer<T>(key: string, load: () => Promise<EventsApiResult<T>>, freshMs: number): JourneyAnswer<T> {
  useSharedReadAccount();
  const [data, setData] = useState<T | null>(() => lastAnswer<T>(key) ?? null);
  const [failure, setFailure] = useState<EventsApiFailure | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const keyRef = useRef(key);
  keyRef.current = key;

  const reload = useCallback(async () => {
    const asked = key;
    let res: EventsApiResult<T>;
    try {
      res = await sharedRead(`journey:${asked}`, () => loadRef.current());
    } catch {
      res = { ok: false, reason: "network" };
    }
    if (keyRef.current !== asked) return;
    if (res.ok) {
      rememberAnswer(asked, res.data);
      setData(res.data);
      setFailure(null);
    } else {
      const failed = (res as { ok: false; reason: EventsApiFailure }).reason;
      setData((current) => {
        if (current === null) setFailure(failed);
        return current;
      });
    }
  }, [key]);

  useEffect(() => {
    setData(lastAnswer<T>(key) ?? null);
    setFailure(null);
    if (!answerFresh(key, freshMs)) void reload();
  }, [key, freshMs, reload]);

  const update = useCallback((next: T | ((current: T | null) => T | null)) => {
    setData((current) => {
      const value = typeof next === "function" ? (next as (current: T | null) => T | null)(current) : next;
      if (value !== null) rememberAnswer(keyRef.current, value);
      return value;
    });
  }, []);

  return { data, failure, reload, update };
}
