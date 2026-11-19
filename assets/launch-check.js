/* QuickCart — "Launch check" page for the platform admin: shows what is configured and what still blocks selling. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  function isAdmin() { return (localStorage.getItem('qc_logged_user') || '') === 'admin' && !(window.QCDB && QCDB.isStaff && QCDB.isStaff()); }
  async function run() {
    var box = $('lc-body'); box.innerHTML = '<div style="padding:30px;text-align:center;color:#6b7a99">Checking your setup…</div>';
    try {
      var r = await fetch('/api/health', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('qc_token') || '') }, body: '{}' });
      var j = await r.json(); if (!j.ok) throw new Error(j.error || 'Could not run the check');
      var rank = { required: 0, recommended: 1, optional: 2 }, list = j.checks.slice().sort(function (a, b) { return (a.ok - b.ok) || (rank[a.level] - rank[b.level]); });
      box.innerHTML = '<div style="border-radius:16px;padding:18px 22px;margin-bottom:16px;font-weight:800;font-size:16px;background:' + (j.ready ? '#e6f7ef;color:#0a8a5a' : '#fff1ea;color:#c2410c') + '">' + (j.ready ? '✅ Everything required is in place — you can start selling.' : '⚠️ ' + j.blockers + ' thing' + (j.blockers > 1 ? 's' : '') + ' must be fixed before you sell to customers.') + '</div>'
        + list.map(function (c) {
          return '<div style="display:flex;gap:14px;padding:14px 16px;border:1px solid var(--border,#e3e9f5);border-radius:14px;margin-bottom:8px;background:#fff"><div style="font-size:20px">' + (c.ok ? '✅' : c.level === 'required' ? '❌' : '⚪') + '</div><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14px">' + esc(c.label) + ' <span style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:' + (c.level === 'required' ? '#c2410c' : '#8a96b0') + ';margin-left:6px">' + c.level + '</span></div>'
            + (c.note ? '<div style="font-size:12px;color:#c2410c;margin-top:4px;font-weight:600">' + esc(c.note) + '</div>' : '') + (c.fix ? '<div style="font-size:12px;color:#5b6b8c;margin-top:4px;line-height:1.55">' + esc(c.fix) + '</div>' : '') + '</div></div>';
        }).join('');
    } catch (e) { box.innerHTML = '<div style="padding:24px;color:#c0392b">❌ ' + esc(e.message) + '</div>'; }
  }
  function init() {
    if (!isAdmin() || $('p-launch')) return; var anchor = $('p-customers'); if (!anchor) return;
    anchor.insertAdjacentHTML('afterend', '<div class="panel" id="p-launch"><div class="ptitle">Launch check</div><div class="psub">Everything your platform needs before customers can safely pay you. Only you (the platform admin) can see this page.</div><div style="margin:14px 0"><button class="btn btn-p" id="lc-run" style="padding:10px 20px">↻ Run check again</button></div><div id="lc-body"></div></div>');
    var nav = Array.prototype.filter.call(document.querySelectorAll('.sb'), function (e) { return (e.getAttribute('onclick') || '').indexOf("go('customers'") > -1; })[0];
    if (nav) nav.insertAdjacentHTML('afterend', '<div class="sb" onclick="go(\'launch\',this)">🩺 Launch check</div>');
    $('lc-run').onclick = run;
    var g = window.go; window.go = function (n) { var r = g.apply(this, arguments); if (n === 'launch') run(); return r; };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
