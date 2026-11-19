# QuickCart — upgrade 54 (launch build)

Start with **SETUP.md** (what you must do) and **BACKEND-GUIDE.md** (how to use your new Backend).

## NEW: 🛠 Backend (admin only)
No-code control center: Features (on/off, min plan, rename, badge, order, % rollout), Plans & pricing, Announcements, What’s new, custom Pages, Website content, Look & feel, Maintenance/sign-up switch, Owners, Inbox, History with rollback and scheduled releases. Draft → Preview → ▶ Run → live for everyone in ~1 minute.
Files: `api/platform.js`, `api/_platform.js`, `assets/backend.js` (admin UI), `assets/platform.js` (runtime loaded by dashboard/POS/store/website). Plans/trial/sign-up now come from the published config (`api/_plans.js`).

## Security (the big one)
* The database was fully open (anyone could read/change any store). Now: per-store access tokens (`QC_SECURE_DB=1`) + locked rules (`database.rules.json`; rollback copy in `firebase-rules/`). Shoppers can still browse, order and lower stock; nothing else.
* Login / staff login / register / forgot-password are rate-limited (brute-force lockout). Passwords ≥ 8. Terms must be accepted at sign-up.
* `/api/health` + **🩺 Launch check** page (admin) verify your whole setup, including that the rules really lock the database.
* Security headers in `vercel.json`.

## Fixed
* **Landing “image keeps growing”** — real cause: duplicate React keys in the live-sales feed. Fixed at the source (+ height clamp).
* **Banners from the Page Editor didn’t display** — the Page Editor had no banner/picture option. Added: top slider banner, banner strip, picture, gallery, video, reviews, contact block — with direct photo upload. (Store-builder banners already worked.)
* New sign-ups were sent to the old card page — now go to the dashboard.
* POS: card options, terminal-waiting, camera scanner and scan-confirmation screens were unstyled; empty-cart text was huge; Settings now solid and tidy.
* App icons / favicon / social image were missing (manifest pointed at files that didn’t exist) — added.
* Admin account moved to its own store (`users/admin`); old deal-site pages (store/submit/track-click) and their menu items removed.
* Landing page no longer shows invented stats (“₦2.4B”, “2,400+ stores”, “99.9% SLA”) or fake testimonials — add real ones in Backend → Website.

## Also in this build
Marketing pages (/features /demo /how-it-works /pricing /faq /contact /terms /privacy), contact form → your email + Backend inbox, Billing & Card and Backup removed (no card needed; trial starts instantly), **My Plan** page for owners, Import · Edit · Export (CSV, Excel, JSON, JSONL, XML, HTML, Markdown, TSV), coupon store dropdown, sitemap.xml / robots.txt.

## Tested (real headless Chrome against a copy of the deployment + fake secure Firebase)
Landing soak test (110 s), all marketing pages desktop+mobile, sign-up, all 22 dashboard panels, import/edit, banners from Page Editor, POS cash sale, staff login, 18 attacker probes against the locked rules, the whole Backend (edit → Run → owner/visitor/pricing/payments/sign-up see it; maintenance; rollback; preview; owners; inbox; POS switches).
**Not testable here:** the real Firebase rules engine, real Paystack, real email — that is why SETUP.md step 6 has Launch check + a rollback file.
