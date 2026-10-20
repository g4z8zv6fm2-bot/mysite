import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
    const timeZone = Deno.env.get("BUSINESS_TIME_ZONE") || "America/New_York";
    if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
      return json({ error: "Reminder server secrets are not configured." }, 500);
    }

    // This endpoint is called only by the scheduled GitHub Actions workflow.
    const auth = req.headers.get("Authorization") || "";
    if (auth !== `Bearer ${serviceRoleKey}`) return json({ error: "Unauthorized." }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: workspaces, error: workspaceError } = await admin
      .from("crm_workspaces").select("company_id,data");
    if (workspaceError) return json({ error: "Could not load scheduled jobs." }, 500);

    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("push_subscriptions").select("id,company_id,endpoint,p256dh,auth");
    if (subscriptionsError) return json({ error: "Could not load push subscriptions." }, 500);

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const now = Date.now();
    let checked = 0, due = 0, sent = 0, failed = 0, skipped = 0;

    for (const workspace of workspaces || []) {
      const jobs = Array.isArray(workspace.data?.jobs) ? workspace.data.jobs : [];
      const companySubs = (subscriptions || []).filter((s) => s.company_id === workspace.company_id);
      for (const job of jobs) {
        checked++;
        if (!job || String(job.status || "Scheduled").toLowerCase() === "completed") continue;
        const date = String(job.date || job.scheduledDate || "").trim();
        const time = String(job.time || job.startTime || "").trim();
        const jobId = String(job.id || job.jobId || "").trim();
        if (!date || !time || !jobId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) continue;
        const startsAt = localTimeToUtc(date, time, timeZone);
        if (!startsAt) continue;
        const minutesUntil = (startsAt.getTime() - now) / 60000;
        // GitHub Actions runs every 5 minutes. This window allows for small scheduler delays.
        if (minutesUntil < 55 || minutesUntil > 65) continue;
        due++;

        // A unique database key prevents duplicate reminders across repeated scheduled runs.
        const { error: claimError } = await admin.from("job_reminder_deliveries").insert({
          company_id: workspace.company_id,
          job_id: jobId,
          job_date: date,
          job_time: time,
        });
        if (claimError) {
          if (claimError.code === "23505") { skipped++; continue; }
          console.error("Could not claim reminder:", claimError.message);
          failed++;
          continue;
        }

        const customer = String(job.name || job.customerName || job.customer || "Scheduled job");
        const service = String(job.service || job.title || "Cleaning appointment");
        const payload = JSON.stringify({
          title: "Job starts in 1 hour",
          body: `${customer} — ${service}`,
          url: "/mysite/",
          tag: `lc-job-reminder-${jobId}-${date}-${time}`,
        });
        const outcomes = await Promise.all(companySubs.map(async (sub) => {
          try {
            await webpush.sendNotification({
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            }, payload);
            return true;
          } catch (error) {
            const status = Number(error?.statusCode || error?.status || 0);
            if (status === 404 || status === 410) {
              await admin.from("push_subscriptions").delete().eq("id", sub.id);
            }
            console.error("Reminder push failed:", status || error?.message || "unknown");
            return false;
          }
        }));
        if (outcomes.some(Boolean)) {
          sent++;
        } else {
          // Allow a later run to retry if no device accepted the notification.
          await admin.from("job_reminder_deliveries").delete()
            .eq("company_id", workspace.company_id).eq("job_id", jobId)
            .eq("job_date", date).eq("job_time", time);
          failed++;
        }
      }
    }
    return json({ checked, due, sent, failed, skipped, timeZone });
  } catch (error) {
    console.error("Scheduled reminder error:", error?.message || error);
    return json({ error: "Scheduled reminder run failed." }, 500);
  }
});

function localTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite) || hour > 23 || minute > 59) return null;
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = target;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    // Recalculate the zone offset to handle daylight-saving time.
    for (let i = 0; i < 3; i++) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(guess))
        .filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
      const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
      guess += target - asUtc;
    }
    const result = new Date(guess);
    return Number.isFinite(result.getTime()) ? result : null;
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
