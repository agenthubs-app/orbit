"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { useOrbitLanguage } from "./orbit-language-context";
import { Icon } from "./orbit-reference-primitives";

type T = (copy: { en: string; zh: string }) => string;

function buildSuggests(t: T) {
  return [
    {
      icon: "users",
      label: t({ en: "Find AI finance contacts", zh: "找金融 AI 方向的人脉" }),
      q: t({ en: "I want to build AI products in finance — who should I talk to?", zh: "我想做金融领域的 AI 产品开发，找哪位朋友比较合适？" }),
    },
    {
      icon: "handshake",
      label: t({ en: "Meet womenswear designers", zh: "想认识女装设计师" }),
      q: t({ en: "Introduce me to a few womenswear designers.", zh: "帮我介绍几位做女装设计的朋友。" }),
    },
    {
      icon: "calendar",
      label: t({ en: "Recommend AI / global events", zh: "推荐 AI / 出海活动" }),
      q: t({ en: "I'd like to attend more AI and global-expansion events lately.", zh: "我最近想多参加一些 AI 和出海主题的活动。" }),
    },
  ];
}

function sendToAgent(value: string) {
  const q = value.trim();
  if (!q) return;
  window.location.href = `/app/agent?q=${encodeURIComponent(q)}`;
}

function readOrbitVisualSeed() {
  try {
    return new URLSearchParams(window.location.search).get("orbitVisualSeed") || undefined;
  } catch {
    return undefined;
  }
}

function seededRandom(seedText: string) {
  let seed = 2166136261;

  for (let i = 0; i < seedText.length; i += 1) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }

  return () => {
    seed = Math.imul(seed + 0x6D2B79F5, 1);
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createPrototypeWebGlRenderer(THREE: any) {
  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl", { alpha: true, antialias: true }) ||
      canvas.getContext("experimental-webgl", { alpha: true, antialias: true });

    if (!context) return null;

    return new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      context,
    });
  } catch {
    return null;
  }
}

function PrototypeThreeBg({ opacity = 1 }: { opacity?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const THREE = (window as typeof window & { THREE?: any }).THREE;
    const mount = ref.current;

    if (!THREE || !mount) return;

    const W = () => mount.clientWidth || 1;
    const H = () => mount.clientHeight || 1;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, W() / H(), 1, 2000);
    camera.position.z = 340;

    const renderer = createPrototypeWebGlRenderer(THREE);
    if (!renderer) return;

    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(W(), H());
    mount.appendChild(renderer.domElement);

    const N = 78;
    const spread = 520;
    const pos = new Float32Array(N * 3);
    const vel = [];
    const orbitVisualSeed = readOrbitVisualSeed();
    const random = orbitVisualSeed ? seededRandom(orbitVisualSeed) : Math.random;
    const freezeThree = Boolean(
      orbitVisualSeed || (window as typeof window & { __orbitFreezeThree?: boolean }).__orbitFreezeThree,
    );

    for (let i = 0; i < N; i += 1) {
      pos[i * 3] = (random() - 0.5) * spread;
      pos[i * 3 + 1] = (random() - 0.5) * spread * 0.58;
      pos[i * 3 + 2] = (random() - 0.5) * 170;
      vel.push({
        x: (random() - 0.5) * 0.16,
        y: (random() - 0.5) * 0.16,
        z: (random() - 0.5) * 0.09,
      });
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0x6359e9,
      opacity: 0.9,
      size: 7,
      sizeAttenuation: true,
      transparent: true,
    });
    const points = new THREE.Points(pGeo, pMat);
    scene.add(points);

    const lPos = new Float32Array(N * N * 3);
    const lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute("position", new THREE.BufferAttribute(lPos, 3));
    const lMat = new THREE.LineBasicMaterial({ color: 0x8b7bf0, opacity: 0.2, transparent: true });
    const lines = new THREE.LineSegments(lGeo, lMat);
    scene.add(lines);

    const DIST = 96;
    let raf = 0;
    let frame = 0;

    function updateLines() {
      let n = 0;
      const p = pGeo.attributes.position.array;

      for (let i = 0; i < N; i += 1) {
        for (let j = i + 1; j < N; j += 1) {
          const dx = p[i * 3] - p[j * 3];
          const dy = p[i * 3 + 1] - p[j * 3 + 1];
          const dz = p[i * 3 + 2] - p[j * 3 + 2];

          if (dx * dx + dy * dy + dz * dz < DIST * DIST) {
            lPos[n] = p[i * 3];
            lPos[n + 1] = p[i * 3 + 1];
            lPos[n + 2] = p[i * 3 + 2];
            lPos[n + 3] = p[j * 3];
            lPos[n + 4] = p[j * 3 + 1];
            lPos[n + 5] = p[j * 3 + 2];
            n += 6;
          }
        }
      }

      lGeo.setDrawRange(0, n / 3);
      lGeo.attributes.position.needsUpdate = true;
    }

    function animate() {
      if (!freezeThree) {
        raf = requestAnimationFrame(animate);
      }
      frame += 1;
      const p = pGeo.attributes.position.array;

      for (let i = 0; i < N; i += 1) {
        p[i * 3] += vel[i].x;
        p[i * 3 + 1] += vel[i].y;
        p[i * 3 + 2] += vel[i].z;
        if (p[i * 3] > spread / 2 || p[i * 3] < -spread / 2) vel[i].x *= -1;
        if (p[i * 3 + 1] > spread * 0.29 || p[i * 3 + 1] < -spread * 0.29) vel[i].y *= -1;
        if (p[i * 3 + 2] > 85 || p[i * 3 + 2] < -85) vel[i].z *= -1;
      }

      pGeo.attributes.position.needsUpdate = true;
      if (frame % 2 === 0) updateLines();
      points.rotation.y = Math.sin(frame * 0.0007) * 0.14;
      lines.rotation.y = points.rotation.y;
      renderer.render(scene, camera);
    }

    animate();

    const onResize = () => {
      camera.aspect = W() / H();
      camera.updateProjectionMatrix();
      renderer.setSize(W(), H());
    };

    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      pGeo.dispose();
      pMat.dispose();
      lGeo.dispose();
      lMat.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      data-orbit-three-bg="prototype"
      ref={ref}
      style={{ inset: 0, opacity, pointerEvents: "none", position: "absolute", zIndex: 0 }}
    />
  );
}

export function OrbitAgentHero() {
  const { t } = useOrbitLanguage();
  const [text, setText] = useState("");
  const suggests = buildSuggests(t);
  const isBlank = !text.trim();

  function submitToAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendToAgent(text);
  }

  return (
    <section
      className="orbit-agent-hero"
      style={{
        alignItems: "center",
        background: "linear-gradient(180deg, #E7DDFB 0%, #EFE8FD 38%, #F8F5FE 72%, #FFFFFF 100%)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        minHeight: "calc(100dvh - 108px)",
        overflow: "hidden",
        padding: "8px 18px 16px",
        position: "relative",
        width: "100%",
      }}
    >
      <PrototypeThreeBg />
      <div
        style={{
          maxWidth: "calc(100vw - 36px)",
          minWidth: 0,
          position: "relative",
          textAlign: "center",
          width: "min(720px, 100%)",
          zIndex: 1,
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "rgba(99,89,233,0.10)",
            borderRadius: 999,
            color: "var(--accent)",
            display: "inline-flex",
            fontSize: 12.5,
            fontWeight: 700,
            gap: 9,
            height: 32,
            marginBottom: 18,
            padding: "0 14px",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--accent)" }} />
          {t({ en: "ORBIT AGENT · Your network & business copilot", zh: "ORBIT AGENT · 你的人脉与商业副驾" })}
        </div>
        <h1
          className="h-display"
          style={{
            color: "var(--ink)",
            fontSize: "clamp(28px, 5vw, 46px)",
            letterSpacing: 0,
            lineHeight: 1.1,
            margin: 0,
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          {t({ en: "Bring the right people into your ", zh: "让对的人，进入你的" })}
          <span
            style={{
              background: "linear-gradient(96deg, #7C5CF6 0%, #5B4FE0 48%, #A66BF2 100%)",
              backgroundClip: "text",
              color: "#6B5CF0",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {t({ en: "business orbit", zh: "商业轨道" })}
          </span>
          {t({ en: ".", zh: "。" })}
        </h1>
        <p style={{ color: "var(--text-2)", fontSize: "clamp(14px, 1.5vw, 17px)", lineHeight: 1.65, margin: "16px auto 24px", maxWidth: 500 }}>
          {t({ en: "Tell Orbit what you want to do, and it finds the right people in your network, the right events to join, and how to start the conversation.", zh: "说出你想做的事，Orbit 帮你从人脉里找对的人、从活动里找对的局，并告诉你该怎么开口。" })}
        </p>
        <form
          onSubmit={submitToAgent}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-2)",
            borderRadius: 20,
            boxShadow: "0 18px 50px rgba(99,89,233,0.12), 0 2px 8px rgba(18,18,28,0.05)",
            padding: "18px 18px 12px",
            width: "100%",
          }}
        >
          <textarea
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendToAgent(text);
              }
            }}
            placeholder={t({ en: "Ask Orbit: what you want to do, who to meet, which event to attend…", zh: "问问 Orbit：想做什么、想认识谁、想去什么活动…" })}
            rows={2}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--ink)",
              fontFamily: "var(--ff)",
              fontSize: 17,
              lineHeight: 1.5,
              outline: "none",
              padding: "2px 4px",
              resize: "none",
              width: "100%",
            }}
            value={text}
          />
          <div style={{ alignItems: "center", display: "flex", gap: 10, justifyContent: "space-between", marginTop: 8, minWidth: 0 }}>
            <div style={{ alignItems: "center", display: "flex", gap: 8, minWidth: 0 }}>
              <span
                style={{
                  alignItems: "center",
                  background: "var(--accent-soft)",
                  borderRadius: 999,
                  color: "var(--accent)",
                  display: "inline-flex",
                  fontSize: 12.5,
                  fontWeight: 650,
                  gap: 6,
                  height: 32,
                  padding: "0 12px",
                }}
              >
                <Icon name="sparkle" size={14} />
                iOrbit
              </span>
              <span style={{ color: "var(--text-4)", fontSize: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t({ en: "Contacts · Events · Business value", zh: "人脉 · 活动 · 商业价值" })}</span>
            </div>
            <button
              aria-disabled={isBlank}
              aria-label={t({ en: "Send", zh: "发送" })}
              className="hit-44"
              data-orbit-agent-hero-submit="true"
              style={{
                alignItems: "center",
                background: isBlank ? "var(--surface-3)" : "var(--accent-grad)",
                border: "none",
                borderRadius: 12,
                boxShadow: isBlank ? "none" : "0 8px 18px rgba(99,76,226,0.28)",
                color: isBlank ? "var(--text-4)" : "var(--on-dark)",
                cursor: "pointer",
                display: "flex",
                height: 40,
                justifyContent: "center",
                width: 40,
              }}
              type="submit"
            >
              <Icon name="arrow" size={19} style={{ transform: "rotate(-90deg)" }} />
            </button>
          </div>
        </form>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 9, justifyContent: "center", marginTop: 16 }}>
          {suggests.map((suggest) => (
            <button
              className="hit-44"
              key={suggest.label}
              onClick={() => sendToAgent(suggest.q)}
              style={{
                alignItems: "center",
                backdropFilter: "blur(8px)",
                background: "rgba(255,255,255,0.8)",
                border: "1px solid var(--border-2)",
                borderRadius: 999,
                color: "var(--text)",
                cursor: "pointer",
                display: "inline-flex",
                fontFamily: "var(--ff)",
                fontSize: 13.5,
                fontWeight: 550,
                gap: 7,
                lineHeight: 1.25,
                maxWidth: "100%",
                minHeight: 38,
                padding: "9px 15px",
                whiteSpace: "normal",
              }}
              type="button"
            >
              <Icon color="var(--accent)" name={suggest.icon} size={15} />
              {suggest.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
