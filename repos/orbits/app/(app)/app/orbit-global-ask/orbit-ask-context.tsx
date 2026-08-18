"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  clearAskDraft,
  readAskDraft,
  stashPendingAsk,
  writeAskDraft,
} from "./orbit-ask-draft";
import { ORBIT_ASK_HOME } from "./orbit-ask-routes";

export interface OrbitAskChip {
  label: string;
  query: string;
}

/**
 * 页面可以接管提问的落点。
 *
 * iOrbit 工作台注册自己的 `ask`，于是提问就地进入当前对话；没有页面注册时，
 * 默认行为是把问题暂存后跳去 iOrbit 工作台。
 */
export interface OrbitAskTarget {
  busy: boolean;
  chips: readonly OrbitAskChip[];
  onAsk: (query: string) => void;
}

interface OrbitAskContextValue {
  busy: boolean;
  chips: readonly OrbitAskChip[];
  draft: string;
  open: boolean;
  setDraft: (value: string) => void;
  setOpen: (open: boolean) => void;
  /** 发起提问。context 是用户当时认可的页面上下文标签（划掉 chip 后为 null）。 */
  submit: (query: string, context: string | null) => void;
  /** 当前页面是否自己接管了提问（iOrbit 工作台为 true）。 */
  submitsInPlace: boolean;
}

const NO_CHIPS: readonly OrbitAskChip[] = [];

const OrbitAskContext = createContext<OrbitAskContextValue | null>(null);

/**
 * 注册落点用的独立 context。
 *
 * 单独一条通道，是为了让面向 UI 的 context value 里没有 setter：输入框只该能
 * 读状态和提交，不该有能力改写「提问去哪」。
 */
const OrbitAskTargetSetterContext = createContext<
  ((target: OrbitAskTarget | null) => void) | null
>(null);

export function OrbitAskProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [draft, setDraftState] = useState("");
  // 全局提问器默认收起。iOrbit 工作台已有自己的主输入区；再自动展开一层固定
  // 输入框会遮住结果，也会制造两个并列的提交入口。
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<OrbitAskTarget | null>(null);

  // 草稿只能在挂载后读：sessionStorage 在服务端不存在，初值必须是空串。
  useEffect(() => {
    const stored = readAskDraft();

    if (stored) setDraftState(stored);
  }, []);

  // 换页时总是收起；草稿仍保留，用户主动点开后可继续写。
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const setDraft = useCallback((value: string) => {
    setDraftState(value);
    writeAskDraft(value);
  }, []);

  const submit = useCallback(
    (query: string, context: string | null) => {
      const trimmed = query.trim();

      if (!trimmed) return;

      setDraftState("");
      clearAskDraft();

      if (target) {
        target.onAsk(trimmed);
        setOpen(false);
        return;
      }

      // 跨页提问：问题走 sessionStorage 交接，URL 保持干净（见 orbit-ask-draft）。
      stashPendingAsk({ context, from: pathname || null, query: trimmed });
      setOpen(false);
      router.push(ORBIT_ASK_HOME);
    },
    [pathname, router, target],
  );

  const value = useMemo<OrbitAskContextValue>(
    () => ({
      busy: target?.busy ?? false,
      chips: target?.chips ?? NO_CHIPS,
      draft,
      open,
      setDraft,
      setOpen,
      submit,
      submitsInPlace: Boolean(target),
    }),
    [draft, open, setDraft, submit, target],
  );

  return (
    <OrbitAskTargetSetterContext.Provider value={setTarget}>
      <OrbitAskContext.Provider value={value}>{children}</OrbitAskContext.Provider>
    </OrbitAskTargetSetterContext.Provider>
  );
}

/** 给输入框用。没有 provider 时返回 null，调用方渲染 null 即可。 */
export function useOrbitAsk(): OrbitAskContextValue | null {
  return useContext(OrbitAskContext);
}

/**
 * 由页面注册提问落点，卸载时自动摘掉。
 *
 * 调用方必须把 `chips` 和 `onAsk` 记忆化（useMemo / useCallback），否则每次
 * 渲染都会重新注册。
 */
export function useOrbitAskTarget(target: OrbitAskTarget | null): void {
  const setTarget = useContext(OrbitAskTargetSetterContext);
  const busy = target?.busy ?? false;
  const chips = target?.chips;
  const onAsk = target?.onAsk;

  useEffect(() => {
    if (!setTarget) return undefined;

    if (!onAsk) {
      setTarget(null);
      return undefined;
    }

    setTarget({ busy, chips: chips ?? NO_CHIPS, onAsk });

    return () => setTarget(null);
  }, [busy, chips, onAsk, setTarget]);
}
