/**
 * 引导期示例模式的前端核心（W0004 定义；W0005 起从 `demo-mode-context.tsx` 拆出）。
 *
 * - `DemoModeProvider` / `useDemoMode`：服务端算出「在示例里」时由页面挂上；没挂时
 *   `useDemoMode()` 返回 null，所有组件照旧走真实数据。
 * - `guardWrite(label)`：示例里的写操作一律改成弹出「这是示例」拦截层，不发任何请求。
 * - `DemoBanner`／`DemoNavPill`／`DemoTag`／`DemoInterceptLayer`：横条、收起后的药丸、
 *   「示例」角标、拦截层。
 *
 * 这里只依赖 React 与语言上下文，不牵连 `next/navigation`、全局提问框或首页示例数据，
 * 所以人脉页的组件（包括脱离 Next 单独打包的浏览器测试）可以直接引用。iOrbit 专用的
 * `DemoHandoffGuard`／`DemoAskTarget` 仍在 `demo-mode-context.tsx`（它转出本文件的全部名字）。
 */
"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { useOrbitLanguage } from "../orbit-language-context";
import { useOrbitModalA11y } from "../orbit-modal-a11y";
import { ORBIT_Z } from "../orbit-z";
import { demoNow } from "./demo-clock";

export const GUIDE_START_HREF = "/app/start";
export const GUIDE_STATE_ENDPOINT = "/api/guide/state";

type GuideStep = "contacts" | "goal" | "plan";

/** 页面下传给壳的示例视图（由 route adapter 从引导状态映射而来）。 */
export interface DemoModeView {
  bannerCollapsed: boolean;
  /** 第 1–3 步已完成几步。 */
  completed: number;
  confirmedContacts: number;
  nextStep: GuideStep | null;
  steps: Readonly<Record<GuideStep, boolean>>;
}

export interface DemoModeValue {
  /** 示例时钟（东京的今天 11:40）。 */
  clock: () => Date;
  collapsed: boolean;
  guardWrite: (label: string) => void;
  /** 当前拦截层的标签；null 表示没弹。 */
  intercept: string | null;
  closeIntercept: () => void;
  setCollapsed: (collapsed: boolean) => void;
  view: DemoModeView;
}

/** 模块级常量：引用稳定，概览屏的分钟时钟不会因为横条收起而重建。 */
const demoClock = () => demoNow();

const DemoModeContext = createContext<DemoModeValue | null>(null);

export function useDemoMode(): DemoModeValue | null {
  return useContext(DemoModeContext);
}

async function sendCollapse(value: boolean): Promise<boolean> {
  try {
    const response = await fetch(GUIDE_STATE_ENDPOINT, {
      body: JSON.stringify({ bannerCollapsed: value }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function DemoModeProvider({ children, view }: { children: ReactNode; view: DemoModeView }) {
  const [collapsed, setCollapsedState] = useState(view.bannerCollapsed);
  const [intercept, setIntercept] = useState<string | null>(null);

  // 收起状态的写入：同一时刻最多一个请求在路上；在路上时的新点击只更新「想要的值」，
  // 请求回来后若想要的值和服务端已确认的值不同，再发一次最新的。这样连点
  // 收起→展开，无论响应先后，服务端最后留下的都是最后一次选择。写失败即停，
  // 界面保留本次页面的状态，下次点击再写。
  const desiredRef = useRef(view.bannerCollapsed);
  const confirmedRef = useRef(view.bannerCollapsed);
  const inFlightRef = useRef(false);
  const flushCollapse = useCallback(async () => {
    if (inFlightRef.current) return;
    while (desiredRef.current !== confirmedRef.current) {
      const value = desiredRef.current;
      inFlightRef.current = true;
      const ok = await sendCollapse(value);
      inFlightRef.current = false;
      if (!ok) return;
      confirmedRef.current = value;
    }
  }, []);

  const guardWrite = useCallback((label: string) => setIntercept(label), []);
  const closeIntercept = useCallback(() => setIntercept(null), []);
  const setCollapsed = useCallback(
    (next: boolean) => {
      setCollapsedState(next);
      desiredRef.current = next;
      void flushCollapse();
    },
    [flushCollapse],
  );

  const value = useMemo<DemoModeValue>(
    () => ({
      clock: demoClock,
      closeIntercept,
      collapsed,
      guardWrite,
      intercept,
      setCollapsed,
      view,
    }),
    [closeIntercept, collapsed, guardWrite, intercept, setCollapsed, view],
  );

  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>;
}

/**
 * 拦截层的挂载点：放在页面皮肤的作用域里面（`ir-demo-*` 样式靠那个祖先选择器），
 * `position:fixed`，DOM 位置不影响布局。
 */
export function DemoInterceptLayer() {
  const demo = useDemoMode();
  if (!demo || demo.intercept === null) return null;
  return <DemoWriteGuard label={demo.intercept} onClose={demo.closeIntercept} view={demo.view} />;
}

function useGuideCopy(view: DemoModeView | null) {
  const { t } = useOrbitLanguage();
  if (!view) return null;
  const cta =
    view.completed === 0
      ? t({ en: "Start the guide →", zh: "开始引导 →" })
      : t({ en: "Continue the guide →", zh: "继续引导 →" });
  const next =
    view.nextStep === "contacts"
      ? view.confirmedContacts === 0
        ? t({ en: "add 3 business cards", zh: "放进 3 张名片" })
        : t({ en: "confirm cards until you have 3", zh: "确认名片，凑够 3 位" })
      : view.nextStep === "goal"
        ? t({ en: "set your goal", zh: "设定目标" })
        : t({ en: "generate your first plan", zh: "生成第一份计划" });
  const sub =
    view.completed === 0
      ? t({ en: "3 steps and this becomes your own data", zh: "3 步就能换成你的数据" })
      : t({
          en: `Progress ${view.completed} / 3 · Next: ${next}`,
          zh: `进度 ${view.completed} / 3 · 下一步：${next}`,
        });
  return { cta, sub, t };
}

const HOME_BANNER_MESSAGE = {
  en: "Once you finish the guide, this becomes your own today and your own plan.",
  zh: "完成引导后，这里会是你自己的今日要事和计划。",
};

/**
 * 页面顶部的「示例预览」横条；收起后不渲染（改由导航药丸承接）。`message` 是各页自己的
 * 一句话（W0005 人脉页：「完成引导后，这里换成你自己的人脉。」），缺省为首页那句。
 */
export function DemoBanner({ message = HOME_BANNER_MESSAGE }: { message?: { en: string; zh: string } } = {}) {
  const demo = useDemoMode();
  const view = demo?.view ?? null;
  const copy = useGuideCopy(view);
  if (!demo || !view || !copy || demo.collapsed) return null;
  const { cta, sub, t } = copy;
  return (
    <div className="ir-demo-bar" data-orbit-guide-demo-banner role="note">
      <span className="ir-demo-tagline">{t({ en: "DEMO PREVIEW", zh: "示例预览" })}</span>
      <p className="ir-demo-msg">
        {t(message)}
        <small>{sub}</small>
      </p>
      <span aria-hidden className="ir-demo-prog">
        {(["contacts", "goal", "plan"] as const).map((step) => (
          <i className={view.steps[step] ? "ir-demo-pip ir-demo-pip-on" : "ir-demo-pip"} key={step} />
        ))}
      </span>
      <a className="ir-demo-cta" data-orbit-guide-start href={GUIDE_START_HREF}>
        {cta}
      </a>
      <button
        aria-label={t({ en: "Collapse the demo notice", zh: "收起提示" })}
        className="btn ir-demo-collapse"
        data-orbit-guide-demo-collapse
        onClick={() => demo.setCollapsed(true)}
        type="button"
      >
        {t({ en: "Collapse", zh: "收起" })}
      </button>
    </div>
  );
}

/** 横条收起后在导航栏右侧的药丸；点它把横条展开回来。 */
export function DemoNavPill() {
  const demo = useDemoMode();
  const { t } = useOrbitLanguage();
  if (!demo || !demo.collapsed) return null;
  return (
    <button
      className="btn ir-demo-pill"
      data-orbit-guide-demo-pill
      onClick={() => demo.setCollapsed(false)}
      type="button"
    >
      {demo.view.completed === 0
        ? t({ en: "Demo · Start the guide", zh: "示例 · 开始引导" })
        : t({ en: "Demo · Continue the guide", zh: "示例 · 继续引导" })}
    </button>
  );
}

/** 示例人名旁的「示例」角标。 */
export function DemoTag() {
  const { t } = useOrbitLanguage();
  return (
    <span className="ir-demo-tag" data-orbit-guide-demo-tag>
      {t({ en: "Demo", zh: "示例" })}
    </span>
  );
}

function DemoWriteGuard({
  label,
  onClose,
  view,
}: {
  label: string;
  onClose: () => void;
  view: DemoModeView;
}) {
  const { t } = useOrbitLanguage();
  const cardRef = useOrbitModalA11y(onClose);
  const cta =
    view.completed === 0
      ? t({ en: "Start the guide →", zh: "开始引导 →" })
      : t({ en: "Continue the guide →", zh: "继续引导 →" });
  return (
    <div
      className="ir-demo-scrim"
      data-orbit-guide-demo-intercept
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{ zIndex: ORBIT_Z.modal }}
    >
      <div
        aria-labelledby="ir-demo-intercept-title"
        aria-modal="true"
        className="ir-demo-sheet"
        ref={cardRef}
        role="dialog"
        tabIndex={-1}
      >
        <h3 id="ir-demo-intercept-title">{t({ en: "This is a demo", zh: "这是示例" })}</h3>
        <p>
          {t({
            en: `Once you finish the guide, this will be your own ${label}, and you can act on it directly. Progress: ${view.completed} / 3.`,
            zh: `完成引导后，这里会是你自己的${label}，可以直接操作。现在进度 ${view.completed} / 3。`,
          })}
        </p>
        <div className="ir-demo-sheet-acts">
          <button className="btn ir-demo-dismiss" data-orbit-guide-demo-dismiss onClick={onClose} type="button">
            {t({ en: "Got it", zh: "知道了" })}
          </button>
          <a className="ir-demo-cta ir-demo-cta-primary" href={GUIDE_START_HREF}>
            {cta}
          </a>
        </div>
      </div>
    </div>
  );
}
