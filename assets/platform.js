/* QuickCart — Platform runtime.
   Loaded by the owner dashboard, POS, storefront and the public website. It fetches the config the platform admin published
   from the Backend (/api/platform) and applies it live: feature on/off & plan locks, renamed menu items, badges, custom pages,
   announcements, "What's new", maintenance mode, theme, and website text. Polls every minute, so a "Run" reaches everyone
   without a reload. The platform admin can preview the unpublished DRAFT (Backend → Preview). */
(function () {
  'use strict';
  if (window.QCPlatform) return;
  var L = localStorage, D = document, RANK = { starter: 1, pro: 2, enterprise: 3, premium: 3 }, PLAN_NAME = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' };
  var HIDDEN_MODS = { dashboard: 1, settings: 1, subs: 1, launch: 1, backend: 1, myplan: 1, whatsnew: 1 };
  var cfg = null, ver = -1, api = {}, listeners = [], plansCache = null;
  try { var c = JSON.parse(L.getItem('qcp_cfg') || 'null'); if (c && c.config) { cfg = c.config; ver = c.version; } } catch (e) { }

  var path = location.pathname.toLowerCase();
  var CTX = D.querySelector('aside.sidebar') ? 'dashboard' : (/pos(\.html)?$/.test(path) || D.getElementById('cobtn')) ? 'pos' : /shop(\.html)?$|^\/store/.test(path) ? 'store' : 'site';
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var isAdmin = function () { return L.getItem('qc_logged_user') === 'admin' && L.getItem('qc_is_staff') !== '1'; };
  var preview = function () { return isAdmin() && L.getItem('qcp_prev') === '1'; };
  var userPlan = function () { if (preview() && L.getItem('qcp_prev_plan')) return L.getItem('qcp_prev_plan'); if (isAdmin()) return 'enterprise'; return String(L.getItem('qc_sub_plan') || 'starter').toLowerCase(); };
  var rank = function (p) { return RANK[p] || 1; };
  function hashPct(id, pct) {   // stable per owner: the same owner always lands on the same side of a rollout percentage
    if (pct == null || pct >= 100) return true; if (pct <= 0) return false;
    var s = (L.getItem('qc_logged_user') || 'x') + ':' + id, h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 100 < pct;
  }
  var planOk = function (list) { return !list || !list.length || list.indexOf(userPlan()) > -1; };

  /* ───────── fetching ───────── */
  function authHeader() { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (L.getItem('qc_token') || '') }; }
  function fetchCfg(force) {
    var p;
    if (preview()) p = fetch('/api/platform', { method: 'POST', headers: authHeader(), body: JSON.stringify({ action: 'draft' }) }).then(function (r) { return r.json(); }).then(function (j) { return j.ok ? { config: j.config, version: 'draft' } : null; });
    else p = fetch('/api/platform' + (force || ver < 0 ? '' : '?v=' + ver), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) { return j.ok && !j.same ? { config: j.config, version: j.version } : null; });
    return p.then(function (r) {
      if (!r) return false; var changed = JSON.stringify(r.config) !== JSON.stringify(cfg);
      cfg = r.config; ver = r.version; if (!preview()) { try { L.setItem('qcp_cfg', JSON.stringify({ version: ver, config: cfg })); } catch (e) { } }
      if (changed || force) applyAll(); return changed;
    }).catch(function (e) { try { console.error('QCPlatform:', e && e.stack || e); } catch (x) { } return false; });
  }
  function loadPlans() {
    if (plansCache) return Promise.resolve(plansCache);
    return fetch('/api/paystack?action=plans', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) { plansCache = j.plans || {}; window.QC_PLANS = plansCache; return plansCache; }).catch(function () { return {}; });
  }

  /* ───────── shared bits ───────── */
  function css(id, text) { var s = D.getElementById(id); if (!s) { s = D.createElement('style'); s.id = id; D.head.appendChild(s); } s.textContent = text; }
  function el(tag, cls, html) { var n = D.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  var STYLE = '.qcp-badge{font-size:8px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:2px 6px;border-radius:99px;margin-left:auto;background:#ff5a1f;color:#fff}.qcp-badge.b-beta{background:#7c3aed}.qcp-badge.b-soon{background:#6b7280}.qcp-badge.b-pro{background:#0a1f44}.qcp-badge.b-off{background:#c0392b}'
    + '.sb.qcp-locked{opacity:.62}.qcp-lock{margin-left:auto;font-size:10px}'
    + '#qcp-ann{display:grid;gap:0}.qcp-bar{display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;padding:10px 18px;font-size:13px;line-height:1.45;text-align:center;font-family:inherit}'
    + '.qcp-bar.k-info{background:#e8f0ff;color:#123a8c}.qcp-bar.k-success{background:#e6f7ef;color:#0a6b46}.qcp-bar.k-warning{background:#fff4d6;color:#7a5200}.qcp-bar.k-promo{background:linear-gradient(90deg,#ff5a1f,#ff8a3d);color:#fff}'
    + '.qcp-bar a{font-weight:800;text-decoration:underline;color:inherit}.qcp-bar button{border:0;background:rgba(0,0,0,.12);color:inherit;width:22px;height:22px;border-radius:50%;cursor:pointer;font-size:13px;line-height:1}'
    + '.qcp-pos-ann{position:fixed;left:14px;bottom:14px;z-index:9200;max-width:340px;border-radius:14px;box-shadow:0 16px 40px rgba(0,0,0,.25)}'
    + '.qcp-ov{position:fixed;inset:0;z-index:2147483000;background:rgba(6,20,51,.92);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px)}'
    + '.qcp-card{background:#fff;color:#0a1f44;border-radius:24px;max-width:520px;width:100%;padding:34px 30px;text-align:center;box-shadow:0 40px 100px rgba(0,0,0,.5);font-family:inherit;max-height:90vh;overflow:auto}'
    + '.qcp-card h2{font-size:26px;font-weight:800;margin:10px 0 8px;letter-spacing:-.03em}.qcp-card p{color:#5b6b8c;line-height:1.65;font-size:15px;margin:0 0 16px;white-space:pre-line}'
    + '.qcp-btn{display:inline-block;border:0;background:linear-gradient(135deg,#ff5a1f,#ff8a3d);color:#fff;padding:12px 24px;border-radius:99px;font-weight:800;font-size:14px;cursor:pointer;text-decoration:none;font-family:inherit}.qcp-btn.ghost{background:#eef2fa;color:#0a1f44}'
    + '.qcp-prev{position:fixed;top:0;left:0;right:0;z-index:2147482000;background:#7c3aed;color:#fff;font:700 12px/1 system-ui,sans-serif;padding:8px 14px;text-align:center}.qcp-prev button{margin-left:10px;border:0;background:#fff;color:#7c3aed;border-radius:99px;padding:4px 12px;font-weight:800;cursor:pointer}'
    + '.qcp-pg{max-width:780px}.qcp-pg h2{font-size:24px;margin:22px 0 8px}.qcp-pg h3{font-size:18px;margin:18px 0 6px}.qcp-pg p{line-height:1.75;color:#3b4a6b;margin:0 0 12px;font-size:14px;white-space:pre-line}.qcp-pg img{max-width:100%;border-radius:14px;display:block;margin:10px 0}.qcp-pg figcaption{font-size:12px;color:#8a96b0}'
    + '.qcp-pg ul,.qcp-pg ol{margin:0 0 14px;padding-left:22px;line-height:1.8;font-size:14px;color:#3b4a6b}.qcp-pg ul.checks{list-style:none;padding-left:0}.qcp-pg ul.checks li::before{content:"✓";color:#0a8a5a;font-weight:900;margin-right:8px}'
    + '.qcp-pg .vid{position:relative;aspect-ratio:16/9;border-radius:14px;overflow:hidden;margin:12px 0;background:#000}.qcp-pg iframe{border:0;width:100%;height:100%;position:absolute;inset:0}.qcp-pg .emb{margin:12px 0}.qcp-pg .emb iframe{position:static;border-radius:14px}'
    + '.qcp-pg .co{border-radius:14px;padding:14px 18px;margin:12px 0;font-size:14px;line-height:1.6}.qcp-pg hr{border:0;border-top:1px solid #e3e9f5;margin:20px 0}'
    + '.qcp-pg .fq{border:1px solid #e3e9f5;border-radius:12px;margin:8px 0;overflow:hidden;background:#fff}.qcp-pg .fq b{display:block;padding:13px 16px;cursor:pointer;font-size:14px}.qcp-pg .fq div{display:none;padding:0 16px 14px;color:#5b6b8c;font-size:13px;line-height:1.7}.qcp-pg .fq.on div{display:block}'
    + '.qcp-pg a.qb{display:inline-block;margin:8px 8px 8px 0;padding:11px 22px;border-radius:99px;font-weight:800;font-size:14px;text-decoration:none;background:linear-gradient(135deg,#ff5a1f,#ff8a3d);color:#fff}.qcp-pg a.qb.ghost{background:#eef2fa;color:#0a1f44}'
    + '.qcp-wn{border:1px solid #e3e9f5;border-radius:16px;padding:18px 20px;margin-bottom:12px;background:#fff}.qcp-wn small{color:#8a96b0;font-size:11px;font-weight:700}.qcp-wn h3{margin:4px 0 6px;font-size:17px}.qcp-wn p{margin:0;font-size:13.5px;line-height:1.7;color:#4a5878;white-space:pre-line}.qcp-tag{display:inline-block;background:#fff1ea;color:#ff5a1f;font-size:10px;font-weight:800;padding:3px 9px;border-radius:99px;margin-left:8px;text-transform:uppercase}';
  function ensureStyle() { css('qcp-style', STYLE); }
  function link(u, label) { return u ? ' <a href="' + esc(u) + '"' + (/^https?:/i.test(u) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(label || 'Learn more') + '</a>' : ''; }
  function nav(path) { try { (window.parent && window.parent.qcNavigate ? window.parent : window).qcNavigate(path); } catch (e) { location.href = path; } }

  /* ───────── announcements ───────── */
  function activeAnns() {
    var now = Date.now(), ctx = CTX;
    return ((cfg && cfg.announcements) || []).filter(function (a) {
      if (!a.on || (a.where || ['dashboard']).indexOf(ctx) < 0) return false;
      if (a.start && Date.parse(a.start) > now) return false; if (a.end && Date.parse(a.end) < now) return false;
      if (ctx !== 'site' && !planOk(a.plans)) return false; if (!hashPct(a.id, a.pct)) return false;
      return !(a.dismissible !== false && L.getItem('qcp_dis_' + a.id) === '1');
    }).slice(0, 3);
  }
  function applyAnnouncements() {
    var old = D.getElementById('qcp-ann'); if (old) old.remove();
    var list = activeAnns(); var s = cfg && cfg.site && cfg.site.announcement;
    if (CTX === 'site' && s && s.on && s.text) list = [{ id: 'site_bar', kind: 'custom', text: s.text, link: s.link, linkLabel: s.label || 'Learn more', bg: s.bg, dismissible: false }].concat(list);
    if (!list.length) return; ensureStyle();
    var box = el('div'); box.id = 'qcp-ann';
    list.forEach(function (a) {
      var bar = el('div', 'qcp-bar ' + (CTX === 'pos' ? 'qcp-pos-ann ' : '') + (a.kind === 'custom' ? '' : 'k-' + a.kind));
      if (a.kind === 'custom') { bar.style.background = a.bg || '#0a1f44'; bar.style.color = '#fff'; }
      bar.innerHTML = '<span>' + (a.title ? '<b>' + esc(a.title) + '</b> ' : '') + esc(a.text || '') + link(a.link, a.linkLabel) + '</span>' + (a.dismissible !== false && a.kind !== 'custom' ? '<button aria-label="Dismiss">×</button>' : '');
      var b = bar.querySelector('button'); if (b) b.onclick = function () { L.setItem('qcp_dis_' + a.id, '1'); bar.remove(); };
      box.appendChild(bar);
    });
    if (CTX === 'dashboard') { var w = D.querySelector('.wrap'); w.parentNode.insertBefore(box, w); }
    else if (CTX === 'pos' || CTX === 'store') D.body.appendChild(box);
    else D.body.insertBefore(box, D.body.firstChild);
  }

  /* ───────── maintenance ───────── */
  function applyMaintenance() {
    var o = D.getElementById('qcp-maint'); if (o) o.remove(); var strip = D.getElementById('qcp-maint-adm'); if (strip) strip.remove();
    var m = cfg && cfg.maintenance; if (!m || !m.on) return;
    if (m.scope !== 'all' && m.scope !== CTX) return; ensureStyle();
    if (CTX === 'site') { return; }   // the public website stays readable; only the apps are blocked
    if (isAdmin() && !preview()) { var s = el('div', 'qcp-prev', '🔧 Maintenance mode is ON — owners and staff are blocked. You can still work.'); s.id = 'qcp-maint-adm'; s.style.background = '#c0392b'; D.body.appendChild(s); return; }
    var ov = el('div', 'qcp-ov', '<div class="qcp-card"><div style="font-size:54px">🔧</div><h2>' + esc(m.title) + '</h2><p>' + esc(m.message) + '</p>' + (m.eta ? '<p style="font-weight:700;color:#0a1f44">Expected back: ' + esc(m.eta) + '</p>' : '') + '<button class="qcp-btn" onclick="location.reload()">Try again</button></div>'); ov.id = 'qcp-maint'; D.body.appendChild(ov);
  }

  /* ───────── theme + flags ───────── */
  var FLAG_SEL = { 'pos.split': '.pm[onclick*="\'split\'"]', 'pos.card': '.pm[onclick*="\'card\'"]', 'pos.transfer': '.pm[onclick*="\'transfer\'"]', 'pos.scanner': '.scan-cam-btn', 'pos.discount': '#drow, .disc-row' };
  function applyThemeFlags() {
    var t = (cfg && cfg.theme) || {}, v = '';
    if (CTX === 'dashboard') { if (t.accent) v += '--accent:' + t.accent + '!important;--orange:' + t.accent + '!important;'; if (t.accent2) v += '--accent2:' + t.accent2 + '!important;'; if (t.radius != null) v += '--r:' + t.radius + 'px!important;'; }
    if (CTX === 'pos') { if (t.accent) v += '--ac:' + t.accent + '!important;'; if (t.accent2) v += '--ac2:' + t.accent2 + '!important;'; }
    css('qcp-theme', v ? ':root{' + v + '}' : '');
    var h = ''; var fl = (cfg && cfg.flags) || {}; Object.keys(fl).forEach(function (k) { if (fl[k] === false && FLAG_SEL[k]) h += FLAG_SEL[k] + '{display:none!important}'; });
    css('qcp-flags', h);
  }

  /* ───────── dashboard: modules, custom pages, what's new ───────── */
  function sbId(n) { var oc = n.getAttribute('onclick') || '', m = oc.match(/go\('([\w-]+)'/); if (m) return m[1]; if (/openPOS/.test(oc)) return 'pos'; if (/openPageEditor/.test(oc)) return 'pageeditor'; return null; }
  function stateFor(id) {   // → {hidden, locked, m}
    var m = ((cfg && cfg.modules) || {})[id]; if (!m || HIDDEN_MODS[id]) return { m: m, hidden: false, locked: false };
    var hidden = m.on === false || !hashPct(id, m.pct), locked = !hidden && rank(userPlan()) < rank(m.minPlan);
    return { m: m, hidden: hidden, locked: locked };
  }
  var admView = function () { return isAdmin() && !preview(); };   // admin sees everything (tagged) unless previewing
  function blockedMsg(id, st) {
    ensureStyle(); var need = PLAN_NAME[st.m.minPlan] || 'a higher plan', label = (st.m.label || id);
    var msg = st.locked ? (st.m.message || (label + ' is available on the ' + need + ' plan and above.')) : (st.m.message || (label + ' isn’t available right now.'));
    var ov = el('div', 'qcp-ov', '<div class="qcp-card"><div style="font-size:48px">' + (st.locked ? '🔒' : '🚧') + '</div><h2>' + esc(st.locked ? 'Upgrade to unlock' : 'Not available right now') + '</h2><p>' + esc(msg) + '</p>' + (st.locked ? '<button class="qcp-btn" id="qcp-up">See plans →</button> ' : '') + '<button class="qcp-btn ghost" id="qcp-x">Close</button></div>');
    D.body.appendChild(ov); ov.querySelector('#qcp-x').onclick = function () { ov.remove(); }; var u = ov.querySelector('#qcp-up'); if (u) u.onclick = function () { nav('/payment'); };
  }
  function applyModules() {
    var side = D.querySelector('aside.sidebar'); if (!side) return; ensureStyle();
    side.querySelectorAll('.sb').forEach(function (n) {
      if (n.getAttribute('data-qcp')) return; var id = sbId(n); if (!id) return;
      if (n.dataset.qo == null) n.dataset.qo = n.innerHTML;
      n.innerHTML = n.dataset.qo; n.style.display = ''; n.classList.remove('qcp-locked');
      var st = stateFor(id), m = st.m; if (!m || HIDDEN_MODS[id]) return;
      if (m.label || m.icon) {
        var raw = (n.textContent || '').trim(), em = raw.match(/^(\p{Extended_Pictographic}\S*)\s+([\s\S]*)$/u), iconOrig = em ? em[1] : '', labelOrig = em ? em[2] : raw;
        if (n.querySelector('svg') && !m.icon) { var tn = [].slice.call(n.childNodes).filter(function (c) { return c.nodeType === 3 && c.nodeValue.trim(); }).pop(); if (tn && m.label) tn.nodeValue = ' ' + m.label; }
        else n.textContent = ((m.icon || iconOrig) ? (m.icon || iconOrig) + ' ' : '') + (m.label || labelOrig);
      }
      var tag = ''; if (m.badge) tag = '<span class="qcp-badge b-' + m.badge + '">' + (m.badge === 'soon' ? 'Soon' : m.badge) + '</span>';
      if (st.hidden) { if (admView()) tag = '<span class="qcp-badge b-off">OFF</span>'; else n.style.display = 'none'; }
      else if (st.locked) { n.classList.add('qcp-locked'); tag = '<span class="qcp-lock">🔒 ' + (PLAN_NAME[m.minPlan] || '') + '</span>'; if (admView()) { n.classList.remove('qcp-locked'); tag = '<span class="qcp-badge b-pro">' + (PLAN_NAME[m.minPlan] || '') + '+</span>'; } }
      n.insertAdjacentHTML('beforeend', tag);
    });
    // order inside each group
    var groups = [], cur = []; [].slice.call(side.children).forEach(function (c) { if (c.classList.contains('sb') && !c.getAttribute('data-qcp')) cur.push(c); else { if (cur.length) groups.push(cur); cur = []; } }); if (cur.length) groups.push(cur);
    groups.forEach(function (g) {
      var anchor = g[0].previousSibling, withIdx = g.map(function (n, i) { var m = ((cfg && cfg.modules) || {})[sbId(n)]; return { n: n, k: m && m.order != null ? m.order : i * 10 + 5 }; });
      if (!withIdx.some(function (x, i) { return x.k !== i * 10 + 5; })) return;
      withIdx.sort(function (a, b) { return a.k - b.k; }); var ref = g[g.length - 1].nextSibling; withIdx.forEach(function (x) { side.insertBefore(x.n, ref); });
    });
  }
  function renderBlocks(blocks) {
    return (blocks || []).map(function (b) {
      if (b.type === 'heading') return '<h' + (b.level === 3 ? 3 : 2) + '>' + esc(b.text) + '</h' + (b.level === 3 ? 3 : 2) + '>';
      if (b.type === 'text') return '<p>' + esc(b.text) + '</p>';
      if (b.type === 'image') return '<figure style="margin:10px 0"><img src="' + esc(b.src) + '" alt="' + esc(b.alt) + '">' + (b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : '') + '</figure>';
      if (b.type === 'button') return '<a class="qb ' + (b.style === 'ghost' ? 'ghost' : '') + '" href="' + esc(b.link) + '"' + (/^https?:/i.test(b.link) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(b.label) + '</a>';
      if (b.type === 'video') return '<div class="vid"><iframe src="' + esc(b.embed) + '" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>';
      if (b.type === 'embed') return '<div class="emb"><iframe src="' + esc(b.embed) + '" style="width:100%;height:' + (b.height || 520) + 'px" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>';
      if (b.type === 'list') { var tag = b.style === 'numbers' ? 'ol' : 'ul'; return '<' + tag + (b.style === 'checks' ? ' class="checks"' : '') + '>' + (b.items || []).map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</' + tag + '>'; }
      if (b.type === 'callout') { var col = { info: '#e8f0ff;color:#123a8c', success: '#e6f7ef;color:#0a6b46', warning: '#fff4d6;color:#7a5200', promo: '#fff1ea;color:#c2410c' }[b.kind] || '#e8f0ff;color:#123a8c'; return '<div class="co" style="background:' + col + '">' + esc(b.text) + '</div>'; }
      if (b.type === 'faq') return (b.items || []).map(function (i) { return '<div class="fq"><b>' + esc(i.q) + '</b><div>' + esc(i.a) + '</div></div>'; }).join('');
      if (b.type === 'divider') return '<hr>';
      return '';
    }).join('');
  }
  function applyPages() {
    var side = D.querySelector('aside.sidebar'), main = D.querySelector('main'); if (!side || !main) return; ensureStyle();
    D.querySelectorAll('[data-qcp="custom"]').forEach(function (n) { n.remove(); });
    var cur = D.querySelector('.panel.on'); var pages = ((cfg && cfg.pages) || []).filter(function (p) { return p.on && (admView() || (planOk(p.plans) && hashPct(p.id, p.pct))); });
    var wn = (cfg && cfg.whatsNew) || [], groups = {}, firstSb = side.querySelector('.sb');
    if (wn.length) {
      var hdr = side.querySelector('.sb[onclick*="go(\'dashboard\'"]'); var item = el('div', 'sb', '🎁 What’s new'); item.setAttribute('data-qcp', 'custom'); item.setAttribute('onclick', "go('whatsnew',this)");
      var unseen = L.getItem('qcp_seen_wn') !== wn[0].id; if (unseen) item.insertAdjacentHTML('beforeend', '<span class="qcp-badge">NEW</span>');
      if (hdr) hdr.insertAdjacentElement('afterend', item); else side.insertBefore(item, firstSb);
      var panel = el('div', 'panel'); panel.id = 'p-whatsnew'; panel.setAttribute('data-qcp', 'custom');
      panel.innerHTML = '<div class="ptitle">What’s new</div><div class="psub">The latest features and improvements.</div><div class="qcp-pg">' + wn.map(function (w) { return '<div class="qcp-wn"><small>' + esc(w.date) + (w.tag ? '<span class="qcp-tag">' + esc(w.tag) + '</span>' : '') + '</small><h3>' + esc(w.title) + '</h3>' + (w.image ? '<img src="' + esc(w.image) + '" alt="" style="max-width:100%;border-radius:12px;margin:8px 0">' : '') + '<p>' + esc(w.body) + '</p>' + (w.link ? '<p style="margin-top:8px"><a href="' + esc(w.link) + '" target="_blank" rel="noopener" style="color:#ff5a1f;font-weight:700">Learn more →</a></p>' : '') + '</div>'; }).join('') + '</div>';
      main.appendChild(panel);
    }
    pages.forEach(function (p) {
      var g = p.group || 'Resources'; if (!groups[g]) { var h = el('div'); h.setAttribute('data-qcp', 'custom'); h.style.cssText = 'padding:10px 14px 6px;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink4);border-top:1px solid var(--border);margin-top:6px'; h.textContent = g; var anchorEl = side.querySelector('.sb[onclick*="openPageEditor"]') || side.lastElementChild; anchorEl.insertAdjacentElement('afterend', h); groups[g] = h; }
      var id = 'cp_' + p.id, it = el('div', 'sb', esc(p.icon) + ' ' + esc(p.title)); it.setAttribute('data-qcp', 'custom'); it.setAttribute('onclick', "go('" + id + "',this)");
      if (admView() && (!planOk(p.plans))) it.insertAdjacentHTML('beforeend', '<span class="qcp-badge b-pro">' + p.plans.map(function (x) { return PLAN_NAME[x]; }).join('/') + '</span>');
      var last = groups[g]; while (last.nextElementSibling && last.nextElementSibling.getAttribute('data-qcp') === 'custom' && last.nextElementSibling.classList.contains('sb')) last = last.nextElementSibling; last.insertAdjacentElement('afterend', it);
      var pn = el('div', 'panel'); pn.id = 'p-' + id; pn.setAttribute('data-qcp', 'custom'); pn.innerHTML = '<div class="ptitle">' + esc(p.title) + '</div><div class="qcp-pg">' + renderBlocks(p.blocks) + '</div>'; main.appendChild(pn);
      pn.querySelectorAll('.fq b').forEach(function (b) { b.onclick = function () { b.parentNode.classList.toggle('on'); }; });
    });
    if (cur && !D.querySelector('.panel.on')) { var d = D.getElementById('p-dashboard'); if (d) d.classList.add('on'); }
  }
  function showWhatsNew() {
    var wn = (cfg && cfg.whatsNew) || []; if (!wn.length || CTX !== 'dashboard' || L.getItem('qcp_seen_wn') === wn[0].id || D.getElementById('qcp-wn')) return;
    if (L.getItem('qcp_seen_wn') == null && !preview()) { L.setItem('qcp_seen_wn', wn[0].id); return; }   // brand-new owners don't need a "what's new" on day one
    ensureStyle(); var w = wn[0];
    var ov = el('div', 'qcp-ov', '<div class="qcp-card"><div style="font-size:46px">🎉</div><div style="font-size:11px;font-weight:800;letter-spacing:.1em;color:#ff5a1f">WHAT’S NEW' + (w.tag ? ' · ' + esc(w.tag).toUpperCase() : '') + '</div><h2>' + esc(w.title) + '</h2>' + (w.image ? '<img src="' + esc(w.image) + '" alt="" style="max-width:100%;border-radius:14px;margin:0 0 14px">' : '') + '<p>' + esc(w.body) + '</p><button class="qcp-btn" id="qcp-ok">Got it</button></div>'); ov.id = 'qcp-wn'; D.body.appendChild(ov);
    ov.querySelector('#qcp-ok').onclick = function () { if (!preview()) L.setItem('qcp_seen_wn', w.id); ov.remove(); applyPages(); };
  }
  function wrapNavigation() {
    if (CTX !== 'dashboard' || window.__qcpWrapped) return; window.__qcpWrapped = true;
    var g = window.go; if (typeof g === 'function') window.go = function (n, el) {
      if (n === 'whatsnew' && (cfg.whatsNew || [])[0]) { if (!preview()) L.setItem('qcp_seen_wn', cfg.whatsNew[0].id); }
      var st = stateFor(n); if (!admView() && (st.hidden || st.locked)) { blockedMsg(n, st); return; } return g.apply(this, arguments);
    };
    ['openPOS', 'openPageEditor'].forEach(function (fn) { var o = window[fn]; var id = fn === 'openPOS' ? 'pos' : 'pageeditor'; if (typeof o === 'function') window[fn] = function () { var st = stateFor(id); if (!admView() && (st.hidden || st.locked)) { blockedMsg(id, st); return; } return o.apply(this, arguments); }; });
    var cg = window.canGo; if (typeof cg === 'function') window.canGo = function (n) { return /^cp_|^whatsnew$/.test(n) ? true : cg(n); };
  }
  function previewBar() {
    var o = D.getElementById('qcp-prevbar'); if (o) o.remove(); if (!preview()) return; ensureStyle();
    var b = el('div', 'qcp-prev', '👁 Previewing the DRAFT as a <b>' + (PLAN_NAME[userPlan()] || 'Pro') + '</b> owner — only you see this <button id="qcp-pe">Exit preview</button>'); b.id = 'qcp-prevbar'; D.body.appendChild(b);
    b.querySelector('#qcp-pe').onclick = function () { L.removeItem('qcp_prev'); L.removeItem('qcp_prev_plan'); location.reload(); };
  }

  /* ───────── public website (landing + marketing pages) ───────── */
  function applySite() {
    if (CTX !== 'site' || !cfg) return; var s = cfg.site || {};
    window.QC_SITE = s; try { window.dispatchEvent(new Event('qc-site')); } catch (e) { }
    if (s.contactEmail) D.querySelectorAll('a[href^="mailto:"]').forEach(function (a) { a.href = 'mailto:' + s.contactEmail; if (/@/.test(a.textContent)) a.textContent = s.contactEmail; });
    if (s.footerNote) { var f = D.querySelector('.sx-foot-b, .lp-foot-b'); if (f && !f.querySelector('.qcp-fn')) f.insertAdjacentHTML('afterbegin', '<span class="qcp-fn">' + esc(s.footerNote) + '</span> · '); }
    // FAQ page: extra questions from the Backend
    var faq = D.querySelector('.sx-faq'); if (faq && (s.faq || []).length && !D.getElementById('qcp-faq')) {
      var grp = el('div', 'sx-grp', 'More answers'), box = el('div', 'sx-faq'); box.id = 'qcp-faq'; box.setAttribute('data-gl', '');
      box.innerHTML = s.faq.map(function (f) { return '<div class="sx-q"><button>' + esc(f.q) + '<i>+</i></button><div class="sx-a"><p>' + esc(f.a) + '</p></div></div>'; }).join('');
      var last = D.querySelectorAll('.sx-faq'); last = last[last.length - 1]; last.insertAdjacentElement('afterend', box); last.insertAdjacentElement('afterend', grp); grp.setAttribute('data-g', '');
      box.querySelectorAll('.sx-q').forEach(function (q) { q.querySelector('button').onclick = function () { var o = q.classList.toggle('on'), a = q.querySelector('.sx-a'); a.style.maxHeight = o ? a.scrollHeight + 'px' : 0; }; });
    }
    // pricing page: names, prices, features come from the Backend
    if (D.querySelector('.sx-plans')) loadPlans().then(function (pl) {
      var keys = ['starter', 'pro', 'enterprise'], N = function (n) { return Math.round(n).toLocaleString('en-NG'); };
      D.querySelectorAll('.sx-plan').forEach(function (card, i) {
        var p = pl[keys[i]]; if (!p) return; card.style.display = p.hidden ? 'none' : '';
        var h = card.querySelector('h3'); if (h) h.textContent = p.name; var pr = card.querySelector('[data-p]'); if (pr) { pr.setAttribute('data-p', p.monthly); pr.textContent = N(p.monthly); }
        if (p.features && p.features.length) { var ul = card.querySelector('ul'); if (ul) ul.innerHTML = p.features.map(function (f) { return '<li><i>✓</i>' + esc(f) + '</li>'; }).join(''); }
        card.classList.toggle('hot', !!p.popular); var hb = card.querySelector('.sx-hotb'); if (p.popular && !hb) card.insertAdjacentHTML('afterbegin', '<div class="sx-hotb">Most popular</div>'); if (!p.popular && hb) hb.remove();
      });
      D.querySelectorAll('.sx-t thead th').forEach(function (th, i) { if (i > 0 && pl[keys[i - 1]]) th.textContent = pl[keys[i - 1]].name; });
    });
  }

  function applyAll() {
    if (!cfg) return; ensureStyle(); applyThemeFlags(); applyAnnouncements(); applyMaintenance(); previewBar();
    if (CTX === 'dashboard') { applyModules(); applyPages(); wrapNavigation(); showWhatsNew(); }
    if (CTX === 'site') applySite();
    listeners.forEach(function (f) { try { f(cfg); } catch (e) { } });
  }

  api = {
    get cfg() { return cfg; }, version: function () { return ver; }, ctx: CTX, userPlan: userPlan, refresh: function () { return fetchCfg(true); }, loadPlans: loadPlans,
    flag: function (k, d) { var f = cfg && cfg.flags && cfg.flags[k]; return f === undefined ? (d === undefined ? true : d) : f; },
    onChange: function (f) { listeners.push(f); },
    signupsOpen: function () { return !(cfg && cfg.signups && cfg.signups.open === false); },
    previewOn: function (plan) { L.setItem('qcp_prev', '1'); if (plan) L.setItem('qcp_prev_plan', plan); },
    previewOff: function () { L.removeItem('qcp_prev'); L.removeItem('qcp_prev_plan'); },
  };
  window.QCPlatform = api;

  function boot() { if (cfg) applyAll(); fetchCfg(true); setInterval(function () { if (!D.hidden) fetchCfg(false); }, 60000); D.addEventListener('visibilitychange', function () { if (!D.hidden) fetchCfg(false); }); }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 60); }); else setTimeout(boot, 60);
})();
