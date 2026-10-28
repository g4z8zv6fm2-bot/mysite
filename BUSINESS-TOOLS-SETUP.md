# Legendary Cleaners Business Tools — Setup and Launch Checklist

The business-tools UI is merged into `main` and GitHub Pages deployment is automatic. The GitHub Actions workflow now also deploys the two new Supabase Edge Functions when the workflow or those function folders change. This does not automatically configure third-party credentials or create the document bucket.

## 1. AI Business Assistant

The Edge Function is at `supabase/functions/business-assistant/index.ts`. The function verifies the signed-in user and company, limits the CRM data sent to the AI, and only proposes actions. It does not directly change jobs. Rescheduling requires an Owner or Team Lead to approve and confirm.

Required Supabase Edge Function secret:
- `OPENAI_API_KEY` — an OpenAI API key with API billing enabled.

Optional:
- `OPENAI_MODEL` — defaults to `gpt-5-mini`.

Add the secret in **Supabase Dashboard → Project Settings → Edge Functions / Secrets** for project `uxsndyiyqttnrdeanhli`. Never put API keys in browser code or commit them to GitHub. The function deployment is handled by GitHub Actions, but the AI will return a configuration message until the key is set.

## 2. Private Document Center

The SQL file is `business-assistant-storage.sql`. Open the Supabase SQL Editor for project `uxsndyiyqttnrdeanhli`, review the SQL, and run it once. It creates the private `crm-documents` bucket, limits files to 15 MB, and scopes object access by the company ID in the first folder segment.

Until the SQL is run successfully, document uploads will not work. Do not make the bucket public.

## 3. Customer email and SMS

The Edge Function is at `supabase/functions/customer-communications/index.ts`. It verifies the signed-in user and looks up the destination from the customer's saved record in that company's workspace.

Configure these secrets in Supabase for project `uxsndyiyqttnrdeanhli`:

**Email via Resend**
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` — a sender/domain verified in Resend.

**SMS via Twilio**
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER` — a Twilio-enabled sender.

The Edge Function deploys through GitHub Actions. Email/SMS remain unavailable until the corresponding provider is configured. Send only messages the customer expects or has agreed to receive, and honor opt-outs.

The current response means the provider accepted the request, not that the message reached the customer's inbox or phone. Provider delivery-status webhooks and final delivery tracking are not implemented yet.

## 4. Route Planner and Activity Log

The Route Planner groups scheduled jobs by date/address and can create a multi-stop Google Maps route link. It is a basic planner, not a traffic-aware route optimizer.

The Activity Log records changes it can observe in the app's save flow. It is not yet a server-authoritative audit trail and does not independently verify push delivery or cloud persistence. Continue to verify important changes on a second device.

## 5. Customer Portal — not ready to share

The Customer Portal is currently a readiness screen, not a functioning customer-facing portal. Do not send customers a portal link yet. A production portal still needs secure customer access grants, revocable tokens, and server-side scoped APIs for estimates, contracts, appointments, and invoices. It must never expose the full `crm_workspaces.data` payload.

## 6. Safe verification

After setting up the items above:
- Verify Owner and employee logins still work.
- Make a harmless test job edit and confirm it saves and appears on another device.
- Test existing push notifications and the one-hour reminder path separately.
- Test document upload/open with two different company memberships to check company isolation.
- Ask the AI for a summary first; verify its suggestions before approving a controlled test reschedule.
- Send provider test messages only after provider credentials, sender verification, and customer consent/opt-out handling are ready.

Existing auth, employee invite logic, workspace data, and push-notification code were not intentionally changed by the business-tools UI work.
