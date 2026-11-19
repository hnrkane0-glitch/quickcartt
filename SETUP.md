# QuickCart — what YOU must do to go live

Everything in the code is built and tested. These are the steps only you can do (accounts, keys, domain).
Do them **in this order**. Each step says how to check it worked. Budget: 1–2 hours.

> After step 5, log in as **admin** and open **🩺 Launch check** in the menu — it shows ✅/❌ for everything below and tells you what is left.

---------------------------------------------------------------------------------------------------

## 1 · Put the project on Vercel
1. Unzip this project. Push the folder to a **GitHub** repository (private is fine).
2. Vercel → **Add New → Project** → pick that repository → **Deploy** (no build settings needed).
3. Open the site address Vercel gives you. You should see the landing page.

## 2 · Firebase (your database)
The app already points at the Firebase Realtime Database used before (`sneakerai-c96f0`).
1. Firebase console → that project → **Project settings → Service accounts → Database secrets** → **Show / Copy**.
2. You will paste it into Vercel as `FIREBASE_DB_SECRET` in step 5.
3. **Do not publish new rules yet** — that is step 6 (order matters).

*Using a different Firebase project?* Tell me — the database address appears in a few files and must be changed there.

## 3 · Email (password reset + Contact page)
1. Create a free account at **resend.com** → *Domains* → add your domain and add the DNS records it shows (at your domain registrar).
2. Resend → *API Keys* → create one → copy it (`RESEND_API_KEY`).
3. Choose a sender on that domain, e.g. `QuickCart <no-reply@yourdomain.com>` (`MAIL_FROM`).
Without this, password-reset emails and the Contact page email will not work (contact messages are still saved and visible in **Backend → Inbox**).

## 4 · Paystack (so customers can pay you)
1. Paystack dashboard → **Settings → API Keys & Webhooks**.
2. Copy the **live** secret key (`sk_live_…`) and public key (`pk_live_…`).
3. Test first with the `sk_test_…` / `pk_test_…` keys: pay for a plan with Paystack’s test card, then switch to live.
Note: customers’ own shop payments go to **their own** Paystack — that is configured by them in their dashboard.

## 5 · Environment variables in Vercel
Vercel → your project → **Settings → Environment Variables**. Add (see `.env.example` for the full list with notes):

| Name | What to put |
|---|---|
| `QC_ENC_KEY` | any random 32+ characters (never change it later) |
| `QC_ADMIN_PASSWORD` | a long password — this is your **admin** login |
| `FIREBASE_DB_SECRET` | the secret from step 2 |
| `APP_URL` | `https://yourdomain.com` |
| `RESEND_API_KEY`, `MAIL_FROM` | from step 3 |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` | from step 4 |

Then **Deployments → ⋯ → Redeploy**. Log in at `/login` with username **admin** and your `QC_ADMIN_PASSWORD`, open **🩺 Launch check**.
At this point everything should be ✅ **except** “Secure mode” and “Database rules are LOCKED”.

## 6 · Lock the database (VERY IMPORTANT — do not skip)
Until you do this, anyone who knows a store’s link can read/change that store’s data (customers, orders). Do it in this exact order:
1. Vercel → add `QC_SECURE_DB` = `1` → **Redeploy**.
2. Launch check → “Firebase accepts the access tokens this server issues” must be ✅. (If ❌: the database secret is wrong.)
3. Firebase console → **Realtime Database → Rules** → delete what’s there → paste the contents of **`database.rules.json`** → **Publish**.
4. Launch check again → “Database rules are LOCKED” ✅ and “One store cannot read another store’s data” ✅.
5. Test by hand (5 minutes): log in as a test owner → dashboard loads; open a store link in a private window → products show; place a test order; POS sale works.
6. **If anything breaks:** Firebase → Rules → paste **`firebase-rules/ROLLBACK-open-rules.json`** → Publish. Everything returns to how it was (but unlocked) while you investigate.
Owners who were already logged in simply log in again once.

## 7 · Your own domain
1. Vercel → **Settings → Domains** → add `yourdomain.com` and `www.yourdomain.com` → add the DNS records at your registrar.
2. Make sure `APP_URL` matches. Open `https://yourdomain.com/sitemap.xml` — it should list the pages.
3. *(Optional)* For automatic custom domains for your customers add `VERCEL_API_TOKEN` + `VERCEL_PROJECT_ID` (see `.env.example`).

## 8 · Back up your data (the app no longer has a backup page)
Firebase → Realtime Database → **Backups** (scheduled daily backups, on the Blaze plan) — turn it on. Also use **Dashboard → Import · Edit · Export → Export** for a product export any time.

## 9 · Legal wording
`/terms` and `/privacy` are plain-language templates. Before taking money, have a Nigerian lawyer review them and add your **registered company name and address**. Edit them by changing `terms.html` / `privacy.html`.

## 10 · Your first-day test (do it yourself, as a customer)
1. Visit `/register` → create a store (tick the Terms box) → you land in the dashboard (trial: 14 days).
2. **Import** a few products (CSV) → open the store link → products show → add one to cart → place an order.
3. Open **POS** → ring up a cash sale.
4. Log out → **Forgot password** → you receive the email.
5. **My Plan → Pay / renew** with the Paystack **test** key → plan shows Active.
6. Use the **Contact** page → you receive the email and see it in **Backend → Inbox**.
7. In **Backend**, change something small, **Preview**, then **▶ Run** (see BACKEND-GUIDE.md).

---------------------------------------------------------------------------------------------------
Questions? Everything here can also be asked of me — just say which step.
