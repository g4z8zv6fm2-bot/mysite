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
