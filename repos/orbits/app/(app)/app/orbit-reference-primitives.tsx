import type { CSSProperties, ReactNode } from "react";

const iconPaths: Record<string, ReactNode> = {
  arrow: <><path d="M4 12h15M13 6l6 6-6 6"/></>,
  arrowUR: <><path d="M7 17 17 7M8 7h9v9"/></>,
  back: <><path d="M20 12H4M10 6l-6 6 6 6"/></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7"/></>,
  checkCircle: <><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.5 2.5L16 9.5"/></>,
  chevD: <><path d="m6 9 6 6 6-6"/></>,
  chevL: <><path d="m15 6-6 6 6 6"/></>,
  chevR: <><path d="m9 6 6 6-6 6"/></>,
  clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></>,
  handshake: <><path d="m12 8-2-1.5a2 2 0 0 0-2.4.1L3 10v5l2 1 3 3a1.5 1.5 0 0 0 2.3-.2"/><path d="m12 8 2-1.5a2 2 0 0 1 2.4.1L21 10v5l-2 1-2.5 2.5a1.5 1.5 0 0 1-2.1 0L12 16"/></>,
  home: <><path d="M4 11.5 12 4l8 7.5M6 10v9.5h12V10"/></>,
  list: <><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 19a2 2 0 0 0 4 0"/></>,
  briefcase: <><rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5M3.5 12.5h17"/></>,
  building: <><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9.5 20.5v-3h5v3"/></>,
  doc: <><path d="M6 3h8l4 4v14H6V3Z"/><path d="M13 3v5h5"/></>,
  download: <><path d="M12 4v11M8 11.5l4 4 4-4M5 18v1a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1"/></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></>,
  mail: <><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/></>,
  message: <><path d="M20 12a7.5 7.5 0 0 1-10.8 6.7L4 20l1.3-4.2A7.5 7.5 0 1 1 20 12Z"/></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></>,
  filter: <><path d="M4 5h16l-6 8v5l-4 2v-7L4 5Z"/></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></>,
  pin: <><path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></>,
  phone: <><path d="M5 4h3.5l1.5 4.5-2 1.5a12 12 0 0 0 5 5l1.5-2 4.5 1.5V18a2 2 0 0 1-2 2A15 15 0 0 1 5 6a2 2 0 0 1 0-2Z"/></>,
  more: <><circle cx="6" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18" cy="12" r="1.2" fill="currentColor"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  logout: <><path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h9"/></>,
  network: <><circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M10.5 7 6.5 15.8M13.5 7l4 8.8M7.5 18h9"/></>,
  qr: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2M20 14v6M14 20h2"/></>,
  refresh: <><path d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5"/></>,
  scan: <><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></>,
  seat: <><path d="M6 9V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3M5 9h14v5H5zM6 14v5M18 14v5"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V20a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H4a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 5.2 6.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10.5 4.6V4a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H20a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/></>,
  share: <><path d="M12 15V4M8.5 7.5 12 4l3.5 3.5"/><path d="M6 12.5V18a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-5.5"/></>,
  sparkle: <><path d="M12 3l1.6 5.1L19 10l-5.4 1.9L12 17l-1.6-5.1L5 10l5.4-1.9L12 3Z"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z"/></>,
  star: <><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8-4.3-4.1 5.9-.9L12 3.5Z"/></>,
  target: <><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.8" fill="currentColor"/></>,
  ticket: <><path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4Z"/><path d="M14 6v12" strokeDasharray="2 2"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"/></>,
  users: <><circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5"/><path d="M16 5.2A3.5 3.5 0 0 1 18 12M17.5 14.6c2.4.5 4 2.2 4 4.4"/></>,
  wallet: <><rect x="3.5" y="6" width="17" height="13" rx="2.5"/><path d="M3.5 10h17M16 14.5h.5"/></>,
  x: <><path d="M6 6l12 12M18 6 6 18"/></>,
  zap: <><path d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z"/></>,
};

const coverBg: Record<string, string> = {
  "g-indigo": "radial-gradient(120% 120% at 15% 15%, #8B7BF0 0%, #6359E9 42%, #3B2FB0 100%)",
  "g-violet": "radial-gradient(120% 120% at 20% 10%, #C18BF0 0%, #8B3FD6 45%, #5A1E9E 100%)",
  "g-rose": "radial-gradient(120% 120% at 15% 20%, #F58BA8 0%, #E0415F 45%, #A01E3C 100%)",
  "g-amber": "radial-gradient(120% 120% at 18% 12%, #F5C078 0%, #E08A2B 48%, #A85A12 100%)",
  "g-emerald": "radial-gradient(120% 120% at 18% 15%, #6FE0AE 0%, #15A06B 48%, #0A6B47 100%)",
  "g-sky": "radial-gradient(120% 120% at 18% 12%, #7BB8F5 0%, #2D7FF0 48%, #1452A8 100%)",
  "g-slate": "radial-gradient(120% 120% at 20% 15%, #9AA4B8 0%, #4A5468 48%, #2A3142 100%)",
};

const coverKeys = Object.keys(coverBg);

export function gradientFromString(value: string, fallback = "g-indigo") {
  if (!value) return fallback;

  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }

  return coverKeys[Math.abs(hash) % coverKeys.length] ?? fallback;
}

export function Icon({
  name,
  size = 20,
  color,
  stroke = 1.7,
  style,
}: {
  name: string;
  size?: number;
  color?: string;
  stroke?: number;
  style?: CSSProperties;
}) {
  const path = iconPaths[name];
  if (!path) return null;

  return (
    <svg
      aria-hidden
      fill="none"
      height={size}
      stroke={color ?? "currentColor"}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={stroke}
      style={{ flexShrink: 0, display: "block", height: size, width: size, ...style }}
      viewBox="0 0 24 24"
      width={size}
    >
      {path}
    </svg>
  );
}

export function Logo({
  color = "var(--accent)",
  size = 25,
  textColor = "var(--ink)",
  withText = true,
}: {
  color?: string;
  size?: number;
  textColor?: string;
  withText?: boolean;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      <svg aria-hidden fill="none" height={size} viewBox="0 0 28 28" width={size}>
        <circle cx="14" cy="14" opacity="0.35" r="12.5" stroke={color} strokeWidth="1.6" />
        <circle cx="14" cy="14" fill={color} r="4.4" />
        <circle cx="24.2" cy="10" fill={color} r="2.5" />
      </svg>
      {withText ? (
        <span
          style={{
            color: textColor,
            fontFamily: "var(--ff-tight)",
            fontSize: size * 0.74,
            fontWeight: 650,
            letterSpacing: "-0.03em",
          }}
        >
          Orbit
        </span>
      ) : null}
    </span>
  );
}

export function Avatar({
  letter,
  g = "g-indigo",
  size = 40,
  ring,
  title,
}: {
  letter?: string;
  g?: string;
  size?: number;
  ring?: string;
  title?: string;
}) {
  return (
    <span
      className={`avatar ${g}`}
      style={{
        boxShadow: ring ? `0 0 0 2.5px ${ring}, inset 0 0 0 1px rgba(255,255,255,0.14)` : undefined,
        fontSize: size * 0.42,
        height: size,
        width: size,
      }}
      title={title}
    >
      {letter || "O"}
    </span>
  );
}

export function Cover({
  children,
  className = "",
  g = "g-indigo",
  imageAlt = "",
  imageUrl,
  monogram,
  style,
}: {
  children?: ReactNode;
  className?: string;
  g?: string;
  imageAlt?: string;
  imageUrl?: string;
  monogram?: { text: string; size: number } | null;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`cover cover-grain ${className}`}
      style={{ background: coverBg[g] ?? coverBg["g-indigo"], ...style }}
    >
      {imageUrl ? (
        <img
          alt={imageAlt}
          decoding="async"
          loading="lazy"
          src={imageUrl}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: imageUrl ? "linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.22))" : "transparent",
        }}
      />
      {!imageUrl ? (
        <>
          <div
            style={{
              position: "absolute",
              width: "62%",
              height: "62%",
              right: "-12%",
              bottom: "-16%",
              background: "radial-gradient(circle, rgba(255,255,255,0.22), transparent 70%)",
              filter: "blur(8px)",
            }}
          />
          <svg
            aria-hidden
            preserveAspectRatio="xMidYMid slice"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.55, pointerEvents: "none" }}
            viewBox="0 0 200 200"
          >
            <g fill="none" stroke="rgba(255,255,255,0.32)" strokeDasharray="2 7" strokeWidth="1.1">
              <circle cx="100" cy="100" r="40" />
              <circle cx="100" cy="100" r="66" />
              <circle cx="100" cy="100" r="94" />
            </g>
            <circle cx="140" cy="62" fill="rgba(255,255,255,0.85)" r="4.5" />
            <circle cx="58" cy="138" fill="rgba(255,255,255,0.7)" r="3.5" />
            <circle cx="160" cy="132" fill="rgba(255,255,255,0.6)" r="3" />
            <circle cx="46" cy="58" fill="rgba(255,255,255,0.55)" r="2.6" />
          </svg>
        </>
      ) : null}
      {monogram ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span
            style={{
              color: "rgba(255,255,255,0.92)",
              fontFamily: "var(--ff-tight)",
              fontSize: monogram.size,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              textShadow: "0 2px 12px rgba(0,0,0,0.18)",
            }}
          >
            {monogram.text}
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "active" || status === "live") {
    return <span className="badge badge-live"><span className="dot dot-live" />进行中</span>;
  }
  if (status === "ended") return <span className="badge badge-ended">已结束</span>;
  if (status === "unknown") return <span className="badge badge-soon">时间待定</span>;
  return <span className="badge badge-soon">即将开始</span>;
}
