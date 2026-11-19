/* QuickCart — BACKEND (platform admin only).
   A no-code control center: edit a DRAFT of the whole platform, preview it, then press ▶ Run to push it live to every owner.
   Everything is stored through /api/platform (server checks that you are the platform admin). */
(function () {
  'use strict';
  var D = document, L = localStorage, $ = function (id) { return D.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var isAdmin = function () { return L.getItem('qc_logged_user') === 'admin' && L.getItem('qc_is_staff') !== '1'; };
  var say = function (m) { if (window.toast) window.toast(m); };
  var PLANS = [['starter', 'Starter'], ['pro', 'Pro'], ['enterprise', 'Enterprise']];
  var HIDE = { dashboard: 1, settings: 1, subs: 1, launch: 1, backend: 1, myplan: 1, whatsnew: 1 };
  var FLAGS = [['pos.split', 'POS · Split payments (cash + card/transfer)'], ['pos.card', 'POS · Card payments'], ['pos.transfer', 'POS · Bank transfer payments'], ['pos.scanner', 'POS · Camera barcode scanner button'], ['pos.discount', 'POS · Discount field at checkout']];
  var TABS = [['overview', '🏠 Overview'], ['features', '🧩 Features'], ['plans', '💰 Plans & pricing'], ['announce', '📣 Announcements'], ['news', '🎁 What’s new'], ['pages', '📄 Pages'], ['site', '🌐 Website'], ['look', '🎨 Look & feel'], ['controls', '🚦 Controls'], ['owners', '👥 Owners'], ['inbox', '📬 Inbox'], ['history', '🕘 History']];

  var S = { tab: 'overview', pub: null, dirty: false, sched: null, saving: false, owners: null, msgs: null, hist: null, aud: null, page: 0, saveT: null, ownersQ: '', ownersF: 'all', plansLive: null };
  var C = null;   // the working draft config

  /* ───────── api ───────── */
  function hdr() { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (L.getItem('qc_token') || '') }; }
  function post(url, body) { return fetch(url, { method: 'POST', headers: hdr(), body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Bad response' }; }); }); }
  var plat = function (b) { return post('/api/platform', b); };
  var getP = function (o, p) { return String(p).split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); };
  function setP(o, p, v) { var ks = String(p).split('.'), t = o; for (var i = 0; i < ks.length - 1; i++) { if (t[ks[i]] == null || typeof t[ks[i]] !== 'object') t[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; t = t[ks[i]]; } t[ks[ks.length - 1]] = v; }
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var rid = function () { return Math.random().toString(36).slice(2, 8); };

  /* ───────── draft autosave ───────── */
  function touch() {
    S.dirty = true; status('Saving…'); clearTimeout(S.saveT); S.saveT = setTimeout(flush, 700);
  }
  function flush() {
    clearTimeout(S.saveT); S.saving = true;
    return plat({ action: 'save-draft', config: C }).then(function (j) {
      S.saving = false; if (!j.ok) { status('⚠️ Not saved: ' + (j.error || 'error')); return false; }
      S.dirty = j.dirty; status(j.dirty ? 'Draft saved · not live yet' : 'Draft equals live'); runbar(); return true;
    });
  }
  function status(t) { var s = $('bk-st'); if (s) s.textContent = t; }

  /* ───────── tiny form helpers ───────── */
  function fld(label, path, type, o) {
    o = o || {}; var v = getP(C, path), a = ' data-b="' + path + '" data-t="' + type + '"' + (o.rr ? ' data-rr="1"' : '');
    if (type === 'check') return '<label class="bk-chk"><input type="checkbox"' + a + (v === undefined ? (o.def ? ' checked' : '') : (v ? ' checked' : '')) + '> ' + label + '</label>';
    var inner;
    if (type === 'area') inner = '<textarea' + a + ' rows="' + (o.rows || 3) + '" placeholder="' + esc(o.ph || '') + '" maxlength="' + (o.max || 2000) + '">' + esc(v == null ? '' : v) + '</textarea>';
    else if (type === 'select') inner = '<select' + a + '>' + o.options.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (String(v == null ? o.def : v) === String(x[0]) ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>';
    else if (type === 'dt') inner = '<input type="datetime-local"' + a + ' value="' + (v ? new Date(Date.parse(v) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '') + '">';
    else if (type === 'color') inner = '<input type="color"' + a + ' value="' + esc(v || o.def || '#ff5a1f') + '" style="height:40px;padding:2px">';
    else inner = '<input type="' + (type === 'number' ? 'number' : 'text') + '"' + a + ' value="' + esc(v == null ? '' : v) + '" placeholder="' + esc(o.ph || '') + '"' + (o.max ? ' maxlength="' + o.max + '"' : '') + (o.min != null ? ' min="' + o.min + '"' : '') + '>';
    return '<label class="bk-f' + (o.cls ? ' ' + o.cls : '') + '"><span>' + label + '</span>' + inner + (o.hint ? '<small>' + o.hint + '</small>' : '') + '</label>';
  }
  var card = function (title, body, sub) { return '<div class="bk-card"><div class="bk-ch"><h3>' + title + '</h3>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + body + '</div>'; };
  var btn = function (label, act, extra, cls) { return '<button class="bk-b ' + (cls || '') + '" data-a="' + act + '" ' + (extra || '') + '>' + label + '</button>'; };
  var empty = function (t) { return '<div class="bk-empty">' + t + '</div>'; };

  function compressImage(file, max, q) {
    return new Promise(function (res, rej) {
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () { var r = Math.min(1, max / Math.max(img.width, img.height)), c = D.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); var d = c.toDataURL('image/webp', q || .75); if (d.indexOf('image/webp') < 0) d = c.toDataURL('image/jpeg', q || .75); URL.revokeObjectURL(u); d.length > 220000 ? rej(new Error('Image is too big — use a smaller one or paste a link')) : res(d); };
      img.onerror = function () { rej(new Error('Could not read that image')); }; img.src = u;
    });
  }
  function pickImage(cb) { var f = $('bk-file'); f.value = ''; f.onchange = function () { if (!f.files[0]) return; compressImage(f.files[0], 900, .72).then(cb, function (e) { say('❌ ' + e.message); }); }; f.click(); }

  /* ───────── run bar ───────── */
  function diffSummary() {
    var pub = S.pub || {}, out = [], same = function (a, b) { return JSON.stringify(a) === JSON.stringify(b); };
    var mods = Object.keys(Object.assign({}, C.modules, pub.modules)).filter(function (k) { return !same((C.modules || {})[k], (pub.modules || {})[k]); });
    if (mods.length) out.push('Features: ' + mods.length + ' changed (' + mods.slice(0, 4).join(', ') + (mods.length > 4 ? '…' : '') + ')');
    if (!same(C.flags, pub.flags)) out.push('Feature switches changed');
    if (!same(C.plans, pub.plans) || C.trialDays !== pub.trialDays) out.push('Plans, prices or trial length changed');
    if (!same(C.announcements, pub.announcements)) out.push('Announcements changed');
    if (!same(C.whatsNew, pub.whatsNew)) out.push('“What’s new” changed');
    if (!same(C.pages, pub.pages)) out.push('Custom pages changed');
    if (!same(C.site, pub.site)) out.push('Website content changed');
    if (!same(C.theme, pub.theme)) out.push('Look & feel changed');
    if (!same(C.maintenance, pub.maintenance)) out.push('Maintenance settings changed' + (C.maintenance.on ? ' — ⚠️ ON' : ''));
    if (!same(C.signups, pub.signups)) out.push('Sign-ups ' + (C.signups.open === false ? 'CLOSED' : 'open'));
    return out;
  }
  function runbar() {
    var b = $('bk-run'); if (!b) return;
    var n = diffSummary().length, sch = S.sched;
    $('bk-chip').className = 'bk-chip ' + (n ? 'warn' : 'ok'); $('bk-chip').textContent = n ? '● ' + n + ' unpublished change' + (n > 1 ? 's' : '') : '✓ Live = Draft';
    $('bk-ver').textContent = S.pubVersion ? 'Live: version ' + S.pubVersion : 'Nothing published yet';
    $('bk-sch').innerHTML = sch ? '⏰ Scheduled ' + esc(new Date(sch.at).toLocaleString()) + ' <a href="#" data-a="cancelsched">cancel</a>' : '';
    b.disabled = !n;
  }
  function openModal(html, onReady) { closeModal(); var m = D.createElement('div'); m.className = 'bk-ov'; m.id = 'bk-modal'; m.innerHTML = '<div class="bk-mod">' + html + '</div>'; D.body.appendChild(m); m.addEventListener('click', function (e) { if (e.target === m) closeModal(); }); if (onReady) onReady(m); }
  function closeModal() { var m = $('bk-modal'); if (m) m.remove(); }

  function runDialog() {
    flush().then(function (ok) {
      if (!ok) return; var items = diffSummary();
      openModal('<h3>▶ Run — push to everyone</h3><p class="bk-mut">This goes live for <b>all owners, staff and visitors</b> within about a minute. You can roll back from History at any time.</p><div class="bk-sum">' + (items.length ? items.map(function (i) { return '<div>• ' + esc(i) + '</div>'; }).join('') : '<div>No changes.</div>') + '</div><label class="bk-f"><span>Release note (only you see this)</span><input id="bk-note" placeholder="e.g. Added Black Friday announcement"></label><div class="bk-row"><button class="bk-b pri" id="bk-go">▶ Run now</button><button class="bk-b" id="bk-sch-btn">⏰ Schedule instead…</button><button class="bk-b" id="bk-cx">Cancel</button></div>', function () {
        $('bk-cx').onclick = closeModal;
        $('bk-go').onclick = function () { doRun(false); };
        $('bk-sch-btn').onclick = function () {
          openModal('<h3>⏰ Schedule this release</h3><p class="bk-mut">It will go live automatically at the time you pick (your local time).</p><label class="bk-f"><span>Go live at</span><input type="datetime-local" id="bk-at"></label><div class="bk-row"><button class="bk-b pri" id="bk-sgo">Schedule</button><button class="bk-b" id="bk-cx">Cancel</button></div>', function () {
            $('bk-cx').onclick = closeModal; $('bk-sgo').onclick = function () { var v = $('bk-at').value; if (!v) return say('Pick a date and time'); plat({ action: 'schedule', at: new Date(v).toISOString(), note: '' }).then(function (j) { if (!j.ok) return say('❌ ' + j.error); closeModal(); say('✅ Scheduled'); S.sched = { at: j.at }; runbar(); }); };
          });
        };
      });
    });
  }
  function doRun(confirmMaint) {
    var note = ($('bk-note') || {}).value || ''; var b = $('bk-go'); if (b) { b.disabled = true; b.textContent = 'Publishing…'; }
    plat({ action: 'publish', note: note, confirmMaintenance: !!confirmMaint }).then(function (j) {
      if (j.needsConfirm) { closeModal(); openModal('<h3>🔧 Maintenance mode is ON</h3><p class="bk-mut">' + esc(j.error) + '</p><div class="bk-row"><button class="bk-b pri" id="bk-yes">Yes, block owners now</button><button class="bk-b" id="bk-cx">Cancel</button></div>', function () { $('bk-cx').onclick = closeModal; $('bk-yes').onclick = function () { doRun(true); }; }); return; }
      closeModal(); if (!j.ok) return say('❌ ' + (j.error || 'Could not publish'));
      say('🚀 Live! Version ' + j.version + ' is now running for everyone'); load(true);
    });
  }

  /* ───────── tabs ───────── */
  function moduleList() {
    var side = D.querySelector('aside.sidebar'), out = [], grp = 'Main'; if (!side) return out;
    [].slice.call(side.children).forEach(function (n) {
      if (n.classList.contains('sb')) {
        if (n.getAttribute('data-qcp')) return; var oc = n.getAttribute('onclick') || '', m = oc.match(/go\('([\w-]+)'/), id = m ? m[1] : /openPOS/.test(oc) ? 'pos' : /openPageEditor/.test(oc) ? 'pageeditor' : null;
        if (!id || HIDE[id]) return; var t = (n.dataset.qo ? (function (h) { var s = D.createElement('span'); s.innerHTML = h; return s.textContent; })(n.dataset.qo) : n.textContent).replace(/\s+/g, ' ').trim(), mt = t.match(/^(\p{Extended_Pictographic}\S*)\s+(.*)$/u);   // only a real emoji counts as the icon
        out.push({ id: id, icon: mt ? mt[1] : '', label: (mt ? mt[2] : t).replace(/\s*↗$/, ''), group: grp });
      } else if (n.textContent.trim() && !n.getAttribute('data-qcp')) grp = n.textContent.replace(/[▼▲▾▴]/g, '').trim();
    });
    return out;
  }
  function modDef(id) { return Object.assign({ on: true, minPlan: 'starter', label: '', icon: '', badge: '', order: null, message: '', pct: 100 }, (C.modules || {})[id] || {}); }

  var VIEWS = {
    overview: function () {
      var o = S.owners, stats = '';
      if (o) { var now = Date.now(), cnt = { total: o.length, trial: 0, active: 0, expired: 0, week: 0, soon: 0 }, mrr = 0, pl = S.plansLive || {};
        o.forEach(function (u) { if (u.isStaff) return; if (u.status === 'active' && Date.parse(u.subExpires || 0) > now) { cnt.active++; mrr += (pl[u.plan] || {}).monthly || 0; } else if ((u.status === 'trial' || u.status === 'pending_card') && Date.parse(u.trialEnds || 0) > now) { cnt.trial++; if (Date.parse(u.trialEnds) - now < 3 * 864e5) cnt.soon++; } else cnt.expired++; if (now - Date.parse(u.createdAt || 0) < 7 * 864e5) cnt.week++; });
        cnt.total = o.filter(function (u) { return !u.isStaff; }).length;
        stats = '<div class="bk-kpis"><div><small>Owners</small><b>' + cnt.total + '</b></div><div><small>Paying now</small><b>' + cnt.active + '</b></div><div><small>On free trial</small><b>' + cnt.trial + '</b></div><div><small>Trials ending ≤3 days</small><b>' + cnt.soon + '</b></div><div><small>Expired / inactive</small><b>' + cnt.expired + '</b></div><div><small>Est. monthly revenue</small><b>₦' + Math.round(mrr).toLocaleString('en-NG') + '</b></div><div><small>New this week</small><b>' + cnt.week + '</b></div></div>'; }
      else stats = '<div class="bk-empty">Loading owner numbers…</div>';
      var unread = S.msgs ? S.msgs.filter(function (m) { return !m.read; }).length : 0;
      return stats
        + card('How this works (read once)', '<ol class="bk-how"><li><b>Change things</b> in any tab on this page. Everything you change is saved as a <b>draft</b> — owners don’t see it yet.</li><li>Press <b>👁 Preview</b> to look at the draft in your own dashboard exactly like an owner on the plan you choose.</li><li>Happy? Press <b>▶ Run</b>. It goes live for <b>everyone</b> in about a minute — no code, no redeploy.</li><li>Made a mistake? <b>History → Roll back</b> restores any earlier release in one click.</li></ol>')
        + card('Quick actions', '<div class="bk-row">' + btn('📣 New announcement', 'goto', 'data-v="announce"') + btn('🎁 Post a release note', 'goto', 'data-v="news"') + btn('📄 Build a page', 'goto', 'data-v="pages"') + btn('🧩 Turn a feature on/off', 'goto', 'data-v="features"') + btn('💰 Change prices', 'goto', 'data-v="plans"') + btn('🚦 Maintenance / sign-ups', 'goto', 'data-v="controls"') + btn('📬 Inbox' + (unread ? ' (' + unread + ' new)' : ''), 'goto', 'data-v="inbox"') + '</div>')
        + card('Good to know', '<ul class="bk-how"><li>Turning a feature <b>off</b> hides it from owners’ menus. Setting a <b>minimum plan</b> shows it with a 🔒 and an upgrade prompt to owners on lower plans.</li><li>Price changes apply to <b>new payments and the website</b> immediately after Run. Owners who already paid keep what they paid for.</li><li>Your own admin account always sees everything (tagged), so you never lock yourself out.</li></ul>');
    },

    features: function () {
      var list = moduleList(), groups = {}; list.forEach(function (m) { (groups[m.group] = groups[m.group] || []).push(m); });
      var h = '<p class="bk-mut" style="margin:0 0 12px">Every owner dashboard menu item. Switch off to hide; choose a minimum plan to lock; rename, re-icon, badge or reorder. “Rollout %” shows a feature to only part of your owners first (a safe way to test).</p>';
      Object.keys(groups).forEach(function (g) {
        h += '<div class="bk-card"><div class="bk-ch"><h3>' + esc(g) + '</h3></div><div class="bk-tw"><table class="bk-t"><thead><tr><th>Feature</th><th>On</th><th>Min plan</th><th>Name</th><th>Icon</th><th>Badge</th><th>Rollout %</th><th>Lock message</th><th>Order</th></tr></thead><tbody>';
        groups[g].forEach(function (m, i) {
          var d = modDef(m.id), p = 'modules.' + m.id; h += '<tr><td><b>' + esc(m.icon + ' ' + m.label) + '</b><br><small>' + m.id + '</small></td>'
            + '<td><label class="bk-sw"><input type="checkbox" data-b="' + p + '.on" data-t="check" data-mod="' + m.id + '"' + (d.on !== false ? ' checked' : '') + '><i></i></label></td>'
            + '<td><select data-b="' + p + '.minPlan" data-t="select" data-mod="' + m.id + '">' + PLANS.map(function (x) { return '<option value="' + x[0] + '"' + (d.minPlan === x[0] ? ' selected' : '') + '>' + x[1] + '+</option>'; }).join('') + '</select></td>'
            + '<td><input data-b="' + p + '.label" data-t="text" data-mod="' + m.id + '" value="' + esc(d.label) + '" placeholder="' + esc(m.label) + '"></td>'
            + '<td><input data-b="' + p + '.icon" data-t="text" data-mod="' + m.id + '" value="' + esc(d.icon) + '" placeholder="' + esc(m.icon) + '" style="width:54px"></td>'
            + '<td><select data-b="' + p + '.badge" data-t="select" data-mod="' + m.id + '">' + [['', '—'], ['new', 'NEW'], ['beta', 'BETA'], ['soon', 'SOON'], ['pro', 'PRO']].map(function (x) { return '<option value="' + x[0] + '"' + (d.badge === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></td>'
            + '<td><input type="number" min="0" max="100" data-b="' + p + '.pct" data-t="number" data-mod="' + m.id + '" value="' + (d.pct == null ? 100 : d.pct) + '" style="width:64px"></td>'
            + '<td><input data-b="' + p + '.message" data-t="text" data-mod="' + m.id + '" value="' + esc(d.message) + '" placeholder="optional"></td>'
            + '<td style="white-space:nowrap">' + btn('↑', 'modmove', 'data-g="' + esc(g) + '" data-id="' + m.id + '" data-d="-1"', 'sm') + btn('↓', 'modmove', 'data-g="' + esc(g) + '" data-id="' + m.id + '" data-d="1"', 'sm') + '</td></tr>';
        });
        h += '</tbody></table></div></div>';
      });
      h += card('Feature switches', '<div class="bk-flags">' + FLAGS.map(function (f) { return fld(esc(f[1]), 'flags.' + f[0], 'check', { def: true }); }).join('') + '</div>', 'Turn small parts of the POS on or off for everyone.');
      return h;
    },

    plans: function () {
      var pl = S.plansLive || {}, h = '<p class="bk-mut" style="margin:0 0 12px">Leave a field empty to keep the built-in default. The website, sign-up and payment page all read these.</p><div class="bk-grid3">';
      PLANS.forEach(function (p) {
        var k = p[0], b = pl[k] || {}, pre = 'plans.' + k; h += '<div class="bk-card"><div class="bk-ch"><h3>' + p[1] + '</h3><p>Current live price: ₦' + Math.round(b.monthly || 0).toLocaleString('en-NG') + '/month</p></div>'
          + fld('Plan name', pre + '.name', 'text', { ph: p[1], max: 30 }) + fld('Monthly price (₦)', pre + '.monthly', 'number', { ph: String(b.monthly || ''), min: 100 }) + fld('Yearly price (₦)', pre + '.annual', 'number', { ph: 'auto = 20% off', min: 100, hint: 'Leave empty for 20% off 12 months.' })
          + fld('Tagline', pre + '.tagline', 'text', { max: 90, ph: 'e.g. Best for growing shops' })
          + fld('Features shown on the website (one per line)', pre + '.featuresText', 'area', { rows: 7, ph: 'Online store\nPOS\nInventory…', hint: 'Empty = keep the default list.' })
          + fld('Mark as “Most popular”', pre + '.popular', 'check') + fld('Hide this plan', pre + '.hidden', 'check') + '</div>';
      });
      h += '</div>' + card('Free trial', fld('Trial length for new sign-ups (days)', 'trialDays', 'number', { min: 1, max: 90 }), 'Applies to everyone who registers after you press Run.');
      return h;
    },

    announce: function () {
      var a = C.announcements || [], h = '<div class="bk-row" style="margin-bottom:12px">' + btn('＋ New announcement', 'ann-add', '', 'pri') + '</div>';
      if (!a.length) return h + empty('No announcements. Add one to show a banner to owners (or visitors) — e.g. “Black Friday: 20% off Pro”.');
      a.forEach(function (x, i) {
        var p = 'announcements.' + i;
        h += '<div class="bk-card"><div class="bk-ch"><h3>' + esc(x.title || x.text || 'Announcement').slice(0, 60) + '</h3>' + btn('🗑 Delete', 'ann-del', 'data-i="' + i + '"', 'sm danger') + '</div>'
          + '<div class="bk-grid2">' + fld('Title (bold, optional)', p + '.title', 'text', { max: 90 }) + fld('Style', p + '.kind', 'select', { options: [['info', 'ℹ️ Info (blue)'], ['success', '✅ Success (green)'], ['warning', '⚠️ Warning (yellow)'], ['promo', '🔥 Promo (orange)']], def: 'info' }) + '</div>'
          + fld('Message', p + '.text', 'area', { rows: 2, max: 500 })
          + '<div class="bk-grid2">' + fld('Button link (optional)', p + '.link', 'text', { ph: 'https://… or /pricing' }) + fld('Link text', p + '.linkLabel', 'text', { max: 30, ph: 'Learn more' }) + '</div>'
          + '<div class="bk-sub">Show on</div><div class="bk-checks">' + [['dashboard', 'Owner dashboard'], ['pos', 'POS'], ['site', 'Public website'], ['store', 'Online stores']].map(function (w) { return '<label class="bk-chk"><input type="checkbox" data-arr="' + p + '.where" data-val="' + w[0] + '"' + ((x.where || ['dashboard']).indexOf(w[0]) > -1 ? ' checked' : '') + '> ' + w[1] + '</label>'; }).join('') + '</div>'
          + '<div class="bk-sub">Only for plans <small>(none ticked = everyone)</small></div><div class="bk-checks">' + PLANS.map(function (w) { return '<label class="bk-chk"><input type="checkbox" data-arr="' + p + '.plans" data-val="' + w[0] + '"' + ((x.plans || []).indexOf(w[0]) > -1 ? ' checked' : '') + '> ' + w[1] + '</label>'; }).join('') + '</div>'
          + '<div class="bk-grid3">' + fld('Starts (optional)', p + '.start', 'dt') + fld('Ends (optional)', p + '.end', 'dt') + fld('Show to % of owners', p + '.pct', 'number', { min: 0, max: 100 }) + '</div>'
          + '<div class="bk-checks">' + fld('Visible (on)', p + '.on', 'check', { def: true }) + fld('Owners can dismiss it', p + '.dismissible', 'check', { def: true }) + '</div></div>';
      });
      return h;
    },

    news: function () {
      var w = C.whatsNew || [], h = '<p class="bk-mut" style="margin:0 0 12px">Release notes. The newest one pops up once for every owner after you Run, and all of them appear under “🎁 What’s new” in their menu.</p><div class="bk-row" style="margin-bottom:12px">' + btn('＋ Post a release note', 'news-add', '', 'pri') + '</div>';
      if (!w.length) return h + empty('Nothing posted yet.');
      w.forEach(function (x, i) {
        var p = 'whatsNew.' + i;
        h += '<div class="bk-card"><div class="bk-ch"><h3>' + esc(x.title || 'New release').slice(0, 60) + '</h3><div>' + btn('↑', 'news-move', 'data-i="' + i + '" data-d="-1"', 'sm') + btn('↓', 'news-move', 'data-i="' + i + '" data-d="1"', 'sm') + btn('🗑', 'news-del', 'data-i="' + i + '"', 'sm danger') + '</div></div>'
          + '<div class="bk-grid3">' + fld('Title', p + '.title', 'text', { max: 110 }) + fld('Date', p + '.date', 'text', { ph: '2026-11-20' }) + fld('Tag', p + '.tag', 'text', { max: 20, ph: 'NEW / IMPROVED' }) + '</div>'
          + fld('Details (plain text, line breaks kept)', p + '.body', 'area', { rows: 4, max: 1800 }) + '<div class="bk-grid2">' + fld('“Learn more” link (optional)', p + '.link', 'text') + '<div class="bk-f"><span>Picture (optional)</span><div class="bk-row">' + btn('📷 Upload', 'news-img', 'data-i="' + i + '"') + (x.image ? '<img src="' + esc(x.image) + '" style="height:40px;border-radius:8px">' + btn('Remove', 'news-imgx', 'data-i="' + i + '"', 'sm') : '') + '</div></div></div></div>';
      });
      return h;
    },

    pages: function () {
      var pg = C.pages || [], cur = pg[S.page], h = '<p class="bk-mut" style="margin:0 0 12px">Build your own pages that appear in every owner’s menu — training videos, tips, support, partner offers. No code.</p>';
      h += '<div class="bk-row" style="margin-bottom:12px">' + pg.map(function (p, i) { return '<button class="bk-b ' + (i === S.page ? 'pri' : '') + '" data-a="page-sel" data-i="' + i + '">' + esc(p.icon + ' ' + p.title) + '</button>'; }).join('') + btn('＋ New page', 'page-add', '', 'sm') + '</div>';
      if (!cur) return h + empty('No custom pages yet. Press “＋ New page”.');
      var p = 'pages.' + S.page;
      h += '<div class="bk-card"><div class="bk-ch"><h3>Page settings</h3>' + btn('🗑 Delete page', 'page-del', '', 'sm danger') + '</div><div class="bk-grid3">' + fld('Page title', p + '.title', 'text', { max: 60, rr: 1 }) + fld('Menu icon', p + '.icon', 'text', { max: 8 }) + fld('Menu group', p + '.group', 'text', { max: 30, ph: 'Resources' }) + '</div>'
        + '<div class="bk-sub">Only for plans <small>(none = everyone)</small></div><div class="bk-checks">' + PLANS.map(function (w) { return '<label class="bk-chk"><input type="checkbox" data-arr="' + p + '.plans" data-val="' + w[0] + '"' + ((cur.plans || []).indexOf(w[0]) > -1 ? ' checked' : '') + '> ' + w[1] + '</label>'; }).join('') + fld('Visible (on)', p + '.on', 'check', { def: true }) + '</div>' + fld('Show to % of owners', p + '.pct', 'number', { min: 0, max: 100 }) + '</div>';
      h += '<div class="bk-card"><div class="bk-ch"><h3>Content blocks</h3></div>';
      (cur.blocks || []).forEach(function (b, bi) {
        var bp = p + '.blocks.' + bi; h += '<div class="bk-blk"><div class="bk-bh"><b>' + ({ heading: '𝗧 Heading', text: '¶ Text', image: '🖼 Image', button: '🔘 Button', video: '▶️ Video', embed: '🧩 Embed', list: '☰ List', callout: '💬 Callout', faq: '❓ FAQ', divider: '— Divider' }[b.type] || b.type) + '</b><span>' + btn('↑', 'blk-move', 'data-i="' + bi + '" data-d="-1"', 'sm') + btn('↓', 'blk-move', 'data-i="' + bi + '" data-d="1"', 'sm') + btn('✕', 'blk-del', 'data-i="' + bi + '"', 'sm danger') + '</span></div>';
        if (b.type === 'heading') h += fld('Heading', bp + '.text', 'text', { max: 160 }) + fld('Size', bp + '.level', 'select', { options: [[2, 'Large'], [3, 'Medium']], def: 2 });
        else if (b.type === 'text') h += fld('Paragraph', bp + '.text', 'area', { rows: 4, max: 4000 });
        else if (b.type === 'image') h += '<div class="bk-row">' + btn('📷 Upload picture', 'blk-img', 'data-i="' + bi + '"') + (b.src ? '<img src="' + esc(b.src) + '" style="height:50px;border-radius:8px">' : '') + '</div>' + fld('…or image link', bp + '.src', 'text', { ph: 'https://…' }) + fld('Caption (optional)', bp + '.caption', 'text', { max: 200 });
        else if (b.type === 'button') h += '<div class="bk-grid2">' + fld('Button text', bp + '.label', 'text', { max: 60 }) + fld('Link', bp + '.link', 'text', { ph: 'https://…' }) + '</div>' + fld('Style', bp + '.style', 'select', { options: [['solid', 'Solid'], ['ghost', 'Soft']], def: 'solid' });
        else if (b.type === 'video') h += fld('YouTube or Vimeo link', bp + '.url', 'text', { ph: 'https://youtu.be/…' });
        else if (b.type === 'embed') h += fld('Embed link (Calendly, Google Form or Google Maps embed)', bp + '.url', 'text') + fld('Height (px)', bp + '.height', 'number', { min: 200, max: 1000 });
        else if (b.type === 'list') h += fld('Items (one per line)', bp + '.itemsText', 'area', { rows: 4 }) + fld('Style', bp + '.style', 'select', { options: [['bullets', 'Bullets'], ['numbers', 'Numbers'], ['checks', 'Check marks']], def: 'bullets' });
        else if (b.type === 'callout') h += fld('Message', bp + '.text', 'area', { rows: 2, max: 800 }) + fld('Style', bp + '.kind', 'select', { options: [['info', 'Info'], ['success', 'Success'], ['warning', 'Warning'], ['promo', 'Promo']], def: 'info' });
        else if (b.type === 'faq') { (b.items || []).forEach(function (q, qi) { h += '<div class="bk-grid2">' + fld('Question', bp + '.items.' + qi + '.q', 'text', { max: 180 }) + fld('Answer', bp + '.items.' + qi + '.a', 'text', { max: 900 }) + '</div>'; }); h += btn('＋ Question', 'faq-add', 'data-i="' + bi + '"', 'sm'); }
        h += '</div>';
      });
      h += '<div class="bk-sub">Add a block</div><div class="bk-row">' + [['heading', '𝗧 Heading'], ['text', '¶ Text'], ['image', '🖼 Image'], ['button', '🔘 Button'], ['video', '▶️ Video'], ['list', '☰ List'], ['callout', '💬 Callout'], ['faq', '❓ FAQ'], ['embed', '🧩 Embed'], ['divider', '— Divider']].map(function (t) { return btn(t[1], 'blk-add', 'data-t="' + t[0] + '"', 'sm'); }).join('') + '</div></div>';
      return h;
    },

    site: function () {
      var s = C.site || {}, h = '<p class="bk-mut" style="margin:0 0 12px">The public website (landing page, pricing, FAQ, contact). Leave a field empty to keep the built-in wording.</p>';
      h += card('Top announcement bar', '<div class="bk-checks">' + fld('Show the bar', 'site.announcement.on', 'check') + '</div><div class="bk-grid2">' + fld('Text', 'site.announcement.text', 'text', { max: 200, ph: '🔥 Black Friday: 20% off all plans' }) + fld('Background colour', 'site.announcement.bg', 'color', { def: '#0a1f44' }) + fld('Link', 'site.announcement.link', 'text') + fld('Link text', 'site.announcement.label', 'text', { max: 30 }) + '</div>');
      h += card('Landing page headline', '<div class="bk-grid2">' + fld('Small label above the headline', 'site.hero.eyebrow', 'text', { max: 60, ph: 'Built for Nigerian businesses' }) + fld('Headline (replaces the animated one)', 'site.hero.title', 'text', { max: 120 }) + '</div>' + fld('Sub-text', 'site.hero.subtitle', 'area', { rows: 2, max: 300 }) + '<div class="bk-grid2">' + fld('Main button text', 'site.hero.cta1', 'text', { max: 40 }) + fld('Second button text', 'site.hero.cta2', 'text', { max: 40 }) + '</div>');
      h += card('Numbers under the headline', '<p class="bk-mut" style="margin:0 0 8px">Only add numbers that are <b>true</b> (e.g. “120” “Active stores”). Empty = this row is hidden.</p>' + [0, 1, 2, 3].map(function (i) { return '<div class="bk-grid2">' + fld('Number ' + (i + 1), 'site.stats.' + i + '.value', 'text', { max: 20, ph: '120+' }) + fld('Label', 'site.stats.' + i + '.label', 'text', { max: 40, ph: 'Active stores' }) + '</div>'; }).join(''));
      h += card('Customer reviews', '<p class="bk-mut" style="margin:0 0 8px">Add real quotes from real customers (with their permission). With none added, the reviews section is hidden.</p>' + [0, 1, 2, 3, 4].map(function (i) { return '<div class="bk-blk">' + fld('Quote ' + (i + 1), 'site.reviews.' + i + '.text', 'area', { rows: 2, max: 420 }) + '<div class="bk-grid2">' + fld('Name', 'site.reviews.' + i + '.name', 'text', { max: 60 }) + fld('Business & place', 'site.reviews.' + i + '.role', 'text', { max: 90 }) + '</div></div>'; }).join(''));
      h += card('Extra FAQ answers', (s.faq || []).map(function (f, i) { return '<div class="bk-grid2">' + fld('Question', 'site.faq.' + i + '.q', 'text', { max: 180 }) + fld('Answer', 'site.faq.' + i + '.a', 'text', { max: 900 }) + '</div>'; }).join('') + btn('＋ Add question', 'sitefaq-add', '', 'sm'), 'Added to the FAQ section and FAQ page.');
      h += card('Contact & footer', '<div class="bk-grid2">' + fld('Support email shown on the website', 'site.contactEmail', 'text', { ph: 'hnrkane@gmail.com' }) + fld('Footer note', 'site.footerNote', 'text', { max: 200 }) + '</div>', 'Note: the Contact form still delivers to your CONTACT_TO inbox.');
      return h;
    },

    look: function () {
      return card('Dashboard & POS colours', '<div class="bk-grid3">' + fld('Main colour (buttons, highlights)', 'theme.accent', 'color', { def: '#ff5a1f' }) + fld('Second colour', 'theme.accent2', 'color', { def: '#ff8a3d' }) + fld('Corner roundness (0–24)', 'theme.radius', 'number', { min: 0, max: 24 }) + '</div><div class="bk-row">' + btn('Reset to default look', 'theme-reset') + '</div><p class="bk-mut">Applies to every owner’s dashboard and POS after Run. Use Preview to see it first.</p>'
        + '<div style="display:flex;gap:10px;margin-top:10px"><div style="width:110px;height:44px;border-radius:' + (getP(C, 'theme.radius') == null ? 10 : getP(C, 'theme.radius')) + 'px;background:' + (getP(C, 'theme.accent') || '#171717') + ';color:#fff;display:grid;place-items:center;font-weight:800">Button</div><div style="width:110px;height:44px;border-radius:' + (getP(C, 'theme.radius') == null ? 10 : getP(C, 'theme.radius')) + 'px;background:' + (getP(C, 'theme.accent2') || '#333') + ';color:#fff;display:grid;place-items:center;font-weight:800">Second</div></div>');
    },

    controls: function () {
      var m = C.maintenance || {};
      return card('🔧 Maintenance mode', '<p class="bk-mut" style="margin:0 0 8px">Shows a full-screen “we’ll be right back” to owners and staff (you can still work). The public website stays readable.</p><div class="bk-checks">' + fld('Maintenance mode is ON', 'maintenance.on', 'check') + '</div><div class="bk-grid2">' + fld('Who is blocked', 'maintenance.scope', 'select', { options: [['all', 'Dashboard + POS + stores'], ['dashboard', 'Dashboard only'], ['pos', 'POS only'], ['store', 'Online stores only']], def: 'all' }) + fld('Expected back (text)', 'maintenance.eta', 'text', { max: 60, ph: 'e.g. 3:00 PM today' }) + '</div>' + fld('Title', 'maintenance.title', 'text', { max: 80 }) + fld('Message', 'maintenance.message', 'area', { rows: 2, max: 400 }))
        + card('🚪 New sign-ups', '<div class="bk-checks">' + fld('Allow new sign-ups', 'signups.open', 'check', { def: true }) + '</div>' + fld('Message shown when closed', 'signups.message', 'text', { max: 200, ph: 'We’re full this week — back on Monday!' }))
        + card('⏱ Free trial', fld('Trial length (days)', 'trialDays', 'number', { min: 1, max: 90 }));
    },

    owners: function () {
      var o = S.owners; if (!o) return empty('Loading owners…'); var now = Date.now(), q = S.ownersQ.toLowerCase();
      var rows = o.filter(function (u) { return !u.isStaff; }).filter(function (u) {
        var active = u.status === 'active' && Date.parse(u.subExpires || 0) > now, trial = (u.status === 'trial' || u.status === 'pending_card') && Date.parse(u.trialEnds || 0) > now;
        if (S.ownersF === 'active' && !active) return false; if (S.ownersF === 'trial' && !trial) return false; if (S.ownersF === 'expired' && (active || trial)) return false; if (S.ownersF === 'suspended' && u.status !== 'suspended') return false;
        return !q || [u.businessName, u.email, u.username, u.name].join(' ').toLowerCase().indexOf(q) > -1;
      }).sort(function (a, b) { return Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0); });
      var fmt = function (iso) { return iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
      var h = '<div class="bk-row" style="margin-bottom:10px"><input id="bk-oq" class="bk-q" placeholder="🔍 Search business, email or username…" value="' + esc(S.ownersQ) + '"><select id="bk-of" class="bk-sel">' + [['all', 'All'], ['trial', 'On trial'], ['active', 'Paying'], ['expired', 'Expired'], ['suspended', 'Suspended']].map(function (x) { return '<option value="' + x[0] + '"' + (S.ownersF === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>' + btn('↻ Refresh', 'owners-load') + '<span class="bk-mut">' + rows.length + ' owner' + (rows.length === 1 ? '' : 's') + '</span></div>';
      h += '<div class="bk-card"><div class="bk-tw"><table class="bk-t"><thead><tr><th>Business</th><th>Contact</th><th>Plan</th><th>Status</th><th>Ends</th><th>Joined</th><th>Actions</th></tr></thead><tbody>';
      rows.slice(0, 200).forEach(function (u) {
        var active = u.status === 'active' && Date.parse(u.subExpires || 0) > now, ends = u.status === 'active' ? u.subExpires : u.trialEnds;
        h += '<tr><td><b>' + esc(u.businessName || u.name || '—') + '</b><br><small>' + esc(u.username) + '</small></td><td>' + esc(u.email || '') + '<br><small>' + esc(u.phone || '') + '</small></td><td>' + esc(u.plan || '') + '</td><td><span class="bk-pill ' + (active ? 'g' : u.status === 'suspended' ? 'r' : 'y') + '">' + esc(u.status || '') + '</span></td><td>' + fmt(ends) + '</td><td>' + fmt(u.createdAt) + '</td>'
          + '<td style="white-space:nowrap">' + btn('+7d trial', 'own-trial', 'data-k="' + esc(u.key) + '"', 'sm') + btn('Grant plan…', 'own-grant', 'data-k="' + esc(u.key) + '"', 'sm') + (u.status === 'suspended' ? btn('Activate', 'own-act', 'data-k="' + esc(u.key) + '"', 'sm') : btn('Suspend', 'own-sus', 'data-k="' + esc(u.key) + '"', 'sm danger')) + '<a class="bk-b sm" target="_blank" rel="noopener" href="/store?store=' + encodeURIComponent(u.username) + '">Store ↗</a></td></tr>';
      });
      return h + (rows.length ? '' : '<tr><td colspan="7" class="bk-empty">No owners match.</td></tr>') + '</tbody></table></div></div>';
    },

    inbox: function () {
      var m = S.msgs; if (!m) return empty('Loading messages…'); if (!m.length) return empty('No messages yet. Messages from your Contact page appear here (and in your email).');
      return m.map(function (x) { return '<div class="bk-card' + (x.read ? '' : ' unread') + '"><div class="bk-ch"><h3>' + esc(x.name) + ' <small>&lt;' + esc(x.email) + '&gt;' + (x.phone ? ' · ' + esc(x.phone) : '') + '</small></h3><span class="bk-mut">' + esc(x.topic || '') + ' · ' + new Date(x.at).toLocaleString() + '</span></div><p style="white-space:pre-wrap;margin:0 0 10px;font-size:13px;line-height:1.6">' + esc(x.message) + '</p><div class="bk-row"><a class="bk-b pri sm" href="mailto:' + esc(x.email) + '?subject=' + encodeURIComponent('Re: ' + (x.topic || 'your message')) + '">↩ Reply by email</a>' + btn(x.read ? 'Mark unread' : 'Mark read', 'msg-read', 'data-id="' + esc(x.id) + '" data-r="' + (x.read ? 0 : 1) + '"', 'sm') + btn('🗑 Delete', 'msg-del', 'data-id="' + esc(x.id) + '"', 'sm danger') + '</div></div>'; }).join('');
    },

    history: function () {
      var hs = S.hist, au = S.aud, h = '';
      if (S.sched) h += card('⏰ Scheduled release', '<p>Goes live <b>' + esc(new Date(S.sched.at).toLocaleString()) + '</b></p>' + btn('Cancel schedule', 'cancelsched', '', 'sm danger'));
      h += card('Releases (every “Run”)', !hs ? empty('Loading…') : !hs.length ? empty('No releases yet. Press ▶ Run to publish your first.') : '<div class="bk-tw"><table class="bk-t"><thead><tr><th>Version</th><th>When</th><th>Note</th><th></th></tr></thead><tbody>' + hs.map(function (r, i) { return '<tr><td><b>v' + r.version + '</b>' + (i === 0 ? ' <span class="bk-pill g">live</span>' : '') + '</td><td>' + esc(new Date(r.at).toLocaleString()) + '</td><td>' + esc(r.note || '') + '</td><td>' + (i === 0 ? '' : btn('↶ Roll back to this', 'rollback', 'data-id="' + esc(r.id) + '" data-v="' + r.version + '"', 'sm')) + '</td></tr>'; }).join('') + '</tbody></table></div>', 'Rolling back publishes that older version again as a new release.');
      h += card('Activity log', !au ? empty('Loading…') : '<div class="bk-log">' + au.map(function (a) { return '<div><small>' + esc(new Date(a.at).toLocaleString()) + '</small> <b>' + esc(a.action) + '</b> ' + esc(a.note || '') + '</div>'; }).join('') + '</div>');
      return h;
    },
  };

  /* ───────── render + events ───────── */
  function render() {
    var b = $('bk-body'); if (!b || !C) return; var sc = b.scrollTop;
    b.innerHTML = VIEWS[S.tab](); D.querySelectorAll('.bk-tab').forEach(function (t) { t.classList.toggle('on', t.getAttribute('data-v') === S.tab); }); runbar();
  }
  function go(tab) { S.tab = tab; if (tab === 'owners') loadOwners(); if (tab === 'inbox') loadMsgs(); if (tab === 'history') loadHist(); if (tab === 'overview' && !S.owners) loadOwners(); render(); }
  function loadOwners() { return post('/api/auth', { action: 'admin-users' }).then(function (j) { S.owners = j.ok ? j.users : []; if (S.tab === 'owners' || S.tab === 'overview') render(); }); }
  function loadMsgs() { return plat({ action: 'messages' }).then(function (j) { S.msgs = j.ok ? j.items : []; badge(); if (S.tab === 'inbox' || S.tab === 'overview') render(); }); }
  function loadHist() { S.hist = null; S.aud = null; return Promise.all([plat({ action: 'history' }), plat({ action: 'audit' }), plat({ action: 'state' })]).then(function (r) { S.hist = r[0].ok ? r[0].items : []; S.aud = r[1].ok ? r[1].items : []; S.sched = r[2].ok ? r[2].scheduled : null; if (S.tab === 'history') render(); runbar(); }); }
  function badge() { var n = (S.msgs || []).filter(function (m) { return !m.read; }).length, t = $('bk-nav-badge'); if (t) { t.textContent = n ? n : ''; t.style.display = n ? '' : 'none'; } }

  /* config values that the UI edits as text but the server stores as arrays */
  function normalise() {
    PLANS.forEach(function (p) { var o = (C.plans || {})[p[0]]; if (!o) return; if (o.featuresText !== undefined) { o.features = String(o.featuresText).split('\n').map(function (x) { return x.trim(); }).filter(Boolean); } else if (o.features && o.featuresText === undefined) o.featuresText = o.features.join('\n'); ['monthly', 'annual'].forEach(function (k) { if (o[k] === '' || o[k] == null || isNaN(o[k])) delete o[k]; else o[k] = Number(o[k]); }); });
    (C.pages || []).forEach(function (pg) { (pg.blocks || []).forEach(function (b) { if (b.type === 'list') { if (b.itemsText !== undefined) b.items = String(b.itemsText).split('\n').map(function (x) { return x.trim(); }).filter(Boolean); else if (b.items) b.itemsText = b.items.join('\n'); } }); });
    ['stats', 'reviews'].forEach(function (k) { if (C.site && C.site[k]) C.site[k] = C.site[k].filter(function (x) { return x && (x.value || x.text || x.label || x.name); }); });
  }
  function prep() { PLANS.forEach(function (p) { var o = (C.plans || {})[p[0]]; if (o && o.features) o.featuresText = o.features.join('\n'); }); (C.pages || []).forEach(function (pg) { (pg.blocks || []).forEach(function (b) { if (b.type === 'list') b.itemsText = (b.items || []).join('\n'); }); }); C.site = C.site || {}; C.site.stats = C.site.stats || []; C.site.reviews = C.site.reviews || []; }

  function onInput(e) {
    var t = e.target, p = t.getAttribute && t.getAttribute('data-b');
    if (t.id === 'bk-oq') { S.ownersQ = t.value; var pos = t.selectionStart; render(); var n = $('bk-oq'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { } return; }
    if (t.id === 'bk-of') { S.ownersF = t.value; render(); return; }
    if (!p) { var arrp = t.getAttribute && t.getAttribute('data-arr'); if (arrp) { var a = (getP(C, arrp) || []).slice(), v = t.getAttribute('data-val'), i = a.indexOf(v); if (t.checked && i < 0) a.push(v); if (!t.checked && i > -1) a.splice(i, 1); setP(C, arrp, a); touch(); } return; }
    var ty = t.getAttribute('data-t'), v;
    if (ty === 'check') v = t.checked; else if (ty === 'number') v = t.value === '' ? null : Number(t.value); else if (ty === 'dt') v = t.value ? new Date(t.value).toISOString() : ''; else v = t.value;
    var mod = t.getAttribute('data-mod'); if (mod && !(C.modules || {})[mod]) setP(C, 'modules.' + mod, modDef(mod));
    setP(C, p, v); normalise(); touch(); if (t.getAttribute('data-rr')) { var f = D.activeElement; render(); }
    if (p === 'theme.accent' || p === 'theme.accent2' || p === 'theme.radius') { if (S.tab === 'look') { var x = $('bk-body'); } }
  }
  var ACT = {
    goto: function (el) { go(el.getAttribute('data-v')); },
    modmove: function (el) { var list = moduleList().filter(function (m) { return m.group === el.getAttribute('data-g'); }), id = el.getAttribute('data-id'), d = Number(el.getAttribute('data-d')), i = list.findIndex(function (m) { return m.id === id; }), j = i + d; if (j < 0 || j >= list.length) return; list.forEach(function (m, k) { var o = modDef(m.id), cur = o.order == null ? k * 10 + 5 : o.order; if (!(C.modules || {})[m.id]) setP(C, 'modules.' + m.id, modDef(m.id)); C.modules[m.id].order = k * 10; }); var a = C.modules[list[i].id].order; C.modules[list[i].id].order = C.modules[list[j].id].order; C.modules[list[j].id].order = a; touch(); render(); },
    'ann-add': function () { (C.announcements = C.announcements || []).unshift({ id: 'a' + rid(), on: true, kind: 'info', title: '', text: '', link: '', linkLabel: '', plans: [], where: ['dashboard'], start: '', end: '', dismissible: true, pct: 100 }); touch(); render(); },
    'ann-del': function (el) { C.announcements.splice(+el.getAttribute('data-i'), 1); touch(); render(); },
    'news-add': function () { (C.whatsNew = C.whatsNew || []).unshift({ id: 'w' + rid(), date: new Date().toISOString().slice(0, 10), title: '', body: '', tag: 'NEW', link: '', image: '' }); touch(); render(); },
    'news-del': function (el) { C.whatsNew.splice(+el.getAttribute('data-i'), 1); touch(); render(); },
    'news-move': function (el) { var i = +el.getAttribute('data-i'), j = i + Number(el.getAttribute('data-d')), a = C.whatsNew; if (j < 0 || j >= a.length) return; var x = a.splice(i, 1)[0]; a.splice(j, 0, x); touch(); render(); },
    'news-img': function (el) { var i = +el.getAttribute('data-i'); pickImage(function (d) { C.whatsNew[i].image = d; touch(); render(); }); },
    'news-imgx': function (el) { C.whatsNew[+el.getAttribute('data-i')].image = ''; touch(); render(); },
    'page-sel': function (el) { S.page = +el.getAttribute('data-i'); render(); },
    'page-add': function () { (C.pages = C.pages || []).push({ id: 'p' + rid(), on: true, title: 'New page', icon: '📄', group: 'Resources', plans: [], pct: 100, blocks: [{ type: 'heading', text: 'Welcome', level: 2 }, { type: 'text', text: 'Write something helpful here.' }] }); S.page = C.pages.length - 1; touch(); render(); },
    'page-del': function () { if (!confirm('Delete this page?')) return; C.pages.splice(S.page, 1); S.page = 0; touch(); render(); },
    'blk-add': function (el) { var t = el.getAttribute('data-t'), b = { type: t }; if (t === 'heading') { b.text = 'Heading'; b.level = 2; } if (t === 'text') b.text = 'Your text…'; if (t === 'button') { b.label = 'Open'; b.link = 'https://'; b.style = 'solid'; } if (t === 'list') { b.items = ['First point', 'Second point']; b.style = 'bullets'; b.itemsText = 'First point\nSecond point'; } if (t === 'callout') { b.text = 'Tip: …'; b.kind = 'info'; } if (t === 'faq') b.items = [{ q: 'Question?', a: 'Answer.' }]; if (t === 'video' || t === 'embed') b.url = ''; if (t === 'image') b.src = ''; C.pages[S.page].blocks.push(b); touch(); render(); },
    'blk-del': function (el) { C.pages[S.page].blocks.splice(+el.getAttribute('data-i'), 1); touch(); render(); },
    'blk-move': function (el) { var a = C.pages[S.page].blocks, i = +el.getAttribute('data-i'), j = i + Number(el.getAttribute('data-d')); if (j < 0 || j >= a.length) return; var x = a.splice(i, 1)[0]; a.splice(j, 0, x); touch(); render(); },
    'blk-img': function (el) { var i = +el.getAttribute('data-i'); pickImage(function (d) { C.pages[S.page].blocks[i].src = d; touch(); render(); }); },
    'faq-add': function (el) { C.pages[S.page].blocks[+el.getAttribute('data-i')].items.push({ q: '', a: '' }); touch(); render(); },
    'sitefaq-add': function () { C.site.faq = C.site.faq || []; C.site.faq.push({ q: '', a: '' }); touch(); render(); },
    'theme-reset': function () { C.theme = { accent: '', accent2: '', radius: null }; touch(); render(); },
    'owners-load': function () { S.owners = null; render(); loadOwners(); },
    'own-trial': function (el) { var k = el.getAttribute('data-k'), u = S.owners.find(function (x) { return x.key === k; }); var base = Math.max(Date.now(), Date.parse(u.trialEnds || 0) || 0); ownerSet(k, { status: 'trial', trialEnds: new Date(base + 7 * 864e5).toISOString() }, '+7 days of trial added'); },
    'own-grant': function (el) {
      var k = el.getAttribute('data-k'); openModal('<h3>Grant a plan</h3><p class="bk-mut">Give this owner a paid plan without payment (for partners, refunds or goodwill).</p><div class="bk-grid2"><label class="bk-f"><span>Plan</span><select id="bk-gp">' + PLANS.map(function (p) { return '<option value="' + p[0] + '">' + p[1] + '</option>'; }).join('') + '</select></label><label class="bk-f"><span>For how long</span><select id="bk-gd"><option value="30">30 days</option><option value="90">90 days</option><option value="180">6 months</option><option value="365">1 year</option></select></label></div><div class="bk-row"><button class="bk-b pri" id="bk-gok">Grant</button><button class="bk-b" id="bk-cx">Cancel</button></div>', function () { $('bk-cx').onclick = closeModal; $('bk-gok').onclick = function () { closeModal(); ownerSet(k, { plan: $('bk-gp').value, status: 'active', subExpires: new Date(Date.now() + Number($('bk-gd').value) * 864e5).toISOString() }, 'Plan granted'); }; });
    },
    'own-sus': function (el) { if (!confirm('Suspend this owner? They will be locked out until you activate them.')) return; ownerSet(el.getAttribute('data-k'), { status: 'suspended' }, 'Suspended'); },
    'own-act': function (el) { var k = el.getAttribute('data-k'), u = S.owners.find(function (x) { return x.key === k; }); var p = Date.parse(u.subExpires || 0) > Date.now() ? { status: 'active' } : { status: 'trial', trialEnds: new Date(Date.now() + 7 * 864e5).toISOString() }; ownerSet(k, p, 'Activated'); },
    'msg-read': function (el) { var id = el.getAttribute('data-id'), r = el.getAttribute('data-r') === '1'; plat({ action: 'message-set', id: id, read: r }).then(function () { (S.msgs.find(function (m) { return m.id === id; }) || {}).read = r; badge(); render(); }); },
    'msg-del': function (el) { if (!confirm('Delete this message?')) return; var id = el.getAttribute('data-id'); plat({ action: 'message-delete', id: id }).then(function () { S.msgs = S.msgs.filter(function (m) { return m.id !== id; }); badge(); render(); }); },
    rollback: function (el) { if (!confirm('Roll back to version ' + el.getAttribute('data-v') + '? It goes live for everyone straight away.')) return; plat({ action: 'rollback', id: el.getAttribute('data-id') }).then(function (j) { if (!j.ok) return say('❌ ' + j.error); say('↶ Rolled back — now live as version ' + j.version); load(true); }); },
    cancelsched: function () { plat({ action: 'cancel-schedule' }).then(function () { S.sched = null; say('Schedule cancelled'); runbar(); if (S.tab === 'history') render(); }); },
  };
  function ownerSet(key, patch, okMsg) { post('/api/auth', { action: 'admin-user-set', key: key, patch: patch }).then(function (j) { if (!j.ok) return say('❌ ' + (j.error || 'Failed')); say('✅ ' + okMsg); var u = S.owners.find(function (x) { return x.key === key; }); if (u) Object.assign(u, patch); render(); }); }
  function onClick(e) {
    var el = e.target.closest('[data-a]'); if (!el) return; var a = el.getAttribute('data-a'); if (ACT[a]) { e.preventDefault(); ACT[a](el); }
  }

  /* ───────── load + mount ───────── */
  function load(keepTab) {
    return plat({ action: 'state' }).then(function (j) {
      if (!j.ok) { var b = $('bk-body'); if (b) b.innerHTML = empty('❌ ' + esc(j.error || 'Could not load the Backend. Are you logged in as admin?')); return; }
      S.pub = j.published.config; S.pubVersion = j.published.version; S.sched = j.scheduled; C = clone(j.draft ? j.draft.config : j.published.config); S.dirty = j.dirty; prep();
      fetch('/api/paystack?action=plans').then(function (r) { return r.json(); }).then(function (p) { S.plansLive = p.plans || {}; if (S.tab === 'plans' || S.tab === 'overview') render(); }).catch(function () { });
      status(j.dirty ? 'Draft saved · not live yet' : 'Draft equals live'); render();
    });
  }
  function previewDialog() {
    flush().then(function (ok) {
      if (!ok) return;
      openModal('<h3>👁 Preview your draft</h3><p class="bk-mut">Opens your own dashboard showing the <b>draft</b> exactly as an owner would see it. Only you see this; nobody else is affected. Use the purple bar at the top to exit.</p><label class="bk-f"><span>See it as an owner on the…</span><select id="bk-pp">' + PLANS.map(function (p) { return '<option value="' + p[0] + '">' + p[1] + ' plan</option>'; }).join('') + '</select></label><div class="bk-row"><button class="bk-b pri" id="bk-pgo">Start preview</button><button class="bk-b" id="bk-cx">Cancel</button></div>', function () { $('bk-cx').onclick = closeModal; $('bk-pgo').onclick = function () { L.setItem('qcp_prev', '1'); L.setItem('qcp_prev_plan', $('bk-pp').value); location.reload(); }; });
    });
  }
  var CSS = '.bk{max-width:1180px}.bk-run{position:sticky;top:56px;z-index:30;background:#0a1f44;color:#fff;border-radius:16px;padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px;box-shadow:0 10px 30px rgba(10,31,68,.25)}.bk-run .grow{flex:1;min-width:160px}.bk-run small{display:block;opacity:.7;font-size:11px}.bk-chip{font-size:12px;font-weight:800;padding:5px 12px;border-radius:99px}.bk-chip.ok{background:#0a8a5a}.bk-chip.warn{background:#ff5a1f}#bk-sch a{color:#ffb08a}'
    + '.bk-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}.bk-tab{border:1px solid var(--border,#e3e9f5);background:#fff;padding:9px 14px;border-radius:12px;font-weight:700;font-size:12px;cursor:pointer;color:#3b4a6b;position:relative}.bk-tab.on{background:#ff5a1f;border-color:#ff5a1f;color:#fff}#bk-nav-badge{display:none;margin-left:6px;background:#c0392b;color:#fff;font-size:9px;font-weight:800;padding:1px 6px;border-radius:99px}'
    + '.bk-card{background:#fff;border:1px solid var(--border,#e3e9f5);border-radius:16px;padding:18px 20px;margin-bottom:14px}.bk-card.unread{border-color:#ff5a1f;box-shadow:0 0 0 3px rgba(255,90,31,.1)}.bk-ch{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px}.bk-ch h3{font-size:16px;margin:0;font-weight:800}.bk-ch h3 small{font-weight:500;color:#8a96b0;font-size:12px}.bk-ch p{width:100%;margin:2px 0 0;color:#6b7a99;font-size:12px}'
    + '.bk-f{display:grid;gap:5px;margin-bottom:10px}.bk-f span{font-size:11px;font-weight:700;color:#3b4a6b}.bk-f small{color:#8a96b0;font-size:11px}.bk-f input,.bk-f select,.bk-f textarea,.bk-t input,.bk-t select,.bk-q,.bk-sel{padding:9px 11px;border:1px solid var(--border,#d9e0ee);border-radius:10px;font-size:13px;font-family:inherit;background:#fff;width:100%;box-sizing:border-box;color:#0a1f44}.bk-f textarea{resize:vertical}.bk-f input:focus,.bk-f textarea:focus,.bk-f select:focus,.bk-t input:focus{outline:none;border-color:#ff5a1f;box-shadow:0 0 0 3px rgba(255,90,31,.12)}'
    + '.bk-grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.bk-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.bk-grid3 .bk-card{margin:0}.bk-grid3 .bk-grid3{gap:0 12px}.bk-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.bk-chk{display:inline-flex;gap:7px;align-items:center;font-size:13px;font-weight:600;margin:0 14px 8px 0;cursor:pointer}.bk-checks{display:flex;flex-wrap:wrap;margin-bottom:8px}.bk-sub{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#6b7a99;margin:6px 0}.bk-sub small{text-transform:none;letter-spacing:0;font-weight:500}'
    + '.bk-b{border:1px solid var(--border,#d9e0ee);background:#fff;color:#0a1f44;padding:9px 16px;border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;text-decoration:none;display:inline-block;font-family:inherit}.bk-b:hover:not(:disabled){border-color:#ff5a1f}.bk-b.sm{padding:6px 11px;font-size:11px;margin-right:4px}.bk-b.pri{background:linear-gradient(135deg,#ff5a1f,#ff8a3d);color:#fff;border:0;box-shadow:0 8px 18px rgba(255,90,31,.3)}.bk-b.danger{color:#c0392b}.bk-b:disabled{opacity:.45;cursor:not-allowed}.bk-run .bk-b{border:0}.bk-run .bk-b.go{background:linear-gradient(135deg,#ff5a1f,#ff8a3d);color:#fff;font-size:14px;padding:11px 24px}'
    + '.bk-tw{overflow:auto}.bk-t{width:100%;border-collapse:collapse;font-size:12px}.bk-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6b7a99;padding:8px 6px;border-bottom:1px solid var(--border,#e3e9f5);white-space:nowrap}.bk-t td{padding:8px 6px;border-bottom:1px solid #f0f3fa;vertical-align:middle}.bk-t small{color:#8a96b0}.bk-t input,.bk-t select{padding:6px 8px;min-width:80px}'
    + '.bk-sw{position:relative;display:inline-block;width:42px;height:24px}.bk-sw input{opacity:0;width:0;height:0;position:absolute}.bk-sw i{position:absolute;inset:0;background:#cbd5e6;border-radius:99px;transition:.2s;cursor:pointer}.bk-sw i::after{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.2s;box-shadow:0 2px 4px rgba(0,0,0,.2)}.bk-sw input:checked+i{background:#0a8a5a}.bk-sw input:checked+i::after{transform:translateX(18px)}'
    + '.bk-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}.bk-kpis div{background:#fff;border:1px solid var(--border,#e3e9f5);border-radius:14px;padding:14px}.bk-kpis small{color:#6b7a99;font-size:11px;font-weight:700}.bk-kpis b{display:block;font-size:24px;margin-top:4px;letter-spacing:-.03em}'
    + '.bk-mut{color:#6b7a99;font-size:12.5px;line-height:1.6}.bk-how{margin:0;padding-left:20px;line-height:1.9;font-size:13px;color:#3b4a6b}.bk-empty{padding:26px;text-align:center;color:#6b7a99;font-size:13px;background:#fff;border:1px dashed #d9e0ee;border-radius:14px}.bk-blk{border:1px solid #e8edf7;border-radius:12px;padding:12px 14px;margin-bottom:10px;background:#fbfcff}.bk-bh{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:12px}'
    + '.bk-pill{font-size:10px;font-weight:800;padding:3px 9px;border-radius:99px}.bk-pill.g{background:#e6f7ef;color:#0a8a5a}.bk-pill.y{background:#fff4d6;color:#7a5200}.bk-pill.r{background:#ffecec;color:#c0392b}.bk-log{max-height:300px;overflow:auto;font-size:12px;line-height:1.9}.bk-log small{color:#8a96b0;margin-right:6px}.bk-flags{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:2px 16px}.bk-q{flex:1;min-width:200px}.bk-sel{width:auto}'
    + '.bk-ov{position:fixed;inset:0;background:rgba(6,20,51,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px)}.bk-mod{background:#fff;border-radius:20px;padding:24px 26px;max-width:480px;width:100%;box-shadow:0 30px 80px rgba(0,0,0,.4);max-height:90vh;overflow:auto}.bk-mod h3{margin:0 0 8px;font-size:19px}.bk-sum{background:#f6f8fd;border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.8;margin:10px 0 14px}'
    + '@media(max-width:900px){.bk-grid3,.bk-grid2{grid-template-columns:1fr}.bk-run{top:0}}';

  function init() {
    if (!isAdmin() || $('p-backend')) return; var anchor = $('p-customers'); if (!anchor) return;
    var st = D.createElement('style'); st.textContent = CSS; D.head.appendChild(st);
    anchor.insertAdjacentHTML('afterend', '<div class="panel" id="p-backend"><div class="bk"><div class="ptitle">🛠 Backend</div><div class="psub">Control the whole platform — features, prices, announcements, pages and your website — without touching code. Only you can see this.</div>'
      + '<div class="bk-run"><span id="bk-chip" class="bk-chip ok">…</span><div class="grow"><b id="bk-ver">…</b><small><span id="bk-st">Loading…</span> <span id="bk-sch"></span></small></div>'
      + '<button class="bk-b" id="bk-prev">👁 Preview</button><button class="bk-b" id="bk-disc">↩ Discard draft</button><button class="bk-b go" id="bk-run" disabled>▶ Run — push live</button></div>'
      + '<div class="bk-tabs" id="bk-tabs">' + TABS.map(function (t) { return '<button class="bk-tab" data-v="' + t[0] + '">' + t[1] + (t[0] === 'inbox' ? '<span id="bk-nav-badge"></span>' : '') + '</button>'; }).join('') + '</div>'
      + '<div id="bk-body"><div class="bk-empty">Loading…</div></div><input type="file" id="bk-file" accept="image/*" style="display:none"></div></div>');
    var nav = Array.prototype.filter.call(D.querySelectorAll('.sb'), function (e) { return (e.getAttribute('onclick') || '').indexOf("go('dashboard'") > -1; })[0];
    if (nav) nav.insertAdjacentHTML('afterend', '<div class="sb" id="bk-nav" onclick="go(\'backend\',this)" style="color:var(--accent);font-weight:800">🛠 Backend</div>');
    var body = $('bk-body'); body.addEventListener('input', onInput); body.addEventListener('change', onInput); body.addEventListener('click', onClick); $('bk-run').parentNode.addEventListener('click', onClick);
    $('bk-tabs').addEventListener('click', function (e) { var t = e.target.closest('.bk-tab'); if (t) go(t.getAttribute('data-v')); });
    $('bk-run').onclick = runDialog; $('bk-prev').onclick = previewDialog;
    $('bk-disc').onclick = function () { if (!S.dirty && !diffSummary().length) return say('Nothing to discard'); if (!confirm('Discard all unpublished changes and go back to what is live?')) return; plat({ action: 'discard-draft' }).then(function () { load(true); say('Draft discarded'); }); };
    var g = window.go; window.go = function (n) { var r = g.apply(this, arguments); if (n === 'backend') { load(); loadMsgs(); } return r; };
    var cg = window.canGo; if (typeof cg === 'function') window.canGo = function (n) { return n === 'backend' ? isAdmin() : cg(n); };
    plat({ action: 'messages' }).then(function (j) { if (j.ok) { S.msgs = j.items; badge(); var nb = $('bk-nav'); if (nb && j.unread) nb.insertAdjacentHTML('beforeend', ' <span class="qcp-badge" style="background:#c0392b">' + j.unread + '</span>'); } });
  }
  window.QCBackend = { _S: S, _C: function () { return C; }, init: init, go: go, flush: flush };
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init); else init();
})();
