require('./_fbauth');
// QuickCart — subscription payments with Paystack (Vercel serverless function).
//
//   GET  /api/paystack?action=plans     → plan prices (single source of truth)
//   POST /api/paystack {action:'verify', reference, kind:'trial'|'pay', username}
//        Asks Paystack whether the payment really happened (never trusts the browser), checks
//        the amount / email, activates the trial or plan, saves the card for later billing
//        (encrypted) and refunds the ₦50 card-check charge.
//
// Env (Vercel → Settings → Environment Variables):
//   PAYSTACK_SECRET_KEY  sk_live_… of the QuickCart platform account   (required)
//   QC_ENC_KEY           long random text; encrypts saved card tokens   (required to save cards)
const { MAIN, enc, fbGet, fbPut, seal, unseal, jbody, verifyTok, tokenOf } = require('./_qc');
const { getPlans, getSettings, PAID_DAYS } = require('./_plans');

const PS = 'https://api.paystack.co';
const out = (res, code, obj) => res.status(code).json(obj);
const psFetch = async (path, opt) => {
  const r = await fetch(PS + path, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET_KEY, 'Content-Type': 'application/json' }, (opt && opt.headers) || {}) }));
  let j = null; try { j = await r.json(); } catch (e) { j = {}; }
  return { ok: r.ok, status: r.status, json: j };
};
const patch = async (url, data) => {
  const r = await fetch(url + '.json', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!r.ok) throw new Error('Database write failed (' + r.status + ')');
};
async function findUser(username) {
  username = String(username || '').trim();
  if (!/^[A-Za-z0-9._@+-]{2,80}$/.test(username)) return null;
  const r = await fetch(`${MAIN}/users.json?orderBy="username"&equalTo="${enc(username)}"`);
  if (!r.ok) return null;
  const d = await r.json();
  if (!d || typeof d !== 'object') return null;
  const key = Object.keys(d).find((k) => d[k] && !d[k].isStaff);
  return key ? { key, user: d[key] } : null;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      if ((req.query && req.query.action) === 'plans') return out(res, 200, { ok: true, plans: await getPlans(), trialDays: (await getSettings()).trialDays, publicKey: process.env.PAYSTACK_PUBLIC_KEY || '' });
      return out(res, 404, { ok: false, error: 'Unknown action' });
    }
    if (req.method !== 'POST') return out(res, 405, { ok: false, error: 'Method not allowed' });
    if (!process.env.PAYSTACK_SECRET_KEY) return out(res, 500, { ok: false, code: 'NO_SECRET', error: 'Payments are not fully set up yet: add PAYSTACK_SECRET_KEY in Vercel → Settings → Environment Variables and redeploy.' });

    const b = jbody(req);
    const tok = verifyTok(tokenOf(req));
    if (!tok || tok.r !== 'owner') return out(res, 401, { ok: false, code: 'NO_SESSION', error: 'Please log in again to continue.' });
    const key = tok.k;
    const user = await fbGet(`${MAIN}/users/${enc(key)}`);
    if (!user) return out(res, 404, { ok: false, error: 'We could not find your account. Please log in again.' });
    const PLANS = await getPlans(); const plan = PLANS[user.plan] || PLANS.starter;

    if (b.action === 'card') {   // what card is saved?
      const bill = await fbGet(`${MAIN}/billing/${enc(key)}`);
      return out(res, 200, { ok: true, status: user.status, trialEnds: user.trialEnds || null, subExpires: user.subExpires || null, plan: user.plan, planName: plan.name, monthly: plan.monthly, backupUntil: user.backupUntil || null, card: bill ? { last4: bill.last4, brand: bill.brand, bank: bill.bank, exp: (bill.expMonth || '') + '/' + (bill.expYear || '') } : null });
    }
    if (b.action !== 'verify') return out(res, 400, { ok: false, error: 'Unknown action' });
    const reference = String(b.reference || '').trim();
    if (b.kind && b.kind !== 'pay') return out(res, 400, { ok: false, error: 'Unsupported payment type.' });
    const kind = 'pay';
    if (!/^[A-Za-z0-9_.=-]{6,100}$/.test(reference)) return out(res, 400, { ok: false, error: 'Bad payment reference' });

    // Already processed? (page refresh / double callback) → return the stored result.
    const seen = await fbGet(`${MAIN}/payments/${enc(reference)}`);
    if (seen && seen.ok) return out(res, 200, Object.assign({ ok: true, repeat: true }, seen));

    const v = await psFetch('/transaction/verify/' + enc(reference));
    const d = v.json && v.json.data;
    if (!v.ok || !d) return out(res, 502, { ok: false, error: (v.json && v.json.message) || 'Paystack could not confirm this payment.' });
    if (d.status !== 'success') return out(res, 402, { ok: false, error: 'Payment was not completed (' + d.status + ').' });
    if (String(d.currency || 'NGN') !== 'NGN') return out(res, 402, { ok: false, error: 'Unexpected currency.' });
    const want = plan.monthly * 100;
    if (Number(d.amount) < want) return out(res, 402, { ok: false, error: 'The amount paid does not match your plan.' });
    const mail = String((d.customer && d.customer.email) || '').toLowerCase();
    if (user.email && mail && mail !== String(user.email).toLowerCase()) return out(res, 402, { ok: false, error: 'This payment was made with a different email address.' });

    const now = Date.now(), iso = (t) => new Date(t).toISOString();
    const a = d.authorization || {};
    const card = { last4: a.last4 || '', brand: a.brand || a.card_type || '', bank: a.bank || '', expMonth: a.exp_month || '', expYear: a.exp_year || '', reusable: !!a.reusable };

    const cardSaved = false, refunded = false, warn = '';
    // A confirmed payment switches the plan on for one billing period. (No card is stored.)
    const update = { status: 'active', plan: user.plan || 'starter', subExpires: iso(now + PAID_DAYS * 86400000), lastPaymentRef: reference, lastPaymentAmount: d.amount / 100, lastPaymentDate: iso(now) };
    const message = 'Payment confirmed — your ' + plan.name + ' plan is active.';
    await patch(`${MAIN}/users/${enc(key)}`, update);

    const result = { ok: true, kind, message, backupUntil: update.backupUntil || null, cardSaved, refunded, card: { last4: card.last4, brand: card.brand }, trialEnds: update.trialEnds || null, subExpires: update.subExpires || null, warn };
    try { await fbPut(`${MAIN}/payments/${enc(reference)}`, Object.assign({ user: key, at: iso(now) }, result)); } catch (e) { /* non-fatal */ }
    return out(res, 200, result);
  } catch (e) {
    return out(res, 500, { ok: false, error: e && e.message ? e.message : 'Server error' });
  }
};
