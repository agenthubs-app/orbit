/* Orbit Redesign 2026-10 — 原型共享脚本：图标 / 图表 / 画框 / 交互 */
(function () {
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.3 3.3 0 0 1 0 6.6M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
    sparkle: '<path d="M12 3.5c.7 4.3 2.2 5.8 6.5 6.5-4.3.7-5.8 2.2-6.5 6.5-.7-4.3-2.2-5.8-6.5-6.5 4.3-.7 5.8-2.2 6.5-6.5Z"/><path d="M18.5 15.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    bell: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2H4.5Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
    right: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>', left: '<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>', down: '<path d="m5.5 9.5 6.5 6.5 6.5-6.5"/>',
    more: '<circle cx="5.5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18.5" cy="12" r="1.2" fill="currentColor"/>',
    scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><rect x="7.5" y="8.5" width="9" height="7" rx="1.5"/>',
    nfc: '<path d="M8.5 8.5a5 5 0 0 1 0 7M12 6a8.5 8.5 0 0 1 0 12M15.5 3.5a12 12 0 0 1 0 17"/><circle cx="5" cy="12" r="1.3" fill="currentColor"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-4.5 4 3 3-2.5 4.5 4"/>',
    mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
    pen: '<path d="M4 20h4L19.5 8.5a2.8 2.8 0 0 0-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="m4.5 7.5 7.5 5.5 7.5-5.5"/>',
    phone: '<path d="M6.5 3.5h3l1.5 4-2 1.5a10 10 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z"/>',
    inbox: '<path d="M3.5 13.5 6 5.5h12l2.5 8V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/><path d="M3.5 13.5H9l1 2h4l1-2h5.5"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    out: '<path d="M7 17 17 7M9 7h8v8"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    send: '<path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4Z"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    brief: '<rect x="3.5" y="7" width="17" height="12.5" rx="3"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
    moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>',
    share: '<path d="M12 15V4M8 7.5 12 4l4 3.5M6 12v6.5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V12"/>',
    layers: '<path d="m12 4 8.5 4.5L12 13 3.5 8.5Z"/><path d="m3.5 13 8.5 4.5 8.5-4.5"/>',
    route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
    ticket: '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4Z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/>',
    book: '<path d="M5 4.5h10a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3Z"/><path d="M5 16.5a3 3 0 0 1 3-3h10"/>',
    edit: '<path d="M4 20h16"/><path d="M6 16v-3l9-9 3 3-9 9Z"/>',
    star: '<path d="m12 4 2.4 5 5.4.7-4 3.7 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.7 5.4-.7Z"/>',
  };
  window.ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

  // 环形图：segs=[{v, c}] 单色系深浅
  window.ring = (size, stroke, segs, center = '', track = 'var(--surface-3)') => {
    const r = (size - stroke) / 2, C = 2 * Math.PI * r, total = segs.reduce((a, s) => a + s.v, 0) || 1;
    const gap = segs.length > 1 ? 3 : 0;
    let off = 0, arcs = '';
    segs.forEach(s => {
      const len = Math.max(0, (s.v / Math.max(total, s.max || total)) * C - gap);
      arcs += `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${s.c}" stroke-width="${stroke}" data-dash="${len} ${C}" stroke-dasharray="0 ${C}" stroke-dashoffset="${-off}"/>`;
      off += len + gap;
    });
    return `<div class="ring" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${track}" stroke-width="${stroke}"/>${arcs}</svg><div class="c">${center}</div></div>`;
  };
  window.bar = (pct, cls = '') => `<div class="bar ${cls}"><i data-w="${pct}"></i></div>`;
  window.num = (v, dec = 0) => `<span class="cnt" data-to="${v}" data-dec="${dec}">${dec ? (0).toFixed(dec) : 0}</span>`;
  // 注释针：锚定到画框内的目标元素（selector + 第 nth 个），渲染后由 placePins() 定位
  window.pin = (n, sel, nth = 0) => `<template data-pin="${n}" data-sel="${sel.replace(/"/g, '&quot;')}" data-nth="${nth}"></template>`;
  const PINS = [];
  const posPin = ({ p, target, host }) => {
    const tr = target.getBoundingClientRect(), hr = host.getBoundingClientRect();
    p.style.left = (tr.left - hr.left + host.scrollLeft) + 'px'; p.style.top = (tr.top - hr.top + host.scrollTop) + 'px';
  };
  window.placePins = (root = document) => {
    root.querySelectorAll('template[data-pin]').forEach(t => {
      const frame = t.closest('.phone, .web') || document;
      const target = frame.querySelectorAll(t.dataset.sel)[+t.dataset.nth];
      if (!target) { console.warn('pin target missing', t.dataset.pin, t.dataset.sel); return; }
      target.classList.add('pinned');
      const host = target.parentElement.closest('.scroll, .main, .rail, .drawer, .sheet') || frame;
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      const p = document.createElement('span'); p.className = 'pin'; p.textContent = t.dataset.pin;
      host.appendChild(p); t.remove();
      const rec = { p, target, host }; PINS.push(rec); posPin(rec);
    });
  };
  const repin = () => PINS.forEach(posPin);
  document.fonts && document.fonts.ready.then(repin);
  window.addEventListener('load', () => setTimeout(repin, 50));
  window.addEventListener('resize', repin);

  const statusBar = (t = '9:41') => `<div class="status"><span>${t}</span><span class="island"></span><span class="sys"><svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="4.5" y="5" width="3" height="6" rx="1"/><rect x="9" y="2.5" width="3" height="8.5" rx="1"/><rect x="13.5" y="0" width="3" height="11" rx="1"/></svg><svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1 3.8a10 10 0 0 1 14 0M3.4 6.3a6.5 6.5 0 0 1 9.2 0"/><circle cx="8" cy="9" r="1" fill="currentColor"/></svg><span class="bat"></span></span></div>`;
  const TABS = [['home', 'ホーム'], ['users', '人脈'], ['calendar', 'イベント'], ['target', 'プラン']];
  window.phone = ({ body, tab = 0, fab = true, overlay = '', pins = '', theme = '' }) =>
    `<div class="phone" ${theme ? `data-theme="${theme}"` : ''}>${statusBar()}<div class="scroll">${body}</div>
     ${tab >= 0 ? `<nav class="tabbar">${TABS.map(([i, l], k) => `<button class="${k === tab ? 'on' : ''}">${ic(i)}${l}</button>`).join('')}</nav>` : ''}
     ${fab && tab >= 0 ? `<button class="fab">${ic('plus')}追加</button>` : ''}
     ${overlay}${pins}<div class="home-ind"></div></div>`;
  window.topbar = (title, sub, l = '', r = '') => `<div class="topbar">${l || '<span></span>'}<div class="t"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>${r || '<span></span>'}</div>`;

  const SIDE = [['home', 'ホーム'], ['sparkle', 'iOrbit'], ['users', '人脈'], ['calendar', 'イベント'], ['target', 'プラン'], ['inbox', '受信箱']];
  window.webFrame = ({ nav = 0, head, body, rail = '', pins = '', theme = '' }) =>
    `<div class="web ${rail ? '' : 'no-rail'}" ${theme ? `data-theme="${theme}"` : ''}>
      <aside class="side"><div class="logo">O</div>${SIDE.map(([i, l], k) => `<a class="${k === nav ? 'on' : ''}">${ic(i)}${l}</a>`).join('')}
        <div class="sp"></div><a class="${nav === 'host' ? 'on' : ''}">${ic('brief')}主催</a><a class="${nav === 'settings' ? 'on' : ''}">${ic('settings')}設定</a><div class="avatar-btn" style="margin-top:8px">佐</div></aside>
      <section class="main">${head}${body}</section>${rail ? `<aside class="rail">${rail}</aside>` : ''}${pins}</div>`;
  window.mainhead = (title, sub, l = '', r = '') => `<div class="mainhead"><div class="l">${l}</div><div class="t"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div><div class="r">${r}</div></div>`;

  // 文档页导航（所有页面共用）
  const PAGES = [['index', '← 总览'], ['00-inventory', '现状图谱'], ['01-system', '设计系统'], ['app', 'App'], ['web', 'Web'], ['widgets', '小组件'], ['02-gaps', '缺口分析'],
    ['b1-onboarding-cards', '①新用户+名片'], ['b2-events-flow', '②活动闭环'], ['b3-daily-actions', '③每日行动'], ['b4-plan-iorbit', '④计划+iOrbit'], ['b5-me-inbox', '⑤我的+收件箱'], ['b6-host-polish', '⑥主办+收尾'], ['b7-account-misc', '⑦账号+补遗'], ['b8-responsive', '⑧Web 自适应'], ['b9-import-plan-v2', '⑨导入 v2'], ['b10-plan-example', '⑩计划具体化（示例）']];
  window.docNav = (active) => { const n = document.getElementById('docnav'); if (n) n.innerHTML = PAGES.map(([f, l]) => `<a class="${f === active ? 'on' : ''}" href="${f}.html">${l}</a>`).join(''); };

  // ---- 运行时：动画、交互 ----
  function animate(root = document) {
    root.querySelectorAll('.ring circle[data-dash]').forEach(c => { c.setAttribute('stroke-dasharray', `0 9999`); });
    root.querySelectorAll('.bar > i[data-w]').forEach(b => b.style.width = '0');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.querySelectorAll('.ring circle[data-dash]').forEach(c => c.setAttribute('stroke-dasharray', c.dataset.dash));
      root.querySelectorAll('.bar > i[data-w]').forEach(b => b.style.width = b.dataset.w + '%');
    }));
    root.querySelectorAll('.cnt').forEach(el => {
      const to = parseFloat(el.dataset.to), dec = +el.dataset.dec || 0, t0 = performance.now(), d = 1100;
      const step = t => { const p = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - p, 3);
        el.textContent = (to * e).toLocaleString('ja-JP', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }
  window.orbitAnimate = animate;

  document.addEventListener('click', e => {
    const acc = e.target.closest('[data-acc]');
    if (acc) acc.closest('.acc').classList.toggle('open');
    const seg = e.target.closest('.seg button');
    if (seg && !seg.closest('[data-ctl]')) { seg.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === seg)); }
    const why = e.target.closest('.why');
    if (why) { const box = why.closest('[data-why-box]')?.querySelector('.why-body'); if (box) box.hidden = !box.hidden; }
  });

  // 左滑出操作
  let drag = null;
  document.addEventListener('pointerdown', e => {
    const face = e.target.closest('.swipe .face'); if (!face) return;
    drag = { face, x: e.clientX, open: face.parentElement.classList.contains('open'), dx: 0 };
    face.style.transition = 'none';
  });
  document.addEventListener('pointermove', e => {
    if (!drag) return; drag.dx = e.clientX - drag.x;
    const base = drag.open ? -144 : 0, x = Math.min(0, Math.max(-170, base + drag.dx));
    drag.face.style.transform = `translateX(${x}px)`;
  });
  document.addEventListener('pointerup', () => {
    if (!drag) return; const { face, dx, open } = drag; drag = null;
    face.style.transition = ''; face.style.transform = '';
    const sw = face.parentElement;
    if (Math.abs(dx) < 4) return;
    sw.classList.toggle('open', open ? dx < 50 : dx < -50);
  });

  // 主题与注释开关
  window.orbitChrome = () => {
    placePins();
    const root = document.documentElement;
    if (!root.dataset.theme) root.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.querySelectorAll('[data-ctl="theme"] button').forEach(b => {
      b.classList.toggle('on', b.dataset.v === root.dataset.theme);
      b.onclick = () => { root.dataset.theme = b.dataset.v; document.querySelectorAll('[data-ctl="theme"] button').forEach(x => x.classList.toggle('on', x === b)); animate(); };
    });
    document.querySelectorAll('[data-ctl="pins"] button').forEach(b => b.onclick = () => {
      document.body.classList.toggle('no-pins', b.dataset.v === 'off');
      b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    });
  };
  window.addEventListener('load', () => animate());
})();
