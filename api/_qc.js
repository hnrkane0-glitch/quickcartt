// QuickCart — shared helpers for serverless functions (not a route: leading underscore).
require('./_fbauth');
const crypto = require('crypto');

const MAIN = 'https://sneakerai-c96f0-default-rtdb.firebaseio.com';
const validDb = (u) => /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)?\.(firebaseio\.com|firebasedatabase\.app)$/i.test(String(u || ''));
const enc = encodeURIComponent;

/* ── owner → Firebase base URL (same rule as qc-db.js) ── */
async function baseFor(owner) {
  owner = String(owner || '').trim().toLowerCase();
  if (!owner) owner = 'admin';
  if (!/^[a-z0-9._@+-]{1,80}$/.test(owner)) throw new Error('Bad owner');
  try {
    const r = await fetch(`${MAIN}/dbmap/${enc(owner)}.json`);
    if (r.ok) { const v = await r.json(); if (typeof v === 'string' && validDb(v)) return v.replace(/\/+$/, ''); }
  } catch (e) { /* fall through to shared DB */ }
  return `${MAIN}/users/${enc(owner)}`;
}

const fbGet = async (url) => { const r = await fetch(url + '.json'); return r.ok ? r.json() : null; };
const fbPut = async (url, val) => {
  const r = await fetch(url + '.json', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(val) });
  if (!r.ok) throw new Error('Database write failed (' + r.status + ')');
  return r.json();
};

/* ── secret vault: AES-256-GCM with QC_ENC_KEY (env). Secrets are never returned to the browser. ── */
function vaultKey() {
  const k = process.env.QC_ENC_KEY;
  if (!k || k.length < 16) { const e = new Error('Server is missing QC_ENC_KEY (a long random string). Add it in Vercel → Settings → Environment Variables, then redeploy.'); e.code = 'NO_ENC_KEY'; throw e; }
  return crypto.createHash('sha256').update(k).digest();
}
function seal(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', vaultKey(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}
function unseal(box) {
  if (!box || !box.data) return null;
  const d = crypto.createDecipheriv('aes-256-gcm', vaultKey(), Buffer.from(box.iv, 'base64'));
  d.setAuthTag(Buffer.from(box.tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(box.data, 'base64')), d.final()]).toString('utf8'));
}
const SECRET_PATH = (base, p) => `${base}/terminal_vault/${p}`;
async function getSecrets(base, provider) { try { return unseal(await fbGet(SECRET_PATH(base, provider))) || {}; } catch (e) { if (e.code === 'NO_ENC_KEY') throw e; return {}; } }
async function putSecrets(base, provider, obj) { await fbPut(SECRET_PATH(base, provider), seal(obj)); }
const getCfg = async (base, provider) => (await fbGet(`${base}/settings/terminals/${provider}`)) || {};

const timingSafe = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const jbody = (req) => { try { return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) { return {}; } };
const raw = async (req) => { if (typeof req.body === 'string') return req.body; if (Buffer.isBuffer(req.body)) return req.body.toString('utf8'); if (req.body && typeof req.body === 'object') return JSON.stringify(req.body); const ch = []; for await (const c of req) ch.push(c); return Buffer.concat(ch).toString('utf8'); };

/* ── passwords (scrypt) + signed session tokens ── */
function hashPw(pw) { const salt = crypto.randomBytes(16); return 's1$' + salt.toString('base64') + '$' + crypto.scryptSync(String(pw), salt, 32).toString('base64'); }
function checkPw(pw, stored) {
  if (!stored || typeof stored !== 'string') return false;
  if (stored.startsWith('s1$')) { const [, s, h] = stored.split('$'); try { return timingSafe(crypto.scryptSync(String(pw), Buffer.from(s, 'base64'), 32).toString('base64'), h); } catch (e) { return false; } }
  return timingSafe(stored, Buffer.from(String(pw), 'latin1').toString('base64'));   // old accounts: upgraded to scrypt at next login
}
const isHashed = (s) => typeof s === 'string' && s.startsWith('s1$');
function sessKey() { const k = process.env.QC_ENC_KEY; if (!k || k.length < 16) { const e = new Error('Server is missing QC_ENC_KEY (long random text) in Vercel environment variables.'); e.code = 'NO_ENC_KEY'; throw e; } return crypto.createHash('sha256').update('qc-session:' + k).digest(); }
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function signTok(p, days) { const body = b64u(JSON.stringify(Object.assign({}, p, { exp: Date.now() + (days || 30) * 86400000 }))); return body + '.' + b64u(crypto.createHmac('sha256', sessKey()).update(body).digest()); }
function verifyTok(t) {
  try { const [body, sig] = String(t || '').split('.'); if (!body || !sig) return null;
    if (!timingSafe(sig, b64u(crypto.createHmac('sha256', sessKey()).update(body).digest()))) return null;
    const p = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); return p.exp > Date.now() ? p : null; } catch (e) { return null; }
}
const tokenOf = (req) => String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '');

const PLATFORM = `${MAIN}/users/admin`;   // the platform owner's own store

/* ── Database access tokens (secure mode) ──────────────────────────────────────────────
   When QC_SECURE_DB=1 the server hands every logged-in owner/staff a short-lived Firebase "legacy" token
   (HS256, signed with FIREBASE_DB_SECRET) carrying { owner }. The locked-down rules in database.rules.json only let
   a token whose owner matches the store read/write that store. Visitors (no token) can only do what a shopper needs. */
const secureOn = () => process.env.QC_SECURE_DB === '1' && !!process.env.FIREBASE_DB_SECRET;
function mintDbToken(owner, role, hours) {
  const secret = process.env.FIREBASE_DB_SECRET; if (!secret) return null;
  const now = Math.floor(Date.now() / 1000), exp = now + Math.round((hours || 12) * 3600);
  const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'HS256' })), p = b64u(JSON.stringify({ v: 0, iat: now, exp, d: { uid: String(owner), owner: String(owner), role: role || 'owner' } }));
  return { token: h + '.' + p + '.' + b64u(crypto.createHmac('sha256', secret).update(h + '.' + p).digest()), exp: exp * 1000 };
}

/* ── brute-force protection: counters kept in Firebase (/ratelimit, server-only) + memory fallback ── */
const mem = new Map();
const clientIp = (req) => String(((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || '?').trim();
async function throttle(bucket, key, max, windowMs) {
  const id = crypto.createHash('sha256').update(bucket + '|' + key).digest('hex').slice(0, 28), now = Date.now();
  let rec = null;
  try { rec = await fbGet(`${MAIN}/ratelimit/${id}`); } catch (e) { /* fail open on DB trouble */ }
  if (!rec) rec = mem.get(id) || null;
  if (!rec || now - (rec.t || 0) > windowMs) rec = { n: 0, t: now };
  if (rec.n >= max) return { ok: false, retryMin: Math.max(1, Math.ceil((rec.t + windowMs - now) / 60000)) };
  rec.n += 1; mem.set(id, rec); if (mem.size > 2000) mem.clear();
  try { await fbPut(`${MAIN}/ratelimit/${id}`, rec); } catch (e) { /* memory copy still counts */ }
  return { ok: true, id };
}
async function throttleClear(id) { mem.delete(id); try { await fetch(`${MAIN}/ratelimit/${id}.json`, { method: 'DELETE' }); } catch (e) { } }

module.exports = { secureOn, mintDbToken, throttle, throttleClear, clientIp, PLATFORM, hashPw, checkPw, isHashed, signTok, verifyTok, tokenOf, MAIN, validDb, enc, baseFor, fbGet, fbPut, seal, unseal, getSecrets, putSecrets, getCfg, timingSafe, jbody, raw, crypto };
