require('./_fbauth');
// QuickCart — "Contact us" form.  POST { name, email, phone?, topic?, message, website(honeypot) }
// 1) saves a copy in Firebase (/contact_messages, server-only)  2) emails it to CONTACT_TO (default hnrkane@gmail.com)
// The visitor's address is set as Reply-To, so you can just hit "Reply" in your inbox.
const { sendMail, configured, shell, esc } = require('./_mail');

const FB = 'https://sneakerai-c96f0-default-rtdb.firebaseio.com';
const TO = process.env.CONTACT_TO || 'hnrkane@gmail.com';
const hits = new Map();   // best-effort flood guard (per server instance)

function clean(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max); }

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  let b = {};
  try { b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) {}

  if (b.website) return res.status(200).json({ ok: true });   // honeypot: bots fill this in; pretend success

  const name = clean(b.name, 80), email = clean(b.email, 120).toLowerCase(), phone = clean(b.phone, 30),
        topic = clean(b.topic, 60) || 'General question', message = clean(b.message, 4000);
  if (!name || !message) return res.status(400).json({ ok: false, error: 'Please fill in your name and message.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });

  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket && req.socket.remoteAddress || '?').trim();
  const now = Date.now(), recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (recent.length >= 5) return res.status(429).json({ ok: false, error: 'Too many messages — please wait a few minutes or email us directly.' });
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 500) hits.clear();

  const record = { name, email, phone, topic, message, at: now, ip };
  let saved = false, mailed = false;
  try {
    const r = await fetch(`${FB}/contact_messages.json`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) });
    saved = r.ok;
  } catch (e) { console.error('contact save failed:', e.message); }

  if (configured()) {
    try {
      const html = shell('New message from the website', `
        <table role="presentation" style="width:100%;font-size:14px;color:#3b4a6b;margin:0 0 18px">
          <tr><td style="padding:4px 0;width:90px;color:#7a88a8">Name</td><td><b>${esc(name)}</b></td></tr>
          <tr><td style="padding:4px 0;color:#7a88a8">Email</td><td><a href="mailto:${esc(email)}" style="color:#ff5a1f">${esc(email)}</a></td></tr>
          ${phone ? `<tr><td style="padding:4px 0;color:#7a88a8">Phone</td><td>${esc(phone)}</td></tr>` : ''}
          <tr><td style="padding:4px 0;color:#7a88a8">Topic</td><td>${esc(topic)}</td></tr>
        </table>
        <div style="background:#f6f8fd;border-radius:12px;padding:18px;font-size:15px;line-height:1.7;color:#0a1f44;white-space:pre-wrap">${esc(message)}</div>
        <p style="margin:18px 0 0;font-size:12px;color:#7a88a8">Just hit Reply — it goes to ${esc(email)}.</p>`);
      await sendMail({ to: TO, replyTo: email, subject: `[QuickCart] ${topic} — ${name}`, html,
        text: `New website message\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || '-'}\nTopic: ${topic}\n\n${message}\n` });
      mailed = true;
    } catch (e) { console.error('contact mail failed:', e.code || '', e.message, e.detail ? JSON.stringify(e.detail) : ''); }
  }

  if (saved || mailed) return res.status(200).json({ ok: true });
  return res.status(503).json({ ok: false, error: 'We could not send your message right now. Please email hnrkane@gmail.com directly.' });
};
