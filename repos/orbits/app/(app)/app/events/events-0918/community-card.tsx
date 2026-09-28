"use client";

/**
 * 活动页置顶的「加入 iOrbit 用户社群」卡片（RW-06、D6、D4）。
 *
 * 社群不是活动：卡片不进活动网格、不参与搜索 / 筛选 / 统计，也不走报名接口。
 * 素材来自 `features/community/config.ts`，占位项逐一标「占位」。
 * 「我已加入」= `PUT /api/community/membership`（幂等，只写本人记录）；
 * 初始状态由服务端读取后传入，刷新或换设备首帧就是「已加入」。
 * 版式按 2026-09 引导原型第 4 步的社群块：112px 二维码 + 标签 / 标题 / 介绍 / 微信号 / 按钮。
 */
import { useRef, useState } from "react";

import { COMMUNITY_CONFIG } from "../../../../../features/community/config";
import { useOrbitLanguage } from "../../orbit-language-context";

export const COMMUNITY_CARD_ANCHOR = "iorbit-community";
export const COMMUNITY_MEMBERSHIP_ENDPOINT = "/api/community/membership";

const S = '[data-orbit-real-page="events-0918"]';
const BUTTONS = ["ev-community-copy", "ev-community-join"];

// 同一页只有这张卡片用浅靛蓝底；新增 .btn 类按 events-0918 口径中和基类。
export const COMMUNITY_CARD_STYLES = `
${BUTTONS.map((name) => `${S} .btn.${name}`).join(", ")} { height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; cursor: pointer; }
${BUTTONS.map((name) => `${S} .btn.${name}:active`).join(", ")} { transform: none; }
${S} .ev-community { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 18px; padding: 18px; border: 1px solid #DDDEFA; border-radius: 14px; background: #F4F5FC; scroll-margin-top: 96px; }
${S} .ev-community-qr { width: 112px; height: 112px; border-radius: 10px; border: 1.5px dashed #B9BCEB; background: #FFFFFF; display: grid; place-items: center; text-align: center; font-size: 11.5px; line-height: 1.5; color: #9FA3C4; overflow: hidden; }
${S} .ev-community-qr img { width: 100%; height: 100%; object-fit: contain; }
${S} .ev-community-body { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
${S} .ev-community-tags { display: flex; flex-wrap: wrap; gap: 6px; }
${S} .ev-community-tag { padding: 3px 10px; border-radius: 999px; font-size: 12px; line-height: 1.5; background: #FFFFFF; color: #3B3F7A; border: 1px solid #DDDEFA; }
${S} .ev-community-tag-free { background: #4B4FC7; border-color: #4B4FC7; color: #FFFFFF; }
${S} .ev-community-tag-pin { background: transparent; color: #4B4FC7; border-color: #B9BCEB; }
${S} .ev-community-title { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 19px; line-height: 1.3; color: #0E1225; }
${S} .ev-community-intro { margin: 0; font-size: 13.5px; line-height: 1.65; color: #3B3F7A; }
${S} .ev-community-ph { color: #C4461B; font-size: 11.5px; }
${S} .ev-community-wx { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; color: #3B3F7A; }
${S} .ev-community-wx code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12.5px; padding: 2px 8px; border-radius: 6px; border: 1px solid #E8E9F6; background: #FFFFFF; color: #0E1225; user-select: all; }
${S} .btn.ev-community-copy { padding: 0; border: 0; background: transparent; color: #4B4FC7; font-size: 13px; font-weight: 400; }
${S} .btn.ev-community-copy:hover { color: #2E3270; }
${S} .ev-community-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-top: 2px; }
${S} .btn.ev-community-join { padding: 9px 18px; border: 0; border-radius: 10px; background: #4B4FC7; color: #FFFFFF; font-size: 14px; font-weight: 500; }
${S} .btn.ev-community-join:hover { background: #2E3270; color: #FFFFFF; }
${S} .btn.ev-community-join[data-joined="true"], ${S} .btn.ev-community-join[data-joined="true"]:hover { background: #ECEEFB; color: #2E3270; cursor: default; }
${S} .btn.ev-community-join[aria-busy="true"] { opacity: 0.7; cursor: progress; }
${S} .ev-community-hint { font-size: 12.5px; color: #6B6F99; }
${S} .ev-community-status { margin: 0; font-size: 12.5px; color: #6B6F99; }
/* 状态行常驻 DOM（aria-live 区域要先存在才能播报）；空时不占版面。 */
${S} .ev-community-status:empty { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
${S} .ev-community-status[data-tone="error"] { color: #C4461B; }
@media (max-width: 560px) {
  ${S} .ev-community { grid-template-columns: minmax(0, 1fr); gap: 14px; padding: 16px; }
}
`;

type StatusState = "idle" | "copied" | "selected" | "joined";

export function CommunityCard({
  joined: initialJoined,
  loginHref = "/app/account/login?next=%2Fapp%2Fevents",
  onJoined,
  signedIn,
}: {
  joined: boolean;
  loginHref?: string;
  /** 加入记录写成功后回调（W0006 引导页第 4 步据此标记完成）。 */
  onJoined?: () => void;
  signedIn: boolean;
}) {
  const { t } = useOrbitLanguage();
  const config = COMMUNITY_CONFIG;
  const [joined, setJoined] = useState(initialJoined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusState>("idle");
  const idRef = useRef<HTMLElement | null>(null);

  const copyWechatId = async () => {
    try {
      await navigator.clipboard.writeText(config.wechatId);
      setStatus("copied");
    } catch {
      // 剪贴板不可用或被拒绝：选中微信号，让用户自己复制。
      const node = idRef.current;
      const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
      if (node && selection && typeof document !== "undefined") {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setStatus("selected");
    }
  };

  const markJoined = async () => {
    if (joined || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(COMMUNITY_MEMBERSHIP_ENDPOINT, { method: "PUT" });
      const body = (await response.json().catch(() => null)) as
        | { success?: boolean; data?: { joined?: boolean } }
        | null;
      if (response.ok && body?.success === true && body.data?.joined === true) {
        setJoined(true);
        setStatus("joined");
        onJoined?.();
      } else if (response.status === 401) {
        setError(t({ en: "Sign in first, then mark yourself as joined.", zh: "请先登录，再标记已加入。" }));
      } else {
        setError(t({ en: "Couldn't save that. Please try again.", zh: "没有保存成功，请再试一次。" }));
      }
    } catch {
      setError(t({ en: "Couldn't save that. Please try again.", zh: "没有保存成功，请再试一次。" }));
    } finally {
      setPending(false);
    }
  };

  const placeholder = t({ en: "Placeholder", zh: "占位" });
  const statusText =
    error ??
    (status === "joined"
      ? t({ en: "You've joined the iOrbit user community.", zh: "已加入 iOrbit 用户社群。" })
      : status === "copied"
        ? t({ en: "WeChat ID copied.", zh: "微信号已复制。" })
        : status === "selected"
          ? t({ en: "WeChat ID selected. Press ⌘C / Ctrl+C to copy.", zh: "已选中微信号，按 ⌘C / Ctrl+C 复制。" })
          : "");

  return (
    <section
      aria-labelledby="ev-community-title"
      className="ev-community"
      data-events-community={joined ? "joined" : "invite"}
      id={COMMUNITY_CARD_ANCHOR}
    >
      <style>{COMMUNITY_CARD_STYLES}</style>
      <div className="ev-community-qr" data-community-placeholder={config.placeholder.qr ? "qr" : undefined}>
        {config.qrImageSrc && !config.placeholder.qr ? (
          <img
            alt={t({ en: "QR code for the iOrbit assistant", zh: "iOrbit 助手二维码" })}
            height={112}
            src={config.qrImageSrc}
            width={112}
          />
        ) : (
          <span>
            {t({ en: "QR code", zh: "二维码" })}
            <br />
            {placeholder}
          </span>
        )}
      </div>
      <div className="ev-community-body">
        <div className="ev-community-tags">
          <span className="ev-community-tag ev-community-tag-free">{t({ en: "Free", zh: "免费" })}</span>
          <span className="ev-community-tag">{t({ en: "Always open", zh: "长期有效" })}</span>
          <span className="ev-community-tag ev-community-tag-pin">{t({ en: "Pinned", zh: "置顶" })}</span>
        </div>
        <h2 className="ev-community-title" id="ev-community-title">
          {t(config.name)}
        </h2>
        <p className="ev-community-intro">
          {t(config.summary)}
          {config.intro && !config.placeholder.intro ? (
            <> {t(config.intro)}</>
          ) : (
            <span className="ev-community-ph" data-community-placeholder="intro">
              {t({ en: "[Placeholder: group description, to be provided]", zh: "【占位：群介绍，待提供】" })}
            </span>
          )}
        </p>
        <div className="ev-community-wx">
          <span>{t({ en: "WeChat ID", zh: "微信号" })}</span>
          <code ref={idRef}>{config.wechatId}</code>
          {config.placeholder.wechatId ? (
            <span className="ev-community-ph" data-community-placeholder="wechat">{placeholder}</span>
          ) : null}
          <button className="btn ev-community-copy" onClick={copyWechatId} type="button">
            {t({ en: "Copy", zh: "复制" })}
          </button>
        </div>
        <div className="ev-community-acts">
          {signedIn ? (
            <button
              aria-busy={pending ? "true" : undefined}
              // 用 aria-disabled 而不是 disabled：加入成功后按钮仍可聚焦，焦点不会丢到 body。
              aria-disabled={joined || pending ? "true" : undefined}
              className="btn ev-community-join"
              data-joined={joined ? "true" : "false"}
              onClick={markJoined}
              type="button"
            >
              {joined ? t({ en: "✓ Joined", zh: "✓ 已加入" }) : t({ en: "I've joined", zh: "我已加入" })}
            </button>
          ) : (
            <a className="btn ev-community-join" href={loginHref}>
              {t({ en: "Sign in to mark as joined", zh: "登录后标记已加入" })}
            </a>
          )}
          <span className="ev-community-hint">
            {t({ en: "Scan to add the assistant, who will invite you to the group.", zh: "扫码添加助手，由助手拉你进群" })}
          </span>
        </div>
        <p aria-live="polite" className="ev-community-status" data-tone={error ? "error" : undefined} role="status">
          {statusText}
        </p>
      </div>
    </section>
  );
}
