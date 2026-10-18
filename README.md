# Legendary Cleaners CRM — installable phone web app

## Included
- Responsive phone-first interface with labeled bottom tabs
- Job scheduling, edit/delete, assignment, status, and Google Maps directions
- Customer directory with phone/address and schedule-job shortcut
- Day, last-7-days, month and all-time revenue totals from completed jobs
- Local persistence in the browser using localStorage
- PWA manifest and service worker for install/offline app shell

## Try it
Open `index.html` in a modern browser for a quick preview. Some PWA installation/offline features require HTTPS or localhost.

## Install on your phone
1. Upload the contents of this folder to an HTTPS static host (for example, a static hosting service you control). Keep `index.html`, `manifest.webmanifest`, `sw.js`, and both icon files together.
2. Open the hosted HTTPS URL on your phone.
3. iPhone: open the URL in Safari, tap Share, then **Add to Home Screen**.
4. Android: open the URL in Chrome, tap the menu, then **Install app** or **Add to Home screen**.
5. Launch it from the new home-screen icon.

## Important limitations
This version saves records only in the browser/device where you enter them. It is not yet a shared cloud database, has no user authentication, and does not sync across iPhone and Android. Browser data can be lost if you clear site storage. Export/backup and a secure cloud backend should be added before using it as the sole source of business records. Revenue is gross completed-job revenue, not profit. Sample data is not preloaded.


## Secure employee accounts (required setup)

This version uses **Supabase Auth** for email/password sign-up, sign-in, sign-out, and password-reset emails. Accounts are not implemented by storing plaintext passwords in the app.

Before deploying, configure `supabase-config.js` with your Supabase **Project URL** and **public anon key** (Project Settings → API). In Supabase Authentication settings, enable Email sign-in and choose whether email confirmation is required. Do not place a `service_role` key in client-side code. Deploy the app over HTTPS.

Each signed-in account's CRM data is currently stored in that browser/device under a user-specific local-storage key. That isolates the app's local records between accounts on the same browser, but records **do not sync across devices or automatically share between employees**. Shared company-wide jobs/customers/team data needs a cloud database plus access policies and employee membership/invitation rules; this version does not claim that shared-data functionality.
