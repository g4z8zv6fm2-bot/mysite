import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = Deno.env.get("REMINDER_CRON_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !cronSecret) {
    return json({ error: "Reminder scheduler secrets are not configured." }, 503);
  }

  const supplied = req.headers.get("x-cron-secret") || "";
  if (supplied.length !== cronSecret.length || supplied !== cronSecret) {
    return json({ error: "Unauthorized." }, 401);
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc("configure_legendary_reminder_cron", {
      p_secret: cronSecret,
    });
    if (error) {
      console.error("Could not configure Supabase reminder cron:", error.message);
      return json({ error: "Could not register the database reminder schedule." }, 500);
    }
    return json({ configured: true, jobId: data, schedule: "every minute" });
  } catch (error) {
    console.error("Reminder cron configuration failed:", error?.message || error);
    return json({ error: "Reminder cron configuration failed." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
