# Legendary Cleaners Business Tools — Setup and Launch Checklist

The business-tools UI is deployed through GitHub Pages. The Supabase deployment workflow deploys the push, reminder, contract, and customer-portal Edge Functions.

## 1. AI features

AI features are intentionally removed from Legendary Cleaners CRM. The business-assistant and contract-scheduling-assistant Edge Function endpoints return HTTP 410 and do not call an AI provider. No OpenAI API key is needed.

## 2. Private Document Center

The private `crm-documents` bucket is now configured in Supabase project `uxsndyiyqttnrdeanhli`. It is limited to 15 MB and has company-scoped read, upload, and delete policies. The bucket is private; do not make it public. The corresponding migration is `supabase/migrations/20261110202513_configure_private_crm_document_storage.sql`.

No files existed in the bucket at setup time. Test an upload and open operation using an owner and an employee account before relying on it.

## 3. Customer Communication removed

The entire Customer Communication screen has been removed from the CRM, including SMS, email, message composition, provider sending, and message-history views. Customer phone numbers and email addresses remain part of customer records. Existing message-history data and the legacy Supabase `customer-communications` function have been left untouched; this UI change does not delete stored data or modify backend services.

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
- Test document upload/open with two different company memberships to check company isolation.

Existing auth, employee invite logic, workspace data, and push-notification code were not intentionally changed by the business-tools UI work.


## AI features removed
The AI Business Assistant and AI contract-scheduling assistant have been removed from the CRM interface and their Edge Function endpoints are disabled. No OpenAI API key is required for the CRM's remaining tools.
