# Legendary Cleaners Business Tools — Setup and Launch Checklist

The business-tools UI is deployed through GitHub Pages. The Supabase deployment workflow deploys the push, reminder, contract, communication, and customer-portal Edge Functions. Provider credentials still need to be configured separately.

## 1. AI features

AI features are intentionally removed from Legendary Cleaners CRM. The business-assistant and contract-scheduling-assistant Edge Function endpoints return HTTP 410 and do not call an AI provider. No OpenAI API key is needed.

## 2. Private Document Center

The private `crm-documents` bucket is now configured in Supabase project `uxsndyiyqttnrdeanhli`. It is limited to 15 MB and has company-scoped read, upload, and delete policies. The bucket is private; do not make it public. The corresponding migration is `supabase/migrations/20261110202513_configure_private_crm_document_storage.sql`.

No files existed in the bucket at setup time. Test an upload and open operation using an owner and an employee account before relying on it.

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

The Edge Function deploys through GitHub Actions. Email/SMS remain unavailable until the corresponding provider is configured. The CRM now records explicit SMS consent on each customer; SMS is blocked unless that consent is checked. Send only messages the customer expects or has agreed to receive, and honor opt-outs.

Every outbound SMS now identifies Legendary Cleaners and includes “Reply STOP to unsubscribe”; the Edge Function still blocks SMS unless the customer has explicitly opted in. Twilio's opt-out handling and the business's A2P/toll-free sender registration must also be configured as applicable.

The current response means the provider accepted the request, not that the message reached the customer's inbox or phone. Provider delivery-status webhooks and final delivery tracking are not implemented yet.

### Use the old iPhone for customer messages
The Customer Communication screen also has a **This iPhone (open Messages / Mail)** option. On the iPhone, it opens the native Messages app with the customer's phone number and text filled in, or Mail with the recipient, subject, and email body filled in. The user must review the draft and tap Send. A prepared draft is recorded as a draft, not as a sent or delivered message. SMS still requires recorded customer consent. This does not require Twilio or Resend, but it is a manual send workflow and will not send while the CRM is closed.

The separate **Connected cloud provider** option is for background/provider sending and still requires the Resend or Twilio secrets listed above. Provider acceptance is not proof of final delivery.

## 4. Route Planner and Activity Log

The Route Planner groups scheduled jobs by date/address and can create a multi-stop Google Maps route link. It is a basic planner, not a traffic-aware route optimizer.

The Activity Log now includes a server-side audit trail for shared workspace changes. It records the operation, timestamp, actor when available, and top-level sections changed (such as jobs, customers, or team) without copying customer or job contents. Browser-local activity remains available as a supplemental view. This is not a compliance-certified immutable audit system and does not independently prove push delivery.

## 5. Customer Portal

The Customer Portal now supports Owner-created, private customer links. Each link uses a random token, stores only its SHA-256 hash, expires after 30 days, and can be revoked. The server returns only the matched customer's appointments and contracts; it never returns the full `crm_workspaces.data` payload, employee directory, or other customers. Estimates and invoices are not shown because those record types are not yet part of the CRM data model.

Before sharing a link with a real customer, test creation, opening, expiry, and revocation with a test customer record. Only the Owner can create or revoke links.

## 6. Safe verification

After setting up the items above:
- Verify Owner and employee logins still work.
- Make a harmless test job edit and confirm it saves and appears on another device.
- Test existing push notifications and the one-hour reminder path separately. The primary one-hour reminder schedule is Supabase Cron every minute; GitHub Actions remains a five-minute backup.
- Test a customer portal link with a test customer before sharing it.
- Record SMS consent on the customer record before sending any text.
- Test document upload/open with two different company memberships to check company isolation.
- Send provider test messages only after provider credentials, sender verification, and customer consent/opt-out handling are ready.

Existing auth, employee invite logic, workspace data, and push-notification code were not intentionally changed by the business-tools UI work.


## AI features removed
The AI Business Assistant and AI contract-scheduling assistant have been removed from the CRM interface and their Edge Function endpoints are disabled. No OpenAI API key is required for the CRM's remaining tools.
