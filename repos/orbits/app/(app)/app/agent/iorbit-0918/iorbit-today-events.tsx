/**
 * W0037（RH-03）：首页「今日要事」下方的活动小模组与紧凑社群卡。
 *
 * - 活动只来自 `IOrbitHome` 内的共享活动池 `eventPool`（W0036 建立：已排序、已去重、已排除
 *   已报名／已开始／本人主办，标题已按首页语言换好，地点是来源原文）。这里**不重新排序、不重新
 *   过滤**，按池的顺序取前几场；场数不够就只显示实际场数，不补占位卡。卡上没有报名按钮，整卡是
 *   详情链接；不显示费用（池里没有真实费用，W36-5）。
 * - 展开（`expanded`）：未加入社群时是社群卡 + 前 2 场，已加入时是前 3 场；已加入且池空时整块
 *   不渲染。收起：一行「本周还有 N 场适合你的活动 →」，N 按东京周一至周日只从池里数（W37-2），
 *   N=0 时整行不显示。展开与否、何时渲染由首页判定（要事就绪 + 池就绪；示例期固定展开，W37-1）。
 * - 「我已加入」：`PUT /api/community/membership`（幂等，只写本人记录）。乐观收起社群卡并补上第三场；
 *   失败（非 2xx、`joined` 不为 true、网络错误）回滚并在 `role="status"` 提示，401 单独文案；
 *   请求进行中再点不会发第二次。示例期同样真实写入（W37-1）。
 * - 素材仍是占位（D4）：微信号旁、二维码展开框都标「占位」。不复用活动页的 `CommunityCard`
 *   （作用域、常显二维码、非乐观更新、固定 id 都不适合首页），只沿用它的加入判定与文案。
 *
 * 首页文案只有 zh／en 两档（ja 界面按 en，W37-3）。
 */
"use client";

import { useRef, useState, type JSX } from "react";

import { COMMUNITY_CONFIG } from "../../../../../features/community/config";
import type { HomeEventPoolItem, HomeEventPoolReason } from "../../../../../features/agent/home-event-pool";
import { COMMUNITY_MEMBERSHIP_ENDPOINT } from "../../events/events-0918/community-card";
import { eventDetailHref } from "../../events/events-0918/events-model";

const TZ = "Asia/Tokyo";
const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type Lang = "en" | "zh";
const pick = (lang: Lang, copy: { en: string; zh: string }) => copy[lang];

/** 推荐理由：只有计划、目标、近期三种真实来源（SC-W0037-02）。目标取 `tokens` 前 2 个，用「、」连接。 */
export function formatHomeEventReason(reason: HomeEventPoolReason, lang: "en" | "zh"): string {
  if (reason.kind === "plan") return pick(lang, { en: "In your plan", zh: "计划里提到" });
  if (reason.kind === "recent") return pick(lang, { en: "Coming up soon", zh: "近期活动" });
  const tokens = reason.tokens.filter((token) => token.trim()).slice(0, 2).join("、");
  if (!tokens) return pick(lang, { en: "Matches your goal", zh: "匹配你的目标" });
  return pick(lang, { en: `Matches “${tokens}” in your goal`, zh: `匹配你目标里的『${tokens}』` });
}

/**
 * W37-2：池里从 `now` 到本周日 24:00（东京）之间开始的活动数。东京一周按周一至周日；
 * 池有上限，所以只能说「本周还有」，不代表活动页的全部数量。
 */
export function countHomeEventsThisTokyoWeek(pool: readonly HomeEventPoolItem[], now: Date): number {
  const nowMs = now.getTime();
  if (Number.isNaN(nowMs)) return 0;
  const tokyo = new Date(nowMs + TOKYO_OFFSET_MS);
  const tokyoMidnightUtc =
    Date.UTC(tokyo.getUTCFullYear(), tokyo.getUTCMonth(), tokyo.getUTCDate()) - TOKYO_OFFSET_MS;
  // getUTCDay：0 = 周日。到下一个周一 00:00 还有几天（周一当天 → 7，周日 → 1）。
  const daysToNextMonday = ((8 - tokyo.getUTCDay()) % 7) || 7;
  const weekEndMs = tokyoMidnightUtc + daysToNextMonday * DAY_MS;
  return pool.filter((item) => {
    const startMs = Date.parse(item.startsAt);
    return Number.isFinite(startMs) && startMs > nowMs && startMs < weekEndMs;
  }).length;
}

export interface IOrbitTodayEventsProps {
  /** 首页的共享活动池（顺序即展示顺序）。 */
  pool: readonly HomeEventPoolItem[];
  /** true：要事为空（或示例期）时的展开形态；false：一行「本周还有 N 场」。 */
  expanded: boolean;
  /** 服务端读到的本人社群加入状态（W0003；示例期同样是真实值）。 */
  communityJoined: boolean;
  lang: "en" | "zh";
  /** 「本周还有 N 场」的参照时间（首页时钟）。 */
  now: Date;
}

type Notice = { tone: "error" | "info"; text: string } | null;

export function IOrbitTodayEvents({
  communityJoined: initialJoined,
  expanded,
  lang,
  now,
  pool,
}: IOrbitTodayEventsProps): JSX.Element | null {
  const t = (copy: { en: string; zh: string }) => pick(lang, copy);
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  const [joined, setJoined] = useState(initialJoined);
  const [qrOpen, setQrOpen] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const joinInFlight = useRef(false);
  const idRef = useRef<HTMLElement | null>(null);

  const markJoined = async () => {
    if (joined || joinInFlight.current) return;
    joinInFlight.current = true;
    // 乐观：先收起社群卡、补上第三场；服务端不确认就撤回。
    setJoined(true);
    setNotice(null);
    let failure: string | null = null;
    try {
      const response = await fetch(COMMUNITY_MEMBERSHIP_ENDPOINT, { method: "PUT" });
      const body = (await response.json().catch(() => null)) as
        | { success?: boolean; data?: { joined?: boolean } }
        | null;
      if (!(response.ok && body?.success === true && body.data?.joined === true)) {
        failure =
          response.status === 401
            ? t({ en: "Sign in first, then mark yourself as joined.", zh: "请先登录，再标记已加入。" })
            : t({ en: "Couldn't save that. Please try again.", zh: "没有保存成功，请再试一次。" });
      }
    } catch {
      failure = t({ en: "Couldn't save that. Please try again.", zh: "没有保存成功，请再试一次。" });
    } finally {
      joinInFlight.current = false;
    }
    if (failure) {
      setJoined(false);
      setNotice({ text: failure, tone: "error" });
    } else {
      setNotice({ text: t({ en: "You've joined the iOrbit user community.", zh: "已加入 iOrbit 用户社群。" }), tone: "info" });
    }
  };

  const copyWechatId = async () => {
    try {
      await navigator.clipboard.writeText(COMMUNITY_CONFIG.wechatId);
      setNotice({ text: t({ en: "WeChat ID copied.", zh: "微信号已复制。" }), tone: "info" });
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
      setNotice({
        text: t({ en: "WeChat ID selected. Press ⌘C / Ctrl+C to copy.", zh: "已选中微信号，按 ⌘C / Ctrl+C 复制。" }),
        tone: "info",
      });
    }
  };

  if (!expanded) {
    const count = countHomeEventsThisTokyoWeek(pool, now);
    if (count === 0) return null;
    return (
      <div className="ir-te" data-orbit-today-events="collapsed">
        <a className="ir-te-week" data-orbit-today-events-week href="/app/events">
          {t({
            en: `${count} more event${count === 1 ? "" : "s"} for you this week →`,
            zh: `本周还有 ${count} 场适合你的活动 →`,
          })}
        </a>
      </div>
    );
  }

  const events = pool.slice(0, joined ? 3 : 2);
  if (joined && events.length === 0) return null;

  const fmtDay = (date: Date) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "numeric", timeZone: TZ }).format(date);
  const fmtWeekday = (date: Date) => new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: "short" }).format(date);
  const fmtTime = (date: Date) =>
    new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(date);
  const placeholder = t({ en: "Placeholder", zh: "占位" });

  return (
    <div className="ir-te" data-orbit-today-events="expanded">
      {!joined ? (
        <section className="ir-te-community" data-orbit-today-community="invite">
          <div className="ir-te-community-head">
            <span className="ir-te-community-tag">{t({ en: "Community", zh: "社群" })}</span>
            <strong>{t(COMMUNITY_CONFIG.name)}</strong>
          </div>
          <div className="ir-te-wx">
            <span>{t({ en: "WeChat ID", zh: "微信号" })}</span>
            <code ref={idRef}>{COMMUNITY_CONFIG.wechatId}</code>
            {COMMUNITY_CONFIG.placeholder.wechatId ? (
              <span className="ir-te-ph" data-community-placeholder="wechat">
                {placeholder}
              </span>
            ) : null}
            <button className="btn ir-te-copy" data-orbit-today-community-copy onClick={copyWechatId} type="button">
              {t({ en: "Copy", zh: "复制" })}
            </button>
            <button
              aria-expanded={qrOpen}
              className="btn ir-te-qr"
              data-orbit-today-community-qr
              onClick={() => setQrOpen((value) => !value)}
              type="button"
            >
              {qrOpen ? t({ en: "Hide QR code", zh: "收起二维码" }) : t({ en: "Show QR code", zh: "看二维码" })}
            </button>
          </div>
          {qrOpen ? (
            COMMUNITY_CONFIG.qrImageSrc && !COMMUNITY_CONFIG.placeholder.qr ? (
              <img
                alt={t({ en: "QR code for the iOrbit assistant", zh: "iOrbit 助手二维码" })}
                className="ir-te-qr-box"
                height={112}
                src={COMMUNITY_CONFIG.qrImageSrc}
                width={112}
              />
            ) : (
              <span className="ir-te-qr-box" data-community-placeholder="qr">
                {t({ en: "QR code", zh: "二维码" })}
                <br />
                {placeholder}
              </span>
            )
          ) : null}
          <div className="ir-te-acts">
            <button className="btn ir-te-join" data-orbit-today-community-join onClick={markJoined} type="button">
              {t({ en: "I've joined", zh: "我已加入" })}
            </button>
            <span className="ir-te-hint">
              {t({ en: "Add the assistant; they'll invite you to the group.", zh: "添加助手，由助手拉你进群" })}
            </span>
          </div>
        </section>
      ) : null}
      {events.length > 0 ? (
        <div className="ir-te-events">
          {events.map((event) => {
            const start = new Date(event.startsAt);
            const valid = !Number.isNaN(start.getTime());
            return (
              <a
                className="ir-m-event ir-te-event"
                data-orbit-today-event={event.eventId}
                href={eventDetailHref(event.publicCode)}
                key={event.eventId}
              >
                <span className="ir-m-event-date">
                  {valid ? fmtDay(start) : ""}
                  <small>
                    {valid ? fmtWeekday(start) : ""} {valid ? fmtTime(start) : "--:--"}
                  </small>
                </span>
                <span className="ir-m-event-copy">
                  <strong>{event.title}</strong>
                  {event.place ? <span>{event.place}</span> : null}
                  <span className="ir-te-reason">{formatHomeEventReason(event.reason, lang)}</span>
                </span>
              </a>
            );
          })}
        </div>
      ) : null}
      <p
        aria-live="polite"
        className="ir-te-status"
        data-orbit-today-events-status
        data-tone={notice?.tone === "error" ? "error" : undefined}
        role="status"
      >
        {notice?.text ?? ""}
      </p>
    </div>
  );
}
