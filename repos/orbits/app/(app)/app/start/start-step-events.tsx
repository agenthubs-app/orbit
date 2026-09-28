/**
 * 引导第 4 步「活动」（W0006；随时可做）。社群卡片置顶（直接复用 W0003 的 `CommunityCard`
 * 与 `/api/community/membership`，D6），下面是最多两场还没开始、本人未报名的真实活动。
 * 报名任意一场或点「我已加入」社群即完成这一步。
 */
"use client";

import { CommunityCard } from "../events/events-0918/community-card";
import { eventDetailHref } from "../events/events-0918/events-model";
import { useOrbitLanguage } from "../orbit-language-context";
import type { StartEventView } from "./start-guide";

function eventDate(startsAt: string, language: "en" | "zh"): { day: string; weekday: string } {
  const date = new Date(startsAt);
  if (!Number.isFinite(date.getTime())) return { day: "", weekday: "" };
  const day = new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "2-digit", timeZone: "Asia/Tokyo" }).format(date);
  const weekday = new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(date);
  return { day, weekday };
}

export function StepEvents({
  communityJoined,
  done,
  events,
  onJoined,
}: {
  communityJoined: boolean;
  done: boolean;
  events: readonly StartEventView[];
  onJoined: () => void;
}) {
  const { language, preserveHref, t } = useOrbitLanguage();
  const lang = language === "en" ? "en" : "zh";
  return (
    <article className="sg-lead" data-start-module="4">
      <div className="sg-meta">
        <span className="sg-pill">{t({ en: "Step 4 · Events", zh: "第 4 步 · 活动" })}</span>
        {done ? <span className="sg-pill sg-pill-good">{t({ en: "✓ Done", zh: "✓ 已完成" })}</span> : null}
      </div>
      <h2>{t({ en: "Go meet the people your plan needs", zh: "去认识计划里需要的人" })}</h2>
      <p className="sg-why">
        {done
          ? t({
              en: "This step is done. Register for more events whenever you want to meet more people.",
              zh: "这一步已经完成。想认识更多人，随时可以再报名活动。",
            })
          : t({
              en: "Registering for any event completes this step. You can start by joining the free iOrbit community.",
              zh: "报名任意一个活动就算完成这一步。可以先加入免费的 iOrbit 社群。",
            })}
      </p>
      {/* 社群卡片的样式限定在活动页作用域下，这里套一层同名作用域直接复用。 */}
      <div data-orbit-real-page="events-0918" data-start-community>
        <CommunityCard joined={communityJoined} onJoined={onJoined} signedIn />
      </div>
      {events.length > 0 ? (
        <div className="sg-recs" data-start-events>
          {events.map((event) => {
            const date = eventDate(event.startsAt, lang);
            return (
              <div className="sg-rec" data-start-event={event.id} key={event.id}>
                <div className="sg-rec-date">
                  {date.day}
                  <small>{date.weekday}</small>
                </div>
                <h4>{event.name}</h4>
                {event.place ? <div className="sg-rec-where">{event.place}</div> : null}
                <div className="sg-rec-acts">
                  <a
                    className="btn sg-secondary"
                    href={preserveHref(`/app/events/${encodeURIComponent(event.code)}/register`)}
                  >
                    {t({ en: "Register", zh: "报名" })}
                  </a>
                  <a className="sg-lk" href={preserveHref(eventDetailHref(event.code))}>
                    {t({ en: "Details →", zh: "详情 →" })}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="sg-hint" data-start-events-empty>
          {t({ en: "No upcoming events to register for right now.", zh: "近期还没有可报名的活动。" })}
        </p>
      )}
      <a className="sg-lk" data-start-more-events href={preserveHref("/app/events")} style={{ alignSelf: "flex-start" }}>
        {t({ en: "More events →", zh: "更多活动 →" })}
      </a>
    </article>
  );
}
