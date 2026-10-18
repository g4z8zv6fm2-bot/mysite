# Legendary Cleaners background push upgrade

This is a **patch package**, not a full replacement website. It intentionally does not include `supabase-config.js`, so your working Supabase URL and public key are not overwritten.

## 1. Publish the frontend files
Upload/replace `index.html` and `sw.js` in the root of your existing GitHub Pages repository. Upload `push-setup.sql` and the `supabase/functions/send-job-push/index.ts` file too, keeping the folders exactly as shown. Keep your existing `supabase-config.js` values intact, and add this line to it:

```js
// Public VAPID key only. Never put the private key here.
window.LC_VAPID_PUBLIC_KEY = "YOUR_VAPID_PUBLIC_KEY";
```

## 2. Create VAPID keys
On a computer with Node.js installed, run:

```bash
npx web-push generate-vapid-keys
```

Copy the **public** key into `LC_VAPID_PUBLIC_KEY` above. Keep the private key for the server-only secret in step 4.

## 3. Create the Supabase tables
Open Supabase → SQL Editor and run the complete contents of `push-setup.sql`. This is separate from the main setup and can be run safely again.

## 4. Deploy the Supabase Edge Function
Install the Supabase CLI, then from your existing repository root (where the `supabase` folder is):

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy send-job-push --no-verify-jwt
```

Generate a separate long random secret for `PUSH_CRON_SECRET`. Then set server-only secrets, replacing every placeholder:

```bash
supabase secrets set VAPID_PUBLIC_KEY="YOUR_PUBLIC_VAPID_KEY" VAPID_PRIVATE_KEY="YOUR_PRIVATE_VAPID_KEY" VAPID_SUBJECT="mailto:YOUR_ADMIN_EMAIL" PUSH_CRON_SECRET="YOUR_LONG_RANDOM_CRON_SECRET"
```

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. **Never put the service-role key, VAPID private key, or cron secret in `index.html`, `supabase-config.js`, or any public GitHub file.** The function is deployed with JWT verification disabled because it validates the custom `x-cron-secret` header itself.

## 5. Schedule the sender every minute
In Supabase Dashboard, open **Integrations → Cron** (or Database → Cron) and create a job using `* * * * *`. Configure it as an HTTP request/Edge Function request:

- Method: `POST`
- URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-job-push`
- Headers: `Content-Type: application/json` and `x-cron-secret: YOUR_LONG_RANDOM_CRON_SECRET`
- Body: `{}`

Use the same cron secret as in step 4. If your dashboard does not offer an HTTP/Edge Function target, use Supabase's documented Cron + `pg_net` setup; do not expose secrets in the website.

## 6. Enable notifications per device and test
Hard refresh the published website with Ctrl+Shift+R. Sign in, open Team, scroll to Job reminders, click **Enable push notifications**, and allow notifications. Each employee device must do this once. Create or edit a scheduled job at least 61 minutes in the future and save it. The app stores a timezone-aware `scheduledAt` timestamp for newly saved jobs; open and save older jobs once so they have that field.

The scheduled sender currently sends one-hour reminders to all subscribed devices in the company, not only the assigned employee. It skips completed jobs and deduplicates reminders. Delivery still depends on browser/OS permission, focus modes, network access, and the push provider; no website can guarantee an alert if the operating system blocks it.
