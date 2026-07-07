"use client";

import { useEffect } from "react";

/** Shared interaction layer for the 名片夹 pages.
 *  Ensures every clickable thing has a UI effect (never a dead click):
 *  - .nc-basis            → tap toggles its provenance popover (hover already works)
 *  - buttons whose label mentions 邮件/Draft (or [data-sheet="email"]) → email compose sheet
 *  - [data-nav] / .nc-drill → navigate
 *  - real cross-page links (/app…, /home…) → navigate normally
 *  - .chip (filters/toggles) → visual active toggle within its group
 *  - any other button / placeholder link → transient toast
 *  Injects a toast host + email sheet into <body>; does not fight React state. */
export function OrbitCardsInteractions() {
  useEffect(() => {
    const doc = document;
    const en = () => doc.documentElement.lang === "en";
    const L = (zh: string, e: string) => (en() ? e : zh);
    const check = '<svg class="nc-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

    let host = doc.querySelector<HTMLDivElement>("body > .nc-toast-host");
    if (!host) {
      host = doc.createElement("div");
      host.className = "nc-toast-host";
      doc.body.appendChild(host);
    }
    let toastTimer: number | undefined;
    const toast = (msg: string) => {
      host!.innerHTML = `<div class="nc-toast">${check}<span></span></div>`;
      const el = host!.querySelector<HTMLDivElement>(".nc-toast")!;
      host!.querySelector("span")!.textContent = msg;
      requestAnimationFrame(() => el.classList.add("show"));
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        el.classList.remove("show");
        window.setTimeout(() => { if (host) host.innerHTML = ""; }, 260);
      }, 2600);
    };

    let scrim: HTMLDivElement | null = null;
    let sheet: HTMLDivElement | null = null;
    const ensureSheet = () => {
      if (sheet) return;
      scrim = doc.createElement("div");
      scrim.className = "nc-scrim";
      scrim.setAttribute("data-nc-close", "");
      doc.body.appendChild(scrim);
      sheet = doc.createElement("div");
      sheet.className = "nc-sheet";
      sheet.innerHTML =
        `<div class="nc-sheet-head"><h3>${L("起草邮件", "Draft email")}</h3>` +
        `<button class="nc-sheet-close" data-nc-close aria-label="close"><svg class="nc-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>` +
        `<div class="nc-sheet-body">` +
        `<div><label class="nc-flabel">${L("收件人", "To")}</label><input class="field nc-to"></div>` +
        `<div><label class="nc-flabel">${L("主题", "Subject")}</label><input class="field nc-subj"></div>` +
        `<div><label class="nc-flabel">${L("正文", "Body")}</label><textarea class="field nc-body"></textarea></div>` +
        `<div style="font-size:12.5px;color:var(--text-3);line-height:1.55">${L("草稿引用：来源活动 · 上次交流要点 · 待办承诺。只谈公事，发送前需你确认。", "Cites: source event · last talking points · open promise. Work-only; confirm before sending.")}</div>` +
        `</div>` +
        `<div class="nc-sheet-foot"><button class="btn btn-ghost btn-sm nc-rewrite">${L("AI 重写", "AI rewrite")}</button><button class="btn btn-primary btn-sm nc-send" style="flex:1;justify-content:center">${L("发送（需确认）", "Send (confirm)")}</button></div>`;
      doc.body.appendChild(sheet);
    };
    const openEmail = (to: string) => {
      ensureSheet();
      (sheet!.querySelector(".nc-to") as HTMLInputElement).value = to || L("联系人", "Contact");
      (sheet!.querySelector(".nc-subj") as HTMLInputElement).value = L("很高兴在活动中认识你", "Great to meet you at the event");
      (sheet!.querySelector(".nc-body") as HTMLTextAreaElement).value = L(
        "你好，\n\n很高兴上周在 AI 峰会 2026 认识你。上次聊到的合作方向我很感兴趣，附上我们的产品资料。\n\n方便的话，下周约 30 分钟线上聊聊？\n\n此致",
        "Hi,\n\nGreat meeting you at AI Summit 2026. I’m keen on the direction we discussed and have attached our deck.\n\nWould 30 minutes next week work for a quick call?\n\nBest,");
      requestAnimationFrame(() => { scrim!.classList.add("show"); sheet!.classList.add("show"); });
    };
    const closeSheet = () => { scrim?.classList.remove("show"); sheet?.classList.remove("show"); };
    const closeBasis = () => doc.querySelectorAll(".nc-basis.is-open").forEach((b) => b.classList.remove("is-open"));

    const isRealLink = (a: HTMLAnchorElement | null) => {
      const h = a?.getAttribute("href") || "";
      return h.startsWith("/app") || h.startsWith("/home") || h.startsWith("http");
    };
    const label = (el: Element) => (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24);

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target || !target.closest) return;
      if (!target.closest('[data-orbit-real-page], .nc-sheet, .nc-scrim, .nc-toast-host')) return;

      if (target.closest("[data-nc-close], .nc-scrim")) { closeSheet(); return; }
      if (target.closest(".nc-send")) { closeSheet(); toast(L("邮件已发送（演示）", "Email sent (demo)")); return; }
      if (target.closest(".nc-rewrite")) { toast(L("已用 AI 重写草稿", "Draft rewritten by AI")); return; }

      const basis = target.closest<HTMLElement>(".nc-basis");
      if (basis) { e.preventDefault(); const open = basis.classList.contains("is-open"); closeBasis(); if (!open) basis.classList.add("is-open"); return; }
      closeBasis();

      const btn = target.closest<HTMLElement>(".btn, button");
      const anchor = target.closest<HTMLAnchorElement>("a");
      const mail = target.closest<HTMLElement>('[data-sheet="email"]')
        || (btn && /邮件|draft email/i.test(label(btn)) ? btn : null)
        || (anchor && anchor.getAttribute("href") === "#" && /邮件|draft email/i.test(label(anchor)) ? anchor : null);
      if (mail) { e.preventDefault(); openEmail(mail.getAttribute("data-to") || ""); return; }

      const drill = target.closest<HTMLElement>("[data-nav], .nc-drill");
      if (drill && !isRealLink(anchor)) { const url = drill.getAttribute("data-nav") || "/app/contacts"; window.location.href = url; return; }

      if (anchor && isRealLink(anchor)) return;

      const chip = target.closest<HTMLElement>(".chip");
      if (chip && !isRealLink(anchor)) {
        const parent = chip.parentElement;
        if (parent) parent.querySelectorAll(":scope > .chip").forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        return;
      }

      if (btn) { e.preventDefault(); toast(L("已执行：", "Done: ") + label(btn)); return; }
      if (anchor && anchor.getAttribute("href") === "#") { e.preventDefault(); toast(L("打开：", "Open: ") + label(anchor)); return; }
    };

    doc.addEventListener("click", onClick);
    return () => {
      doc.removeEventListener("click", onClick);
      host?.remove();
      scrim?.remove();
      sheet?.remove();
    };
  }, []);

  return null;
}
