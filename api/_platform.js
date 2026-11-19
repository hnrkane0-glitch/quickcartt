require('./_fbauth');
/* QuickCart — Platform config ("Backend").
   One JSON document describes everything the platform admin can change without touching code:
   which dashboard features are on/off (and for which plan), plans & prices, announcements, "What's new" releases,
   custom pages, public-website text, theme and kill-switches.
   Stored server-only in Firebase:  /platform/published   (what everyone sees)
                                    /platform/draft       (what the admin is editing)
                                    /platform/history/*   (every release — roll back any time)
                                    /platform/scheduled   (a release waiting for its time)
                                    /platform/audit/*     (who changed what) */
const { MAIN } = require('./_qc');

const PLAN_IDS = ['starter', 'pro', 'enterprise'];
const BADGES = ['', 'new', 'beta', 'soon', 'pro'];
const KINDS = ['info', 'success', 'warning', 'promo'];
const WHERE = ['dashboard', 'pos', 'site', 'store'];

const DEFAULT_CONFIG = () => ({
  modules: {}, flags: {},
  plans: {},                      // overrides on top of api/_plans.js (name, monthly, annual, tagline, features[], popular, hidden)
  trialDays: 14,
  signups: { open: true, message: '' },
  maintenance: { on: false, scope: 'all', title: 'We’ll be right back', message: 'QuickCart is being upgraded. Please try again in a few minutes.', eta: '' },
  announcements: [], whatsNew: [], pages: [],
  site: { announcement: { on: false, text: '', link: '', label: '', bg: '#0a1f44' }, hero: { eyebrow: '', title: '', subtitle: '', cta1: '', cta2: '' }, faq: [], stats: [], reviews: [], contactEmail: '', footerNote: '' },
  theme: { accent: '', accent2: '', radius: null },
});

/* ───────── sanitiser: only known fields, clamped lengths, safe URLs ───────── */
const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
const num = (v, min, max, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const url = (v) => { v = str(v, 500).trim(); if (!v) return ''; if (/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(v)) return v; return /^[\w-]+(\.[\w-]+)+(\/|$)/.test(v) ? 'https://' + v : ''; };
const img = (v) => { v = str(v, 260000).trim(); return /^(https?:\/\/|\/)/i.test(v) || /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : ''; };
const color = (v, d) => (/^#[0-9a-f]{3,8}$/i.test(String(v || '')) ? String(v) : d);
const iso = (v) => { const t = Date.parse(v); return Number.isFinite(t) && String(v).length < 40 ? new Date(t).toISOString() : ''; };
const slug = (v) => (/^[a-z0-9_-]{1,40}$/i.test(String(v || '')) ? String(v) : null);
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const plans = (v) => arr(v, 3).filter((p) => PLAN_IDS.includes(p));
const where = (v) => arr(v, 4).filter((p) => WHERE.includes(p));
const rid = () => Math.random().toString(36).slice(2, 9);

function embedUrl(u) {   // only YouTube / Vimeo / Google Maps / Calendly style embeds
  u = String(u || '').trim(); let m;
  if ((m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/))) return 'https://www.youtube.com/embed/' + m[1];
  if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d{6,12})/))) return 'https://player.vimeo.com/video/' + m[1];
  if (/^https:\/\/(calendly\.com|www\.google\.com\/maps\/embed|docs\.google\.com\/forms|forms\.gle)\//i.test(u)) return u.slice(0, 500);
  return '';
}

function block(b) {
  if (!b || typeof b !== 'object') return null;
  const t = String(b.type || '');
  if (t === 'heading') return { type: t, text: str(b.text, 160), level: b.level === 3 ? 3 : 2 };
  if (t === 'text') return { type: t, text: str(b.text, 4000) };
  if (t === 'image') { const s = img(b.src); return s ? { type: t, src: s, alt: str(b.alt, 120), caption: str(b.caption, 200) } : null; }
  if (t === 'button') { const l = url(b.link); return l ? { type: t, label: str(b.label, 60) || 'Open', link: l, style: b.style === 'ghost' ? 'ghost' : 'solid' } : null; }
  if (t === 'video') { const e = embedUrl(b.url); return e ? { type: t, url: str(b.url, 300), embed: e } : null; }
  if (t === 'embed') { const e = embedUrl(b.url); return e ? { type: t, url: str(b.url, 300), embed: e, height: num(b.height, 200, 1000, 520) } : null; }
  if (t === 'list') return { type: t, style: ['bullets', 'numbers', 'checks'].includes(b.style) ? b.style : 'bullets', items: arr(b.items, 20).map((x) => str(x, 240)).filter(Boolean) };
  if (t === 'callout') return { type: t, kind: KINDS.includes(b.kind) ? b.kind : 'info', text: str(b.text, 800) };
  if (t === 'faq') return { type: t, items: arr(b.items, 12).map((x) => ({ q: str(x && x.q, 180), a: str(x && x.a, 900) })).filter((x) => x.q) };
  if (t === 'divider') return { type: t };
  return null;
}

function sanitize(input) {
  const i = input && typeof input === 'object' ? input : {}, d = DEFAULT_CONFIG(), o = DEFAULT_CONFIG();
  // modules
  Object.keys(i.modules || {}).slice(0, 80).forEach((k) => {
    if (!/^[a-z0-9_]{1,30}$/i.test(k)) return; const m = i.modules[k] || {};
    o.modules[k] = { on: m.on !== false, minPlan: PLAN_IDS.includes(m.minPlan) ? m.minPlan : 'starter', label: str(m.label, 40), icon: str(m.icon, 8), badge: BADGES.includes(m.badge) ? m.badge : '', order: m.order == null || m.order === '' ? null : num(m.order, 0, 999, null), message: str(m.message, 200), pct: num(m.pct, 0, 100, 100) };
  });
  Object.keys(i.flags || {}).slice(0, 60).forEach((k) => { if (/^[a-z0-9_.]{1,40}$/i.test(k)) o.flags[k] = !!i.flags[k]; });
  // plans
  PLAN_IDS.forEach((p) => {
    const x = (i.plans || {})[p]; if (!x || typeof x !== 'object') return;
    const mo = Number(x.monthly), an = Number(x.annual), monthly = mo >= 100 && mo <= 10000000 ? Math.round(mo) : 0, annual = an >= 100 && an <= 120000000 ? Math.round(an) : 0;   // out-of-range prices are ignored (default price stays)
    o.plans[p] = { name: str(x.name, 30), monthly: monthly || undefined, annual: annual || undefined, tagline: str(x.tagline, 90), features: arr(x.features, 14).map((f) => str(f, 90)).filter(Boolean), popular: !!x.popular, hidden: !!x.hidden };
    Object.keys(o.plans[p]).forEach((k) => o.plans[p][k] === undefined && delete o.plans[p][k]);
  });
  o.trialDays = Math.round(num(i.trialDays, 1, 90, d.trialDays));
  o.signups = { open: !(i.signups && i.signups.open === false), message: str(i.signups && i.signups.message, 200) };
  const mt = i.maintenance || {}; o.maintenance = { on: !!mt.on, scope: ['all', 'dashboard', 'pos', 'store'].includes(mt.scope) ? mt.scope : 'all', title: str(mt.title, 80) || d.maintenance.title, message: str(mt.message, 400) || d.maintenance.message, eta: str(mt.eta, 60) };
  o.announcements = arr(i.announcements, 20).map((a) => a && typeof a === 'object' ? { id: slug(a.id) || 'a' + rid(), on: a.on !== false, kind: KINDS.includes(a.kind) ? a.kind : 'info', title: str(a.title, 90), text: str(a.text, 500), link: url(a.link), linkLabel: str(a.linkLabel, 30), plans: plans(a.plans), where: where(a.where).length ? where(a.where) : ['dashboard'], start: iso(a.start), end: iso(a.end), dismissible: a.dismissible !== false, pct: num(a.pct, 0, 100, 100) } : null).filter((a) => a && (a.title || a.text));
  o.whatsNew = arr(i.whatsNew, 30).map((w) => w && typeof w === 'object' ? { id: slug(w.id) || 'w' + rid(), date: str(w.date, 12) || new Date().toISOString().slice(0, 10), title: str(w.title, 110), body: str(w.body, 1800), tag: str(w.tag, 20), link: url(w.link), image: img(w.image) } : null).filter((w) => w && w.title);
  o.pages = arr(i.pages, 20).map((p) => p && typeof p === 'object' ? { id: slug(p.id) || 'p' + rid(), on: p.on !== false, title: str(p.title, 60) || 'Untitled', icon: str(p.icon, 8) || '📄', group: str(p.group, 30) || 'Resources', plans: plans(p.plans), pct: num(p.pct, 0, 100, 100), blocks: arr(p.blocks, 40).map(block).filter(Boolean) } : null).filter(Boolean);
  const s = i.site || {}, an = s.announcement || {}, h = s.hero || {};
  o.site = {
    announcement: { on: !!an.on, text: str(an.text, 200), link: url(an.link), label: str(an.label, 30), bg: color(an.bg, '#0a1f44') },
    hero: { eyebrow: str(h.eyebrow, 60), title: str(h.title, 120), subtitle: str(h.subtitle, 300), cta1: str(h.cta1, 40), cta2: str(h.cta2, 40) },
    faq: arr(s.faq, 20).map((f) => ({ q: str(f && f.q, 180), a: str(f && f.a, 900) })).filter((f) => f.q && f.a),
    stats: arr(s.stats, 4).map((x) => ({ value: str(x && x.value, 20), label: str(x && x.label, 40) })).filter((x) => x.value && x.label),
    reviews: arr(s.reviews, 8).map((x) => ({ text: str(x && x.text, 420), name: str(x && x.name, 60), role: str(x && x.role, 90) })).filter((x) => x.text && x.name),
    contactEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.contactEmail || '')) ? str(s.contactEmail, 120) : '', footerNote: str(s.footerNote, 200),
  };
  const t = i.theme || {}; o.theme = { accent: color(t.accent, ''), accent2: color(t.accent2, ''), radius: t.radius == null || t.radius === '' ? null : num(t.radius, 0, 24, null) };
  return o;
}

/* ───────── storage ───────── */
const P = `${MAIN}/platform`;
const J = { 'Content-Type': 'application/json' };
async function jget(path) { try { const r = await fetch(`${P}/${path}.json`); return r.ok ? await r.json() : null; } catch (e) { return null; } }
async function jput(path, v) { const r = await fetch(`${P}/${path}.json`, { method: 'PUT', headers: J, body: JSON.stringify(v) }); if (!r.ok) throw new Error('Database refused the write (' + r.status + ')'); }
async function jdel(path) { try { await fetch(`${P}/${path}.json`, { method: 'DELETE' }); } catch (e) { } }

let cache = null, cacheAt = 0;
async function publishConfig(config, by, note) {
  const cur = await jget('published'), version = ((cur && cur.version) || 0) + 1, now = Date.now(), id = String(now).padStart(14, '0') + '_' + version;
  const rec = { version, config, publishedAt: new Date(now).toISOString(), by: by || 'admin', note: str(note, 200) };
  await jput('published', rec); await jput('history/' + id, rec);
  const hist = await jget('history'); if (hist) { const keys = Object.keys(hist).sort(); for (const k of keys.slice(0, Math.max(0, keys.length - 60))) await jdel('history/' + k); }
  await audit(by, 'publish', 'v' + version + (note ? ' — ' + note : '')); cache = null; return rec;
}
async function audit(by, action, note) { try { await jput('audit/' + String(Date.now()).padStart(14, '0') + '_' + rid(), { at: new Date().toISOString(), by: by || 'admin', action, note: str(note, 300) }); } catch (e) { } }

/* what everybody sees. A release scheduled for a time that has now passed goes live here. */
async function getPublished() {
  if (cache && Date.now() - cacheAt < 15000) return cache;
  let rec = await jget('published');
  const sch = await jget('scheduled');
  if (sch && sch.at && Date.parse(sch.at) <= Date.now() && sch.config) { rec = await publishConfig(sanitize(sch.config), 'scheduler', sch.note || 'Scheduled release'); await jdel('scheduled'); }
  if (!rec || !rec.config) rec = { version: 0, config: DEFAULT_CONFIG(), publishedAt: null, by: '', note: '' };
  cache = rec; cacheAt = Date.now(); return rec;
}

module.exports = { DEFAULT_CONFIG, sanitize, getPublished, publishConfig, audit, jget, jput, jdel, embedUrl, PLAN_IDS, str };
