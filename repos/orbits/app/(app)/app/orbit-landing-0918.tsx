"use client";

/**
 * Orbit_0918 新 UI 落地页（批次 0，纯视觉）。
 *
 * 唯一设计来源：docs/designs/Orbit_0918/Orbit 首页.dc.html（01–06 + 闭环总结
 * 七个区块）。本组件只做展示：不含任何业务数据、不调用 API；页面中的人名、
 * 匹配度、计数全部是设计稿的演示文案（与旧 starfield 首页的营销演示同级）。
 *
 * 边界 A 决定：导航统一使用共享 OrbitTopNav（本页 active=null），不自建头部；
 * 设计稿的浮岛药丸视觉是全局 CSS 变更，随后续批次在全部页面视觉验收后落地。
 * 设计稿的登录/注册弹窗对应既有 /app/account/* 路由，本批 CTAs 直接链到真实
 * 路由（登录 /app/account/login、注册 /app/account/signup?next=%2Fapp%2Fhome、
 * 已登录进 /app/home），沿用 auth-state-consistency 测试锁定的跳转约定。
 *
 * 文案：zh 为设计稿原文；en 为直译草稿（标注于报告，待文案审阅）。
 */

import type { CSSProperties, ReactNode } from "react";

import { useOrbitLanguage } from "./orbit-language-context";
import { OrbitTopNav } from "./orbit-public-shell";
import {
  ORBIT_0918_COLORS as C,
  ORBIT_0918_FONTS as F,
  ORBIT_0918_LAYOUT as L,
  ORBIT_0918_SHADOWS as SH,
} from "./orbit-0918-tokens";

type Copy = { en: string; zh: string };

const SERIF: CSSProperties = { fontFamily: F.serif, fontWeight: 900, letterSpacing: "-0.03em" };

function Section({
  children,
  id,
  pad = "96px 40px",
}: {
  children: ReactNode;
  id?: string;
  pad?: string;
}) {
  return (
    <section id={id} style={{ padding: pad }}>
      <div
        style={{
          alignItems: "center",
          display: "grid",
          gap: 56,
          gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,480px),1fr))",
          margin: "0 auto",
          maxWidth: L.containerMax,
        }}
      >
        {children}
      </div>
    </section>
  );
}

function PanelCard({ children, plain = false }: { children: ReactNode; plain?: boolean }) {
  const inner = (
    <div
      style={{
        background: "#FFFFFF",
        border: plain ? `1px solid ${C.border}` : 0,
        borderRadius: plain ? 24 : 20,
        boxShadow: SH.card,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        padding: plain ? 36 : 30,
      }}
    >
      {children}
    </div>
  );
  if (plain) return inner;
  return (
    <div style={{ background: C.panel, borderRadius: 28, padding: "clamp(20px,3vw,44px)" }}>
      {inner}
    </div>
  );
}

function TextCol({
  eyebrow,
  title,
  body,
  children,
}: {
  body: string;
  children?: ReactNode;
  eyebrow: string;
  title: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <span style={{ color: C.text2, fontSize: 13, letterSpacing: "0.18em" }}>{eyebrow}</span>
      <h2
        style={{
          ...SERIF,
          fontSize: "clamp(38px,4.6vw,66px)",
          lineHeight: 1.15,
          margin: 0,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          color: C.text2,
          fontSize: "clamp(16px,1.4vw,20px)",
          lineHeight: 1.7,
          margin: 0,
          maxWidth: 500,
        }}
      >
        {body}
      </p>
      {children}
    </div>
  );
}

function PrimaryCta({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      style={{
        alignSelf: "flex-start",
        background: C.ink,
        borderRadius: 999,
        color: "#FFFFFF",
        fontSize: 17,
        fontWeight: 500,
        padding: "18px 44px",
        textDecoration: "none",
      }}
    >
      {label}
    </a>
  );
}

function TextLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      style={{
        alignSelf: "flex-start",
        borderBottom: "1px solid #9FA3D9",
        color: C.text2,
        display: "inline-flex",
        fontSize: 17,
        gap: 8,
        paddingBottom: 4,
        textDecoration: "none",
      }}
    >
      {label}
    </a>
  );
}

function Avatar({ letter, size = 52 }: { letter: string; size?: number }) {
  return (
    <span
      style={{
        alignItems: "center",
        background: C.borderStrong,
        borderRadius: "50%",
        color: C.text2,
        display: "flex",
        flexShrink: 0,
        fontSize: size * 0.35,
        fontWeight: 700,
        height: size,
        justifyContent: "center",
        width: size,
      }}
    >
      {letter}
    </span>
  );
}

function PersonRow({
  bordered = true,
  initial,
  name,
  right,
  role,
}: {
  bordered?: boolean;
  initial: string;
  name: string;
  right?: ReactNode;
  role: string;
}) {
  return (
    <div
      style={{
        alignItems: "center",
        borderBottom: bordered ? "1px solid #EEEFF8" : 0,
        display: "flex",
        gap: 16,
        padding: "14px 0",
      }}
    >
      <Avatar letter={initial} />
      <span style={{ display: "flex", flex: 1, flexDirection: "column", gap: 2 }}>
        <strong style={{ fontSize: 17, whiteSpace: "nowrap" }}>{name}</strong>
        <span style={{ color: C.text3, fontSize: 14 }}>{role}</span>
      </span>
      {right}
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span
      style={{
        background: C.panel,
        borderRadius: 999,
        color: C.text2,
        fontSize: 13,
        fontWeight: 500,
        padding: "6px 12px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function AskPill({ question }: { question: string }) {
  return (
    <div
      style={{
        alignItems: "center",
        background: C.panelSoft,
        border: `1px solid ${C.borderStrong}`,
        borderRadius: 999,
        display: "flex",
        gap: 12,
        padding: "12px 8px 12px 18px",
      }}
    >
      <span style={{ color: C.ink, flex: 1, fontSize: 15 }}>{question}</span>
      <span
        style={{
          alignItems: "center",
          background: C.accent,
          borderRadius: "50%",
          color: "#FFFFFF",
          display: "flex",
          fontSize: 16,
          height: 34,
          justifyContent: "center",
          width: 34,
        }}
      >
        ↑
      </span>
    </div>
  );
}

function NoteBox({ children, label }: { children: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ color: C.text2, fontSize: 14 }}>{label}</span>
      <div
        style={{
          background: C.panelSoft,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          color: C.text2,
          fontSize: 14,
          lineHeight: 1.6,
          padding: "12px 16px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function OrbitLanding0918({ authenticated = false }: { authenticated?: boolean }) {
  const { preserveHref, t } = useOrbitLanguage();

  const startHref = authenticated
    ? preserveHref("/app/home")
    : preserveHref("/app/account/signup?next=%2Fapp%2Fhome");

  const h3Style: CSSProperties = {
    ...SERIF,
    borderBottom: `1px solid ${C.border}`,
    fontSize: 28,
    letterSpacing: "-0.02em",
    margin: 0,
    paddingBottom: 16,
  };

  const stepDot = (bg: string, border?: string): CSSProperties => ({
    background: bg,
    border: border ? `2px solid ${border}` : 0,
    borderRadius: "50%",
    flexShrink: 0,
    height: 26,
    width: 26,
  });

  const flowSteps: { copy: Copy; dateCopy: Copy; desc: Copy; dot: string; name: string; title: Copy }[] = [
    {
      copy: { en: "Step 1 · This week", zh: "第一步 · 本周" },
      dateCopy: { en: "", zh: "" },
      desc: {
        en: "First confirm that “cross-language meeting notes” is a real problem. Her pain points decide whether the next two steps are worth taking.",
        zh: "先确认“跨语言纪要”是真问题。她给出的痛点，决定后面两步值不值得走。",
      },
      dot: C.accentDeep,
      name: "田中惠子",
      title: { en: "Validate the need", zh: "验证需求" },
    },
    {
      copy: { en: "Step 2 · Once the need holds", zh: "第二步 · 需求成立后" },
      dateCopy: { en: "", zh: "" },
      desc: {
        en: "Bring the real pain points to him — he can judge pricing, compliance, and the way into the market directly.",
        zh: "带着真实痛点去找他，他能直接判断定价、合规与进入方式。",
      },
      dot: C.accent,
      name: "山本健",
      title: { en: "Understand the market", zh: "理解市场" },
    },
    {
      copy: { en: "Step 3 · Within two weeks", zh: "第三步 · 两周内" },
      dateCopy: { en: "", zh: "" },
      desc: {
        en: "Only then ask her for an intro. By now you can say clearly who the product helps, so the introduction is not wasted.",
        zh: "最后才请她引荐。此时你已能说清产品对谁有用，引荐才不会被浪费。",
      },
      dot: "#9FA3D9",
      name: "林夏",
      title: { en: "Find pilot users", zh: "找到体验用户" },
    },
  ];

  const timingRows: { desc: Copy; dim?: boolean; dot: string; name: string; tag: Copy; tagStyle: CSSProperties }[] = [
    {
      desc: {
        en: "He just invested in a Japanese SaaS — your market questions are valuable to him right now too.",
        zh: "他刚投了一家日本 SaaS——你的市场问题此刻对他也有价值。",
      },
      dot: C.accentDeep,
      name: "山本健",
      tag: { en: "Worth contacting now", zh: "现在值得联系" },
      tagStyle: { background: C.accentDeep, color: "#FFFFFF" },
    },
    {
      desc: {
        en: "Two proactive interactions in three days — her team is evaluating options.",
        zh: "三天内两次主动互动，她的团队正在评估方案。",
      },
      dot: C.accent,
      name: "佐藤真理",
      tag: { en: "Warming up", zh: "正在升温" },
      tagStyle: { background: C.panel, color: C.accentDeep },
    },
    {
      desc: {
        en: "Last touch was 5 weeks ago; she runs a community event next month — a simple congratulation is enough.",
        zh: "上次交流是 5 周前，她下月办社区活动——一句祝贺就够。",
      },
      dot: "#9FA3D9",
      name: "林夏",
      tag: { en: "Keep in touch", zh: "保持联系" },
      tagStyle: { background: C.panelSoft, color: C.text2 },
    },
    {
      desc: {
        en: "She is in a launch crunch — sending the trial next week lands better.",
        zh: "她正在产品发布冲刺，等下周再发体验版更合适。",
      },
      dim: true,
      dot: "transparent",
      name: "田中惠子",
      tag: { en: "Do not disturb for now", zh: "暂时不打扰" },
      tagStyle: { border: `1px solid ${C.border}`, color: C.text3 },
    },
  ];

  const weekRows: { dateCopy: Copy; dot: string; dotBorder?: string; status: Copy; statusStyle: CSSProperties; title: Copy }[] = [
    {
      dateCopy: { en: "Tuesday", zh: "周二" },
      dot: C.accentDeep,
      status: { en: "Prepared", zh: "已准备" },
      statusStyle: { background: C.panel, color: C.accentDeep },
      title: { en: "Send 田中惠子 the trial build", zh: "给田中惠子发送体验版" },
    },
    {
      dateCopy: { en: "Wednesday", zh: "周三" },
      dot: C.accent,
      status: { en: "Needs your confirmation", zh: "需要你确认" },
      statusStyle: { background: C.panel, color: C.accentDeep },
      title: { en: "Book a chat with 山本健 about the Japanese market", zh: "与山本健约聊日本市场" },
    },
    {
      dateCopy: { en: "Thursday evening", zh: "周四晚" },
      dot: "#9FA3D9",
      status: { en: "Action plan ready", zh: "行动计划就绪" },
      statusStyle: { background: C.panelSoft, color: C.text2 },
      title: { en: "Attend Tokyo AI Product Growth Night", zh: "参加东京 AI 产品增长夜" },
    },
    {
      dateCopy: { en: "Next week", zh: "下周" },
      dot: "#FFFFFF",
      dotBorder: "#B9BCEB",
      status: { en: "Draft only", zh: "仅草稿" },
      statusStyle: { border: `1px solid ${C.border}`, color: C.text3 },
      title: { en: "Ask 林夏 to connect the pilot team", zh: "请林夏连接体验团队" },
    },
  ];

  return (
    <main
      data-orbit-real-page="landing-0918"
      style={{
        background: C.pageBg,
        color: C.ink,
        fontFamily: F.sans,
        overflowX: "clip",
        WebkitFontSmoothing: "antialiased",
        width: "100%",
      }}
    >
      {/* 设计稿字体：Noto Serif SC（标题）/ Noto Sans SC（正文）。 */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@700;900&family=Noto+Sans+SC:wght@400;500;700&display=swap"
        rel="stylesheet"
      />
      <OrbitTopNav active={null} authenticatedFallback={authenticated} meHref="/app/profile" />

      {/* 01 · AI 找到对的人 */}
      <Section id="hero" pad="48px 40px 96px">
        <PanelCard>
          <div style={{ alignItems: "center", display: "flex", fontSize: 15, gap: 12 }}>
            <strong style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em" }}>
              {t({ en: "iOrbit Intelligence", zh: "iOrbit 智能" })}
            </strong>
            <span style={{ color: C.accent, fontSize: 18 }}>✦</span>
            <span style={{ background: C.borderStrong, height: 18, width: 1 }} />
            <span style={{ color: C.text3 }}>
              {t({ en: "428 contacts analyzed", zh: "已分析 428 位人脉" })}
            </span>
          </div>
          <AskPill
            question={t({
              en: "I have an AI meeting-notes product to launch in Japan — who should I talk to first?",
              zh: "我有一款 AI 会议纪要产品，想在日本推广，应该先找谁聊聊？",
            })}
          />
          <div style={{ background: C.border, height: 1 }} />
          <span style={{ color: C.text2, fontSize: 15 }}>
            {t({ en: "Talk to these 3 first", zh: "推荐先聊 3 人" })}
          </span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <PersonRow
              initial="田"
              name="田中惠子"
              right={<Chip label={t({ en: "Validate real demand", zh: "验证真实需求" })} />}
              role={t({ en: "SaaS product lead · Tokyo", zh: "SaaS 产品负责人 · 东京" })}
            />
            <PersonRow
              initial="山"
              name="山本健"
              right={<Chip label={t({ en: "Understand the Japanese market", zh: "理解日本市场" })} />}
              role={t({ en: "Enterprise software investor · Osaka", zh: "企业软件投资人 · 大阪" })}
            />
            <PersonRow
              bordered={false}
              initial="林"
              name="林夏"
              right={<Chip label={t({ en: "Find pilot users", zh: "寻找体验用户" })} />}
              role={t({ en: "Startup community operator · Tokyo", zh: "创业社区运营 · 东京" })}
            />
          </div>
          <div
            style={{
              alignItems: "flex-start",
              background: C.panel,
              borderRadius: 12,
              color: C.accentDeep,
              display: "flex",
              fontSize: 14,
              gap: 12,
              lineHeight: 1.6,
              padding: "14px 16px",
            }}
          >
            <span style={{ color: C.accent }}>✦</span>
            <span>
              {t({
                en: "The three cover need, market, and users — together they form a complete path forward.",
                zh: "三人分别覆盖需求、市场与用户——正好组成一条完整的推进路径。",
              })}
            </span>
          </div>
          <div style={{ alignItems: "center", display: "flex", gap: 18 }}>
            <span
              style={{
                background: C.ink,
                borderRadius: 999,
                color: "#FFFFFF",
                fontSize: 14,
                fontWeight: 500,
                padding: "12px 22px",
                whiteSpace: "nowrap",
              }}
            >
              {t({ en: "Generate conversation path", zh: "生成对话路径" })}
            </span>
            <span style={{ color: "#8A8DB0", fontSize: 13 }}>
              {t({ en: "For reference only — never sent automatically", zh: "仅供参考 — 不会自动发送" })}
            </span>
          </div>
        </PanelCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 26, padding: "20px 0" }}>
          <h1
            style={{
              ...SERIF,
              fontSize: "clamp(46px,6vw,88px)",
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            {t({ en: "Orbit —", zh: "Orbit，" })}
            <br />
            {t({ en: "reshape your", zh: "重塑你的" })}
            <br />
            {t({ en: "circle of relationships.", zh: "人脉圈子。" })}
          </h1>
          <p
            style={{
              color: C.text2,
              fontSize: "clamp(17px,1.6vw,22px)",
              lineHeight: 1.65,
              margin: 0,
              maxWidth: 520,
            }}
          >
            {t({
              en: "From scattered contacts to the right relationships — at exactly the right moment.",
              zh: "从零散的联系人，到对的关系——在恰好对的时刻。",
            })}
          </p>
          <PrimaryCta href={startHref} label={t({ en: "Start with iOrbit", zh: "用 iOrbit 开始" })} />
          <span style={{ color: C.text3, fontSize: 14 }}>
            {t({
              en: "Used by professionals from leading companies and events.",
              zh: "来自领先公司与活动的专业人士都在使用。",
            })}
          </span>
        </div>
      </Section>

      {/* 02 · 生成对话路径 */}
      <Section id="path">
        <TextCol
          body={t({
            en: "iOrbit breaks a goal into ordered steps: who moves which step, and why the order matters.",
            zh: "iOrbit 把目标拆成有先后的几步，说明每个人推动哪一步，以及为什么要按这个顺序去聊。",
          })}
          eyebrow={t({ en: "CONVERSATION PATH", zh: "对话路径" })}
          title={
            <>
              {t({ en: "Not one person —", zh: "不是一个人，" })}
              <br />
              {t({ en: "an ordered", zh: "而是一条" })}
              <br />
              {t({ en: "path.", zh: "有顺序的路。" })}
            </>
          }
        >
          <TextLink
            href={preserveHref("/app/agent")}
            label={t({ en: "See how iOrbit thinks →", zh: "看看 iOrbit 如何思考 →" })}
          />
        </TextCol>
        <PanelCard>
          <h3 style={h3Style}>
            {t({ en: "Validate need → understand market → find pilot users", zh: "验证需求 → 理解市场 → 找到体验用户" })}
          </h3>
          <div style={{ display: "grid", gap: "0 22px", gridTemplateColumns: "auto 1fr" }}>
            {flowSteps.map((step, i) => (
              <div key={step.name} style={{ display: "contents" }}>
                <div style={{ alignItems: "center", display: "flex", flexDirection: "column" }}>
                  <span style={stepDot(step.dot)} />
                  {i < flowSteps.length - 1 ? (
                    <span style={{ background: "#B9BCEB", flex: 1, width: 2 }} />
                  ) : null}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    paddingBottom: i < flowSteps.length - 1 ? 26 : 0,
                  }}
                >
                  <span style={{ color: C.text3, fontSize: 12, letterSpacing: "0.14em" }}>
                    {t(step.copy)}
                  </span>
                  <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10 }}>
                    <strong style={{ fontSize: 18 }}>{t(step.title)}</strong>
                    <span style={{ color: C.text3, fontSize: 14 }}>{step.name}</span>
                  </div>
                  <p style={{ color: C.text2, fontSize: 14, lineHeight: 1.7, margin: 0 }}>
                    {t(step.desc)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              borderTop: `1px solid ${C.border}`,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              paddingTop: 18,
            }}
          >
            <span style={{ color: C.text2, fontSize: 14 }}>
              {t({ en: "Why this order", zh: "为什么是这个顺序" })}
            </span>
            <div
              style={{
                background: C.panelSoft,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                color: C.text2,
                fontSize: 14,
                lineHeight: 1.6,
                padding: "12px 16px",
              }}
            >
              {t({
                en: "Get the order wrong and the next two steps become cold starts — get the facts first, judge the market second, ask for users last.",
                zh: "顺序错了，后两步都会变成冷启动——先拿到事实，再判断市场，最后才去要用户。",
              })}
            </div>
          </div>
        </PanelCard>
      </Section>

      {/* 03 · 活动智能 */}
      <Section id="events">
        <PanelCard>
          <div
            style={{
              alignItems: "flex-start",
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h3 style={{ ...SERIF, fontSize: 28, letterSpacing: "-0.02em", margin: 0 }}>
                {t({ en: "Tokyo AI Product Growth Night", zh: "东京 AI 产品增长夜" })}
              </h3>
              <span style={{ color: C.text3, fontSize: 14 }}>
                {t({ en: "Tomorrow · Tokyo · 480 attendees", zh: "明天 · 东京 · 480 位参与者" })}
              </span>
            </div>
            <div style={{ display: "flex", fontSize: 15, gap: 22 }}>
              <span style={{ borderBottom: `2px solid ${C.ink}`, fontWeight: 500, paddingBottom: 8 }}>
                {t({ en: "Before", zh: "活动前" })}
              </span>
              <span style={{ color: C.text3, paddingBottom: 8 }}>{t({ en: "On-site", zh: "现场" })}</span>
              <span style={{ color: C.text3, paddingBottom: 8 }}>{t({ en: "After", zh: "活动后" })}</span>
            </div>
          </div>
          <AskPill
            question={t({
              en: "Who should I focus on meeting at this event?",
              zh: "这场活动我该重点见谁？",
            })}
          />
          <div style={{ background: C.border, height: 1 }} />
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
            <div
              style={{
                background: C.panelSoft,
                borderRadius: 12,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "14px 16px",
              }}
            >
              <span style={{ color: C.text3, fontSize: 12, letterSpacing: "0.12em" }}>
                {t({ en: "SESSION WORTH JOINING", zh: "值得参加的环节" })}
              </span>
              <strong style={{ fontSize: 15, lineHeight: 1.5 }}>
                {t({ en: "19:30 Global-founders roundtable", zh: "19:30 出海创始人圆桌" })}
              </strong>
            </div>
            <div
              style={{
                background: C.panelSoft,
                borderRadius: 12,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "14px 16px",
              }}
            >
              <span style={{ color: C.text3, fontSize: 12, letterSpacing: "0.12em" }}>
                {t({ en: "EASIER TO MEET TARGET PEOPLE", zh: "更容易遇到目标人群" })}
              </span>
              <strong style={{ fontSize: 15, lineHeight: 1.5 }}>
                {t({ en: "The second-floor bar after the roundtable", zh: "圆桌结束后的二楼吧台" })}
              </strong>
            </div>
          </div>
          <span style={{ color: C.text2, fontSize: 15 }}>
            {t({ en: "People worth meeting", zh: "值得认识的人" })}
          </span>
          {[
            { initial: "佐", match: "92%", name: "佐藤真理", role: { en: "Collaboration tools · Growth lead", zh: "企业协作工具 · 增长负责人" } },
            { initial: "陈", match: "86%", name: "陈以宁", role: { en: "Japan market · Early-stage investor", zh: "日本市场 · 早期投资人" } },
          ].map((p, i, arr) => (
            <PersonRow
              bordered={i < arr.length - 1}
              initial={p.initial}
              key={p.name}
              name={p.name}
              right={
                <span style={{ display: "flex", flexDirection: "column", textAlign: "right" }}>
                  <strong style={{ color: C.accentDeep, fontSize: 26, letterSpacing: "-0.02em" }}>
                    {p.match}
                  </strong>
                  <span style={{ color: C.text3, fontSize: 13 }}>{t({ en: "match", zh: "匹配" })}</span>
                </span>
              }
              role={t(p.role)}
            />
          ))}
          <NoteBox label={t({ en: "A topic to open with", zh: "可以从什么话题开始" })}>
            {t({
              en: "Ask 佐藤真理 how her team handles Japanese–English meeting notes — that is exactly your product's entry point.",
              zh: "问佐藤真理她的团队如何处理日英双语会议记录——这正是你的产品切入点。",
            })}
          </NoteBox>
          <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 18 }}>
            <span
              style={{
                background: C.ink,
                borderRadius: 999,
                color: "#FFFFFF",
                fontSize: 14,
                fontWeight: 500,
                padding: "12px 22px",
                whiteSpace: "nowrap",
              }}
            >
              {t({ en: "Generate event action plan", zh: "生成活动行动计划" })}
            </span>
            <span style={{ color: C.text2, fontSize: 14 }}>
              {t({ en: "View all attendees", zh: "查看全部参与者" })}
            </span>
          </div>
        </PanelCard>
        <TextCol
          body={t({
            en: "iOrbit recommends events based on your goals and hands you an action plan before you walk in: which sessions to join, who to meet, and what to open with.",
            zh: "iOrbit 根据你的目标推荐活动，并在进场前给出行动计划：参加哪个环节、认识哪些人、从什么话题开始。",
          })}
          eyebrow={t({ en: "EVENT INTELLIGENCE", zh: "活动智能" })}
          title={
            <>
              {t({ en: "Go to the right events,", zh: "去对活动，" })}
              <br />
              {t({ en: "and meet", zh: "也遇见" })}
              <br />
              {t({ en: "the right people.", zh: "对的人。" })}
            </>
          }
        >
          <TextLink
            href={preserveHref("/app/events")}
            label={t({ en: "Learn about event intelligence →", zh: "了解活动智能 →" })}
          />
        </TextCol>
      </Section>

      {/* 04 · 会后关系沉淀 */}
      <Section id="memory">
        <TextCol
          body={t({
            en: "After you swap contact details, Orbit organizes the encounter: where you met, what you discussed, what they care about, and what you promised.",
            zh: "交换联系方式后，Orbit 自动整理这次交流：在哪认识、聊了什么、对方关注什么、你答应了什么。",
          })}
          eyebrow={t({ en: "POST-EVENT RELATIONSHIP MEMORY", zh: "会后关系沉淀" })}
          title={
            <>
              {t({ en: "One meeting", zh: "一次见面，" })}
              <br />
              {t({ en: "should not end at", zh: "不应该停在" })}
              <br />
              {t({ en: "swapping contacts.", zh: "交换联系方式。" })}
            </>
          }
        >
          <PrimaryCta href={startHref} label={t({ en: "Build relationships with Orbit", zh: "用 Orbit 沉淀关系" })} />
          <span style={{ color: C.text3, fontSize: 14 }}>
            {t({ en: "You stay in control. Orbit prepares — you decide.", zh: "你始终掌控。Orbit 准备——你决定。" })}
          </span>
        </TextCol>
        <PanelCard plain>
          <div
            style={{
              alignItems: "center",
              borderBottom: `1px solid ${C.border}`,
              display: "flex",
              gap: 18,
              paddingBottom: 20,
            }}
          >
            <Avatar letter="佐" size={64} />
            <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <strong style={{ fontSize: 22 }}>佐藤真理</strong>
              <span style={{ alignItems: "center", color: C.text2, display: "flex", fontSize: 15, gap: 8 }}>
                {t({ en: "Tokyo AI Product Growth Night", zh: "东京 AI 产品增长夜" })}
                <span style={{ background: "#3FBF9F", borderRadius: "50%", height: 7, width: 7 }} />
                {t({ en: "Met yesterday", zh: "昨天认识" })}
              </span>
            </span>
          </div>
          <h3 style={{ ...SERIF, fontSize: 26, letterSpacing: "-0.02em", margin: 0 }}>
            {t({ en: "Memory of this encounter", zh: "这次交流的记忆" })}
          </h3>
          <div
            style={{
              display: "grid",
              fontSize: 15,
              gap: "14px 24px",
              gridTemplateColumns: "auto 1fr",
              lineHeight: 1.6,
            }}
          >
            <span style={{ color: C.text3 }}>{t({ en: "Where you met", zh: "在哪里认识" })}</span>
            <span>{t({ en: "Second-floor bar, after the roundtable", zh: "圆桌结束后，二楼吧台" })}</span>
            <span style={{ color: C.text3 }}>{t({ en: "What you discussed", zh: "聊过什么" })}</span>
            <span>{t({ en: "Accuracy of bilingual meeting notes and approval flows", zh: "双语会议纪要的准确率与审批流" })}</span>
            <span style={{ color: C.text3 }}>{t({ en: "What they care about", zh: "对方关注什么" })}</span>
            <span>{t({ en: "Whether data stays within Japan", zh: "数据是否留在日本境内" })}</span>
            <span style={{ color: C.text3 }}>{t({ en: "What you promised", zh: "你答应了什么" })}</span>
            <span style={{ color: C.accentDeep, fontWeight: 500 }}>
              {t({ en: "Send a trial build with a Japanese UI next week", zh: "下周发一版带日文界面的体验版" })}
            </span>
            <span style={{ color: C.text3 }}>{t({ en: "Best time to reconnect", zh: "适合再次联系" })}</span>
            <span>{t({ en: "Next Tuesday — she finalizes plans by end of month", zh: "下周二 — 她说月底前要定方案" })}</span>
          </div>
          <div style={{ background: C.border, height: 1 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ color: C.text3, fontSize: 12, letterSpacing: "0.14em" }}>
              {t({ en: "FOLLOW-UP DRAFT READY", zh: "已准备好的跟进草稿" })}
            </span>
            <div
              style={{
                background: C.panelSoft,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                color: C.text2,
                fontSize: 14,
                lineHeight: 1.6,
                padding: "14px 16px",
              }}
            >
              {t({
                en: "佐藤さん，昨晚聊到的日本境内数据存储，我们已经支持。附上带日文界面的体验版……",
                zh: "佐藤さん，昨晚聊到的日本境内数据存储，我们已经支持。附上带日文界面的体验版……",
              })}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <span
              style={{
                background: C.ink,
                borderRadius: 999,
                color: "#FFFFFF",
                fontSize: 14,
                fontWeight: 500,
                padding: "12px 22px",
                whiteSpace: "nowrap",
              }}
            >
              {t({ en: "Review follow-up", zh: "审阅跟进内容" })}
            </span>
            <span
              style={{
                border: "1px solid #B9BCEB",
                borderRadius: 999,
                color: C.accentDeep,
                fontSize: 14,
                fontWeight: 500,
                padding: "12px 22px",
              }}
            >
              {t({ en: "Later", zh: "稍后处理" })}
            </span>
          </div>
          <span
            style={{
              borderTop: `1px solid ${C.border}`,
              color: C.text3,
              fontSize: 13,
              paddingTop: 14,
            }}
          >
            {t({ en: "Nothing is ever sent without your confirmation.", zh: "未经你确认，任何内容都不会被发送。" })}
          </span>
        </PanelCard>
      </Section>

      {/* 05 · 长期人脉管理 */}
      <Section id="network">
        <PanelCard>
          <h3 style={h3Style}>{t({ en: "Why now", zh: "为什么是现在" })}</h3>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {timingRows.map((row, i) => (
              <div
                key={row.name}
                style={{
                  alignItems: "center",
                  borderBottom: i < timingRows.length - 1 ? "1px solid #EEEFF8" : 0,
                  display: "grid",
                  gap: 16,
                  gridTemplateColumns: "auto 1fr auto",
                  padding: "14px 0",
                }}
              >
                <span
                  style={{
                    background: row.dot,
                    border: row.dim ? "2px solid #B9BCEB" : 0,
                    borderRadius: "50%",
                    height: 10,
                    width: 10,
                  }}
                />
                <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <strong style={{ color: row.dim ? C.text3 : C.ink, fontSize: 16 }}>{row.name}</strong>
                  <span style={{ color: row.dim ? C.text3 : C.text2, fontSize: 13, lineHeight: 1.5 }}>
                    {t(row.desc)}
                  </span>
                </span>
                <span
                  style={{
                    borderRadius: 999,
                    fontSize: 12,
                    padding: "6px 12px",
                    whiteSpace: "nowrap",
                    ...row.tagStyle,
                  }}
                >
                  {t(row.tag)}
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              borderTop: `1px solid ${C.border}`,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              paddingTop: 16,
            }}
          >
            <span style={{ color: C.text2, fontSize: 14 }}>
              {t({ en: "What the judgment is based on", zh: "判断依据" })}
            </span>
            <span style={{ color: C.text3, fontSize: 14 }}>
              {t({
                en: "Interaction history · relationship changes · current timing · their recent situation",
                zh: "交流历史 · 关系变化 · 当前时机 · 对方近况",
              })}
            </span>
          </div>
          <NoteBox label={t({ en: "What Orbit will not do", zh: "Orbit 不会做的事" })}>
            {t({
              en: "It will not turn relationship management into a mechanical mass-messaging CRM.",
              zh: "不会把关系管理变成机械的群发 CRM。",
            })}
          </NoteBox>
        </PanelCard>
        <TextCol
          body={t({
            en: "Based on interaction history, relationship changes, and current timing, Orbit tells you who is worth contacting now — and explains why now.",
            zh: "Orbit 根据交流历史、关系变化和当前时机，告诉你谁值得现在联系——并解释为什么是现在。",
          })}
          eyebrow={t({ en: "LONG-TERM RELATIONSHIP MANAGEMENT", zh: "长期人脉管理" })}
          title={
            <>
              {t({ en: "Let important relationships", zh: "让重要关系，" })}
              <br />
              {t({ en: "rehappen at", zh: "在正确的时间" })}
              <br />
              {t({ en: "the right time.", zh: "重新发生。" })}
            </>
          }
        >
          <TextLink
            href={preserveHref("/app/agent")}
            label={t({ en: "See how Orbit judges timing →", zh: "看看 Orbit 如何判断时机 →" })}
          />
        </TextCol>
      </Section>

      {/* 06 · 关系日程与行动闭环 */}
      <Section id="calendar" pad="96px 40px 64px">
        <TextCol
          body={t({
            en: "Events, chats, promises, and follow-ups live in one schedule. Orbit prepares the next step — you decide when to act.",
            zh: "活动、约聊、承诺和跟进进入同一份日程。Orbit 准备下一步，你决定何时执行。",
          })}
          eyebrow={t({ en: "RELATIONSHIP SCHEDULE", zh: "关系日程" })}
          title={
            <>
              {t({ en: "Turn every relationship", zh: "把每一段关系，" })}
              <br />
              {t({ en: "into an action", zh: "变成可以" })}
              <br />
              {t({ en: "you can move forward.", zh: "推进的行动。" })}
            </>
          }
        >
          <PrimaryCta href={startHref} label={t({ en: "Build your network with Orbit", zh: "用 Orbit 建立你的人脉" })} />
          <TextLink
            href={preserveHref("/app/events/center")}
            label={t({ en: "I organize events →", zh: "我是活动主办方 →" })}
          />
        </TextCol>
        <PanelCard plain>
          <div
            style={{
              alignItems: "baseline",
              borderBottom: `1px solid ${C.border}`,
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              justifyContent: "space-between",
              paddingBottom: 16,
            }}
          >
            <h3 style={{ ...SERIF, fontSize: 26, letterSpacing: "-0.02em", margin: 0 }}>
              {t({ en: "This week's relationship schedule", zh: "本周关系日程" })}
            </h3>
            <span style={{ color: C.text3, fontSize: 14 }}>
              {t({ en: "4 items to move forward", zh: "4 项待推进" })}
            </span>
          </div>
          <div style={{ alignItems: "start", display: "grid", gap: "0 20px", gridTemplateColumns: "auto 1fr auto" }}>
            {weekRows.map((row, i) => (
              <div key={t(row.title)} style={{ display: "contents" }}>
                <div style={{ alignItems: "center", display: "flex", flexDirection: "column", height: "100%" }}>
                  <span
                    style={{
                      background: row.dot,
                      border: row.dotBorder ? `2px solid ${row.dotBorder}` : 0,
                      borderRadius: "50%",
                      height: 22,
                      width: 22,
                    }}
                  />
                  {i < weekRows.length - 1 ? (
                    <span style={{ background: "#B9BCEB", flex: 1, width: 2 }} />
                  ) : null}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    paddingBottom: i < weekRows.length - 1 ? 24 : 0,
                  }}
                >
                  <span style={{ color: C.text3, fontSize: 12, letterSpacing: "0.14em" }}>
                    {t(row.dateCopy)}
                  </span>
                  <strong style={{ fontSize: 17 }}>{t(row.title)}</strong>
                </div>
                <span
                  style={{
                    borderRadius: 999,
                    fontSize: 13,
                    padding: "6px 12px",
                    whiteSpace: "nowrap",
                    ...row.statusStyle,
                  }}
                >
                  {t(row.status)}
                </span>
              </div>
            ))}
          </div>
          <div style={{ background: C.border, height: 1 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ color: C.text3, fontSize: 12, letterSpacing: "0.14em" }}>
              {t({ en: "NEXT STEP", zh: "下一步" })}
            </span>
            <strong style={{ color: C.accentDeep, fontSize: 20, fontWeight: 500 }}>
              {t({
                en: "Confirm the Japanese-UI requirements for the trial with 田中惠子",
                zh: "向田中惠子确认体验版的日文界面需求",
              })}
            </strong>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <span
              style={{
                background: C.ink,
                borderRadius: 999,
                color: "#FFFFFF",
                fontSize: 14,
                fontWeight: 500,
                padding: "12px 22px",
                whiteSpace: "nowrap",
              }}
            >
              {t({ en: "Review and execute", zh: "审阅并执行" })}
            </span>
            <span
              style={{
                border: "1px solid #B9BCEB",
                borderRadius: 999,
                color: C.accentDeep,
                fontSize: 14,
                fontWeight: 500,
                padding: "12px 22px",
              }}
            >
              {t({ en: "Open schedule", zh: "打开日程" })}
            </span>
          </div>
          <span
            style={{
              borderTop: `1px solid ${C.border}`,
              color: C.text3,
              fontSize: 13,
              paddingTop: 14,
            }}
          >
            {t({
              en: "Nothing is sent or scheduled without your approval.",
              zh: "未经你批准，任何内容不会被发送或安排。",
            })}
          </span>
        </PanelCard>
      </Section>

      {/* 闭环总结 + 页脚 */}
      <section style={{ padding: "32px 40px 120px" }}>
        <div
          style={{
            alignItems: "center",
            background: C.ink,
            borderRadius: 28,
            display: "flex",
            flexDirection: "column",
            gap: 28,
            margin: "0 auto",
            maxWidth: L.containerMax,
            padding: "64px 48px",
            textAlign: "center",
          }}
        >
          <h2
            style={{
              ...SERIF,
              color: "#FFFFFF",
              fontSize: "clamp(28px,3.4vw,46px)",
              letterSpacing: "-0.02em",
              lineHeight: 1.25,
              margin: 0,
            }}
          >
            {t({ en: "Orbit is not a contact database —", zh: "Orbit 不是联系人库，" })}
            <br />
            {t({ en: "it is a complete relationship loop.", zh: "而是一个完整的关系闭环。" })}
          </h2>
          <div
            style={{
              alignItems: "center",
              color: "#C9CBEF",
              display: "flex",
              flexWrap: "wrap",
              fontSize: 15,
              gap: "10px 14px",
              justifyContent: "center",
            }}
          >
            {[
              { en: "State a goal", zh: "提出目标" },
              { en: "Find the right people", zh: "找到对的人" },
              { en: "Join the right events", zh: "参加合适的活动" },
              { en: "Capture the encounter", zh: "沉淀交流" },
              { en: "Maintain the relationship", zh: "维护关系" },
              { en: "Move the action", zh: "推进行动" },
            ].map((step, i, arr) => (
              <span key={step.en} style={{ alignItems: "center", display: "contents" }}>
                <span style={i === arr.length - 1 ? { color: "#FFFFFF", fontWeight: 500 } : undefined}>
                  {t(step)}
                </span>
                {i < arr.length - 1 ? <span style={{ color: C.text3 }}>→</span> : null}
              </span>
            ))}
          </div>
          <a
            href={startHref}
            style={{
              background: "#FFFFFF",
              borderRadius: 999,
              color: C.ink,
              fontSize: 17,
              fontWeight: 500,
              padding: "18px 44px",
              textDecoration: "none",
            }}
          >
            {t({ en: "Start with iOrbit", zh: "用 iOrbit 开始" })}
          </a>
        </div>
        <div
          style={{
            color: C.text3,
            display: "flex",
            flexWrap: "wrap",
            fontSize: 14,
            gap: 16,
            justifyContent: "space-between",
            margin: "40px auto 0",
            maxWidth: L.containerMax,
          }}
        >
          <span style={{ ...SERIF, color: C.ink, fontSize: 20 }}>Orbit</span>
          <div style={{ display: "flex", gap: 28 }}>
            <a href={preserveHref("/app/agent")} style={{ color: C.text3, textDecoration: "none" }}>iOrbit</a>
            <a href={preserveHref("/app/events")} style={{ color: C.text3, textDecoration: "none" }}>
              {t({ en: "Events", zh: "活动" })}
            </a>
            <a href={preserveHref("/app/contacts")} style={{ color: C.text3, textDecoration: "none" }}>
              {t({ en: "Network", zh: "人脉" })}
            </a>
          </div>
          <span>© 2026 Orbit</span>
        </div>
      </section>
    </main>
  );
}
