/* QuickCart — Outlets & Sync page for the owner dashboard. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = window.esc;
  var money = function (n) { return '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG'); };
  var isAdmin = function () { return localStorage.getItem('qc_logged_user') === 'admin' && !QCDB.isStaff(); };
  var fdate = function (d) { return d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
  var ftime = function (d) { return d ? new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never'; };
  var bytes = function (n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; };
  var box = function (title, inner, right) { return '<div class="box" style="margin-bottom:16px;"><div class="box-hd"><h3>' + title + '</h3>' + (right || '') + '</div><div style="padding:16px 18px;font-size:13px;line-height:1.6;">' + inner + '</div></div>'; };

  /* ───────────────── OUTLETS & SYNC ───────────────── */
  var outlets = {};
  async function loadOutletList() { try { var r = await fetch(getSettingsDB() + '/outlets.json'); outlets = (await r.json()) || {}; } catch (e) { outlets = {}; } return outlets; }
  async function fillOutletSelect() {
    var s = $('hr-outlet'); if (!s) return; var o = await loadOutletList(), cur = s.value;
    s.innerHTML = '<option value="">All outlets / head office</option>' + Object.keys(o).map(function (k) { return '<option value="' + esc(o[k].name) + '">' + esc(o[k].name) + '</option>'; }).join(''); s.value = cur;
  }
  function addOutlet() {
    QC.form({ title: 'Add outlet / branch', sub: 'Staff and POS terminals can be assigned to it, and its sales are reported separately.', submit: 'Add outlet',
      fields: [{ name: 'name', label: 'Outlet name', required: true, placeholder: 'e.g. Ikeja Branch' }, { name: 'address', label: 'Address (optional)' }, { name: 'phone', label: 'Phone (optional)', type: 'tel' }],
      save: async function (v) {
        await loadOutletList(); if (Object.keys(outlets).some(function (k) { return outlets[k].name.toLowerCase() === v.name.toLowerCase(); })) throw new Error('You already have an outlet with that name.');
        var id = 'o-' + Date.now().toString(36); var r = await fetch(getSettingsDB() + '/outlets/' + id + '.json', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: v.name, address: v.address || '', phone: v.phone || '', createdAt: new Date().toISOString() }) });
        if (!r.ok) throw new Error('Could not save (' + r.status + ')'); await loadOutlets();
      } }).then(function (r) { if (r) toast('✅ ' + r.name + ' added'); });
  }
  async function delOutlet(id) {
    var o = outlets[id]; if (!o || !await QC.confirm('Delete outlet "' + o.name + '"? Its past sales stay in your records.', { title: 'Delete outlet', ok: 'Delete', danger: true })) return;
    await fetch(getSettingsDB() + '/outlets/' + id + '.json', { method: 'DELETE' }); toast('Outlet deleted'); loadOutlets();
  }
  async function loadOutlets() {
    var el = $('outlets-body'); if (!el) return; await loadOutletList();
    var range = ($('out-range') || {}).value || '30', since = range === 'all' ? 0 : Date.now() - Number(range) * 86400000;
    var ords = {}, staff = {}; try { ords = (await (await fetch(getOrdersDB() + '.json')).json()) || {}; } catch (e) {} try { staff = (await (await fetch(getSettingsDB() + '/staff.json')).json()) || {}; } catch (e) {}
    var byO = {}, byC = {}, devs = {}, offl = 0, total = 0, rev = 0, today = new Date().toDateString();
    Object.keys(ords).forEach(function (k) {
      var o = ords[k]; if (!o || typeof o !== 'object') return; var t = new Date(o.createdAt || o.date || 0).getTime(); if (since && t < since) return;
      if (o.status === 'cancelled' || o.status === 'declined' || o.status === 'refunded') return;
      var on = o.source === 'pos' ? (o.outlet || 'Main / unassigned') : 'Online store', amt = Number(o.total) || 0;
      var a = byO[on] = byO[on] || { n: 0, rev: 0, today: 0, off: 0 }; a.n++; a.rev += amt; if (new Date(t).toDateString() === today) a.today += amt; if (o.offline) { a.off++; offl++; }
      if (o.source === 'pos') { var c = byC[(o.cashier || '—') + '|' + on] = byC[(o.cashier || '—') + '|' + on] || { n: 0, rev: 0, who: o.cashier || '—', out: on }; c.n++; c.rev += amt; if (o.terminal) devs[o.terminal] = 1; }
      total++; rev += amt;
    });
    var names = Object.keys(outlets).map(function (k) { return outlets[k].name; });
    Object.keys(byO).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
    var h = '<div class="stats"><div class="stat"><div class="stat-l">Sales (all outlets)</div><div class="stat-v">' + total + '</div></div><div class="stat"><div class="stat-l">Revenue</div><div class="stat-v">' + money(rev) + '</div></div><div class="stat"><div class="stat-l">POS devices seen</div><div class="stat-v">' + Object.keys(devs).length + '</div></div><div class="stat"><div class="stat-l">Offline sales synced</div><div class="stat-v">' + offl + '</div></div></div>';
    h += '<div class="box" style="margin-bottom:16px;"><div class="box-hd"><h3>Outlets</h3><div style="display:flex;gap:6px;"><select id="out-range" class="sinput" onchange="QCAcct.loadOutlets()" style="width:auto;"><option value="1">Today</option><option value="7">7 days</option><option value="30">30 days</option><option value="all">All time</option></select><button class="btn btn-orange btn-sm" onclick="QCAcct.addOutlet()">+ Add Outlet</button></div></div><div style="overflow-x:auto;"><table><thead><tr><th>Outlet</th><th>Sales</th><th>Revenue</th><th>Today</th><th>Synced from offline</th><th>Staff</th><th></th></tr></thead><tbody>' +
      (names.length ? names.map(function (n) { var a = byO[n] || { n: 0, rev: 0, today: 0, off: 0 }, id = Object.keys(outlets).filter(function (k) { return outlets[k].name === n; })[0], sc = Object.keys(staff).filter(function (k) { return staff[k] && staff[k].outlet === n; }).length;
        return '<tr><td><strong>' + esc(n) + '</strong></td><td>' + a.n + '</td><td style="font-family:\'DM Mono\',monospace;">' + money(a.rev) + '</td><td>' + money(a.today) + '</td><td>' + a.off + '</td><td>' + sc + '</td><td>' + (id ? '<button class="btn btn-red btn-sm" onclick="QCAcct.delOutlet(\'' + id + '\')">Del</button>' : '') + '</td></tr>'; }).join('') : '<tr class="empty-row"><td colspan="7">No outlets yet. Add your branches, then assign staff to them in Human Resources.</td></tr>') + '</tbody></table></div></div>';
    var cs = Object.keys(byC).map(function (k) { return byC[k]; }).sort(function (a, b) { return b.rev - a.rev; });
    h += '<div class="box"><div class="box-hd"><h3>Sales by staff / cashier</h3></div><div style="overflow-x:auto;"><table><thead><tr><th>Cashier</th><th>Outlet</th><th>Sales</th><th>Revenue</th></tr></thead><tbody>' + (cs.length ? cs.map(function (c) { return '<tr><td>' + esc(c.who) + '</td><td>' + esc(c.out) + '</td><td>' + c.n + '</td><td>' + money(c.rev) + '</td></tr>'; }).join('') : '<tr class="empty-row"><td colspan="4">No POS sales in this period.</td></tr>') + '</tbody></table></div></div>';
    h += '<div style="margin-top:14px;font-size:12px;color:var(--ink3);line-height:1.6;">✅ Every POS terminal, outlet and staff login writes to this one account, so all sales appear here and in Orders, Accounting and Inventory automatically. If a terminal loses internet it keeps selling and uploads its sales (and stock changes) by itself when the connection returns.</div>';
    var rs = $('out-range'); $('outlets-body').innerHTML = h; $('out-range').value = range;
  }

  /* ───────────────── wire into the dashboard ───────────────── */
  /* ───────────────── MY PLAN (owners only) ───────────────── */
  var N = function (n) { return '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG'); };
  var D = function (iso) { try { return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; } };
  async function loadPlan() {
    var box = $('myplan-body'); if (!box) return; box.innerHTML = '<div style="padding:30px;text-align:center;color:#6b7a99">Loading…</div>';
    try {
      var tk = localStorage.getItem('qc_token') || '';
      var me = await (await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: JSON.stringify({ action: 'me' }) })).json();
      if (!me.ok) throw new Error(me.error || 'Could not load your plan');
      var pl = {}; try { pl = (await (await fetch('/api/paystack?action=plans')).json()).plans || {}; } catch (e) { }
      var u = me.user || {}, p = pl[u.plan] || {}, now = Date.now(), badge, line, tone;
      if (u.status === 'active' && u.subExpires) { var left = Math.ceil((Date.parse(u.subExpires) - now) / 864e5); badge = left > 0 ? 'Active' : 'Expired'; tone = left > 0 ? '#0a8a5a' : '#c2410c'; line = left > 0 ? 'Paid until <b>' + D(u.subExpires) + '</b> (' + left + ' day' + (left === 1 ? '' : 's') + ' left)' : 'Your plan ended on <b>' + D(u.subExpires) + '</b>. Renew to keep selling.'; }
      else if (u.status === 'trial' || u.status === 'pending_card') { var t = Math.ceil((Date.parse(u.trialEnds || '') - now) / 864e5); badge = t > 0 ? 'Free trial' : 'Trial ended'; tone = t > 0 ? '#1d4ed8' : '#c2410c'; line = t > 0 ? '<b>' + t + ' day' + (t === 1 ? '' : 's') + ' left</b> in your free trial (ends ' + D(u.trialEnds) + ').' : 'Your free trial ended. Choose a plan to keep your store running.'; }
      else { badge = String(u.status || 'Unknown'); tone = '#c2410c'; line = 'Your account needs attention — renew or contact us.'; }
      box.innerHTML = '<div style="background:#fff;border:1px solid var(--border,#e3e9f5);border-radius:20px;padding:26px;max-width:640px">'
        + '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div><div style="font-size:12px;color:#6b7a99;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Current plan</div><div style="font-size:30px;font-weight:800;letter-spacing:-.03em;margin-top:4px">' + (p.name || (u.plan || 'Starter')) + '</div>' + (p.monthly ? '<div style="color:#6b7a99;font-size:14px;margin-top:2px">' + N(p.monthly) + ' per month</div>' : '') + '</div>'
        + '<span style="background:' + tone + '1a;color:' + tone + ';font-weight:800;font-size:12px;padding:7px 14px;border-radius:99px">' + badge + '</span></div>'
        + '<p style="font-size:15px;line-height:1.7;margin:18px 0 0;color:#2c3c60">' + line + '</p>'
        + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:20px"><button class="btn btn-p" style="padding:12px 24px" onclick="(window.parent&&window.parent.qcNavigate?window.parent:window).qcNavigate?(window.parent&&window.parent.qcNavigate?window.parent:window).qcNavigate(\'/payment\'):(location.href=\'/payment\')">💳 Pay / renew / change plan</button><a class="btn" style="padding:12px 20px;text-decoration:none" href="/pricing" target="_blank" rel="noopener">Compare plans</a></div>'
        + '<p style="font-size:12px;color:#8a96b0;margin:18px 0 0">Payments are made securely through Paystack. We never store your card. Questions? <a href="/contact" target="_blank" rel="noopener" style="color:#ff5a1f;font-weight:700">Contact us</a>.</p></div>';
    } catch (e) { box.innerHTML = '<div style="padding:24px;color:#c0392b">❌ ' + e.message + '</div>'; }
  }

  function init() {
    var anchor = $('p-customers'); if (!anchor || $('p-outlets')) return;
    anchor.insertAdjacentHTML('afterend',
      '<div class="panel" id="p-outlets"><div class="ptitle">Outlets &amp; Sync</div><div class="psub">All your branches, POS terminals and staff in one place — every sale synced to this account.</div><div id="outlets-body"></div></div>');
    var nav = Array.prototype.filter.call(document.querySelectorAll('.sb'), function (e) { return (e.getAttribute('onclick') || '').indexOf("go('customers'") > -1; })[0];
    if (nav) nav.insertAdjacentHTML('afterend', '<div class="sb" onclick="go(\'outlets\',this)">🏬 Outlets &amp; Sync</div>');
    var admin = (localStorage.getItem('qc_logged_user') || '') === 'admin';
    if (!admin) {
      var subs = Array.prototype.filter.call(document.querySelectorAll('.sb'), function (e) { return (e.getAttribute('onclick') || '').indexOf("go('subs'") > -1; })[0]; if (subs) subs.remove();
      if (!(window.QCDB && QCDB.isStaff && QCDB.isStaff())) {
        anchor.insertAdjacentHTML('afterend', '<div class="panel" id="p-myplan"><div class="ptitle">My Plan</div><div class="psub">Your subscription and how to renew.</div><div id="myplan-body"></div></div>');
        if (nav) nav.insertAdjacentHTML('afterend', '<div class="sb" onclick="go(\'myplan\',this)">⭐ My Plan</div>');
      }
    }
    var g = window.go; window.go = function (n, el) {
      g.apply(this, arguments);
      if (n === 'myplan') loadPlan();
      if (n === 'outlets') loadOutlets(); else if (n === 'hr') fillOutletSelect();
    };
    var es = window.editStaff; if (typeof es === 'function') window.editStaff = function (k) { es.apply(this, arguments); setTimeout(function () { var s = $('hr-outlet'), st = window._staff && window._staff[k]; if (s && st) s.value = st.outlet || ''; }, 250); };
  }
  window.QCAcct = { addOutlet: addOutlet, delOutlet: delOutlet, loadOutlets: loadOutlets, fillOutletSelect: fillOutletSelect };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
