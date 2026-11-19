/* QuickCart DB access token (secure mode).
   When the server runs with QC_SECURE_DB=1 it gives each logged-in owner/staff a short-lived token (POST /api/auth {action:'dbtoken'}).
   This wrapper attaches it to every request to the central database, refreshes it before it expires, and leaves shoppers
   (no login) untouched. With secure mode OFF the server answers "no token" and nothing changes. */
(function(){
  if (window.__qcDbAuth) return; window.__qcDbAuth = true;
  var HOST = /^https:\/\/sneakerai-c96f0-default-rtdb\.firebaseio\.com\//, L = localStorage, of = window.fetch.bind(window), inflight = null, jumped = false;
  var sess = function(){ return L.getItem('qc_token') || ''; };
  function cur(){ var t = L.getItem('qc_dbtok'); return t && L.getItem('qc_dbtok_s') === sess() && (+L.getItem('qc_dbtok_exp') || 0) - Date.now() > 120000 ? t : ''; }
  function off(){ return Date.now() - (+L.getItem('qc_dbtok_off') || 0) < 10 * 60000; }
  function add(u, t){ return u + (u.indexOf('?') > -1 ? '&' : '?') + 'auth=' + encodeURIComponent(t); }
  function refresh(){
    if (inflight) return inflight; var st = sess(); if (!st) return Promise.resolve('');
    inflight = of('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + st }, body: JSON.stringify({ action: 'dbtoken' }) })
      .then(function(r){ return r.json().catch(function(){ return {}; }); })
      .then(function(j){
        if (j && j.dbToken) { L.setItem('qc_dbtok', j.dbToken); L.setItem('qc_dbtok_exp', String(j.dbTokenExp)); L.setItem('qc_dbtok_s', st); L.removeItem('qc_dbtok_off'); return j.dbToken; }
        if (j && j.expired && !jumped && !/payment/.test(location.pathname + location.href)) { jumped = true; try { (window.parent && window.parent.qcNavigate ? window.parent : window).qcNavigate('/payment'); } catch (e) { } }
        if (j && j.ok && j.dbToken === null) L.setItem('qc_dbtok_off', String(Date.now()));   // secure mode is off on the server
        return '';
      }).catch(function(){ return ''; }).then(function(t){ inflight = null; return t; });
    return inflight;
  }
  window.fetch = function(url, opt){
    var u = typeof url === 'string' ? url : '';
    if (!u || !HOST.test(u) || /[?&]auth=/.test(u) || !sess()) return of(url, opt);
    var t = cur(); if (t) return of(add(u, t), opt);
    if (off()) return of(url, opt);
    return refresh().then(function(nt){ return of(nt ? add(u, nt) : url, opt); });
  };
  window.QCDBAuth = { refresh: refresh, clear: function(){ ['qc_dbtok','qc_dbtok_exp','qc_dbtok_s','qc_dbtok_off'].forEach(function(k){ L.removeItem(k); }); } };
})();

/* QuickCart DB router — decides which Firebase database a session reads/writes.
   MAIN  = your central database: login directory (/users), /dbmap (username -> customer DB URL).
   A customer with their own Firebase has ALL their business data (products, orders, staff, roles…) in THEIR database. */
(function(){
  if (window.QCDB) return;
  var MAIN = 'https://sneakerai-c96f0-default-rtdb.firebaseio.com', L = localStorage;
  var KEYS = ['qc_db_url','qc_owner','qc_role','qc_modules','qc_is_staff','qc_full_name','qc_outlet'];
  function clean(u){ return String(u||'').trim().replace(/\.json.*$/i,'').replace(/\/+$/,''); }
  function valid(u){ return /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)?\.(firebaseio\.com|firebasedatabase\.app)$/i.test(u); }
  function enc(u){ return encodeURIComponent(u); }
  function owner(){ return L.getItem('qc_owner') || L.getItem('qc_logged_user') || ''; }
  function base(){
    var d = L.getItem('qc_db_url'); if (d) return d;
    var o = owner() || 'admin'; return MAIN + '/users/' + enc(o);   /* your own admin store lives in users/admin, like every other owner — the old root store is no longer used */
  }
  function lookup(u, fresh){            // username -> customer DB url ('' if they use the shared DB)
    if (!u) return '';
    var ck = 'qcdb_' + u; if (!fresh){ var c = sessionStorage.getItem(ck); if (c !== null) return c; }
    var out = '';
    try { var x = new XMLHttpRequest(); x.open('GET', MAIN + '/dbmap/' + enc(u) + '.json', false); x.send();
      if (x.status === 200){ var v = JSON.parse(x.responseText); if (typeof v === 'string' && valid(v)) out = v; } } catch(e){}
    try { sessionStorage.setItem(ck, out); } catch(e){}
    return out;
  }
  function baseFor(u){ u = u || 'admin'; var d = lookup(u); return d || MAIN + '/users/' + enc(u); }
  function clearSession(){ KEYS.forEach(function(k){ L.removeItem(k); }); if (window.QCDBAuth) window.QCDBAuth.clear(); }
  function setSession(rec){                // call right after a successful login with the directory record
    clearSession(); if (!rec) return;
    if (rec.isStaff && rec.owner){
      L.setItem('qc_is_staff', '1'); L.setItem('qc_owner', rec.owner); L.setItem('qc_role', rec.role || '');
      L.setItem('qc_modules', JSON.stringify(Array.isArray(rec.modules) ? rec.modules : []));
      L.setItem('qc_full_name', rec.fullname || rec.username || ''); L.setItem('qc_outlet', rec.outlet || '');
      var d = lookup(rec.owner, true) || rec.dbUrl || ''; if (d && valid(d)) L.setItem('qc_db_url', d);
    } else {
      var own = rec.username || '', d2 = rec.dbUrl || lookup(own, true); if (d2 && valid(d2)) L.setItem('qc_db_url', d2);
    }
  }

  /* Server login/session (the browser never reads the users table any more) */
  var QCAuth = {
    token: function(){ return L.getItem('qc_token') || ''; },
    call: async function(action, body){
      var h = { 'Content-Type':'application/json' }, t = QCAuth.token(); if (t) h.Authorization = 'Bearer ' + t;
      try {
        var r = await fetch('/api/auth', { method:'POST', headers:h, body:JSON.stringify(Object.assign({ action:action }, body || {})) });
        var j = {}; try { j = await r.json(); } catch(e){}
        if (r.status === 401 && j.code === 'NO_SESSION') { j.error = j.error || 'Session expired. Please log in again.'; }
        if (j.ok === undefined) j.ok = r.ok;
        return j;
      } catch(e){ return { ok:false, error:'Network problem. Check your connection and try again.' }; }
    }
  };
  function isStaff(){ return L.getItem('qc_is_staff') === '1'; }
  function can(mod){
    if (!isStaff()) return true;
    try { return JSON.parse(L.getItem('qc_modules') || '[]').indexOf(mod) > -1; } catch(e){ return false; }
  }
  /* Run: verify a customer's Firebase, seed it, and register it for this username */
  async function provision(url, username, rolesDefault){
    url = clean(url);
    if (!username) return { ok:false, msg:'Enter the username first (above), then press Run.' };
    if (!valid(url)) return { ok:false, msg:'That doesn\'t look like a Realtime Database URL. It should look like https://their-project-default-rtdb.firebaseio.com' };
    var r;
    try { r = await fetch(url + '/.json?shallow=true'); } catch(e){ return { ok:false, msg:'Could not reach that database. Check the URL and your internet.' }; }
    if (r.status === 401 || r.status === 403) return { ok:false, msg:'Permission denied. In their Firebase console → Realtime Database → Rules, allow read/write, publish, then press Run again.' };
    if (!r.ok) return { ok:false, msg:'Database not found (error ' + r.status + '). Make sure Realtime Database is created in their project and the URL is exact.' };
    try {
      var meta = { owner:username, app:'quickcart', provisionedAt:new Date().toISOString(), v:1 };
      var w = await fetch(url + '/settings/meta.json', { method:'PUT', body:JSON.stringify(meta) });
      if (!w.ok) return { ok:false, msg:'Connected, but writing was blocked. Their rules must allow write access.' };
      var rr = await fetch(url + '/roles.json'); var has = rr.ok ? await rr.json() : null;
      if (!has && rolesDefault) await fetch(url + '/roles.json', { method:'PUT', body:JSON.stringify(rolesDefault) });
      var m = await QCAuth.call('admin-dbmap', { username: username, url: url });
      if (!m.ok) return { ok:false, msg:'Database is ready, but could not register it in your main database.' };
      try { sessionStorage.removeItem('qcdb_' + username); } catch(e){}
    } catch(e){ return { ok:false, msg:'Setup failed: ' + e.message }; }
    return { ok:true, url:url, msg:'Connected ✓ Their database is set up and linked to "' + username + '".' };
  }

  /* Staff login: company ID (owner's store email) + staff username + password. */
  async function staffLogin(companyId, username, password){
    if (!String(companyId||'').trim() || !String(username||'').trim() || !password) return { ok:false, msg:'Enter the Company ID, your username and your password.' };
    var j = await QCAuth.call('staff-login', { company:companyId, user:username, pass:password });
    if (!j.ok) return { ok:false, msg:j.error || 'Login failed.' };
    return { ok:true, rec:j.rec, owner:j.owner, token:j.token };
  }
  function finishStaffLogin(res){
    var rec = res.rec, owner = res.owner;
    setSession(rec); if (res.token) L.setItem('qc_token', res.token);
    L.setItem('qc_logged_user', rec.username);
    L.setItem('qc_sub_plan', owner.plan || 'staff');
    L.setItem('qc_sub_email', rec.email || '');
    L.setItem('qc_biz_name', owner.businessName || '');
  }
  window.QCAuth = QCAuth;
  window.QCDB = { auth:QCAuth, staffLogin:staffLogin, finishStaffLogin:finishStaffLogin, MAIN:MAIN, clean:clean, valid:valid, owner:owner, base:base, baseFor:baseFor, lookup:lookup,
    setSession:setSession, clearSession:clearSession, isStaff:isStaff, can:can, provision:provision };
})();
