import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function normalizePhone(value: string) { return value.replace(/[\s().-]/g, ""); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = req.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authorization || !supabaseUrl || !anonKey) return json({ error: "Sign in is required." }, 401);

  try {
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return json({ error: "Your sign-in session could not be verified." }, 401);
    const { data: profile, error: profileError } = await supabase
      .from("profiles").select("company_id, role").eq("user_id", authData.user.id).maybeSingle();
    if (profileError || !profile?.company_id) return json({ error: "Your company profile could not be verified." }, 403);

    const body = await req.json().catch(() => ({}));
    const customerId = String(body?.customerId || "");
    const channel = String(body?.channel || "");
    const type = String(body?.type || "Custom message").slice(0, 80);
    const message = String(body?.body || "").trim().slice(0, 5000);
    if (!customerId || !["Email", "SMS"].includes(channel) || !message) return json({ error: "Customer, channel, and message are required." }, 400);

    const { data: workspace, error: workspaceError } = await supabase
      .from("crm_workspaces").select("data").eq("company_id", profile.company_id).maybeSingle();
    if (workspaceError || !workspace?.data) return json({ error: "Company workspace data could not be loaded." }, 500);
    const data = workspace.data as Record<string, any>;
    const customer = Array.isArray(data.customers) ? data.customers.find((c: any) => String(c?.id) === customerId) : null;
    if (!customer) return json({ error: "That customer was not found in your company workspace." }, 404);

    const destination = channel === "SMS" ? String(customer.phone || "").trim() : String(customer.email || "").trim();
    if (!destination) return json({ error: "This customer has no saved " + (channel === "SMS" ? "phone number." : "email address."), status: "Not sent" }, 400);

    let providerId = "";
    if (channel === "Email") {
      const apiKey = Deno.env.get("RESEND_API_KEY");
      const from = Deno.env.get("RESEND_FROM_EMAIL");
      if (!apiKey || !from) return json({ error: "Email sending is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL in Supabase secrets.", status: "Not sent" }, 503);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [destination],
          subject: "Legendary Cleaners — " + type,
          text: message,
          tags: [{ name: "source", value: "legendary-cleaners-crm" }],
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error("Resend delivery request failed", response.status, result?.message || "");
        return json({ error: "Email provider rejected the message. Check the verified sender and Resend account.", status: "Failed / not delivered" }, 502);
      }
      providerId = String(result.id || "");
    } else {
      const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const token = Deno.env.get("TWILIO_AUTH_TOKEN");
      const from = Deno.env.get("TWILIO_FROM_NUMBER");
      if (!sid || !token || !from) return json({ error: "SMS sending is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER in Supabase secrets.", status: "Not sent" }, 503);
      const to = normalizePhone(destination);
      if (!/^\+\d{8,15}$/.test(to)) return json({ error: "Save the customer's phone number in international format, such as +18595550123.", status: "Not sent" }, 400);
      const form = new URLSearchParams({ To: to, From: from, Body: message });
      const response = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + encodeURIComponent(sid) + "/Messages.json", {
        method: "POST",
        headers: {
          "Authorization": "Basic " + btoa(sid + ":" + token),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error("Twilio delivery request failed", response.status, result?.message || "");
        return json({ error: "SMS provider rejected the message. Check the Twilio sender, number, and account.", status: "Failed / not delivered" }, 502);
      }
      providerId = String(result.sid || "");
    }
    // Provider acceptance is not a guarantee of final handset delivery. Webhooks can update this later.
    return json({ status: "Accepted by provider", messageId: providerId, channel, type });
  } catch (error) {
    console.error("Customer communication error", error);
    return json({ error: "The message could not be submitted." }, 500);
  }
});
