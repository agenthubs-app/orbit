"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type ContactCard = {
  avatar: string;
  company: string;
  deal: string;
  help: string;
  name: string;
  role: string;
};

type OrbitNodePlacement = {
  angle: number;
  cardX: number;
  cardY: number;
  radius: number;
  scale: number;
};

type EndingContact = {
  avatar: string;
  help: string;
  name: string;
};

const contacts: ContactCard[] = [
  {
    avatar: "/iorbit-starfield/avatars/desktop/ava2.jpg",
    company: "屿见科技",
    deal: "可能合作 · 联合解决方案",
    help: "带过同类项目，能补上你的增长盘",
    name: "许以恒",
    role: "投资总监",
  },
  {
    avatar: "/iorbit-starfield/avatars/desktop/ava11.jpg",
    company: "星桥创投",
    deal: "可能合作 · 渠道分销协议",
    help: "正在选型 AI 获客工具，愿做你的首批内测",
    name: "林知夏",
    role: "生态合伙人",
  },
  {
    avatar: "/iorbit-starfield/avatars/desktop/ava5.jpg",
    company: "远帆基金",
    deal: "可能合作 · 领投你的天使轮",
    help: "看早期 AI 应用，能给你估值与节奏建议",
    name: "沈闻舟",
    role: "合伙人",
  },
  {
    avatar: "/iorbit-starfield/avatars/desktop/ava8.jpg",
    company: "海图增长",
    deal: "可能合作 · 海外市场引荐",
    help: "正在搭建出海服务网络，能帮你校准第一批客户",
    name: "周景澄",
    role: "增长负责人",
  },
  {
    avatar: "/iorbit-starfield/avatars/desktop/ava13.jpg",
    company: "北辰资本",
    deal: "可能合作 · 天使轮顾问",
    help: "熟悉金融科技合规路径，能帮你避开早期试错",
    name: "顾明川",
    role: "投后伙伴",
  },
  {
    avatar: "/iorbit-starfield/avatars/desktop/ava15.jpg",
    company: "岚启智能",
    deal: "可能合作 · 联合活动",
    help: "拥有一批 AI 创业者社群，适合做你的首场路演",
    name: "唐若宁",
    role: "社群主理人",
  },
];

const chips = ["我要创业", "看看谁能帮我", "找金融 AI 方向的人脉", "推荐 AI / 出海活动"];

const clusters = ["金融", "AI", "出海"];

const steps = [
  ["注册一次 · 名片通用", "你的商务身份成为一颗固定的星"],
  ["报名即自动归轨", "iOrbit 把同频的人悄悄聚到你周围"],
  ["到场即连接", "坐下就在对的圈子，并点名该认识谁"],
];

const demoContacts = contacts.slice(0, 3);
const orbitContacts = contacts.slice(0, 6);
const endingContacts: EndingContact[] = [
  {
    avatar: "/iorbit-starfield/avatars/desktop/ava7.jpg",
    help: "能帮你把核心团队补齐",
    name: "韩清越",
  },
  {
    avatar: "/iorbit-starfield/avatars/desktop/ava11.jpg",
    help: "能把冷启动渠道梳理成图",
    name: "林知夏",
  },
  {
    avatar: "/iorbit-starfield/avatars/desktop/ava5.jpg",
    help: "能帮你判断融资节奏",
    name: "沈闻舟",
  },
];
const stopProgress = [0, 0.22, 0.84, 1] as const;
const queryText = "我想创业，给我推荐一些人脉资源";

const popoutPositions = [
  { x: -210, y: 52 },
  { x: 190, y: 36 },
  { x: -130, y: 128 },
  { x: 230, y: 122 },
  { x: 0, y: 86 },
  { x: 118, y: -6 },
] as const;

const orbitNodePlacements: OrbitNodePlacement[] = [
  { angle: -155, cardX: -90, cardY: -36, radius: 190, scale: 0.88 },
  { angle: -88, cardX: -38, cardY: -76, radius: 150, scale: 0.74 },
  { angle: -24, cardX: 74, cardY: -42, radius: 190, scale: 0.84 },
  { angle: 32, cardX: 88, cardY: 18, radius: 205, scale: 0.94 },
  { angle: 102, cardX: 8, cardY: 72, radius: 180, scale: 1 },
  { angle: 154, cardX: -92, cardY: 26, radius: 195, scale: 0.98 },
] as const;

const endingStars = [
  [10, 24, 0.48], [18, 68, 0.74], [27, 38, 0.28], [34, 22, 0.9], [43, 58, 0.42], [50, 31, 0.68],
  [58, 72, 0.32], [64, 18, 0.82], [72, 45, 0.5], [80, 28, 0.72], [86, 66, 0.38], [92, 52, 0.58],
  [20, 50, 0.3], [39, 78, 0.56], [55, 14, 0.36], [69, 62, 0.88], [76, 82, 0.44], [14, 42, 0.82],
  [8, 78, 0.26], [24, 18, 0.64], [31, 64, 0.46], [46, 42, 0.78], [52, 84, 0.34], [61, 36, 0.94],
  [67, 52, 0.44], [74, 15, 0.7], [83, 78, 0.62], [89, 35, 0.3], [94, 18, 0.52], [6, 48, 0.58],
] as const;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function smoother(value: number) {
  const next = clamp(value);
  return next * next * next * (next * (next * 6 - 15) + 10);
}

function smooth(value: number, from: number, to: number) {
  return smoother((value - from) / (to - from));
}

function seededRandom(seedText: string) {
  let seed = 2166136261;

  for (let i = 0; i < seedText.length; i += 1) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }

  return () => {
    seed = Math.imul(seed + 0x6D2B79F5, 1);
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function StarfieldCanvas({ stop }: { stop: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stopRef = useRef(stop);
  const progressRef = useRef<number>(stopProgress[stop] ?? 0);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;

    const random = seededRandom("iorbit-starfield-home-20260702");
    const stars = Array.from({ length: 220 }, (_, index) => {
      const bright = index < 34;
      return {
        angle: random() * Math.PI * 2,
        glow: bright ? 14 + random() * 28 : 0,
        orbit: 0.32 + random() * 0.58,
        phase: random() * Math.PI * 2,
        radius: bright ? 1.6 + random() * 3.6 : 0.65 + random() * 1.5,
        speed: 0.000025 + random() * 0.00008,
        tint: bright && random() > 0.74 ? "gold" : "violet",
        x: random(),
        y: random(),
      };
    });
    let width = 0;
    let height = 0;
    let raf = 0;
    let lastTime = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawDot = (x: number, y: number, radius: number, alpha: number, tint: "gold" | "violet") => {
      const color = tint === "gold" ? "198,160,106" : "207,198,255";
      const core = tint === "gold" ? "#f0d59c" : "#efeaff";
      if (radius > 1.9) {
        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 8.8);
        glow.addColorStop(0, `rgba(${color},${alpha * 0.24})`);
        glow.addColorStop(0.38, `rgba(${color},${alpha * 0.13})`);
        glow.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, radius * 8.8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    const render = (now = performance.now()) => {
      const dt = Math.min(0.05, (now - (lastTime || now)) / 1000);
      lastTime = now;
      const time = reducedMotion ? 1800 : now;
      const compact = width <= 640;
      const cx = width * 0.5;
      const cy = compact ? height * 0.45 : height * 0.5;
      const spreadX = compact ? width * 0.84 : width * 0.76;
      const spreadY = compact ? height * 0.48 : height * 0.58;
      const targetProgress = stopProgress[stopRef.current] ?? 0;
      const span = Math.abs(targetProgress - progressRef.current);
      const ease = span > 0.45 ? 0.008 : 0.026;
      progressRef.current = reducedMotion ? targetProgress : lerp(progressRef.current, targetProgress, clamp(ease + dt * 0.36, ease, 0.05));
      const progress = progressRef.current;
      const intakeLift = smooth(progress, 0.08, 0.22) * (1 - smooth(progress, 0.30, 0.38)) * 0.1;
      const orbitLift = smooth(progress, 0.42, 0.82) * 0.78 + intakeLift;
      const orbitAlpha = smooth(progress, 0.50, 0.72) * (1 - smooth(progress, 0.94, 1));
      const canvasAlpha = 1 - smooth(progress, 0.93, 0.99);

      ctx.clearRect(0, 0, width, height);
      const wash = ctx.createRadialGradient(width * 0.5, height * 0.15, 0, width * 0.5, height * 0.15, Math.max(width, height) * 0.9);
      wash.addColorStop(0, "rgba(64,55,128,0.28)");
      wash.addColorStop(0.42, "rgba(22,18,48,0.22)");
      wash.addColorStop(1, "rgba(4,3,10,0)");
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < stars.length; i += 1) {
        const star = stars[i];
        const driftX = Math.sin(time * star.speed + star.phase) * (compact ? 10 : 18);
        const driftY = Math.cos(time * star.speed * 0.85 + star.phase) * (compact ? 9 : 16);
        const orbitX = cx + Math.cos(star.angle + time * star.speed * 2.4) * spreadX * star.orbit * orbitLift;
        const orbitY = cy + Math.sin(star.angle + time * star.speed * 2.4) * spreadY * star.orbit * orbitLift * 0.55;
        const fieldX = star.x * width + driftX;
        const fieldY = star.y * height + driftY;
        const x = fieldX + (orbitX - fieldX) * orbitLift;
        const y = fieldY + (orbitY - fieldY) * orbitLift;
        const twinkle = 0.56 + Math.sin(time * 0.0015 + star.phase) * 0.28 + star.radius * 0.05;
        const alpha = clamp(twinkle * canvasAlpha, 0.06, 0.92);
        drawDot(x, y, star.radius, alpha, star.tint as "gold" | "violet");

        if (orbitAlpha > 0.08 && i < 10) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.strokeStyle = `rgba(${star.tint === "gold" ? "216,176,106" : "170,154,250"},${orbitAlpha * 0.24})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.quadraticCurveTo((cx + x) / 2 + Math.sin(star.angle) * 22, (cy + y) / 2 - Math.cos(star.angle) * 18, x, y);
          ctx.stroke();
          ctx.restore();
        }
      }

      if (orbitAlpha > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `rgba(139,123,240,${orbitAlpha * 0.24})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, compact ? width * 0.28 : width * 0.16, compact ? height * 0.09 : height * 0.13, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(139,123,240,${orbitAlpha * 0.14})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, compact ? width * 0.38 : width * 0.24, compact ? height * 0.13 : height * 0.19, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(166,150,250,${orbitAlpha * 0.54})`;
        for (let index = 0; index < 2; index += 1) {
          const angle = time * 0.00085 + index * Math.PI;
          ctx.beginPath();
          ctx.ellipse(cx, cy, compact ? width * 0.28 : width * 0.16, compact ? height * 0.09 : height * 0.13, 0, angle, angle + 0.86);
          ctx.stroke();
        }
        drawDot(cx, cy, 6, orbitAlpha, "violet");
        ctx.globalAlpha = orbitAlpha;
        ctx.fillStyle = "#d6d0ff";
        ctx.font = '600 13px "Noto Serif SC", serif';
        ctx.textAlign = "center";
        ctx.fillText("你", cx, cy + 26);
        ctx.textAlign = "left";
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      const vignette = ctx.createRadialGradient(cx, cy, Math.min(width, height) * 0.22, cx, cy, Math.max(width, height) * 0.78);
      vignette.addColorStop(0, "rgba(5,4,11,0)");
      vignette.addColorStop(1, "rgba(2,2,7,0.72)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      if (!reducedMotion) {
        raf = requestAnimationFrame(render);
      }
    };

    resize();
    render(performance.now());
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas aria-hidden="true" className="iorbit-star-canvas" ref={canvasRef} />;
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" fill="currentColor" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8 12h8.4m0 0-3.7-3.7m3.7 3.7-3.7 3.7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

function OrbitLogoMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40">
      <defs>
        <radialGradient cx="38%" cy="32%" id="iorbit-logo-core" r="70%">
          <stop offset="0%" stopColor="#f4f0ff" />
          <stop offset="45%" stopColor="#8b7bf0" />
          <stop offset="100%" stopColor="#4737b0" />
        </radialGradient>
      </defs>
      <circle className="iorbit-logo-core" cx="20" cy="20" r="15.2" fill="url(#iorbit-logo-core)" />
    </svg>
  );
}

function ContactPreview({ className = "", contact, style }: { className?: string; contact: ContactCard; style?: CSSProperties }) {
  return (
    <article className={`iorbit-contact-preview${className ? ` ${className}` : ""}`} style={style}>
      <img alt="" className="iorbit-contact-avatar" src={contact.avatar} />
      <div>
        <strong>{contact.name}</strong>
        <span>{contact.company} · {contact.role}</span>
      </div>
      <p>{contact.help}</p>
      <small><i /> iOrbit 为你匹配</small>
    </article>
  );
}

function JourneyCard({ contact }: { contact: ContactCard }) {
  return (
    <article className="iorbit-journey-card">
      <img alt="" src={contact.avatar} />
      <div>
        <strong>{contact.name}</strong>
        <span>{contact.company} · {contact.role}</span>
      </div>
      <p>{contact.help}</p>
      <small>{contact.deal}</small>
    </article>
  );
}

function EndingMiniCard({ contact }: { contact: EndingContact }) {
  return (
    <article className="iorbit-ending-mini-card">
      <img alt="" src={contact.avatar} />
      <div>
        <strong>{contact.name}</strong>
        <span>iOrbit 为你匹配</span>
      </div>
      <p>{contact.help}</p>
    </article>
  );
}

export function OrbitStarfieldHome() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [stop, setStop] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [typedLength, setTypedLength] = useState(0);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [expandedOrbitIndex, setExpandedOrbitIndex] = useState(0);
  const [endingContactIndex, setEndingContactIndex] = useState(1);
  const [mobileDemoIndex, setMobileDemoIndex] = useState(0);
  const [mobileOrbitIndex, setMobileOrbitIndex] = useState(0);
  const [cardVisible, setCardVisible] = useState(true);
  const rootRef = useRef<HTMLElement | null>(null);
  const progressRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const stopRef = useRef(0);
  const cueText = stop === 3 ? "已是最后一幕 · 滚动返回顶部" : "滚动 / 空格 · 翻到下一幕";
  const mobileCueText = stop === 3 ? "已是最后一幕 · 上滑回到顶部" : "上滑 · 翻到下一幕";
  const rootClass = useMemo(() => `iorbit-starfield-home iorbit-stop-${stop}${isAnimating ? " iorbit-is-animating" : ""}`, [isAnimating, stop]);
  const typedQuery = typedLength > 0 ? queryText.slice(0, typedLength) : "向 Orbit 写下你的目标...";

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const writeProgress = useCallback((progress: number) => {
    progressRef.current = progress;
    const root = rootRef.current;
    if (!root) return;
    root.style.setProperty("--io-progress", progress.toFixed(4));
    root.dataset.iorbitProgress = progress.toFixed(3);
  }, []);

  const goToStop = useCallback((targetStop: number) => {
    const nextStop = Math.max(0, Math.min(stopProgress.length - 1, targetStop));
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const from = progressRef.current;
    const to = stopProgress[nextStop] ?? 0;
    const span = Math.abs(to - from);
    stopRef.current = nextStop;
    setStop(nextStop);

    if (span < 0.001 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      writeProgress(to);
      setIsAnimating(false);
      return;
    }

    const duration = (span > 0.45 ? 8.5 : span > 0.25 ? 2.8 : 2.1) * 1000;
    const startedAt = performance.now();
    setIsAnimating(true);

    const tick = (now: number) => {
      const ratio = clamp((now - startedAt) / duration);
      writeProgress(lerp(from, to, smoother(ratio)));
      if (ratio < 1) {
        animationRef.current = requestAnimationFrame(tick);
        return;
      }
      animationRef.current = null;
      writeProgress(to);
      setIsAnimating(false);
    };

    animationRef.current = requestAnimationFrame(tick);
  }, [writeProgress]);

  useEffect(() => {
    writeProgress(0);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [writeProgress]);

  useEffect(() => {
    let raf = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const ratio = clamp((now - startedAt - 260) / 1200);
      setTypedLength(Math.round(ratio * queryText.length));
      if (ratio < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    let timeout = 0;
    if (stop !== 0) {
      setCardVisible(false);
      return undefined;
    }

    setCardVisible(true);
    const interval = window.setInterval(() => {
      setCardVisible(false);
      timeout = window.setTimeout(() => {
        setFeaturedIndex((current) => (current + 1) % contacts.length);
        setCardVisible(true);
      }, 460);
    }, 2500);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [stop]);

  useEffect(() => {
    if (stop !== 2) {
      setMobileOrbitIndex(0);
      setExpandedOrbitIndex(0);
      return undefined;
    }

    const interval = window.setInterval(() => {
      setMobileOrbitIndex((current) => (current + 1) % orbitContacts.length);
      setExpandedOrbitIndex((current) => (current + 1) % orbitContacts.length);
    }, 2800);

    return () => window.clearInterval(interval);
  }, [stop]);

  useEffect(() => {
    if (stop !== 3) {
      setEndingContactIndex(0);
      return undefined;
    }

    const interval = window.setInterval(() => {
      setEndingContactIndex((current) => (current + 1) % endingContacts.length);
    }, 18000);

    return () => window.clearInterval(interval);
  }, [stop]);

  useEffect(() => {
    if (stop !== 1) {
      setMobileDemoIndex(0);
      return undefined;
    }

    const interval = window.setInterval(() => {
      setMobileDemoIndex((current) => (current + 1) % demoContacts.length);
    }, 2600);

    return () => window.clearInterval(interval);
  }, [stop]);

  useEffect(() => {
    let wheelLock = 0;
    let touchY = 0;
    const go = (direction: 1 | -1) => {
      if (isAnimating) return;
      const current = stopRef.current;
      goToStop(current === 3 && direction === 1 ? 0 : current + direction);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const now = performance.now();
      if (now < wheelLock || Math.abs(event.deltaY) < 28) return;
      wheelLock = now + 760;
      go(event.deltaY > 0 ? 1 : -1);
    };
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowDown", "PageDown", " ", "Spacebar"].includes(event.key)) {
        event.preventDefault();
        go(1);
      }
      if (["ArrowUp", "PageUp"].includes(event.key)) {
        event.preventDefault();
        go(-1);
      }
      if (event.key === "Home") goToStop(0);
      if (event.key === "End") goToStop(3);
    };
    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY ?? 0;
    };
    const onTouchEnd = (event: TouchEvent) => {
      const nextY = event.changedTouches[0]?.clientY ?? touchY;
      const delta = touchY - nextY;
      if (Math.abs(delta) > 42) go(delta > 0 ? 1 : -1);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [goToStop, isAnimating]);

  return (
    <main
      className={rootClass}
      data-appscroll
      data-iorbit-motion="starfield-stop-machine"
      data-iorbit-progress="0.000"
      data-orbit-real-page="starfield-home"
      ref={rootRef}
      style={{ "--io-progress": "0" } as CSSProperties}
    >
      <style>{starfieldCss}</style>
      <div className="iorbit-dynamic-island" />
      <nav className="iorbit-star-nav" aria-label="iOrbit">
        <a className="iorbit-star-brand" href="/app" aria-label="iOrbit">
          <span className="iorbit-brand-mark"><OrbitLogoMark /></span>
          <span>
            <b className="iorbit-brand-desktop">iOrbit</b>
            <b className="iorbit-brand-mobile">Orbit</b>
            <small>由 iOrbit 智能匹配引擎驱动</small>
          </span>
        </a>
        <div className="iorbit-nav-links">
          <a href="/app/events">活动</a>
          <a href="/app/followups">日程</a>
          <a href="/app/contacts">人脉</a>
        </div>
        <div className="iorbit-nav-actions">
          <div className="iorbit-lang">
            <button aria-pressed="true" type="button">中</button>
            <button aria-pressed="false" type="button">EN</button>
          </div>
          <a className="iorbit-me" href="/app/account/login">我的</a>
          <button aria-expanded={menuOpen} aria-label="菜单 / Menu" className="iorbit-burger" onClick={() => setMenuOpen((open) => !open)} type="button">
            <span />
            <span />
            <span />
          </button>
        </div>
      </nav>
      <div className={`iorbit-menu${menuOpen ? " is-open" : ""}`}>
        <a href="/app/events">活动</a>
        <a href="/app/followups">日程</a>
        <a href="/app/contacts">人脉</a>
        <a href="/app/account/login">我的</a>
      </div>
      <section className="iorbit-scene" aria-label="Relationship Starfield">
        <StarfieldCanvas stop={stop} />
        <div className="iorbit-fog" />
        <div className="iorbit-dots" aria-hidden="true">
          {[0, 1, 2, 3].map((item) => (
            <button className={item === stop ? "is-active" : ""} key={item} onClick={() => goToStop(item)} tabIndex={-1} type="button" />
          ))}
        </div>
        <div className="iorbit-hero">
          <div className="iorbit-kicker">Relationship Starfield · 人脉星空</div>
          <h1>
            <span className="iorbit-word">你的人脉，</span><span className="iorbit-word">是一片</span><br />
            <span className="iorbit-word">待你点亮的</span><strong className="iorbit-word">星空</strong>
          </h1>
          <p className="iorbit-serif">Your network, in orbit.</p>
          <p className="iorbit-sub">
            人脉本是散落天际的星星，<span className="iorbit-copy-desktop">iOrbit</span><span className="iorbit-copy-mobile">Orbit</span> 让它们围绕你的轨道运转、为你所用。
          </p>
        </div>
        <ContactPreview
          className={cardVisible ? "is-card-visible" : ""}
          contact={contacts[featuredIndex]}
          key={`featured-${contacts[featuredIndex].name}`}
          style={{
            "--io-pop-x": `${popoutPositions[featuredIndex % popoutPositions.length]?.x ?? 0}px`,
            "--io-pop-y": `${popoutPositions[featuredIndex % popoutPositions.length]?.y ?? 0}px`,
          } as CSSProperties}
        />
        <div className="iorbit-field-wrap">
          <div className="iorbit-field-rings" />
          <label className="iorbit-field" htmlFor="iorbit-query">
            <SparkleIcon />
            <span className={typedLength > 0 ? "" : "is-placeholder"} id="iorbit-query">{typedQuery}</span>
            <i className="iorbit-caret" />
            <button aria-label="翻到下一幕" onClick={() => goToStop(1)} type="button"><ArrowIcon /></button>
          </label>
          <div className="iorbit-chip-row">
            {chips.map((chip) => <button key={chip} onClick={() => goToStop(1)} type="button">{chip}</button>)}
          </div>
        </div>
        <div className="iorbit-process">
          <span />
          <b>{stop < 2 ? "iOrbit 解析你的目标 → 挖掘人脉关联 → 为你排序推荐" : "iOrbit 读懂全场 → 计算商业匹配 → 为你排好这一桌"}</b>
        </div>
        <div className="iorbit-cluster-labels" aria-hidden="true">
          {clusters.map((cluster) => <span key={cluster}>{cluster}</span>)}
        </div>
        <div className="iorbit-pain">一场活动几百张名片，对的只有几个人<br />iOrbit 帮你找到他们。</div>
        <div className="iorbit-demo-cards">
          {demoContacts.map((contact, index) => (
            <div className={`iorbit-demo-card-slot${index === mobileDemoIndex ? " is-active" : ""}${index === 0 ? " is-featured" : ""}`} key={`demo-${contact.name}`}>
              <JourneyCard contact={contact} />
            </div>
          ))}
        </div>
        <div className="iorbit-demo-dots" aria-hidden="true">
          {demoContacts.map((contact, index) => <span className={index === mobileDemoIndex ? "is-active" : ""} key={`demo-dot-${contact.name}`} />)}
        </div>
        <div className="iorbit-orbit-cards" aria-label="匹配到的人脉轨道">
          <div className="iorbit-orbit-ring-system" aria-hidden="true">
            <span />
            <span />
            <i>你</i>
          </div>
          <div className="iorbit-orbit-spin">
          {orbitContacts.map((contact, index) => (
            <button
              aria-label={`展开 ${contact.name}`}
              className={`iorbit-orbit-card-slot${index === 0 ? " is-featured" : ""}${index === expandedOrbitIndex ? " is-expanded" : ""}`}
              key={`orbit-${contact.name}`}
              onClick={() => setExpandedOrbitIndex(index)}
              onMouseEnter={() => setExpandedOrbitIndex(index)}
              style={{
                "--io-card-angle": `${orbitNodePlacements[index]?.angle ?? 0}deg`,
                "--io-card-radius": `${orbitNodePlacements[index]?.radius ?? 260}px`,
                "--io-card-scale": orbitNodePlacements[index]?.scale ?? 1,
                "--io-card-scale-collapsed": (orbitNodePlacements[index]?.scale ?? 1) * 0.82,
                "--io-card-scale-open": (orbitNodePlacements[index]?.scale ?? 1) * 1.03,
                "--io-card-x": `${orbitNodePlacements[index]?.cardX ?? 0}px`,
                "--io-card-y": `${orbitNodePlacements[index]?.cardY ?? 0}px`,
                "--io-card-index": index,
              } as CSSProperties}
              type="button"
            >
              <span className="iorbit-orbit-star" />
              <span className="iorbit-orbit-tether" />
              <span className="iorbit-orbit-card-shell">
                <JourneyCard contact={contact} />
              </span>
            </button>
          ))}
          </div>
        </div>
        <div className={`iorbit-mobile-orbit-card${mobileOrbitIndex === 0 ? " is-featured" : ""}`} key={`mobile-orbit-${orbitContacts[mobileOrbitIndex]?.name ?? "card"}`}>
          <JourneyCard contact={orbitContacts[mobileOrbitIndex] ?? orbitContacts[0]} />
        </div>
        <div className="iorbit-step-list">
          {steps.map(([title, copy], index) => (
            <article key={title}>
              <span />
              <i>0{index + 1}</i>
              <strong>{title}</strong>
              <p>{copy}</p>
            </article>
          ))}
        </div>
        <div className="iorbit-ending">
          <section className="iorbit-ending-panel is-personal">
            <small>FOR YOU · 个人用户</small>
            <div className="iorbit-ending-starfield">
              {endingStars.map(([x, y, alpha], index) => (
                <span key={`ending-star-${index}`} style={{ "--sx": `${x}%`, "--sy": `${y}%`, "--sa": alpha } as CSSProperties} />
              ))}
              <div className="iorbit-ending-popout">
                <EndingMiniCard contact={endingContacts[endingContactIndex] ?? endingContacts[0]} />
              </div>
            </div>
            <h2>
              <span>那些躺在名片夹里的人，</span>
              <span>其实是一片待点亮的星空。</span>
              <span>iOrbit 替你逐颗解读，</span>
              <span>挖出每段关系背后的商业价值。</span>
            </h2>
            <a href="/app/account/login">创建我的人脉星图 · 注册 <span>→</span></a>
          </section>
          <section className="iorbit-ending-panel is-organizer">
            <small>FOR ORGANIZERS · 活动方</small>
            <div className="iorbit-ending-orbit-visual" aria-hidden="true">
              <span className="iorbit-ending-ring is-outer" />
              <span className="iorbit-ending-ring is-inner" />
              <i className="iorbit-ending-core" />
              <b className="iorbit-ending-satellite is-top" />
              <b className="iorbit-ending-satellite is-bottom" />
            </div>
            <h2>
              <span>让一场活动，</span>
              <span>从「人多」变成「人对」。</span>
              <span>iOrbit 替每位来宾算好轨道，</span>
              <span>落座就在对的人中间。</span>
            </h2>
            <a href="/app/register">我是活动主办方 · 接入 iOrbit <span>→</span></a>
          </section>
        </div>
        <button className="iorbit-cue" onClick={() => goToStop(stop === 3 ? 0 : stop + 1)} type="button">
          <span className="iorbit-cue-desktop">{cueText}</span>
          <span className="iorbit-cue-mobile">{mobileCueText}</span>
          <b>{stop === 3 ? "↑" : "↓"}</b>
        </button>
      </section>
    </main>
  );
}

const starfieldCss = `
html:has(.iorbit-starfield-home),
body:has(.iorbit-starfield-home) {
  background: #04030a;
  overflow: hidden;
}

.iorbit-starfield-home {
  --io-bg: #06050d;
  --io-bg-2: #14122a;
  --io-gold: #c6a06a;
  --io-ink: #f1eff9;
  --io-muted: #a6a3bd;
  --io-violet: #8b7bf0;
  --io-violet-soft: #cfc6ff;
  background:
    radial-gradient(130% 100% at 50% 14%, #14122a 0%, #0d0b1e 42%, #08070f 72%, #06050d 100%);
  color: #eceaf6;
  font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  height: 100dvh;
  --io-progress: 0;
  inset: 0;
  letter-spacing: 0;
  overflow: hidden;
  position: fixed;
  width: 100vw;
}

.iorbit-starfield-home *,
.iorbit-starfield-home *::before,
.iorbit-starfield-home *::after {
  box-sizing: border-box;
}

.iorbit-starfield-home a {
  color: inherit;
  text-decoration: none;
}

.iorbit-starfield-home button {
  appearance: none;
  background: transparent;
  border: 0;
  border-radius: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
  margin: 0;
  min-height: 0;
  min-width: 0;
  padding: 0;
}

.iorbit-starfield-home button:focus:not(:focus-visible) {
  outline: none;
}

.iorbit-starfield-home button:focus-visible {
  outline: 2px solid rgba(188,178,244,0.88);
  outline-offset: 4px;
}

.iorbit-scene {
  background: radial-gradient(130% 100% at 50% 14%, #14122a 0%, #0d0b1e 42%, #08070f 72%, #06050d 100%);
  inset: 0;
  overflow: hidden;
  position: absolute;
  z-index: 1;
}

.iorbit-star-canvas {
  display: block;
  height: 100%;
  inset: 0;
  position: absolute;
  width: 100%;
}

.iorbit-fog {
  background-image:
    linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.014) 1px, transparent 1px);
  background-size: 3px 3px, 3px 3px;
  inset: 0;
  mix-blend-mode: overlay;
  opacity: .18;
  pointer-events: none;
  position: absolute;
}

.iorbit-scene::after {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: radial-gradient(130% 100% at 50% 28%, rgba(74,65,150,0.66), rgba(29,25,58,0.62) 52%, rgba(8,7,18,0.18) 100%);
  content: "";
  inset: 0;
  opacity: 0;
  pointer-events: none;
  position: absolute;
  z-index: 3;
}

.iorbit-stop-2.iorbit-is-animating .iorbit-scene::after {
  animation: iorbit-stop2-fog 8.5s both;
}

.iorbit-star-nav {
  align-items: center;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  background: rgba(8,7,16,0.26);
  border-bottom: 1px solid rgba(150,145,200,0.07);
  display: flex;
  justify-content: space-between;
  left: 0;
  padding: 18px clamp(20px, 5vw, 56px);
  position: fixed;
  right: 0;
  top: 0;
  z-index: 60;
}

.iorbit-star-brand {
  align-items: center;
  display: flex;
  gap: 11px;
}

.iorbit-brand-mark {
  color: #8b7bf0;
  display: inline-grid;
  filter: drop-shadow(0 0 10px rgba(139,123,240,0.64));
  height: 28px;
  place-items: center;
  width: 28px;
}

.iorbit-brand-mark svg {
  display: block;
  height: 28px;
  width: 28px;
}

.iorbit-logo-ring {
  fill: none;
  stroke: rgba(139,123,240,0.62);
  stroke-width: 1.7;
}

.iorbit-logo-ring.is-soft {
  stroke: rgba(207,198,255,0.22);
  stroke-width: 1.1;
}

.iorbit-logo-core {
  filter: drop-shadow(0 0 8px rgba(139,123,240,0.85));
}

.iorbit-logo-moon {
  fill: #9d8fff;
  filter: drop-shadow(0 0 7px rgba(139,123,240,0.9));
}

.iorbit-star-brand span:last-child {
  display: flex;
  flex-direction: column;
  line-height: 1;
}

.iorbit-star-brand b {
  color: #f2f0fb;
  font-size: 18px;
  font-weight: 500;
  letter-spacing: .02em;
}

.iorbit-brand-mobile {
  display: none;
}

.iorbit-copy-mobile {
  display: none;
}

.iorbit-star-brand small {
  color: rgba(180,176,210,0.48);
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 9px;
  letter-spacing: .03em;
  margin-top: 4px;
  white-space: nowrap;
}

.iorbit-nav-links {
  align-items: center;
  display: flex;
  gap: 4px;
}

.iorbit-nav-links a {
  border-radius: 9px;
  color: rgba(230,228,244,0.72);
  font-size: 14px;
  padding: 8px 15px;
}

.iorbit-nav-actions {
  align-items: center;
  display: flex;
  gap: 14px;
}

.iorbit-lang {
  color: rgba(230,228,244,0.5);
  display: inline-flex;
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  gap: 1px;
  letter-spacing: .05em;
}

.iorbit-lang button {
  border-radius: 999px;
  padding: 2px 3px;
}

.iorbit-lang button:first-child {
  color: #cfc9ef;
}

.iorbit-lang button + button::before {
  color: rgba(230,228,244,0.38);
  content: "/";
  padding-right: 8px;
}

.iorbit-me {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(150,145,200,0.18);
  border-radius: 999px;
  color: rgba(236,234,248,0.92);
  font-size: 13px;
  padding: 7px 16px;
}

.iorbit-burger,
.iorbit-menu,
.iorbit-dynamic-island {
  display: none;
}

.iorbit-hero {
  left: 50%;
  position: absolute;
  text-align: center;
  top: 12vh;
  transform: translateX(-50%);
  width: min(900px, 92vw);
  z-index: 6;
}

.iorbit-kicker {
  animation: iorbit-reveal .8s .15s both;
  color: #c6a06a;
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11.5px;
  letter-spacing: .34em;
  margin-bottom: 24px;
  text-transform: uppercase;
}

.iorbit-hero h1 {
  color: #f1eff9;
  font-family: "Noto Serif SC", "Songti SC", STSong, Georgia, serif;
  font-size: clamp(30px, 5vw, 60px);
  font-weight: 300;
  letter-spacing: .005em;
  line-height: 1.24;
  margin: 0;
  text-wrap: balance;
}

.iorbit-hero h1 span,
.iorbit-hero h1 strong {
  animation: iorbit-reveal .8s both;
  display: inline-block;
}

.iorbit-hero h1 .iorbit-word:nth-of-type(1) {
  animation-delay: .35s;
}

.iorbit-hero h1 .iorbit-word:nth-of-type(2) {
  animation-delay: .5s;
}

.iorbit-hero h1 .iorbit-word:nth-of-type(3) {
  animation-delay: .65s;
}

.iorbit-hero h1 strong.iorbit-word {
  animation-delay: .8s;
}

.iorbit-hero h1 strong {
  color: #fff;
  font-weight: 500;
}

.iorbit-serif {
  animation: iorbit-reveal .9s .92s both;
  color: #c8c4dd;
  font-family: Newsreader, Georgia, serif;
  font-size: 18px;
  font-style: italic;
  letter-spacing: .01em;
  margin: 22px auto 0;
}

.iorbit-sub {
  animation: iorbit-reveal .9s 1s both;
  color: #a6a3bd;
  font-size: 15px;
  line-height: 1.75;
  margin: 10px auto 0;
  max-width: 620px;
}

.iorbit-contact-preview {
  background: rgba(14,12,24,0.78);
  border: 1px solid rgba(150,145,200,0.18);
  border-radius: 17px;
  box-shadow: 0 16px 50px -30px rgba(0,0,0,0.8);
  display: grid;
  gap: 10px;
  grid-template-columns: 42px 1fr;
  left: 50%;
  min-height: 118px;
  padding: 13px 16px;
  position: absolute;
  top: 43%;
  transform: translate(calc(-50% + var(--io-pop-x, 0px)), var(--io-pop-y, 0px));
  width: 300px;
  z-index: 7;
}

.iorbit-contact-preview.is-card-visible {
  animation: iorbit-card-pop .42s both;
}

.iorbit-contact-avatar {
  border-radius: 50%;
  grid-row: span 2;
  height: 42px;
  object-fit: cover;
  width: 42px;
}

.iorbit-contact-preview strong,
.iorbit-contact-preview span,
.iorbit-contact-preview p,
.iorbit-contact-preview small {
  margin: 0;
}

.iorbit-contact-preview strong {
  color: #f5f2ff;
  display: block;
  font-size: 15px;
  font-weight: 700;
}

.iorbit-contact-preview span {
  color: rgba(188,184,214,0.72);
  display: block;
  font-size: 12px;
  margin-top: 3px;
}

.iorbit-contact-preview p {
  color: #f3f1fb;
  font-size: 13px;
  font-weight: 700;
  grid-column: 1 / -1;
  line-height: 1.45;
}

.iorbit-contact-preview small {
  align-items: center;
  color: #b8afea;
  display: inline-flex;
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  gap: 7px;
  grid-column: 1 / -1;
}

.iorbit-contact-preview i {
  background: #8b7bf0;
  border-radius: 50%;
  box-shadow: 0 0 8px #8b7bf0;
  display: inline-block;
  height: 6px;
  width: 6px;
}

.iorbit-field-wrap {
  animation: iorbit-field-reveal .78s .55s both;
  bottom: 14vh;
  left: 50%;
  opacity: 1;
  position: absolute;
  text-align: center;
  transform: translateX(-50%);
  transition: opacity .42s ease, transform .42s ease;
  width: min(620px, 92vw);
  z-index: 8;
}

.iorbit-field-rings {
  height: 74px;
  left: 0;
  pointer-events: none;
  position: absolute;
  right: 0;
  top: 0;
  z-index: 0;
}

.iorbit-field-rings::before,
.iorbit-field-rings::after {
  border: 1px solid rgba(139,123,240,0.12);
  border-radius: 30px;
  content: "";
  inset: -14px;
  pointer-events: none;
  position: absolute;
}

.iorbit-field-rings::after {
  border-color: rgba(139,123,240,0.06);
  border-radius: 44px;
  inset: -28px;
}

.iorbit-field-rings::before {
  animation: iorbit-flow 16s linear infinite;
  background: conic-gradient(from var(--io-ang, 0deg), transparent 0deg, rgba(139,123,240,.22) 34deg, transparent 78deg, transparent 180deg, rgba(139,123,240,.22) 214deg, transparent 258deg, transparent 360deg);
  border: 0;
  padding: 1px;
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}

@property --io-ang {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}

@keyframes iorbit-flow {
  to { --io-ang: 360deg; }
}

@keyframes iorbit-cue {
  0%, 100% { opacity: .45; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(6px); }
}

@keyframes iorbit-reveal {
  from {
    filter: blur(12px);
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    filter: blur(0);
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes iorbit-field-reveal {
  from {
    filter: blur(12px);
    opacity: 0;
    transform: translateX(-50%) translateY(10px);
  }
  to {
    filter: blur(0);
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

@keyframes iorbit-card-pop {
  0% {
    filter: blur(7px);
    opacity: 0;
    transform: translate(calc(-50% + var(--io-pop-x, 0px)), calc(var(--io-pop-y, 0px) + 12px)) scale(.94);
  }
  100% {
    filter: blur(0);
    opacity: 1;
    transform: translate(calc(-50% + var(--io-pop-x, 0px)), var(--io-pop-y, 0px)) scale(1);
  }
}

@keyframes iorbit-caret {
  0%, 45% { opacity: 1; }
  46%, 100% { opacity: 0; }
}

@keyframes iorbit-process-first {
  0%, 100% {
    opacity: 0;
    transform: translateX(-50%) translateY(8px);
  }
  14%, 84% {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

@keyframes iorbit-stage-reveal {
  from {
    filter: blur(8px);
    opacity: 0;
    transform: translate(-50%, 26px);
  }
  to {
    filter: blur(0);
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

@keyframes iorbit-fade-reveal {
  from {
    filter: blur(8px);
    opacity: 0;
  }
  to {
    filter: blur(0);
    opacity: 1;
  }
}

@keyframes iorbit-stop2-fog {
  0%, 38% {
    opacity: .98;
  }
  58%, 100% {
    opacity: 0;
  }
}

@keyframes iorbit-pain-dock-desktop {
  0%, 36% {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
    color: #f1eff9;
    font-size: clamp(24px, 3.8vw, 42px);
    line-height: 1.5;
    padding: 0;
    top: 23vh;
    width: min(860px, 90vw);
  }
  58%, 100% {
    background: rgba(11,10,21,0.62);
    border-color: rgba(150,145,200,0.16);
    box-shadow: 0 12px 34px -18px rgba(0,0,0,0.7);
    color: #e8e6f4;
    font-size: clamp(14px, 1.35vw, 18px);
    line-height: 1.5;
    padding: 7px 18px;
    top: 82px;
    width: min(520px, 86vw);
  }
}

@keyframes iorbit-pain-dock-mobile {
  0%, 36% {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
    color: #f1eff9;
    font-size: 19px;
    line-height: 1.55;
    padding: 0;
    top: 20%;
    width: 86%;
  }
  58%, 100% {
    background: rgba(11,10,21,0.62);
    border-color: rgba(150,145,200,0.16);
    box-shadow: 0 12px 34px -18px rgba(0,0,0,0.7);
    color: #e8e6f4;
    font-size: 14px;
    line-height: 1.45;
    padding: 10px 18px;
    top: 104px;
    width: 86%;
  }
}

@keyframes iorbit-steps-after-orbit {
  0%, 78% {
    filter: blur(8px);
    opacity: 0;
    transform: translate(-50%, 28px);
  }
  100% {
    filter: blur(0);
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

@keyframes iorbit-card-orbit-path {
  to {
    offset-distance: 100%;
  }
}

@keyframes iorbit-orbit-system-spin {
  to { transform: rotate(360deg); }
}

@keyframes iorbit-orbit-system-counterspin {
  to { rotate: -360deg; }
}

@keyframes iorbit-mobile-orbit-pop {
  0% {
    filter: blur(7px);
    opacity: 0;
    transform: translate(-50%, 12px) scale(.96);
  }
  12%, 86% {
    filter: blur(0);
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }
  100% {
    filter: blur(7px);
    opacity: 0;
    transform: translate(-50%, -8px) scale(.98);
  }
}

.iorbit-field {
  align-items: center;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  background: rgba(255,255,255,0.035);
  border: 1px solid rgba(150,145,200,0.15);
  border-radius: 18px;
  box-shadow: 0 0 60px -26px rgba(120,108,240,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
  color: #eeecf7;
  display: flex;
  gap: 12px;
  min-height: 74px;
  padding: 14px 14px 14px 20px;
  position: relative;
  z-index: 1;
}

.iorbit-field svg:first-child {
  color: #9389d6;
  flex: 0 0 auto;
  height: 18px;
  opacity: .85;
  width: 18px;
}

.iorbit-field span {
  flex: 1;
  font-size: 16px;
  line-height: 1.4;
  min-width: 0;
  overflow: hidden;
  text-align: left;
  white-space: nowrap;
}

.iorbit-field span.is-placeholder {
  color: rgba(166,163,189,0.66);
}

.iorbit-caret {
  animation: iorbit-caret .82s step-end infinite;
  background: #cfc6ff;
  display: inline-block;
  flex: 0 0 auto;
  height: 19px;
  opacity: .9;
  width: 1px;
}

.iorbit-field button {
  align-items: center;
  background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.18), rgba(139,123,240,0.24));
  border: 1px solid rgba(150,145,200,0.22);
  border-radius: 50%;
  box-shadow: 0 0 18px -8px #8b7bf0;
  color: #d6d0ff;
  display: inline-flex;
  flex: 0 0 auto;
  height: 48px;
  justify-content: center;
  width: 48px;
}

.iorbit-field button svg {
  height: 22px;
  width: 22px;
}

.iorbit-chip-row {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 28px;
  position: relative;
  z-index: 1;
}

.iorbit-chip-row button {
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  background: rgba(255,255,255,0.035);
  border: 1px solid rgba(150,145,200,0.16);
  border-radius: 999px;
  color: rgba(236,234,248,0.88);
  font-size: 13px;
  padding: 10px 17px;
  white-space: nowrap;
}

.iorbit-dots {
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: fixed;
  right: clamp(16px, 2.4vw, 34px);
  top: 50%;
  transform: translateY(-50%);
  z-index: 40;
}

.iorbit-dots button {
  border: 1px solid rgba(165,160,210,0.45);
  border-radius: 50%;
  height: 9px;
  position: relative;
  transition: all .35s;
  width: 9px;
}

.iorbit-dots button::after {
  content: "";
  inset: -18px;
  position: absolute;
}

.iorbit-dots button.is-active {
  background: #bcb2f4;
  border-color: #bcb2f4;
  box-shadow: 0 0 12px -1px #8b7bf0;
  transform: scale(1.25);
}

.iorbit-process {
  align-items: center;
  background: rgba(11,10,21,0.58);
  border: 1px solid rgba(139,123,240,0.22);
  border-radius: 999px;
  bottom: 24px;
  box-shadow: 0 0 34px -16px rgba(139,123,240,0.7);
  display: inline-flex;
  gap: 9px;
  left: 50%;
  opacity: 0;
  padding: 9px 17px;
  position: absolute;
  transform: translateX(-50%);
  z-index: 9;
}

.iorbit-stop-0 .iorbit-process {
  animation: iorbit-process-first 4.4s 3.4s both;
}

.iorbit-stop-1 .iorbit-process,
.iorbit-stop-2 .iorbit-process {
  opacity: 0;
  pointer-events: none;
}

.iorbit-process span {
  background: #8b7bf0;
  border-radius: 50%;
  box-shadow: 0 0 8px #8b7bf0;
  height: 6px;
  width: 6px;
}

.iorbit-process b {
  color: #cdc8ec;
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: .05em;
  white-space: nowrap;
}

.iorbit-cue {
  align-items: center;
  bottom: 26px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 8px;
  left: 50%;
  position: absolute;
  transform: translateX(-50%);
  z-index: 12;
}

.iorbit-is-animating .iorbit-cue {
  opacity: 0;
  pointer-events: none;
}

.iorbit-cue span {
  color: #9f9cb8;
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px;
  letter-spacing: .26em;
  text-transform: uppercase;
  white-space: nowrap;
}

.iorbit-cue b {
  animation: iorbit-cue 2.4s ease-in-out infinite;
  color: #c6a06a;
  font-size: 15px;
  font-weight: 400;
}

.iorbit-cue-mobile {
  display: none;
}

.iorbit-pain,
.iorbit-demo-cards,
.iorbit-demo-dots,
.iorbit-cluster-labels,
.iorbit-orbit-cards,
.iorbit-mobile-orbit-card,
.iorbit-step-list,
.iorbit-ending {
  opacity: 0;
  pointer-events: none;
  position: absolute;
  transition: opacity .5s ease, transform .5s ease;
  z-index: 7;
}

.iorbit-pain {
  color: #f1eff9;
  font-family: "Noto Serif SC", "Songti SC", STSong, Georgia, serif;
  font-size: clamp(24px, 3.8vw, 42px);
  font-weight: 300;
  left: 50%;
  line-height: 1.5;
  text-align: center;
  top: 23vh;
  transform: translate(-50%, 20px);
  width: min(860px, 90vw);
}

.iorbit-cluster-labels {
  color: rgba(232,230,246,0.82);
  display: grid;
  font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  font-size: 12px;
  font-weight: 600;
  gap: min(12vw, 170px);
  grid-auto-flow: column;
  left: 50%;
  line-height: 1;
  top: 36.5%;
  transform: translate(-50%, 18px);
  white-space: nowrap;
}

.iorbit-demo-cards {
  align-items: flex-start;
  display: flex;
  gap: clamp(10px, 1.4vw, 18px);
  left: 50%;
  top: 61%;
  transform: translate(-50%, 36px);
}

.iorbit-demo-card-slot {
  display: block;
}

.iorbit-demo-card-slot.is-featured .iorbit-journey-card {
  background: rgba(30,22,18,0.86);
  border-color: rgba(216,176,106,0.54);
  box-shadow: 0 18px 58px -24px rgba(216,176,106,0.38), 0 18px 54px -30px rgba(0,0,0,0.95);
}

.iorbit-demo-card-slot.is-featured .iorbit-journey-card small {
  color: #d8b06a;
}

.iorbit-demo-dots {
  display: none;
}

.iorbit-journey-card {
  background: rgba(14,12,24,0.8);
  border: 1px solid rgba(150,145,200,0.18);
  border-radius: 18px;
  box-shadow: 0 18px 54px -28px rgba(0,0,0,0.9);
  color: #e7e4f4;
  display: grid;
  gap: 10px;
  grid-template-columns: 42px 1fr;
  padding: 16px;
  width: 256px;
}

.iorbit-journey-card img {
  border-radius: 50%;
  grid-row: span 2;
  height: 42px;
  object-fit: cover;
  width: 42px;
}

.iorbit-journey-card strong {
  color: #fff;
  display: block;
  font-size: 15px;
}

.iorbit-journey-card span {
  color: rgba(188,184,214,0.72);
  display: block;
  font-size: 12px;
  margin-top: 2px;
}

.iorbit-journey-card p,
.iorbit-journey-card small {
  grid-column: 1 / -1;
  margin: 0;
}

.iorbit-journey-card p {
  color: #f2efff;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.45;
}

.iorbit-journey-card small {
  border-top: 1px solid rgba(150,145,200,0.12);
  color: rgba(170,176,204,0.8);
  font-size: 12px;
  padding-top: 9px;
}

.iorbit-orbit-cards {
  inset: 0;
  overflow: hidden;
  transform: none;
}

.iorbit-orbit-ring-system {
  height: min(32vh, 284px);
  left: 50%;
  pointer-events: none;
  position: absolute;
  top: 51%;
  transform: translate(-50%, -50%);
  width: min(46vw, 590px);
  z-index: 2;
}

.iorbit-orbit-ring-system span {
  border: 1px solid rgba(139,123,240,0.22);
  border-radius: 50%;
  inset: 14% 8%;
  position: absolute;
  transform: rotate(-8deg);
}

.iorbit-orbit-ring-system span:nth-child(2) {
  border-color: rgba(198,160,106,0.14);
  inset: 3% 0;
  transform: rotate(9deg);
}

.iorbit-orbit-ring-system::before {
  background: radial-gradient(circle, rgba(238,234,255,0.98), rgba(139,123,240,0.78) 45%, rgba(139,123,240,0) 70%);
  border-radius: 50%;
  content: "";
  height: 28px;
  left: 50%;
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 28px;
}

.iorbit-orbit-ring-system i {
  color: #d9d3ff;
  font-family: "Noto Serif SC", "Songti SC", STSong, Georgia, serif;
  font-size: 15px;
  font-style: normal;
  left: 50%;
  position: absolute;
  text-shadow: 0 0 12px rgba(139,123,240,0.9);
  top: calc(50% + 22px);
  transform: translateX(-50%);
}

.iorbit-orbit-spin {
  animation: iorbit-orbit-system-spin 54s linear infinite;
  height: 1px;
  left: 50%;
  position: absolute;
  top: 51%;
  transform-origin: center;
  width: 1px;
  z-index: 4;
}

.iorbit-orbit-card-slot {
  height: 1px;
  left: 0;
  overflow: visible;
  position: absolute;
  top: 0;
  transform: rotate(var(--io-card-angle)) translateX(var(--io-card-radius)) rotate(calc(-1 * var(--io-card-angle)));
  transform-origin: 0 0;
  width: 1px;
  z-index: 2;
}

.iorbit-orbit-star {
  background: radial-gradient(circle, #fff, #b9aef8 58%, rgba(139,123,240,0) 72%);
  border-radius: 50%;
  box-shadow: 0 0 18px rgba(139,123,240,0.76);
  display: block;
  height: 14px;
  left: -7px;
  position: absolute;
  top: -7px;
  width: 14px;
}

.iorbit-orbit-tether {
  background: linear-gradient(90deg, rgba(188,178,244,0.72), rgba(188,178,244,0));
  display: block;
  height: 1px;
  left: 0;
  position: absolute;
  top: 0;
  transform: rotate(-18deg);
  transform-origin: left center;
  width: 72px;
}

.iorbit-orbit-card-shell {
  animation: iorbit-orbit-system-counterspin 54s linear infinite;
  display: block;
  left: 0;
  position: absolute;
  rotate: 0deg;
  top: 0;
  transform: translate(var(--io-card-x), var(--io-card-y)) translate(-50%, -50%) scale(var(--io-card-scale));
  transform-origin: center;
  transition: opacity .35s ease, transform .35s ease;
}

.iorbit-orbit-card-slot .iorbit-journey-card {
  pointer-events: none;
  width: 224px;
}

.iorbit-orbit-card-slot:not(.is-expanded) .iorbit-orbit-card-shell {
  opacity: .82;
  transform: translate(var(--io-card-x), var(--io-card-y)) translate(-50%, -50%) scale(var(--io-card-scale-collapsed));
}

.iorbit-orbit-card-slot:not(.is-expanded) .iorbit-journey-card {
  border-radius: 14px;
  gap: 6px;
  grid-template-columns: 30px 1fr;
  padding: 9px 10px;
  width: 132px;
}

.iorbit-orbit-card-slot:not(.is-expanded) .iorbit-journey-card img {
  height: 30px;
  width: 30px;
}

.iorbit-orbit-card-slot:not(.is-expanded) .iorbit-journey-card strong {
  font-size: 11px;
  line-height: 1.2;
}

.iorbit-orbit-card-slot:not(.is-expanded) .iorbit-journey-card span {
  font-size: 9px;
  line-height: 1.2;
}

.iorbit-orbit-card-slot:not(.is-expanded) .iorbit-journey-card p,
.iorbit-orbit-card-slot:not(.is-expanded) .iorbit-journey-card small {
  display: none;
}

.iorbit-orbit-card-slot.is-expanded {
  z-index: 9;
}

.iorbit-orbit-card-slot.is-expanded .iorbit-orbit-card-shell,
.iorbit-orbit-card-slot:hover .iorbit-orbit-card-shell,
.iorbit-orbit-card-slot:focus-visible .iorbit-orbit-card-shell {
  opacity: 1;
  transform: translate(var(--io-card-x), var(--io-card-y)) translate(-50%, -50%) scale(var(--io-card-scale-open));
}

.iorbit-orbit-card-slot.is-featured .iorbit-journey-card {
  background: rgba(30,22,18,0.86);
  border-color: rgba(216,176,106,0.54);
  box-shadow: 0 18px 58px -24px rgba(216,176,106,0.45), 0 18px 54px -30px rgba(0,0,0,0.95);
}

.iorbit-orbit-card-slot.is-featured .iorbit-journey-card small {
  color: #d8b06a;
}

.iorbit-mobile-orbit-card {
  display: none;
  left: 50%;
  top: 52%;
  transform: translate(-50%, 18px);
  width: min(348px, calc(100vw - 44px));
}

.iorbit-step-list {
  bottom: 118px;
  display: flex;
  gap: min(7vw, 96px);
  justify-content: center;
  left: 50%;
  transform: translate(-50%, 28px);
  width: min(860px, 92vw);
}

.iorbit-step-list article {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 9px;
  text-align: center;
  width: 210px;
}

.iorbit-step-list span {
  background: radial-gradient(circle at 35% 30%, #fff, #8b7bf0 70%);
  border-radius: 50%;
  box-shadow: 0 0 20px -2px #8b7bf0;
  height: 24px;
  width: 24px;
}

.iorbit-step-list i {
  color: #9c92e0;
  font-family: Newsreader, Georgia, serif;
  font-size: 13px;
}

.iorbit-step-list strong {
  color: #f5f6ff;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.3;
}

.iorbit-step-list p {
  color: rgba(170,176,204,0.7);
  font-size: 12px;
  line-height: 1.55;
  margin: 0;
}

.iorbit-ending {
  background:
    radial-gradient(90% 70% at 50% 68%, rgba(12,10,24,0.5), rgba(6,5,13,0) 62%),
    #06050d;
  display: grid;
  grid-template-columns: 1fr 1fr;
  inset: 0;
  overflow: hidden;
}

.iorbit-ending::before {
  background: linear-gradient(180deg, rgba(143,139,195,0), rgba(143,139,195,0.17) 18%, rgba(143,139,195,0.08) 88%, rgba(143,139,195,0));
  bottom: 0;
  content: "";
  left: 50%;
  position: absolute;
  top: 86px;
  width: 1px;
}

.iorbit-ending-panel {
  align-items: center;
  display: grid;
  grid-template-rows: auto 210px auto auto;
  justify-items: center;
  align-content: start;
  padding: clamp(150px, 21vh, 216px) clamp(26px, 6vw, 112px) 0;
  row-gap: 38px;
  position: relative;
  text-align: center;
}

.iorbit-ending-starfield {
  height: 210px;
  position: relative;
  width: min(370px, 88%);
}

.iorbit-ending-starfield::before,
.iorbit-ending-starfield::after {
  background: radial-gradient(circle, rgba(139,123,240,0.18), rgba(139,123,240,0) 68%);
  content: "";
  height: 150px;
  left: 42%;
  pointer-events: none;
  position: absolute;
  top: 54%;
  transform: translate(-50%, -50%);
  width: 270px;
}

.iorbit-ending-starfield::after {
  background: radial-gradient(circle, rgba(238,235,255,0.12), rgba(238,235,255,0) 62%);
  height: 104px;
  left: 50%;
  top: 47%;
  width: 210px;
}

.iorbit-ending-starfield > span {
  animation: iorbit-ending-star 3.6s ease-in-out infinite;
  animation-delay: calc(var(--sa) * -2s);
  background: rgba(238,235,255,calc(var(--sa) * .82));
  border-radius: 50%;
  box-shadow: 0 0 16px rgba(139,123,240,calc(var(--sa) * .58));
  height: calc(1.5px + var(--sa) * 4px);
  left: var(--sx);
  position: absolute;
  top: var(--sy);
  width: calc(1.5px + var(--sa) * 4px);
}

.iorbit-ending-starfield > span:nth-of-type(n+19) {
  display: none;
}

.iorbit-ending-popout {
  animation: iorbit-ending-card-float 4.8s ease-in-out infinite;
  left: 50%;
  position: absolute;
  top: 61%;
  transform: translate(-50%, -50%);
  z-index: 2;
}

.iorbit-ending-popout::before {
  background: linear-gradient(90deg, rgba(201,194,255,0.58), rgba(201,194,255,0));
  content: "";
  height: 1px;
  left: 67%;
  position: absolute;
  top: 57%;
  transform: rotate(14deg);
  transform-origin: left center;
  width: 68px;
  z-index: -1;
}

.iorbit-ending-popout::after {
  background: radial-gradient(circle, #fff, #b7adff 54%, rgba(139,123,240,0) 72%);
  border-radius: 50%;
  box-shadow: 0 0 22px rgba(139,123,240,0.9);
  content: "";
  height: 10px;
  left: calc(67% + 63px);
  position: absolute;
  top: calc(57% + 17px);
  width: 10px;
  z-index: -1;
}

.iorbit-ending-mini-card {
  background: rgba(16,15,29,0.88);
  border: 1px solid rgba(119,112,169,0.36);
  border-radius: 16px;
  box-shadow: 0 22px 52px rgba(0,0,0,0.28), 0 0 24px rgba(139,123,240,0.14);
  color: #f7f5ff;
  display: grid;
  gap: 8px 12px;
  grid-template-columns: 36px 1fr;
  padding: 16px 18px 15px;
  text-align: left;
  width: 246px;
}

.iorbit-ending-mini-card img {
  border: 1px solid rgba(242,238,255,0.42);
  border-radius: 50%;
  box-shadow: 0 0 14px rgba(139,123,240,0.36);
  grid-row: span 2;
  height: 36px;
  object-fit: cover;
  width: 36px;
}

.iorbit-ending-mini-card strong {
  display: block;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.05;
}

.iorbit-ending-mini-card span {
  color: #aaa3da;
  display: block;
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1.35;
  margin-top: 4px;
}

.iorbit-ending-mini-card p {
  color: rgba(236,233,255,0.9);
  font-size: 15px;
  font-weight: 600;
  grid-column: 1 / -1;
  line-height: 1.35;
  margin: 4px 0 0;
}

@keyframes iorbit-ending-star {
  0%, 100% { opacity: .46; transform: scale(.85); }
  50% { opacity: 1; transform: scale(1.08); }
}

@keyframes iorbit-ending-card-float {
  0%, 100% { transform: translate(-50%, -50%) translateY(-4px); }
  50% { transform: translate(-50%, -50%) translateY(6px); }
}

.iorbit-ending small {
  color: #a9a2dc;
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: clamp(11px, .65vw, 13px);
  font-weight: 700;
  letter-spacing: .34em;
  line-height: 1;
  text-transform: uppercase;
}

.iorbit-ending .is-organizer small {
  color: #d8b06a;
}

.iorbit-ending h2 {
  color: rgba(248,246,255,0.94);
  font-family: "Noto Serif SC", "Songti SC", STSong, Georgia, serif;
  font-size: clamp(27px, 1.55vw, 32px);
  font-weight: 300;
  line-height: 1.52;
  margin: 0;
  max-width: 620px;
}

.iorbit-ending h2 span {
  display: block;
}

.iorbit-ending a {
  align-items: center;
  background: rgba(139,123,240,0.1);
  border: 1px solid rgba(139,123,240,0.62);
  border-radius: 999px;
  color: rgba(247,245,255,0.94);
  display: inline-flex;
  font-size: clamp(16px, .92vw, 19px);
  font-weight: 700;
  gap: 12px;
  height: 70px;
  justify-content: center;
  min-width: min(340px, 86%);
  padding: 0 34px;
}

.iorbit-ending a span {
  color: #a89bff;
  font-size: 20px;
  line-height: 1;
}

.iorbit-ending .is-organizer a {
  background: rgba(216,176,106,0.1);
  border-color: rgba(216,176,106,0.58);
  min-width: min(380px, 88%);
}

.iorbit-ending .is-organizer a span {
  color: #d8b06a;
}

.iorbit-ending-orbit-visual {
  height: 210px;
  position: relative;
  width: min(370px, 88%);
}

.iorbit-ending-ring,
.iorbit-ending-core,
.iorbit-ending-satellite {
  left: 50%;
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
}

.iorbit-ending-ring {
  border: 1px solid rgba(216,176,106,0.32);
  border-radius: 50%;
}

.iorbit-ending-ring.is-outer {
  height: 150px;
  width: 306px;
}

.iorbit-ending-ring.is-inner {
  height: 92px;
  width: 188px;
}

.iorbit-ending-core {
  background: radial-gradient(circle at 34% 28%, #f1edff, #8b7bf0 58%, #5a4bce);
  border-radius: 50%;
  box-shadow: 0 0 26px rgba(139,123,240,0.72);
  height: 22px;
  width: 22px;
}

.iorbit-ending-satellite {
  background: radial-gradient(circle, #fff6da 0 24%, #d8b06a 64%, rgba(216,176,106,0) 78%);
  border-radius: 50%;
  box-shadow: 0 0 16px rgba(216,176,106,0.78);
  height: 16px;
  width: 16px;
}

.iorbit-ending-satellite.is-top {
  top: calc(50% - 75px);
}

.iorbit-ending-satellite.is-bottom {
  top: calc(50% + 75px);
}

.iorbit-stop-1 .iorbit-field-wrap,
.iorbit-stop-2 .iorbit-field-wrap,
.iorbit-stop-3 .iorbit-field-wrap,
.iorbit-stop-1 .iorbit-contact-preview,
.iorbit-stop-2 .iorbit-contact-preview,
.iorbit-stop-3 .iorbit-contact-preview,
.iorbit-stop-1 .iorbit-hero,
.iorbit-stop-2 .iorbit-hero,
.iorbit-stop-3 .iorbit-hero {
  animation: none;
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%) translateY(18px);
}

.iorbit-stop-1 .iorbit-cluster-labels,
.iorbit-stop-1 .iorbit-demo-cards,
.iorbit-stop-1 .iorbit-demo-dots,
.iorbit-stop-2 .iorbit-pain,
.iorbit-stop-2 .iorbit-orbit-cards,
.iorbit-stop-2 .iorbit-mobile-orbit-card,
.iorbit-stop-2 .iorbit-step-list,
.iorbit-stop-3 .iorbit-ending {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, 0);
}

.iorbit-stop-1 .iorbit-cluster-labels,
.iorbit-stop-1 .iorbit-demo-cards,
.iorbit-stop-1 .iorbit-demo-dots {
  animation: iorbit-stage-reveal .75s .85s both;
}

.iorbit-stop-2 .iorbit-pain {
  animation: iorbit-stage-reveal .85s 1.05s both;
}

.iorbit-stop-2 .iorbit-orbit-cards {
  animation: iorbit-fade-reveal .95s 3.25s both;
  transform: none;
}

.iorbit-stop-2 .iorbit-mobile-orbit-card {
  animation: iorbit-mobile-orbit-pop 2.8s ease-in-out infinite;
}

.iorbit-stop-2 .iorbit-step-list {
  animation: iorbit-steps-after-orbit 8.5s both;
}

.iorbit-stop-2 .iorbit-pain {
  font-size: clamp(14px, 1.35vw, 18px);
  background: rgba(11,10,21,0.62);
  border: 1px solid rgba(150,145,200,0.16);
  border-radius: 14px;
  box-shadow: 0 12px 34px -18px rgba(0,0,0,0.7);
  color: #e8e6f4;
  padding: 7px 18px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  top: 82px;
  width: min(520px, 86vw);
}

.iorbit-stop-2.iorbit-is-animating .iorbit-pain {
  animation: iorbit-pain-dock-desktop 8.5s both;
}

.iorbit-stop-2.iorbit-is-animating .iorbit-orbit-cards {
  animation: iorbit-fade-reveal .95s 3.25s both;
}

.iorbit-stop-2.iorbit-is-animating .iorbit-mobile-orbit-card {
  animation: iorbit-fade-reveal .7s 3.25s both, iorbit-mobile-orbit-pop 2.8s 3.95s ease-in-out infinite;
}

.iorbit-stop-3 .iorbit-ending {
  transform: none;
}

@media (max-width: 640px) {
  .iorbit-starfield-home {
    border: 0;
    border-radius: 0;
    box-shadow: none;
    height: 100dvh;
    inset: 0;
    left: 0;
    position: fixed;
    top: 0;
    transform: none;
    width: 100vw;
  }

  .iorbit-scene {
    border-radius: 0;
  }

  .iorbit-dynamic-island {
    display: none;
  }

  .iorbit-star-nav {
    left: 0;
    padding: 13px 16px;
    position: absolute;
    right: 0;
    top: 0;
  }

  .iorbit-brand-mark {
    height: 26px;
    width: 26px;
  }

  .iorbit-brand-mark svg {
    height: 26px;
    width: 26px;
  }

  .iorbit-star-brand b {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -.01em;
  }

  .iorbit-brand-desktop,
  .iorbit-copy-desktop,
  .iorbit-nav-links,
  .iorbit-me {
    display: none;
  }

  .iorbit-brand-mobile,
  .iorbit-copy-mobile {
    display: inline;
  }

  .iorbit-star-brand small {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .iorbit-nav-actions {
    gap: 10px;
  }

  .iorbit-lang {
    align-items: center;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(150,145,200,0.16);
    border-radius: 999px;
    display: inline-flex;
    gap: 2px;
    padding: 3px;
  }

  .iorbit-lang button {
    color: rgba(230,228,244,0.5);
    padding: 4px 10px;
  }

  .iorbit-lang button:first-child {
    background: #cfc9ef;
    color: #0b0a15;
    font-weight: 600;
  }

  .iorbit-lang button + button::before {
    content: "";
    padding: 0;
  }

  .iorbit-burger {
    align-items: center;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(150,145,200,0.18);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    height: 44px;
    justify-content: center;
    width: 44px;
  }

  .iorbit-burger span {
    background: #e6e4f4;
    border-radius: 2px;
    height: 1.6px;
    width: 16px;
  }

  .iorbit-menu {
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    background: rgba(14,12,24,0.95);
    border: 1px solid rgba(150,145,200,0.18);
    border-radius: 16px;
    box-shadow: 0 22px 54px -22px rgba(0,0,0,0.85);
    display: none;
    flex-direction: column;
    min-width: 150px;
    padding: 8px;
    position: absolute;
    right: 16px;
    top: 62px;
    z-index: 70;
  }

  .iorbit-menu.is-open {
    display: flex;
  }

  .iorbit-menu a {
    border-radius: 10px;
    color: rgba(236,234,248,0.86);
    font-size: 14.5px;
    padding: 11px 14px;
  }

  .iorbit-hero {
    top: 13.5%;
    width: 90%;
  }

  .iorbit-kicker {
    font-size: 9.5px;
    letter-spacing: .2em;
    margin-bottom: 22px;
    white-space: nowrap;
  }

  .iorbit-hero h1 {
    font-size: 26px;
    line-height: 1.28;
  }

  .iorbit-serif {
    font-size: 16px;
    margin-top: 18px;
  }

  .iorbit-sub {
    font-size: 14.5px;
    line-height: 1.7;
    margin-top: 9px;
    max-width: 330px;
  }

  .iorbit-contact-preview {
    display: none;
  }

  .iorbit-field-wrap {
    bottom: 13.5%;
    width: 88%;
  }

  .iorbit-field-rings {
    height: 64px;
  }

  .iorbit-field {
    border-radius: 14px;
    gap: 8px;
    min-height: 64px;
    padding: 8px 8px 8px 15px;
  }

  .iorbit-field span {
    font-size: 14.5px;
  }

  .iorbit-field button {
    height: 42px;
    width: 42px;
  }

  .iorbit-chip-row {
    justify-content: flex-start;
    margin-left: 0;
    margin-top: 24px;
    overflow: hidden;
    width: calc(100% + 28px);
  }

  .iorbit-chip-row button {
    font-size: 13px;
    padding: 10px 17px;
  }

  .iorbit-dots {
    gap: 14px;
    position: absolute;
    right: 16px;
  }

  .iorbit-process {
    bottom: auto;
    display: none;
    max-width: 300px;
    padding: 9px 14px;
    top: 52%;
    white-space: normal;
  }

  .iorbit-stop-1 .iorbit-process,
  .iorbit-stop-2 .iorbit-process {
    display: none;
  }

  .iorbit-process b {
    font-size: 11px;
    white-space: normal;
  }

  .iorbit-cue {
    bottom: calc(18px + env(safe-area-inset-bottom));
  }

  .iorbit-cue span {
    font-size: 11px;
    letter-spacing: .16em;
  }

  .iorbit-cue-desktop {
    display: none;
  }

  .iorbit-cue-mobile {
    display: inline;
  }

  .iorbit-pain {
    font-size: 19px;
    line-height: 1.55;
    top: 20%;
    width: 86%;
  }

  .iorbit-stop-2 .iorbit-pain {
    font-size: 14px;
    line-height: 1.45;
    padding: 10px 18px;
    top: 104px;
    width: 86%;
  }

  .iorbit-stop-2.iorbit-is-animating .iorbit-pain {
    animation: iorbit-pain-dock-mobile 8.5s both;
  }

  .iorbit-cluster-labels {
    font-size: 11px;
    gap: 48px;
    top: 31%;
  }

  .iorbit-demo-cards {
    left: 50%;
    height: 178px;
    top: 47%;
    width: min(348px, calc(100% - 44px));
  }

  .iorbit-demo-card-slot {
    left: 0;
    opacity: 0;
    position: absolute;
    top: 0;
    transform: translateY(12px) scale(.96);
    transition: opacity .38s ease, transform .38s ease;
    width: 100%;
  }

  .iorbit-demo-card-slot.is-active {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  .iorbit-demo-card-slot .iorbit-journey-card {
    width: 100%;
  }

  .iorbit-demo-dots {
    display: flex;
    gap: 6px;
    justify-content: center;
    left: 50%;
    top: calc(47% + 190px);
    transform: translateX(-50%);
  }

  .iorbit-demo-dots span {
    background: rgba(198,196,221,0.34);
    border-radius: 999px;
    height: 4px;
    width: 14px;
  }

  .iorbit-demo-dots span.is-active {
    background: #d8b06a;
    box-shadow: 0 0 10px -3px rgba(216,176,106,0.9);
  }

  .iorbit-stop-2 .iorbit-orbit-cards {
    display: none;
  }

  .iorbit-mobile-orbit-card {
    display: block;
    left: 50%;
    top: 51%;
    transform: translateX(-50%);
    width: min(348px, calc(100% - 44px));
  }

  .iorbit-mobile-orbit-card .iorbit-journey-card {
    gap: 9px;
    margin: 0 auto;
    padding: 17px;
    width: 100%;
  }

  .iorbit-mobile-orbit-card .iorbit-journey-card img {
    height: 44px;
    width: 44px;
  }

  .iorbit-mobile-orbit-card .iorbit-journey-card strong {
    font-size: 16px;
  }

  .iorbit-mobile-orbit-card .iorbit-journey-card p {
    font-size: 13px;
  }

  .iorbit-mobile-orbit-card .iorbit-journey-card small {
    font-size: 11px;
    padding-top: 9px;
  }

  .iorbit-mobile-orbit-card.is-featured .iorbit-journey-card {
    background: rgba(30,22,18,0.86);
    border-color: rgba(216,176,106,0.54);
    box-shadow: 0 18px 54px -24px rgba(216,176,106,0.42), 0 18px 54px -30px rgba(0,0,0,0.95);
  }

  .iorbit-mobile-orbit-card.is-featured .iorbit-journey-card small {
    color: #d8b06a;
  }

  .iorbit-step-list {
    bottom: 42px;
    flex-direction: column;
    gap: 6px;
    width: min(338px, calc(100% - 40px));
  }

  .iorbit-step-list article {
    align-items: center;
    background: rgba(13,12,24,0.46);
    border: 1px solid rgba(150,145,200,0.12);
    border-radius: 14px;
    display: grid;
    gap: 4px 10px;
    grid-template-columns: 24px 1fr;
    padding: 6px 12px;
    text-align: left;
    width: 100%;
  }

  .iorbit-step-list span {
    grid-row: span 3;
    height: 18px;
    width: 18px;
  }

  .iorbit-step-list i,
  .iorbit-step-list strong,
  .iorbit-step-list p {
    margin: 0;
  }

  .iorbit-step-list p {
    font-size: 10.5px;
    line-height: 1.4;
  }

  .iorbit-ending {
    grid-template-columns: 1fr;
    overflow: hidden;
  }

  .iorbit-ending section {
    gap: 14px;
    padding: 90px 22px 28px;
  }

  .iorbit-ending section + section {
    display: none;
  }

  .iorbit-ending h2 {
    font-size: 28px;
  }

  .iorbit-ending p {
    font-size: 14px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .iorbit-field-rings::before,
  .iorbit-cue b,
  .iorbit-kicker,
  .iorbit-hero h1 span,
  .iorbit-hero h1 strong,
  .iorbit-serif,
  .iorbit-sub,
  .iorbit-contact-preview,
  .iorbit-field-wrap,
  .iorbit-process,
  .iorbit-pain,
  .iorbit-demo-cards,
  .iorbit-step-list {
    animation: none;
  }
}
`;
