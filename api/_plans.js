require('./_fbauth');
// QuickCart subscription plans — the single source of truth for what a subscriber is charged.
// payment.html reads these through GET /api/paystack?action=plans, and the server only
// accepts a payment whose amount matches the plan stored on the user's account.
const BASE_PLANS = {
    starter:    { name: 'Starter',    monthly: 7900,   annual: 75840 },
    pro:        { name: 'Pro',        monthly: 16590,  annual: 159264 },
    enterprise: { name: 'Enterprise', monthly: 45000,  annual: 432000 },
};
/* The Backend can override names, prices, features and the trial length. The server always charges
   what the published config says (never what the browser sends). */
async function getPlans() {
  let cfg = null; try { cfg = (await require('./_platform').getPublished()).config; } catch (e) { }
  const out = {}; Object.keys(BASE_PLANS).forEach((k) => {
    const o = (cfg && cfg.plans && cfg.plans[k]) || {}, b = BASE_PLANS[k];
    const monthly = o.monthly || b.monthly, annual = o.annual || (o.monthly ? Math.round(o.monthly * 12 * 0.8) : b.annual);
    out[k] = { name: o.name || b.name, monthly, annual, tagline: o.tagline || '', features: o.features || [], popular: !!o.popular, hidden: !!o.hidden };
  });
  return out;
}
async function getSettings() {
  let cfg = null; try { cfg = (await require('./_platform').getPublished()).config; } catch (e) { }
  return { trialDays: (cfg && cfg.trialDays) || 14, signups: (cfg && cfg.signups) || { open: true, message: '' } };
}
module.exports = {
  PLANS: BASE_PLANS, getPlans, getSettings,
  TRIAL_DAYS: 14,
  CARD_CHECK_KOBO: 5000,
  PAID_DAYS: 30,
};
