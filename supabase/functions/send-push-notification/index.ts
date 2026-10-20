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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
      return json({ error: "Push server secrets are not configured." }, 500);
    }
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Sign-in required." }, 401);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Invalid session." }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error: profileError } = await admin
      .from("profiles").select("company_id").eq("user_id", authData.user.id).maybeSingle();
    if (profileError || !profile?.company_id) return json({ error: "Company access required." }, 403);

    const input = await req.json();
    const title = String(input.title || "Legendary Cleaners update").slice(0, 100);
    const body = String(input.body || "Your CRM has a new update.").slice(0, 240);
    const url = String(input.url || "/");
    const subscriptionsQuery = admin.from("push_subscriptions")
      .select("id,user_id,endpoint,p256dh,auth")
      .eq("company_id", profile.company_id);
    const { data: subscriptions, error: subscriptionsError } = await subscriptionsQuery;
    if (subscriptionsError) return json({ error: "Could not load notification subscriptions." }, 500);

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const outcomes = await Promise.all((subscriptions || []).map(async (sub) => {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        }, JSON.stringify({ title, body, url }));
        return { ok: true, status: 0 };
      } catch (error) {
        const status = Number(error?.statusCode || error?.status || 0);
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        }
        console.error("Push delivery failed:", status || error?.message || "unknown error");
        return { ok: false, status };
      }
    }));
    const failures = outcomes.filter(x => !x.ok);
    const failureCodes = [...new Set(failures.map(x => x.status || "network/unknown"))].join(",");
    return json({ subscriptionsFound: (subscriptions || []).length, sent: outcomes.filter(x => x.ok).length, failed: failures.length, failureCodes });
  } catch (error) {
    console.error("Push handler error:", error?.message || error);
    return json({ error: "Push notification request failed." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
