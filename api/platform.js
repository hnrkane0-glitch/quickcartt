require('./_fbauth');
// QuickCart — Backend API.
//   GET  /api/platform[?v=N]  → public: the live platform config (everyone's dashboards/POS/website read this). ?v=N returns {same:true} if nothing changed.
//   POST /api/platform        → platform ADMIN only: draft, publish ("Run"), schedule, history/rollback, audit, contact inbox.
const { MAIN, verifyTok, tokenOf, enc } = require('./_qc');
const { DEFAULT_CONFIG, sanitize, getPublished, publishConfig, audit, jget, jput, jdel, str } = require('./_platform');

const out = (res, code, o) => res.status(code).json(o);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const rec = await getPublished();
      res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
      if (req.query && String(req.query.v) === String(rec.version)) return out(res, 200, { ok: true, same: true, version: rec.version });
      return out(res, 200, { ok: true, version: rec.version, config: rec.config, at: rec.publishedAt, serverTime: Date.now() });
    }
    if (req.method !== 'POST') return out(res, 405, { ok: false, error: 'GET or POST only' });
    const tok = verifyTok(tokenOf(req));
    if (!tok || tok.r !== 'admin') return out(res, 401, { ok: false, error: 'Platform admin only.' });
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const act = String(b.action || ''), by = 'admin';

    const pub = await getPublished();
    const draftRec = await jget('draft');
    const state = async () => {
      const sch = await jget('scheduled'), hist = await jget('history');
      const draft = draftRec && draftRec.config ? draftRec : null;
      return { ok: true, published: { version: pub.version, config: pub.config, at: pub.publishedAt, note: pub.note }, draft: draft ? { config: draft.config, at: draft.at } : null, dirty: !!draft && !same(draft.config, pub.config), scheduled: sch ? { at: sch.at, note: sch.note } : null, historyCount: hist ? Object.keys(hist).length : 0 };
    };

    if (act === 'state') return out(res, 200, await state());
    if (act === 'draft') return out(res, 200, { ok: true, config: (draftRec && draftRec.config) || pub.config, isDraft: !!draftRec });   // used by "Preview as owner"

    if (act === 'save-draft') {
      const config = sanitize(b.config); if (JSON.stringify(config).length > 900000) return out(res, 413, { ok: false, error: 'Too much content — shrink images or remove some pages.' });
      await jput('draft', { config, at: new Date().toISOString() }); draftRec && (draftRec.config = config);
      return out(res, 200, { ok: true, dirty: !same(config, pub.config), config });
    }
    if (act === 'discard-draft') { await jdel('draft'); await audit(by, 'discard-draft', ''); return out(res, 200, { ok: true, config: pub.config }); }

    if (act === 'publish') {
      const config = draftRec && draftRec.config ? draftRec.config : pub.config;
      if (b.confirmMaintenance !== true && config.maintenance && config.maintenance.on && !(pub.config.maintenance && pub.config.maintenance.on)) return out(res, 409, { ok: false, needsConfirm: 'maintenance', error: 'Maintenance mode is ON in this release — owners will be blocked. Confirm to continue.' });
      const rec = await publishConfig(config, by, b.note); await jdel('draft'); await jdel('scheduled');
      return out(res, 200, { ok: true, version: rec.version });
    }
    if (act === 'schedule') {
      const at = Date.parse(b.at); if (!Number.isFinite(at) || at < Date.now() + 30000) return out(res, 400, { ok: false, error: 'Pick a time in the future.' });
      const config = draftRec && draftRec.config ? draftRec.config : pub.config;
      await jput('scheduled', { at: new Date(at).toISOString(), note: str(b.note, 200), config }); await audit(by, 'schedule', new Date(at).toISOString());
      return out(res, 200, { ok: true, at: new Date(at).toISOString() });
    }
    if (act === 'cancel-schedule') { await jdel('scheduled'); await audit(by, 'cancel-schedule', ''); return out(res, 200, { ok: true }); }

    if (act === 'history') {
      const h = (await jget('history')) || {};
      return out(res, 200, { ok: true, items: Object.keys(h).sort().reverse().slice(0, 40).map((id) => ({ id, version: h[id].version, at: h[id].publishedAt, by: h[id].by, note: h[id].note })) });
    }
    if (act === 'history-get') { const h = await jget('history/' + String(b.id).replace(/[^\w]/g, '')); return h ? out(res, 200, { ok: true, config: h.config, version: h.version }) : out(res, 404, { ok: false, error: 'Release not found' }); }
    if (act === 'rollback') {
      const h = await jget('history/' + String(b.id).replace(/[^\w]/g, '')); if (!h || !h.config) return out(res, 404, { ok: false, error: 'Release not found' });
      const rec = await publishConfig(sanitize(h.config), by, 'Rollback to v' + h.version); await jdel('draft');
      return out(res, 200, { ok: true, version: rec.version });
    }
    if (act === 'audit') {
      const a = (await jget('audit')) || {}; return out(res, 200, { ok: true, items: Object.keys(a).sort().reverse().slice(0, 60).map((k) => a[k]) });
    }

    /* contact-form inbox */
    if (act === 'messages') {
      const r = await fetch(`${MAIN}/contact_messages.json`); const m = (r.ok && (await r.json())) || {};
      const items = Object.keys(m).map((id) => Object.assign({ id }, m[id])).sort((x, y) => (y.at || 0) - (x.at || 0)).slice(0, 150);
      return out(res, 200, { ok: true, items, unread: items.filter((x) => !x.read).length });
    }
    if (act === 'message-set') { const id = enc(String(b.id)); await fetch(`${MAIN}/contact_messages/${id}/read.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(!!b.read) }); return out(res, 200, { ok: true }); }
    if (act === 'message-delete') { await fetch(`${MAIN}/contact_messages/${enc(String(b.id))}.json`, { method: 'DELETE' }); await audit(by, 'message-delete', String(b.id)); return out(res, 200, { ok: true }); }

    return out(res, 400, { ok: false, error: 'Unknown action' });
  } catch (e) {
    console.error('platform error:', e.message);
    return out(res, 500, { ok: false, error: 'Something went wrong. Please try again.' });
  }
};
