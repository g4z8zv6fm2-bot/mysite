import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  const cronSecret = Deno.env.get('PUSH_CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return json({ error: 'Missing Supabase or VAPID server secrets' }, 500);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const now = Date.now();
  // A 2-minute window is used because this function is scheduled once per minute.
  const start = new Date(now + 59 * 60_000).toISOString();
  const end = new Date(now + 61 * 60_000).toISOString();

  const { data: workspaces, error: workspaceError } = await db.from('crm_workspaces').select('company_id,data');
  if (workspaceError) return json({ error: workspaceError.message }, 500);

  let remindersSent = 0;
  let pushAttempts = 0;
  const errors: string[] = [];

  for (const workspace of workspaces || []) {
    const jobs = Array.isArray(workspace.data?.jobs) ? workspace.data.jobs : [];
    const dueJobs = jobs.filter((job: any) => {
      if (!job || (job.status && String(job.status).toLowerCase() !== 'scheduled')) return false;
      const raw = job.scheduledAt || job.datetime || job.scheduled_at;
      if (!raw) return false;
      const timestamp = Date.parse(raw);
      return Number.isFinite(timestamp) && timestamp >= Date.parse(start) && timestamp < Date.parse(end);
    });
    if (!dueJobs.length) continue;

    const { data: subscriptions, error: subError } = await db.from('push_subscriptions')
      .select('id,user_id,endpoint,p256dh,auth').eq('company_id', workspace.company_id);
    if (subError) { errors.push(`Subscriptions ${workspace.company_id}: ${subError.message}`); continue; }
    if (!subscriptions?.length) continue;

    for (const job of dueJobs) {
      const jobId = String(job.id || job.jobId || job.scheduledAt);
      const { data: alreadySent, error: sentCheckError } = await db.from('push_reminder_log')
        .select('id').eq('company_id', workspace.company_id).eq('job_id', jobId).eq('reminder_type', 'one_hour').maybeSingle();
      if (sentCheckError) { errors.push(`Reminder check ${jobId}: ${sentCheckError.message}`); continue; }
      if (alreadySent) continue;

      const customer = String(job.customerName || job.customer || job.name || 'Scheduled cleaning job');
      const when = String(job.time || job.startTime || 'soon');
      const payload = JSON.stringify({
        title: 'Cleaning job coming up in 1 hour',
        body: `${customer} — scheduled for ${when}`,
        tag: `lc-job-${jobId}`,
        url: './index.html',
      });
      let successful = 0;
      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600 });
          successful++;
          pushAttempts++;
        } catch (err) {
          const status = (err as any)?.statusCode;
          if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('id', sub.id);
          else errors.push(`Push failed for subscription ${sub.id}: ${String((err as any)?.message || err)}`);
        }
      }
      if (successful > 0) {
        const { error: logError } = await db.from('push_reminder_log').insert({ company_id: workspace.company_id, job_id: jobId, reminder_type: 'one_hour', sent_at: new Date().toISOString() });
        if (logError && !String(logError.message).toLowerCase().includes('duplicate')) errors.push(`Reminder log ${jobId}: ${logError.message}`);
        remindersSent++;
      }
    }
  }

  return json({ ok: true, remindersSent, pushAttempts, errors }, 200);

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
