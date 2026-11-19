# Go / No-go checklist

**Must be ✅ before you charge customers**
- [ ] 🩺 Launch check shows no red ❌ (admin → Launch check)
- [ ] Database rules **locked** (SETUP.md step 6) and tested
- [ ] Paystack **live** keys in Vercel; a real small payment tested end to end
- [ ] Email working (password reset arrives; Contact page emails you)
- [ ] Your domain + `APP_URL` set; HTTPS works
- [ ] Terms & Privacy reviewed by a lawyer; company name added
- [ ] You changed `QC_ADMIN_PASSWORD` to something long and private
- [ ] Firebase scheduled backups on
- [ ] Landing page shows **no invented numbers/reviews** (Backend → Website: add only true ones)

**Nice to have**
- [ ] Custom-domain automation (`VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`)
- [ ] A **What’s new** post and a welcome **Page** (training video) built in the Backend
- [ ] Support email on the Website tab

**Known limits (be aware)**
- Product **cost price** is stored on the same record as the selling price, so a technical visitor can see it in a store’s product feed. Don’t rely on cost being secret.
- Shoppers’ stock deduction is allowed from the storefront (they can only *lower* stock, never raise it).
- Feature locks in the Backend are display controls, not security.
