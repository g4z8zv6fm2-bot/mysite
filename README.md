# Legendary Cleaners CRM — GitHub Pages + Supabase shared accounts

## Files
- `index.html`: CRM with Supabase email/password sign-in, invited employee accounts, shared jobs/customers/team workspace, and live workspace refresh.
- `supabase-config.js`: set your Supabase Project URL and public anon/publishable key.
- `supabase-setup.sql`: database schema, row-level security policies, owner bootstrap, and invitation signup trigger.
- `sw.js`, `manifest.webmanifest`, and icons: installable PWA support.

## Deploy in this order

### 1. Create/configure Supabase
1. Open your Supabase project.
2. In **Project Settings → API** (or API Keys), copy the **Project URL** and **public anon/publishable key**. Never use a `service_role` or secret key in the website.
3. Edit `supabase-config.js` and replace the two `YOUR_...` values. Keep the quote marks.
4. In Supabase **Authentication → Providers**, enable **Email**. Email confirmation can be enabled; employees then need to click the verification link.

### 2. Create the owner account and database
1. In Supabase **Authentication → Users**, check whether your owner email already has an account. If not, use the website's sign-up screen once to create it; if email confirmation is enabled, verify it.
2. Open `supabase-setup.sql` in a text editor. Replace `REPLACE_WITH_OWNER_EMAIL` with the exact email address you will use as the company owner (lowercase is recommended). There is one occurrence in the function definition; the SQL bootstrap block reads that function.
3. In Supabase **SQL Editor**, paste the entire edited SQL file and click **Run**.
4. Refresh the website. The owner profile/company is created for that existing auth user. If you created the owner account only after running SQL, rerun the SQL after replacing the owner email.

### 3. Publish to GitHub Pages
1. Extract the ZIP.
2. Upload the **contents** of the `legendary_cleaners_crm` folder to the root of the GitHub repository used for Pages. `index.html` must be at the published root—not inside another nested `legendary_cleaners_crm` folder unless your Pages URL points there.
3. Commit the changes and wait for GitHub Pages to publish.
4. Open the published URL, then hard refresh with **Ctrl+Shift+R**. If installed as a PWA, close it and reopen; if needed, remove the old home-screen app and install the updated site again.

## Invite employee accounts
1. Sign in with the owner email.
2. Open **Team** → **Invite an employee login**.
3. Enter the employee's name, email, and role; choose **Save invitation**.
4. Give the employee the GitHub Pages URL. They select **New employee? Create an account** and register using the exact email address you invited.
5. If email confirmation is enabled, they must confirm their email and then sign in.

Only invited email addresses are assigned to the company. Other signed-up accounts do not get access to company data. The app uses Supabase Auth, so it does not store account passwords itself.

## Shared data
Jobs, customers, and team records are stored in one Supabase workspace row per company and are shared with invited users. The app also listens for workspace changes while open. This simple shared-workspace approach is suitable for a small team; simultaneous edits from two devices at exactly the same moment can overwrite one another. Make regular backups in Supabase.

## Troubleshooting
- **No login screen / old app appears:** make sure the deployed `index.html` is this version; upload all files, then Ctrl+Shift+R. `sw.js` has a bumped cache name.
- **“Supabase is not configured”:** edit `supabase-config.js`, save it, and redeploy.
- **“does not have access”:** owner email in SQL must exactly match the owner login; for an employee, owner must save an invitation before they sign up. If the auth user already existed before an invite was saved, ask them to sign in again after invitation; if still blocked, delete that auth user in Supabase and have them sign up again, or use the invite before creating their account.
- **Profile/workspace/policy error:** rerun the full SQL setup after checking the owner email replacement, then reload the website.
- **Email verification link redirects incorrectly:** in Supabase Authentication → URL Configuration, add the GitHub Pages URL (including any repository subpath) to Site URL / Redirect URLs.
- **Browser still shows old code:** close the installed PWA, open the normal website URL, hard refresh, and confirm the page title/version in `index.html`.

Do not share your Supabase secret/service-role key. The public key belongs in `supabase-config.js`; database access is protected by the SQL RLS policies.


## Push notifications (new jobs and job changes)

The CRM supports subscribing each employee's device to Web Push. Finish these steps before using the **Enable push notifications on this device** button:

1. In Supabase SQL Editor, run the updated `supabase-setup.sql` again. It adds the `push_subscriptions` table and its row-level security policy.
2. The VAPID public key is configured in `supabase-config.js`. The public key may be in the website; never put the VAPID private key or Supabase service-role key in GitHub.
3. In Supabase Dashboard → Edge Functions, create a function named `send-push-notification` and deploy the source from `supabase/functions/send-push-notification/index.ts`.
4. Configure these Edge Function secrets in Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (for example, a `mailto:` contact). Keep private and service-role keys in Supabase secrets only.
5. Redeploy GitHub Pages and hard-refresh it. Sign in on each device, open Team, and click **Enable push notifications on this device**. Allow browser notifications when prompted.

The Edge Function sends job-change notifications to subscribed devices in the same company. One-hour reminders are checked server-side by the GitHub Actions workflow every five minutes, so the CRM does not need to stay open. The reminder function uses the company workspace and a unique delivery record to avoid duplicate reminders. The GitHub repository needs `SUPABASE_ACCESS_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` secrets for deployment and scheduled calls. Push support depends on the browser and device allowing notifications; iOS typically requires the web app to be installed on the Home Screen.


## Contracts, customer signatures, and recurring cleanings

This feature is additive and does not replace `crm_workspaces` or existing jobs, customers, team accounts, or push-notification code.

1. In Supabase **SQL Editor**, confirm that `supabase/migrations/20261026000000_contracts_signing.sql`, `20261027000000_allow_contract_deletion.sql`, `20261027010000_persist_contract_service_selections.sql`, and `20261027020000_persist_contract_blank_fields.sql` have been applied.
2. Also run `supabase/migrations/20261109000000_allow_custom_contract_interval.sql` so the Custom interval option offered by the CRM is accepted by the database.
3. The GitHub Actions deployment workflow deploys the contract and push functions when relevant files change on `main`. No OpenAI API key is required; AI contract scheduling is disabled.
4. Refresh the CRM, open the dashboard menu, and select **Contracts & signatures**. Create a contract with the exact frequency and dates in the agreement, then copy the private signing link or open the prepared email draft.

### How contract scheduling works

- A contract can be 2 or 3 years and can specify weekly, monthly, every 2 months, quarterly, every 6 months, yearly, a custom month interval, or exact dates.
- Public signing records the typed signature name, consent, and timestamp. Only a token hash is stored in the contract table; a sent contract can receive a fresh signing link if needed.
- The database generates an idempotent visit ledger when the contract is signed. When the owner/employee next opens the CRM, the app syncs those visits into the existing job schedule and skips matching jobs to avoid duplicates.
- Generated jobs use 9:00 AM and assign to Owner as a starting default; edit assignments/times in the regular Schedule tab to match the customer's agreement.
- Contract visits are generated by the database when a customer signs. The CRM syncs those visits into the job calendar; no AI assistant is involved.

### Important setup / verification

The SQL migration must be applied in Supabase before the Contracts tab can load. The AI assistant needs `OPENAI_API_KEY` set as a Supabase Edge Function secret. Signing and scheduling should be tested with a sample contract before sending a real agreement to a customer. The signing flow records an electronic signature, but you should review contract wording and applicable e-signature requirements for your business.
