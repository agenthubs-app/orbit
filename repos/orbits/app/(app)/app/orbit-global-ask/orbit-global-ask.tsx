"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useOrbitLanguage } from "../orbit-language-context";
import { Icon } from "../orbit-reference-primitives";
import { useOrbitAsk } from "./orbit-ask-context";
import { allowsOrbitAsk, isOrbitAskHome, orbitAskPageContext } from "./orbit-ask-routes";
import { ORBIT_ASK_STYLES } from "./orbit-global-ask-styles";

/** 提示语轮换间隔。用户已经开始打字就不再打扰。 */
const HINT_INTERVAL_MS = 3500;

/**
 * 收起态的按钮标记：Orbit 品牌环 + 轨道点，白色描在 AI 渐变上。
 *
 * 与 `orbit-reference-primitives` 的 `Logo` 同形，但这里固定用 currentColor，
 * 好让按钮的白色继承下来——`Logo` 的 color 默认是 `--accent`，压在渐变上会糊。
 */
function OrbitAskMark({ size = 26 }: { size?: number }) {
  return (
    <svg aria-hidden fill="none" height={size} viewBox="0 0 28 28" width={size}>
      <circle cx="14" cy="14" opacity="0.5" r="12.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="14" cy="14" fill="currentColor" r="4.4" />
      <circle cx="24.2" cy="10" fill="currentColor" r="2.5" />
    </svg>
  );
}

export function OrbitGlobalAsk() {
  const pathname = usePathname() ?? "";
  const { status } = useSession();
  const ask = useOrbitAsk();

  // 三道门：没登录、路由不在白名单、没有 provider —— 任何一条不满足都不渲染。
  // 这个组件挂在 /app 的 layout 上，一旦抛错整个产品面都会白屏，所以宁可少显示。
  // /app/agent already owns the full conversation composer. Rendering a second
  // fixed launcher there duplicates the same action and can cover result text
  // on narrow screens, so the global entry is reserved for cross-page access.
  const mounted =
    status === "authenticated" &&
    allowsOrbitAsk(pathname) &&
    !isOrbitAskHome(pathname) &&
    Boolean(ask);

  if (!mounted || !ask) return null;

  return <OrbitAskDock />;
}

function OrbitAskDock() {
  const pathname = usePathname() ?? "";
  const { language, t } = useOrbitLanguage();
  const ask = useOrbitAsk();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // 全局提问器始终由用户主动展开，展开后才聚焦；iOrbit 工作台自己的主输入区
  // 仍按页面阅读顺序获得焦点。
  const openedByUser = useRef(false);
  const hintOrderRef = useRef<string[]>([]);
  const [hint, setHint] = useState("");
  const [contextDismissed, setContextDismissed] = useState(false);

  const open = ask?.open ?? false;
  const busy = ask?.busy ?? false;
  const draft = ask?.draft ?? "";
  const setDraft = ask?.setDraft;
  const setOpen = ask?.setOpen;
  const submit = ask?.submit;
  const submitsInPlace = ask?.submitsInPlace ?? false;

  const pageContext = orbitAskPageContext(pathname, language);
  // iOrbit 工作台自己就是落点，不需要告诉用户「会带走哪一页的上下文」。
  const showContext = Boolean(pageContext) && !submitsInPlace && !contextDismissed;
  const activeContext = showContext ? pageContext : null;

  const chips = useMemo(() => {
    const registered = ask?.chips ?? [];

    if (registered.length) return registered.slice(0, 2);

    return [
      {
        label: t({ en: "Who's worth following up", zh: "找值得跟进的人脉" }),
        query: t({
          en: "Who should I follow up with right now?",
          zh: "现在最值得跟进的人是谁？",
        }),
      },
      {
        label: t({ en: "Events worth joining", zh: "推荐可拓展活动" }),
        query: t({
          en: "Which upcoming events are worth joining?",
          zh: "接下来有哪些值得去的活动？",
        }),
      },
    ];
  }, [ask?.chips, t]);

  const hints = useMemo(
    () => [
      ...chips.map((chip) => chip.label),
      t({ en: "Who should I prioritize at my next event?", zh: "下一场活动我该重点找谁聊？" }),
      t({ en: "Add my next step to my follow-ups", zh: "把我的下一步加到待办里" }),
      t({ en: "Which events this month are worth going to?", zh: "这个月还有哪些值得去的活动？" }),
    ],
    [chips, t],
  );

  const nextHint = useCallback(() => {
    if (!hintOrderRef.current.length) {
      const order = [...hints];

      for (let i = order.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }

      hintOrderRef.current = order;
    }

    return hintOrderRef.current.pop() ?? "";
  }, [hints]);

  // 换页时把「上下文 chip 被划掉」的状态复位：那是对上一页的决定。
  useEffect(() => {
    setContextDismissed(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;

    setHint(nextHint());

    const timer = window.setInterval(() => {
      if (inputRef.current?.value) return;
      setHint(nextHint());
    }, HINT_INTERVAL_MS);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen?.(false);
    };

    document.addEventListener("keydown", onKeyDown);

    if (openedByUser.current) inputRef.current?.focus();

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [nextHint, open, setOpen]);

  /**
   * 给页面底部让位。
   *
   * 输入框是 fixed 的，不占文档流，滚到底时会压住最后一屏内容。这里把实测高度
   * 写进 `--orbit-ask-clearance`，由样式表里的 `::after` 垫片在页面末尾补出同样
   * 高度的空白，于是「滚到底」的终点正好是输入框上沿。
   */
  useEffect(() => {
    const root = document.documentElement;

    if (!open) {
      root.style.setProperty("--orbit-ask-clearance", "0px");
      return undefined;
    }

    const panel = panelRef.current;

    if (!panel) return undefined;

    const measure = () => {
      // 面板高度 + 底部留白 18px + 一点呼吸空间，避免内容贴着输入框上沿。
      root.style.setProperty(
        "--orbit-ask-clearance",
        `${Math.ceil(panel.getBoundingClientRect().height) + 30}px`,
      );
    };

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(panel);

    return () => {
      observer.disconnect();
      root.style.setProperty("--orbit-ask-clearance", "0px");
    };
  }, [open]);

  // 卸载时一定要还回去，否则跳到 kiosk 页会留下一块永久空白。
  useEffect(
    () => () => document.documentElement.style.setProperty("--orbit-ask-clearance", "0px"),
    [],
  );

  const openDock = () => {
    openedByUser.current = true;
    setOpen?.(true);
  };

  const closeDock = () => {
    openedByUser.current = false;
    setOpen?.(false);
  };

  const send = (query: string) => {
    if (busy) return;

    const text = query.trim() || hint;

    if (!text) return;

    submit?.(text, activeContext);
  };

  const boundaryId = "orbit-global-ask-boundary";

  return (
    // data-orbit-real-page 不是装饰：整套主题 token（--text-2/--surface/--border…）
    // 都声明在 `[data-orbit-real-page]` 上，而这个组件挂在 layout 里、是页面根节点的
    // 兄弟，不带这个属性就一个变量都取不到。display:contents 让包裹层不生成盒子，
    // 只借用变量继承，不参与布局。
    <div
      className="oga-root"
      data-orbit-ask-clearance="manual"
      data-orbit-real-page="global-ask"
    >
      <style dangerouslySetInnerHTML={{ __html: ORBIT_ASK_STYLES }} />

      <button
        aria-expanded={open}
        aria-label={t({ en: "Open iOrbit", zh: "打开 iOrbit" })}
        className={`oga-ball${open ? " oga-hide" : ""}`}
        data-orbit-global-ask-ball
        onClick={openDock}
        type="button"
      >
        <OrbitAskMark size={26} />
      </button>

      <div className={`oga-dock${open ? "" : " oga-hide"}`} data-orbit-global-ask-dock>
        <div
          aria-label={t({ en: "Ask iOrbit", zh: "iOrbit 快速提问" })}
          className="oga-panel"
          data-orbit-global-ask-panel
          ref={panelRef}
          role="region"
        >
          <span aria-hidden className="oga-halo">
            <i className="h1" />
            <i className="h2" />
            <i className="h3" />
          </span>

          <div className="oga-top">
            <div className="oga-chips">
              {chips.map((chip) => (
                <button
                  className="oga-chip"
                  key={chip.label}
                  onClick={() => {
                    setDraft?.(chip.query);
                    window.requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                  type="button"
                >
                  {chip.label}
                </button>
              ))}
              {showContext ? (
                <span className="oga-context" data-orbit-global-ask-context>
                  <Icon name="pin" size={12} />
                  {t({ en: "About ", zh: "关于" })}
                  {pageContext}
                  <button
                    aria-label={t({
                      en: "Do not send this page as context",
                      zh: "不要带上这一页的上下文",
                    })}
                    className="oga-context-x"
                    onClick={() => setContextDismissed(true)}
                    type="button"
                  >
                    <Icon name="x" size={11} />
                  </button>
                </span>
              ) : null}
            </div>
            <button
              aria-label={t({ en: "Collapse", zh: "收起" })}
              className="oga-close"
              data-orbit-global-ask-close
              onClick={closeDock}
              type="button"
            >
              <Icon name="x" size={15} />
            </button>
          </div>

          {/* 提交钮与隐私说明沿用 data-orbit-agent-* 命名：它们仍然是 agent
              composer 的同一批控件，只是搬了家。改名只会白白废掉一串既有的
              a11y 与路由契约测试。 */}
          <form
            className="oga-row"
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
            }}
          >
            <span className="oga-lead">
              <Icon name="message" size={16} />
            </span>
            <input
              aria-describedby={boundaryId}
              aria-label={t({
                en: "Ask Orbit about contacts, events, and relationship to-dos",
                zh: "询问 Orbit 人脉、活动与关系待办",
              })}
              data-orbit-global-ask-input
              onChange={(event) => setDraft?.(event.target.value)}
              placeholder={hint}
              ref={inputRef}
              type="text"
              value={draft}
            />
            <button
              aria-label={t({ en: "Send Ask Orbit message", zh: "发送给 Orbit" })}
              className="oga-send hit-44"
              data-orbit-agent-submit="true"
              disabled={busy}
              type="submit"
            >
              <Icon name="arrow" size={15} style={{ transform: "rotate(-45deg)" }} />
            </button>
          </form>

          <p className="oga-note" data-orbit-agent-privacy-boundary id={boundaryId}>
            {submitsInPlace
              ? t({
                  en: "External actions always need your confirmation first.",
                  zh: "涉及对外动作会先经你确认",
                })
              : t({
                  en: "Sending opens the iOrbit conversation · external actions always need your confirmation first.",
                  zh: "发送后进入 iOrbit 对话 · 涉及对外动作会先经你确认",
                })}
          </p>
        </div>
      </div>
    </div>
  );
}
