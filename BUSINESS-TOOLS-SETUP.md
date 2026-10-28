# Legendary Cleaners Business Tools — Setup Checklist

These tools are added on a feature branch and are not live on the public CRM until the pull request is reviewed and merged.

## 1. AI Business Assistant

The Edge Function is at `supabase/functions/business-assistant/index.ts`.

Set secrets in Supabase Edge Function secrets (never commit secret values to GitHub):

- `OPENAI_API_KEY` — an OpenAI API key with API billing enabled.
- Optional: `OPENAI_MODEL` — defaults to `gpt-5-mini`.

Deploy the function to the existing project:

```sh
supabase functions deploy business-assistant --project-ref uxsndyiyqttnrdeanhli
supabase secrets set OPENAI_API_KEY=YOUR_KEY --project-ref uxsndyiyqttnrdeanhli
```

If you set `OPENAI_MODEL`, configure it as a Supabase secret too. The assistant only proposes changes. Rescheduling requires an Owner or Team Lead to approve and confirm it.

## 2. Private Document Center

Review and run `business-assistant-storage.sql` in the Supabase SQL Editor. It creates a private `crm-documents` bucket with policies scoped to the signed-in employee's company. Uploads are limited to 15 MB and supported document/image types.

## 3. Customer email and SMS

The Edge Function is at `supabase/functions/customer-communications/index.ts`. It looks up the customer and destination from the authenticated company's workspace; it does not trust a destination supplied by the browser.

Configure the following Supabase secrets:

- Email: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (must be a sender/domain verified in Resend).
- SMS: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (a Twilio-enabled sender).

Deploy:

```sh
supabase functions deploy customer-communications --project-ref uxsndyiyqttnrdeanhli
```

The current response confirms that the provider accepted a request, not that a handset received it. Final delivery tracking requires provider status webhooks; this draft does not claim those are configured.

## 4. Customer Portal

The portal page in this draft is a readiness screen only. Do not share it with customers as a live portal yet. A production portal needs its own server-side customer access grants, revocable tokens, and scoped APIs for estimates, contracts, appointments, and invoices. It must never expose the full `crm_workspaces.data` payload.

## 5. Before going live

- Test Owner and employee logins.
- Verify a job/customer edit saves to Supabase and appears on another device.
- Test existing push notifications and the 1-hour reminder path.
- Test document upload/open with two different company memberships to verify cross-company isolation.
- Test AI suggestions without approving, then approve one controlled test reschedule.
- Test email/SMS only after provider credentials and consent/opt-out handling are in place.
