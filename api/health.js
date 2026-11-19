require('./_fbauth');
// QuickCart — launch check.
//   GET  /api/health            → { ok:true }   (public uptime ping, reveals nothing)
//   POST /api/health  (platform-admin session) → full checklist: what is configured, what is missing, and how to fix it.
const { verifyTok, tokenOf, MAIN, secureOn, mintDbToken } = require('./_qc');
const { configured } = require('./_mail');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ ok: true, time: Date.now() });
  const tok = verifyTok(tokenOf(req));
  if (!tok || tok.r !== 'admin') return res.status(401).json({ ok: false, error: 'Platform admin only.' });

  const env = process.env, raw = global.__qcRawFetch || fetch, checks = [];
  const add = (id, label, ok, level, fix, note) => checks.push({ id, label, ok: !!ok, level, fix: ok ? '' : fix, note: note || '' });

  add('enc', 'Encryption key (QC_ENC_KEY)', (env.QC_ENC_KEY || '').length >= 16, 'required', 'Vercel → Settings → Environment Variables: add QC_ENC_KEY = any random text of 32+ characters. Never change it later or saved bank keys become unreadable.');
  add('adminpw', 'Platform admin password (QC_ADMIN_PASSWORD)', (env.QC_ADMIN_PASSWORD || '').length >= 10, 'required', 'Add QC_ADMIN_PASSWORD (10+ characters, not a word you use elsewhere). This is the password for username "admin".');
  add('fbsecret', 'Firebase database secret (FIREBASE_DB_SECRET)', !!env.FIREBASE_DB_SECRET, 'required', 'Firebase console → Project settings → Service accounts → Database secrets → copy → add as FIREBASE_DB_SECRET.');

  let reach = false, locked = null;
  try { const r = await fetch(`${MAIN}/dbmap.json`); reach = r.ok; } catch (e) { }
  add('db', 'Server can reach your Firebase database', reach, 'required', 'FIREBASE_DB_SECRET is wrong or the database URL changed. Re-copy the secret.');
  try { const r = await raw(`${MAIN}/users.json?shallow=true`); locked = r.status === 401 || r.status === 403; } catch (e) { }
  add('rules', 'Database rules are LOCKED (nobody can read customer data)', locked === true, 'required', 'Firebase console → Realtime Database → Rules → paste database.rules.json from this project → Publish. Do this AFTER step "Secure mode" below is on.', locked === false ? 'Right now anyone on the internet can read and change every store’s data.' : '');
  add('secure', 'Secure mode on (QC_SECURE_DB=1)', secureOn(), 'required', 'Add QC_SECURE_DB = 1 in Vercel and redeploy. Turn it on BEFORE publishing the locked rules.', locked === true && !secureOn() ? 'Rules are locked but secure mode is off — logged-in users will be blocked. Turn it on now.' : '');

  if (secureOn()) {
    const m = mintDbToken('__qc_health', 'owner', 1);
    let tokOk = false, isolated = null;
    try { const r = await raw(`${MAIN}/users/__qc_health/x.json?auth=${encodeURIComponent(m.token)}`); tokOk = r.ok; } catch (e) { }
    add('token', 'Firebase accepts the access tokens this server issues', tokOk, 'required', 'FIREBASE_DB_SECRET does not match this database, or the rules are not published yet.');
    if (locked) {
      try { const r = await raw(`${MAIN}/users/someone_else/orders.json?auth=${encodeURIComponent(m.token)}`); isolated = r.status === 401 || r.status === 403; } catch (e) { }
      add('isolation', 'One store cannot read another store’s data', isolated === true, 'required', 'Publish the rules from database.rules.json exactly as provided.');
    }
  }

  add('mail', 'Email sending (RESEND_API_KEY or BREVO_API_KEY + MAIL_FROM)', configured() && !!env.MAIL_FROM, 'required', 'Needed for password reset and the Contact page. Create a free Resend account, verify your domain, add RESEND_API_KEY and MAIL_FROM = QuickCart <no-reply@yourdomain.com>.');
  add('appurl', 'Site address (APP_URL)', /^https:\/\//.test(env.APP_URL || ''), 'required', 'Add APP_URL = https://yourdomain.com (used inside emails and the sitemap).');
  add('paystack', 'Paystack secret key for subscription payments (PAYSTACK_SECRET_KEY)', /^sk_(live|test)_/.test(env.PAYSTACK_SECRET_KEY || ''), 'required', 'Add PAYSTACK_SECRET_KEY = your sk_live_… key. Without it customers cannot pay for their plan.', /^sk_test_/.test(env.PAYSTACK_SECRET_KEY || '') ? 'This is a TEST key — real money will not move. Switch to sk_live_ to sell.' : '');
  add('paypub', 'Paystack public key (PAYSTACK_PUBLIC_KEY)', /^pk_(live|test)_/.test(env.PAYSTACK_PUBLIC_KEY || ''), 'recommended', 'Add PAYSTACK_PUBLIC_KEY = your pk_live_… key (the one in payment.html belongs to the original account).');
  add('contact', 'Contact form inbox (CONTACT_TO)', !!env.CONTACT_TO, 'optional', 'Optional. Messages go to hnrkane@gmail.com unless you set CONTACT_TO.');
  add('vercel', 'Automatic custom domains (VERCEL_API_TOKEN + VERCEL_PROJECT_ID)', !!(env.VERCEL_API_TOKEN && env.VERCEL_PROJECT_ID), 'recommended', 'Without these, you must add each customer’s domain in Vercel by hand.');

  const blockers = checks.filter((c) => c.level === 'required' && !c.ok).length;
  return res.status(200).json({ ok: true, ready: blockers === 0, blockers, checks, time: Date.now() });
};
