/* =====================================================================
   Orbit 名片夹 · Prototype interactions (shared)
   让原型里"所有能点的地方"都有响应：点开依据 / 跳转 drill / 邮件抽屉 / toast / 筛选切换。
   自动作用于被点元素所在的 .board-canvas（桌面或移动画板各自独立）。
   约定：
   - .basis            → 点击展开/收起依据浮层（移动端可点）
   - .drill / [data-nav] → 点击跳转（data-nav 或默认回名片夹列表）
   - 按钮文本含"邮件/Draft" 或 [data-sheet="email"] → 打开邮件起草抽屉（展开）
   - .chipgroup .chip / .m-seg a → 同组内切换 active（筛选/分段）
   - 其他 .btn/button / a[href="#"] → toast 反馈，绝不"死点"
   ===================================================================== */
(function () {
  function L(zh, en) { return document.documentElement.lang === 'en' ? en : zh; }
  function boardOf(el) { return (el && el.closest('.board-canvas')) || document.querySelector('.gallery') || document.body; }
  /* visible label in the current language (bilingual buttons carry both zh+en in textContent) */
  function labelOf(el) {
    var en = document.documentElement.lang === 'en', parts = [];
    el.querySelectorAll('.t').forEach(function (t) { var b = t.querySelector(en ? 'b.en' : 'b.zh'); if (b) parts.push(b.textContent); });
    var s = parts.length ? parts.join(' ') : (el.textContent || '');
    return s.trim().replace(/\s+/g, ' ');
  }

  /* ---------- toast ---------- */
  var toastTimer;
  function toast(host, msg) {
    var h = host.querySelector(':scope > .toast-host');
    if (!h) { h = document.createElement('div'); h.className = 'toast-host'; host.appendChild(h); }
    h.innerHTML = '<div class="toast"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg><span></span></div>';
    var t = h.querySelector('.toast'); h.querySelector('span').textContent = msg;
    requestAnimationFrame(function () { t.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); setTimeout(function () { if (h.parentNode) h.innerHTML = ''; }, 260); }, 2600);
  }

  /* ---------- email compose sheet (expand) ---------- */
  function ensureSheet(host) {
    var sheet = host.querySelector(':scope > .sheet.js-email');
    if (sheet) return sheet;
    var scrim = document.createElement('div'); scrim.className = 'scrim js-scrim'; host.appendChild(scrim);
    sheet = document.createElement('div'); sheet.className = 'sheet js-email';
    sheet.innerHTML =
      '<div class="sheet-head"><h3><span class="t"><b class="zh">起草邮件</b><b class="en">Draft email</b></span></h3><button class="sheet-close" data-close aria-label="close"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
      '<div class="sheet-body">' +
        '<div><label class="field-label"><span class="t"><b class="zh">收件人</b><b class="en">To</b></span></label><input class="field js-to" value=""></div>' +
        '<div><label class="field-label"><span class="t"><b class="zh">主题</b><b class="en">Subject</b></span></label><input class="field js-subj" value=""></div>' +
        '<div><label class="field-label"><span class="t"><b class="zh">正文</b><b class="en">Body</b></span></label><textarea class="field js-body" style="min-height:150px"></textarea></div>' +
        '<div class="note"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="m9 12 2 2 4-4"/></svg><span class="t"><b class="zh">草稿引用：来源活动 · 上次交流要点 · 待办承诺。只谈公事，发送前需你确认。</b><b class="en">Draft cites: source event · last talking points · open promise. Work-only; confirm before sending.</b></span></div>' +
      '</div>' +
      '<div class="sheet-foot"><button class="btn btn-ghost btn-sm js-rewrite"><span class="t"><b class="zh">AI 重写</b><b class="en">AI rewrite</b></span></button><button class="btn btn-primary btn-sm btn-block js-send"><span class="t"><b class="zh">发送（需确认）</b><b class="en">Send (confirm)</b></span></button></div>';
    host.appendChild(sheet);
    return sheet;
  }
  function openEmail(host, to, subject, body) {
    var sheet = ensureSheet(host);
    var scrim = host.querySelector(':scope > .scrim.js-scrim');
    sheet.querySelector('.js-to').value = to || L('联系人', 'Contact');
    sheet.querySelector('.js-subj').value = subject || L('很高兴在活动中认识你', 'Great to meet you at the event');
    sheet.querySelector('.js-body').value = body || L(
      '你好，\n\n很高兴上周在 AI 峰会 2026 认识你。上次聊到的合作方向我很感兴趣，附上我们的产品资料。\n\n方便的话，下周约 30 分钟线上聊聊？\n\n此致',
      'Hi,\n\nGreat meeting you at AI Summit 2026. I’m keen on the direction we discussed and have attached our deck.\n\nWould 30 minutes next week work for a quick call?\n\nBest,');
    requestAnimationFrame(function () { scrim.classList.add('show'); sheet.classList.add('show'); });
  }
  function closeSheets(host) {
    host.querySelectorAll(':scope > .sheet.show, :scope > .scrim.show').forEach(function (n) { n.classList.remove('show'); });
  }
  function closeBasis(root) { (root || document).querySelectorAll('.basis.is-open').forEach(function (b) { b.classList.remove('is-open'); }); }

  document.addEventListener('click', function (e) {
    /* language toggle (中 / EN — real nav + legacy .lang) */
    var lang = e.target.closest('.orbit-lang-toggle button, .lang button');
    if (lang) {
      var grp = lang.parentElement;
      grp.querySelectorAll('button').forEach(function (b) { b.classList.remove('is-active', 'on'); });
      lang.classList.add(grp.classList.contains('lang') ? 'on' : 'is-active');
      document.documentElement.lang = /en/i.test(lang.textContent) ? 'en' : 'zh';
      return;
    }
    /* close / scrim */
    if (e.target.closest('.js-scrim') || e.target.closest('[data-close]')) { closeSheets(boardOf(e.target)); return; }
    /* send inside sheet */
    var send = e.target.closest('.js-send');
    if (send) { var hb = boardOf(send); closeSheets(hb); toast(hb, L('邮件已发送（演示）', 'Email sent (demo)')); return; }
    var rew = e.target.closest('.js-rewrite');
    if (rew) { toast(boardOf(rew), L('已用 AI 重写草稿', 'Draft rewritten by AI')); return; }

    /* basis toggle (expand) */
    var basis = e.target.closest('.basis');
    if (basis) { e.preventDefault(); e.stopPropagation(); var open = basis.classList.contains('is-open'); closeBasis(); if (!open) basis.classList.add('is-open'); return; }
    closeBasis();

    /* toggle groups (filters / segments) */
    var seg = e.target.closest('.m-seg a, .chipgroup .chip, [data-toggle] .chip');
    if (seg) {
      e.preventDefault();
      var isSeg = !!seg.closest('.m-seg');
      var grp = seg.closest('.m-seg, .chipgroup, [data-toggle]');
      grp.querySelectorAll(isSeg ? 'a' : '.chip').forEach(function (x) { x.classList.remove('active', 'is-active'); });
      seg.classList.add(isSeg ? 'active' : 'is-active');
      /* segmented control can switch .m-view panels by data-view */
      if (seg.hasAttribute('data-view')) {
        var body = seg.closest('.m-body') || boardOf(seg);
        body.querySelectorAll('.m-view').forEach(function (v) { v.hidden = v.getAttribute('data-view') !== seg.getAttribute('data-view'); });
      }
      return;
    }

    /* email compose (explicit or by button label) */
    var mail = e.target.closest('[data-sheet="email"]');
    var btn = e.target.closest('.btn, button');
    if (!mail && btn && /邮件|draft email/i.test(labelOf(btn))) mail = btn;
    if (mail) { e.preventDefault(); openEmail(boardOf(mail), mail.getAttribute('data-to') || '', mail.getAttribute('data-subject') || '', mail.getAttribute('data-body') || ''); return; }

    /* drill / navigate */
    var drill = e.target.closest('[data-nav], .drill');
    if (drill && !e.target.closest('a[href$=".html"]')) {
      var url = drill.getAttribute('data-nav') || '01-wallet.html';
      window.location.href = url; return;
    }

    /* real cross-page links: let them navigate */
    var link = e.target.closest('a[href$=".html"]');
    if (link) return;

    /* any other button / placeholder link → toast (never a dead click) */
    if (btn) {
      if (btn.tagName === 'A' && btn.getAttribute('href') && btn.getAttribute('href') !== '#') return;
      e.preventDefault();
      var lbl = labelOf(btn).slice(0, 24);
      toast(boardOf(btn), L('已触发：' + lbl, 'Done: ' + lbl));
      return;
    }
    var ph = e.target.closest('a[href="#"]');
    if (ph) { e.preventDefault(); var l = labelOf(ph).slice(0, 24); toast(boardOf(ph), L('打开：' + l, 'Open: ' + l)); }
  });
})();
